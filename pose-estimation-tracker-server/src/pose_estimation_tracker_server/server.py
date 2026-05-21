from __future__ import annotations

import argparse
import asyncio
import json
import threading
from dataclasses import dataclass
from typing import Coroutine, TypeAlias, TypedDict, cast

from aiortc import RTCDataChannel, RTCPeerConnection, RTCSessionDescription
from aiortc.mediastreams import MediaStreamTrack
from aiortc.sdp import candidate_from_sdp
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


JsonObject: TypeAlias = dict[str, object]
Prediction: TypeAlias = dict[str, object]


class AnswerMessage(TypedDict):
    type: str
    sdp: str


class LatestFrameDescriptor(TypedDict):
    frameId: str
    capturedAtMs: float
    width: int
    height: int


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
        frame: JsonObject,
        image: np.ndarray,
        threshold: float,
        started_at: float,
        decoded_at: float,
        max_poses: int | None = None,
    ) -> Prediction:
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
        return make_prediction(
            frame,
            result,
            width,
            height,
            threshold,
            timings,
            self.max_poses if max_poses is None else max_poses,
        )

    def detect(self, frame: JsonObject, image_data: str, threshold: float) -> Prediction:
        started_at = monotonic_ms()
        image = decode_base64_image(image_data)
        decoded_at = monotonic_ms()
        return self.detect_core(frame, image, threshold, started_at, decoded_at)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run a YOLO pose tracker WebRTC signaling server.")
    parser.add_argument("--host", default="127.0.0.1", help="WebSocket bind host.")
    parser.add_argument("--port", type=int, default=8765, help="WebSocket bind port.")
    parser.add_argument("--model", default="yolo26s-pose.pt", help="Ultralytics pose model path or name.")
    parser.add_argument("--conf", type=float, default=0.35, help="Minimum model confidence.")
    parser.add_argument("--imgsz", type=int, default=640, help="Inference image size.")
    parser.add_argument("--tracker", default="botsort.yaml", help="Tracker config, for example botsort.yaml.")
    parser.add_argument("--max-poses", type=int, default=2, help="Maximum poses to return to the UI.")
    return parser.parse_args()


@dataclass
class LatestFrame:
    sequence: int
    image: np.ndarray
    received_at_ms: float


class LatestFrameBuffer:
    def __init__(self) -> None:
        self._condition = asyncio.Condition()
        self._frame: LatestFrame | None = None
        self._closed = False

    async def push(self, image: np.ndarray, received_at_ms: float) -> int:
        async with self._condition:
            sequence = 1 if self._frame is None else self._frame.sequence + 1
            self._frame = LatestFrame(sequence=sequence, image=image, received_at_ms=received_at_ms)
            self._condition.notify_all()
            return sequence

    async def get_after(self, last_sequence: int) -> LatestFrame | None:
        async with self._condition:
            await self._condition.wait_for(
                lambda: self._closed or (self._frame is not None and self._frame.sequence > last_sequence)
            )
            if self._closed:
                return None
            return self._frame

    async def close(self) -> None:
        async with self._condition:
            self._closed = True
            self._condition.notify_all()


class WebRTCTrackerSession:
    def __init__(self, tracker: YoloPoseTracker, threshold: float, max_poses: int) -> None:
        self.tracker = tracker
        self.threshold = threshold
        self.max_poses = max_poses
        self.pc = RTCPeerConnection()
        self.frames = LatestFrameBuffer()
        self.data_channel: RTCDataChannel | None = None
        self._tasks: set[asyncio.Task[None]] = set()
        self._closed = False
        self._result_sequence = 0

        @self.pc.on("datachannel")
        def on_datachannel(channel: RTCDataChannel) -> None:
            if channel.label == "detections":
                self.data_channel = channel
                self._start_task(self._run_inference_loop())

        @self.pc.on("track")
        def on_track(track: MediaStreamTrack) -> None:
            if track.kind == "video":
                self._start_task(self._receive_video(track))

    def _start_task(self, coroutine: Coroutine[object, object, None]) -> None:
        task = asyncio.create_task(coroutine)
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def accept_offer(self, payload: JsonObject) -> AnswerMessage:
        sdp = payload.get("sdp")
        if not isinstance(sdp, str):
            raise ValueError("offer.sdp must be a string")

        await self.pc.setRemoteDescription(RTCSessionDescription(sdp=sdp, type="offer"))
        await self.pc.setLocalDescription(await self.pc.createAnswer())
        await wait_for_ice_gathering(self.pc)
        description = self.pc.localDescription
        return {
            "type": "answer",
            "sdp": description.sdp,
        }

    async def add_ice_candidate(self, payload: JsonObject) -> None:
        candidate_payload = payload.get("candidate")
        if candidate_payload is None:
            await self.pc.addIceCandidate(None)
            return
        if not isinstance(candidate_payload, dict):
            raise ValueError("candidate must be an object")

        candidate_text = candidate_payload.get("candidate")
        if not isinstance(candidate_text, str):
            raise ValueError("candidate.candidate must be a string")
        candidate_sdp = candidate_text.removeprefix("candidate:")
        candidate = candidate_from_sdp(candidate_sdp)
        candidate.sdpMid = candidate_payload.get("sdpMid")
        candidate.sdpMLineIndex = candidate_payload.get("sdpMLineIndex")
        await self.pc.addIceCandidate(candidate)

    async def _receive_video(self, track: MediaStreamTrack) -> None:
        try:
            while not self._closed:
                frame = await track.recv()
                received_at = monotonic_ms()
                await self.frames.push(frame.to_ndarray(format="bgr24"), received_at)
        except Exception:
            await self.close()

    async def _run_inference_loop(self) -> None:
        last_frame_sequence = 0
        while not self._closed:
            frame = await self.frames.get_after(last_frame_sequence)
            if frame is None:
                return
            last_frame_sequence = frame.sequence

            height, width = frame.image.shape[:2]
            descriptor: LatestFrameDescriptor = {
                "frameId": f"webrtc-frame-{frame.sequence}",
                "capturedAtMs": frame.received_at_ms,
                "width": width,
                "height": height,
            }
            try:
                result = await asyncio.to_thread(
                    self.tracker.detect_core,
                    descriptor,
                    frame.image,
                    self.threshold,
                    frame.received_at_ms,
                    frame.received_at_ms,
                    self.max_poses,
                )
            except Exception as exc:
                self._send_json({"type": "error", "message": str(exc)})
                continue

            self._result_sequence += 1
            self._send_json({"type": "result", "sequence": self._result_sequence, "result": result})

    def _send_json(self, payload: JsonObject) -> None:
        channel = self.data_channel
        if channel is None or channel.readyState != "open":
            return
        channel.send(json.dumps(payload))

    async def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        await self.frames.close()
        current_task = asyncio.current_task()
        for task in list(self._tasks):
            if task is current_task:
                continue
            task.cancel()
        pending_tasks = [task for task in self._tasks if task is not current_task]
        if pending_tasks:
            await asyncio.gather(*pending_tasks, return_exceptions=True)
        await self.pc.close()


async def wait_for_ice_gathering(pc: RTCPeerConnection) -> None:
    if pc.iceGatheringState == "complete":
        return

    complete = asyncio.Event()

    @pc.on("icegatheringstatechange")
    def on_ice_gathering_state_change() -> None:
        if pc.iceGatheringState == "complete":
            complete.set()

    await complete.wait()


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
    payload: JsonObject = {
        "type": "error",
        "message": message,
    }
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
        payload = cast(JsonObject, json.loads(metadata_json))
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

    async with websockets.serve(handler, args.host, args.port):
        print(f"Pose tracker WebRTC signaling server listening on ws://{args.host}:{args.port}")
        await asyncio.Future()


def main() -> None:
    asyncio.run(serve(parse_args()))
