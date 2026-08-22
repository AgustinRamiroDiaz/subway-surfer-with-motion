from __future__ import annotations

import threading

import numpy as np
from ultralytics import YOLO

from pose_estimation_tracker_server.protocol import (
    DetectionTimings,
    decode_base64_image,
    make_prediction,
    monotonic_ms,
)

type JsonObject = dict[str, object]
type Prediction = dict[str, object]


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
