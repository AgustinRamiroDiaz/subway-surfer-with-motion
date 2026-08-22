from __future__ import annotations

import base64
import time
from dataclasses import dataclass
from typing import Any

import cv2
import numpy as np

KEYPOINT_LABELS = (
    "Nose",
    "Left Eye",
    "Right Eye",
    "Left Ear",
    "Right Ear",
    "Left Shoulder",
    "Right Shoulder",
    "Left Elbow",
    "Right Elbow",
    "Left Wrist",
    "Right Wrist",
    "Left Hip",
    "Right Hip",
    "Left Knee",
    "Right Knee",
    "Left Ankle",
    "Right Ankle",
)

MODEL_PREDICTION_PROTOCOL_VERSION = 1


@dataclass(frozen=True)
class DetectionTimings:
    raw_image_ms: float
    preprocess_ms: float
    model_ms: float
    postprocess_ms: float

    @property
    def total_ms(self) -> float:
        return self.raw_image_ms + self.preprocess_ms + self.model_ms + self.postprocess_ms

    def to_frontend(self) -> dict[str, float]:
        return {
            "rawImageMs": self.raw_image_ms,
            "preprocessMs": self.preprocess_ms,
            "modelMs": self.model_ms,
            "postprocessMs": self.postprocess_ms,
            "totalMs": self.total_ms,
        }


def monotonic_ms() -> float:
    return time.perf_counter() * 1000


def decode_image_bytes(data: bytes) -> np.ndarray:
    encoded = np.frombuffer(data, dtype=np.uint8)
    image = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("image data could not be decoded as an image")
    return image


def decode_base64_image(data: str) -> np.ndarray:
    try:
        raw = base64.b64decode(data, validate=True)
    except ValueError as exc:
        raise ValueError("image.data must be valid base64") from exc

    encoded = np.frombuffer(raw, dtype=np.uint8)
    image = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("image.data could not be decoded as an image")

    return image


def _as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if hasattr(value, "cpu"):
        value = value.cpu()
    if hasattr(value, "tolist"):
        return value.tolist()
    return list(value)


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def _box_from_keypoints(keypoints: list[dict[str, float]], width: int, height: int) -> dict[str, float]:
    visible = [keypoint for keypoint in keypoints if keypoint["score"] > 0 and keypoint["x"] > 0 and keypoint["y"] > 0]
    source = visible or keypoints
    xs = [keypoint["x"] for keypoint in source]
    ys = [keypoint["y"] for keypoint in source]
    xmin = min(xs, default=0)
    ymin = min(ys, default=0)
    xmax = max(xs, default=0)
    ymax = max(ys, default=0)
    padding = max(8.0, max(xmax - xmin, ymax - ymin) * 0.12)

    return {
        "xmin": _clamp(xmin - padding, 0, width),
        "ymin": _clamp(ymin - padding, 0, height),
        "xmax": _clamp(xmax + padding, 0, width),
        "ymax": _clamp(ymax + padding, 0, height),
    }


def extract_detections(
    result: Any,
    width: int,
    height: int,
    threshold: float,
    max_poses: int = 2,
) -> list[dict[str, Any]]:
    boxes = getattr(result, "boxes", None)
    keypoints = getattr(result, "keypoints", None)

    xyxy = _as_list(getattr(boxes, "xyxy", None))
    box_scores = _as_list(getattr(boxes, "conf", None))
    box_ids = _as_list(getattr(boxes, "id", None))
    keypoint_xy = _as_list(getattr(keypoints, "xy", None))
    keypoint_scores = _as_list(getattr(keypoints, "conf", None))

    candidate_count = max(len(xyxy), len(keypoint_xy))
    detections: list[dict[str, Any]] = []

    for index in range(candidate_count):
        points = keypoint_xy[index] if index < len(keypoint_xy) else []
        scores = keypoint_scores[index] if index < len(keypoint_scores) else []
        keypoint_items: list[dict[str, Any]] = []

        for keypoint_index, label in enumerate(KEYPOINT_LABELS):
            point = points[keypoint_index] if keypoint_index < len(points) else [0, 0]
            score = scores[keypoint_index] if keypoint_index < len(scores) else 0
            keypoint_items.append(
                {
                    "label": label,
                    "x": _clamp(float(point[0]), 0, width),
                    "y": _clamp(float(point[1]), 0, height),
                    "score": float(score),
                }
            )

        if index < len(box_scores):
            score = float(box_scores[index])
        elif keypoint_items:
            score = sum(keypoint["score"] for keypoint in keypoint_items) / len(keypoint_items)
        else:
            score = 0.0

        if score < threshold:
            continue

        if index < len(xyxy):
            box_values = xyxy[index]
            box = {
                "xmin": _clamp(float(box_values[0]), 0, width),
                "ymin": _clamp(float(box_values[1]), 0, height),
                "xmax": _clamp(float(box_values[2]), 0, width),
                "ymax": _clamp(float(box_values[3]), 0, height),
            }
        else:
            box = _box_from_keypoints(keypoint_items, width, height)

        detection: dict[str, Any] = {
            "label": "person",
            "score": score,
            "box": box,
            "keypoints": keypoint_items,
        }
        if index < len(box_ids):
            detection["id"] = int(box_ids[index])

        detections.append(detection)

    return sorted(detections, key=lambda item: item["score"], reverse=True)[:max_poses]


def make_prediction(
    frame: dict[str, Any],
    result: Any,
    width: int,
    height: int,
    threshold: float,
    timings: DetectionTimings,
    max_poses: int = 2,
) -> dict[str, Any]:
    return {
        "protocolVersion": MODEL_PREDICTION_PROTOCOL_VERSION,
        "type": "model-prediction",
        "frame": frame,
        "detections": extract_detections(result, width, height, threshold, max_poses),
        "timings": timings.to_frontend(),
    }
