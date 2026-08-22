from __future__ import annotations

import argparse
import asyncio

import websockets

from pose_estimation_tracker_server.signaling import handle_connection
from pose_estimation_tracker_server.tracker import YoloPoseTracker


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


async def serve(args: argparse.Namespace) -> None:
    tracker = YoloPoseTracker(args.model, args.conf, args.imgsz, args.tracker, args.max_poses)

    async def handler(websocket: websockets.ServerConnection) -> None:
        await handle_connection(websocket, tracker)

    async with websockets.serve(handler, args.host, args.port):
        print(f"Pose tracker WebRTC signaling server listening on ws://{args.host}:{args.port}")
        await asyncio.Future()


def main() -> None:
    asyncio.run(serve(parse_args()))
