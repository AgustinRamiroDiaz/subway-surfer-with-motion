from __future__ import annotations

import asyncio
import json
from typing import cast

import websockets

from pose_estimation_tracker_server.protocol import decode_image_bytes, monotonic_ms
from pose_estimation_tracker_server.tracker import JsonObject, YoloPoseTracker
from pose_estimation_tracker_server.webrtc_session import WebRTCTrackerSession


def parse_webrtc_config(payload: JsonObject, tracker: YoloPoseTracker) -> tuple[float, int]:
    config = payload.get("config")
    if config is None:
        return tracker.conf, tracker.max_poses
    if not isinstance(config, dict):
        raise ValueError("config must be an object")

    threshold = config.get("threshold", tracker.conf)
    max_poses = config.get("maxPoses", tracker.max_poses)
    if not isinstance(threshold, int | float):
        raise ValueError("config.threshold must be a number")
    if not isinstance(max_poses, int):
        raise ValueError("config.maxPoses must be a number")
    return float(threshold), max(1, max_poses)


def error_response(message: str, request_id: int | None = None) -> str:
    payload: JsonObject = {"type": "error", "message": message}
    if request_id is not None:
        payload["requestId"] = request_id
    return json.dumps(payload)


async def handle_message(message: str, tracker: YoloPoseTracker) -> str:
    try:
        payload = cast(JsonObject, json.loads(message))
    except json.JSONDecodeError:
        return error_response("Message must be valid JSON")

    request_id = payload.get("requestId")
    if not isinstance(request_id, int):
        return error_response("requestId must be a number")
    if payload.get("type") != "detect":
        return error_response("Unsupported message type", request_id)

    frame = payload.get("frame")
    image = payload.get("image")
    if not isinstance(frame, dict):
        return error_response("frame must be an object", request_id)
    if not isinstance(image, dict) or not isinstance(image.get("data"), str):
        return error_response("image.data must be a base64 string", request_id)

    threshold = payload.get("threshold", tracker.conf)
    if not isinstance(threshold, int | float):
        return error_response("threshold must be a number", request_id)

    try:
        result = await asyncio.to_thread(tracker.detect, frame, image["data"], float(threshold))
    except Exception as exc:
        return error_response(str(exc), request_id)
    return json.dumps({"type": "result", "requestId": request_id, "result": result})


async def handle_binary_message(message: bytes, tracker: YoloPoseTracker) -> str:
    started_at = monotonic_ms()
    if len(message) < 4:
        return error_response("Binary message too short")

    metadata_len = int.from_bytes(message[:4], "little")
    if len(message) < 4 + metadata_len:
        return error_response("Binary message metadata truncated")
    try:
        payload = cast(
            JsonObject,
            json.loads(message[4 : 4 + metadata_len].decode("utf-8")),
        )
    except Exception as exc:
        return error_response(f"Failed to parse binary metadata: {exc}")

    request_id = payload.get("requestId")
    frame = payload.get("frame")
    threshold = payload.get("threshold", tracker.conf)
    if not isinstance(request_id, int):
        return error_response("requestId must be a number")
    if not isinstance(frame, dict):
        return error_response("frame must be an object", request_id)
    if not isinstance(threshold, int | float):
        return error_response("threshold must be a number", request_id)

    try:
        image = decode_image_bytes(message[4 + metadata_len :])
    except Exception as exc:
        return error_response(str(exc), request_id)
    decoded_at = monotonic_ms()

    try:
        result = await asyncio.to_thread(
            tracker.detect_core,
            frame,
            image,
            float(threshold),
            started_at,
            decoded_at,
        )
    except Exception as exc:
        return error_response(str(exc), request_id)
    return json.dumps({"type": "result", "requestId": request_id, "result": result})


async def handle_connection(
    websocket: websockets.ServerConnection,
    tracker: YoloPoseTracker,
) -> None:
    session: WebRTCTrackerSession | None = None
    try:
        async for message in websocket:
            if isinstance(message, bytes):
                await websocket.send(await handle_binary_message(message, tracker))
                continue
            if not isinstance(message, str):
                await websocket.send(error_response("Unsupported message type"))
                continue

            try:
                payload = cast(JsonObject, json.loads(message))
            except json.JSONDecodeError:
                await websocket.send(error_response("Message must be valid JSON"))
                continue

            message_type = payload.get("type")
            if message_type == "offer":
                if session is not None:
                    await session.close()
                threshold, max_poses = parse_webrtc_config(payload, tracker)
                session = WebRTCTrackerSession(tracker, threshold, max_poses)
                try:
                    await websocket.send(json.dumps(await session.accept_offer(payload)))
                except Exception as exc:
                    await websocket.send(error_response(str(exc)))
                    await session.close()
                    session = None
                continue
            if message_type == "ice-candidate":
                if session is None:
                    await websocket.send(error_response("No active WebRTC session"))
                    continue
                try:
                    await session.add_ice_candidate(payload)
                except Exception as exc:
                    await websocket.send(error_response(str(exc)))
                continue
            if message_type == "detect":
                await websocket.send(await handle_message(message, tracker))
                continue
            await websocket.send(error_response("Unsupported message type"))
    finally:
        if session is not None:
            await session.close()
