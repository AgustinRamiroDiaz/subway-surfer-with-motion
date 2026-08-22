import type { DetectorResult } from '../pose-detection/aiDetector';
import type { DetectorTask } from '../pose-detection/detectorConfig';
import type { HandGestureDetection, PersonDetection } from '../pose-detection/detectionSchema';

const DETECTOR_MAX_FRAME_WIDTH_BY_TASK: Record<DetectorTask, number> = {
  gesture: 960,
  pose: 1280,
};

export function getDetectorFrameSize(videoWidth: number, videoHeight: number, task: DetectorTask): {
  width: number;
  height: number;
} {
  const maxWidth = DETECTOR_MAX_FRAME_WIDTH_BY_TASK[task];
  const scale = Math.min(1, maxWidth / Math.max(1, videoWidth));

  return {
    width: Math.max(1, Math.round(videoWidth * scale)),
    height: Math.max(1, Math.round(videoHeight * scale)),
  };
}

function scaleDetectionToFrame<T extends PersonDetection | HandGestureDetection>(
  detection: T,
  scaleX: number,
  scaleY: number
): T {
  return {
    ...detection,
    box: {
      xmin: detection.box.xmin * scaleX,
      ymin: detection.box.ymin * scaleY,
      xmax: detection.box.xmax * scaleX,
      ymax: detection.box.ymax * scaleY,
    },
    keypoints: detection.keypoints?.map((keypoint) => ({
      ...keypoint,
      x: keypoint.x * scaleX,
      y: keypoint.y * scaleY,
    })),
  };
}

export function scaleDetectorResultToFrame(
  result: DetectorResult,
  frameWidth: number,
  frameHeight: number
): DetectorResult {
  if (result.frame.width === frameWidth && result.frame.height === frameHeight) {
    return result;
  }

  const scaleX = frameWidth / Math.max(1, result.frame.width);
  const scaleY = frameHeight / Math.max(1, result.frame.height);

  return {
    ...result,
    frame: {
      ...result.frame,
      width: frameWidth,
      height: frameHeight,
    },
    detections: result.detections.map((detection) => scaleDetectionToFrame(detection, scaleX, scaleY)),
  };
}
