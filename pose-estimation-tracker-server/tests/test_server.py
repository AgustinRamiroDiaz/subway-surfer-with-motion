import json
import asyncio

from pose_estimation_tracker_server.server import handle_message


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
