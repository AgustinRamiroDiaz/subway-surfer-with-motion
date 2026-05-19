from __future__ import annotations

import argparse
import asyncio
import json
import threading
from typing import Any

import numpy as np
import websockets
from ultralytics import YOLO

from pose_estimation_tracker_server.protocol import (
    DetectionTimings,
    decode_base64_image,
    decode_image_bytes,
    make_prediction,
    monotonic_ms,
)


class YoloPoseTracker:
    def __init__(self, model: str, conf: float, imgsz: int, tracker: str, max_poses: int) -> None:
        self.model = YOLO(model)
        self.conf = conf
        self.imgsz = imgsz
        self.tracker = tracker
        self.max_poses = max_poses
        self._lock = threading.Lock()

    def detect_core(
        self,
        frame: dict[str, Any],
        image: np.ndarray,
        threshold: float,
        started_at: float,
        decoded_at: float,
    ) -> dict[str, Any]:
        with self._lock:
            result = self.model.track(
                image,
                conf=threshold,
                imgsz=self.imgsz,
                persist=True,
                tracker=self.tracker,
                verbose=False,
            )[0]
        model_done_at = monotonic_ms()

        timings = DetectionTimings(
            raw_image_ms=decoded_at - started_at,
            preprocess_ms=0,
            model_ms=model_done_at - decoded_at,
            postprocess_ms=monotonic_ms() - model_done_at,
        )
        height, width = image.shape[:2]
        return make_prediction(frame, result, width, height, threshold, timings, self.max_poses)

    def detect(self, frame: dict[str, Any], image_data: str, threshold: float) -> dict[str, Any]:
        started_at = monotonic_ms()
        image = decode_base64_image(image_data)
        decoded_at = monotonic_ms()
        return self.detect_core(frame, image, threshold, started_at, decoded_at)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run a YOLO pose tracker WebSocket server.")
    parser.add_argument("--host", default="127.0.0.1", help="WebSocket bind host.")
    parser.add_argument("--port", type=int, default=8765, help="WebSocket bind port.")
    parser.add_argument("--model", default="yolo26s-pose.pt", help="Ultralytics pose model path or name.")
    parser.add_argument("--conf", type=float, default=0.35, help="Minimum model confidence.")
    parser.add_argument("--imgsz", type=int, default=640, help="Inference image size.")
    parser.add_argument("--tracker", default="botsort.yaml", help="Tracker config, for example botsort.yaml.")
    parser.add_argument("--max-poses", type=int, default=2, help="Maximum poses to return to the UI.")
    return parser.parse_args()


def error_response(message: str, request_id: int | None = None) -> str:
    payload: dict[str, Any] = {
        "type": "error",
        "message": message,
    }
    if request_id is not None:
        payload["requestId"] = request_id
    return json.dumps(payload)


async def handle_message(message: str, tracker: YoloPoseTracker) -> str:
    try:
        payload = json.loads(message)
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

    return json.dumps(
        {
            "type": "result",
            "requestId": request_id,
            "result": result,
        }
    )


async def handle_binary_message(message: bytes, tracker: YoloPoseTracker) -> str:
    started_at = monotonic_ms()
    if len(message) < 4:
        return error_response("Binary message too short")

    metadata_len = int.from_bytes(message[:4], "little")
    if len(message) < 4 + metadata_len:
        return error_response("Binary message metadata truncated")

    try:
        metadata_json = message[4 : 4 + metadata_len].decode("utf-8")
        payload = json.loads(metadata_json)
    except Exception as exc:
        return error_response(f"Failed to parse binary metadata: {exc}")

    request_id = payload.get("requestId")
    frame = payload.get("frame")
    threshold = payload.get("threshold", tracker.conf)

    if not isinstance(request_id, int):
        return error_response("requestId must be a number")
    if not isinstance(frame, dict):
        return error_response("frame must be an object", request_id)

    image_bytes = message[4 + metadata_len :]
    try:
        image = decode_image_bytes(image_bytes)
    except Exception as exc:
        return error_response(str(exc), request_id)

    decoded_at = monotonic_ms()

    try:
        result = await asyncio.to_thread(
            tracker.detect_core, frame, image, float(threshold), started_at, decoded_at
        )
    except Exception as exc:
        return error_response(str(exc), request_id)

    return json.dumps(
        {
            "type": "result",
            "requestId": request_id,
            "result": result,
        }
    )


async def serve(args: argparse.Namespace) -> None:
    tracker = YoloPoseTracker(args.model, args.conf, args.imgsz, args.tracker, args.max_poses)

    async def handler(websocket: websockets.ServerConnection) -> None:
        async for message in websocket:
            if isinstance(message, bytes):
                await websocket.send(await handle_binary_message(message, tracker))
            elif isinstance(message, str):
                await websocket.send(await handle_message(message, tracker))
            else:
                await websocket.send(error_response("Unsupported message type"))

    async with websockets.serve(handler, args.host, args.port):
        print(f"Pose tracker WebSocket server listening on ws://{args.host}:{args.port}")
        await asyncio.Future()


def main() -> None:
    asyncio.run(serve(parse_args()))
