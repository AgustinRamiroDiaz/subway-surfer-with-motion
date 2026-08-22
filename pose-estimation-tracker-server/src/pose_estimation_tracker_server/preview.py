from __future__ import annotations

import argparse
import sys
from typing import Any

import cv2
from ultralytics import YOLO

from pose_estimation_tracker_server.protocol import monotonic_ms


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Preview YOLO pose tracking from a local camera.")
    parser.add_argument("--model", default="yolo26s-pose.pt", help="Ultralytics pose model path or name.")
    parser.add_argument("--camera", type=int, default=0, help="Camera device index.")
    parser.add_argument("--conf", type=float, default=0.35, help="Detection confidence threshold.")
    parser.add_argument("--imgsz", type=int, default=640, help="Inference image size.")
    parser.add_argument("--tracker", default="botsort.yaml", help="Tracker config, for example botsort.yaml.")
    parser.add_argument(
        "--max-frames",
        type=int,
        default=0,
        help="Stop after this many frames. Use 0 to run until q/Escape.",
    )
    parser.add_argument("--window-name", default="YOLO pose tracker", help="OpenCV preview window name.")
    return parser.parse_args()


def get_track_ids(result: Any) -> list[int]:
    boxes = getattr(result, "boxes", None)
    if boxes is None or not getattr(boxes, "is_track", False) or boxes.id is None:
        return []
    return boxes.id.int().cpu().tolist()


def count_visible_keypoints(result: Any, threshold: float = 0.25) -> int:
    keypoints = getattr(result, "keypoints", None)
    scores = getattr(keypoints, "conf", None)
    if scores is None:
        return 0
    return int((scores.cpu() >= threshold).sum().item())


def draw_status(frame: Any, result: Any, frame_count: int, inference_ms: float) -> None:
    boxes = getattr(result, "boxes", None)
    body_count = len(boxes) if boxes is not None else 0
    tracks = get_track_ids(result)
    visible_points = count_visible_keypoints(result)
    speed = getattr(result, "speed", {}) or {}
    model_ms = float(speed.get("inference", 0))
    preprocess_ms = float(speed.get("preprocess", 0))
    postprocess_ms = float(speed.get("postprocess", 0))

    lines = [
        f"Frame {frame_count} | bodies {body_count} | visible points {visible_points} | tracks {tracks or '-'}",
        f"Wall inference {inference_ms:.1f} ms | model {model_ms:.1f} ms",
        f"pre {preprocess_ms:.1f} ms | post {postprocess_ms:.1f} ms",
        "Press q or Esc to quit",
    ]

    x = 12
    y = 28
    line_height = 26
    for index, line in enumerate(lines):
        baseline = y + index * line_height
        cv2.putText(frame, line, (x + 1, baseline + 1), cv2.FONT_HERSHEY_SIMPLEX, 0.68, (0, 0, 0), 3, cv2.LINE_AA)
        cv2.putText(frame, line, (x, baseline), cv2.FONT_HERSHEY_SIMPLEX, 0.68, (76, 255, 196), 2, cv2.LINE_AA)


def main() -> int:
    args = parse_args()
    model = YOLO(args.model)
    camera = cv2.VideoCapture(args.camera)

    if not camera.isOpened():
        print(f"Could not open camera index {args.camera}.", file=sys.stderr)
        return 1

    print(f"Camera running with {args.model}. Press q or Escape to quit.")
    frame_count = 0

    try:
        while True:
            ok, frame = camera.read()
            if not ok:
                print("Could not read a frame from the camera.", file=sys.stderr)
                return 1

            started_at = monotonic_ms()
            result = model.track(
                frame,
                conf=args.conf,
                imgsz=args.imgsz,
                persist=True,
                tracker=args.tracker,
                verbose=False,
            )[0]
            inference_ms = monotonic_ms() - started_at
            frame_count += 1

            annotated = result.plot()
            draw_status(annotated, result, frame_count, inference_ms)
            cv2.imshow(args.window_name, annotated)

            key = cv2.waitKey(1) & 0xFF
            if key in (ord("q"), 27):
                break

            if args.max_frames and frame_count >= args.max_frames:
                break
    finally:
        camera.release()
        cv2.destroyAllWindows()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
