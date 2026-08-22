from __future__ import annotations

import asyncio
import json
from collections.abc import Coroutine
from dataclasses import dataclass
from typing import TypedDict, cast

import numpy as np
from aiortc import RTCDataChannel, RTCPeerConnection, RTCSessionDescription
from aiortc.mediastreams import MediaStreamTrack
from aiortc.sdp import candidate_from_sdp
from av import VideoFrame

from pose_estimation_tracker_server.protocol import monotonic_ms
from pose_estimation_tracker_server.tracker import JsonObject, YoloPoseTracker


class AnswerMessage(TypedDict):
    type: str
    sdp: str


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


async def wait_for_ice_gathering(pc: RTCPeerConnection) -> None:
    if pc.iceGatheringState == "complete":
        return

    complete = asyncio.Event()

    @pc.on("icegatheringstatechange")
    def on_ice_gathering_state_change() -> None:
        if pc.iceGatheringState == "complete":
            complete.set()

    await complete.wait()


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
        return {"type": "answer", "sdp": description.sdp}

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
        candidate = candidate_from_sdp(candidate_text.removeprefix("candidate:"))
        candidate.sdpMid = candidate_payload.get("sdpMid")
        candidate.sdpMLineIndex = candidate_payload.get("sdpMLineIndex")
        await self.pc.addIceCandidate(candidate)

    async def _receive_video(self, track: MediaStreamTrack) -> None:
        try:
            while not self._closed:
                frame = cast(VideoFrame, await track.recv())
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
            descriptor: JsonObject = {
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
        if self.data_channel is not None and self.data_channel.readyState == "open":
            self.data_channel.send(json.dumps(payload))

    async def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        await self.frames.close()
        current_task = asyncio.current_task()
        pending_tasks = [task for task in self._tasks if task is not current_task]
        for task in pending_tasks:
            task.cancel()
        if pending_tasks:
            await asyncio.gather(*pending_tasks, return_exceptions=True)
        await self.pc.close()
