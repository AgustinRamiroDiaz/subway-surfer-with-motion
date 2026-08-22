import asyncio
import json
from unittest.mock import MagicMock, patch

import pytest

from pose_estimation_tracker_server.signaling import (
    handle_binary_message,
    handle_message,
    parse_webrtc_config,
)
from pose_estimation_tracker_server.webrtc_session import LatestFrameBuffer


def test_handle_message_rejects_invalid_json():
    response = json.loads(asyncio.run(handle_message("not-json", tracker=object())))

    assert response["type"] == "error"
    assert response["message"] == "Message must be valid JSON"


def test_handle_message_rejects_missing_image_data():
    response = json.loads(
        asyncio.run(
            handle_message(
                json.dumps(
                    {
                        "type": "detect",
                        "requestId": 7,
                        "frame": {},
                        "image": {},
                    }
                ),
                tracker=object(),
            )
        )
    )

    assert response["type"] == "error"
    assert response["requestId"] == 7
    assert response["message"] == "image.data must be a base64 string"


@patch("pose_estimation_tracker_server.signaling.decode_image_bytes")
def test_handle_binary_message_success(mock_decode):
    mock_decode.return_value = MagicMock()  # Mock numpy array
    tracker = MagicMock()
    tracker.conf = 0.5
    tracker.detect_core = MagicMock(return_value={"mocked": "result"})

    metadata = json.dumps({"requestId": 42, "frame": {"id": "f1"}, "threshold": 0.6})
    metadata_bytes = metadata.encode("utf-8")
    metadata_len = len(metadata_bytes)
    image_bytes = b"fake-jpeg-bytes"

    message = int.to_bytes(metadata_len, 4, "little") + metadata_bytes + image_bytes

    response_json = asyncio.run(handle_binary_message(message, tracker))
    response = json.loads(response_json)

    assert response["type"] == "result"
    assert response["requestId"] == 42
    assert response["result"] == {"mocked": "result"}

    # Verify detect_core was called with expected arguments
    tracker.detect_core.assert_called_once()
    args, _ = tracker.detect_core.call_args
    assert args[0] == {"id": "f1"}
    assert args[2] == 0.6


def test_parse_webrtc_config_uses_offer_config():
    tracker = MagicMock()
    tracker.conf = 0.5
    tracker.max_poses = 2

    threshold, max_poses = parse_webrtc_config(
        {"config": {"threshold": 0.7, "maxPoses": 4}},
        tracker,
    )

    assert threshold == 0.7
    assert max_poses == 4


def test_parse_webrtc_config_rejects_invalid_config():
    tracker = MagicMock()
    tracker.conf = 0.5
    tracker.max_poses = 2

    with pytest.raises(ValueError, match="config.threshold must be a number"):
        parse_webrtc_config({"config": {"threshold": "high"}}, tracker)


def test_latest_frame_buffer_returns_only_newest_frame():
    async def run():
        buffer = LatestFrameBuffer()
        await buffer.push("first", 1)  # type: ignore[arg-type]
        await buffer.push("second", 2)  # type: ignore[arg-type]

        frame = await buffer.get_after(0)

        assert frame is not None
        assert frame.sequence == 2
        assert frame.image == "second"
        assert frame.received_at_ms == 2

    asyncio.run(run())
