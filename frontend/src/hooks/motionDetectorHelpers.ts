import type { AppPreferences } from '../app/appPreferences';
import type { DetectorResult } from '../pose-detection/aiDetector';
import type { HandGestureDetection, PersonDetection } from '../pose-detection/detectionSchema';
import type { FrameTimings } from './motionDetectorTypes';

export const DETECTOR_UI_UPDATE_INTERVAL_MS = 200;

export function createEmptyTrackIds(playerCount: number): Array<number | null> {
  return Array.from({ length: playerCount }, () => null);
}

export function createEmptyPlayerDetections(
  playerCount: number
): Array<PersonDetection | HandGestureDetection | null> {
  return Array.from({ length: playerCount }, () => null);
}

export function isMediaPipeBackend(preferences: AppPreferences): boolean {
  return preferences.selectedBackendId === 'mediapipe' || preferences.selectedBackendId === 'mediapipe-gesture';
}

export function mirrorDetection<T extends PersonDetection | HandGestureDetection>(detection: T, frameWidth: number): T {
  return {
    ...detection,
    box: {
      ...detection.box,
      xmin: frameWidth - detection.box.xmax,
      xmax: frameWidth - detection.box.xmin,
    },
    keypoints: detection.keypoints?.map((keypoint) => ({
      ...keypoint,
      x: frameWidth - keypoint.x,
    })),
  } as T;
}

export function createFrameTimings(
  result: DetectorResult,
  captureMs: number,
  analysisMs: number,
  drawMs: number,
  loopStartedAt: number | null,
  drawDoneAt: number
): FrameTimings {
  const loopMs =
    loopStartedAt === null ? result.timings.totalMs + analysisMs + drawMs : drawDoneAt - loopStartedAt;
  const overheadMs = Math.max(0, loopMs - captureMs - result.timings.totalMs - analysisMs - drawMs);

  return {
    ...result.timings,
    captureMs,
    analysisMs,
    overheadMs,
    drawMs,
    loopMs,
  };
}
