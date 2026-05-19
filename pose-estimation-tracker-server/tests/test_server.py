import json
import asyncio
from unittest.mock import MagicMock, patch

from pose_estimation_tracker_server.server import handle_message, handle_binary_message


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


@patch("pose_estimation_tracker_server.server.decode_image_bytes")
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
