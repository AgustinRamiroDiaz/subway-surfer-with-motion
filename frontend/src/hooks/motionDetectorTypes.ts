import type { RefObject } from 'react';
import type { AppPreferences } from '../app/appPreferences';
import type { DetectorTimings } from '../pose-detection/aiDetector';
import type { HandGestureDetection, PersonDetection } from '../pose-detection/detectionSchema';
import type { DetectorTask } from '../pose-detection/detectorConfig';
import type { GameplayInputFrame } from '../motion-mapping/gameplayInput';

export type FrameTimings = DetectorTimings & {
  captureMs: number;
  analysisMs: number;
  overheadMs: number;
  drawMs: number;
  loopMs: number;
};

export type UseMotionDetectorOptions = {
  task: DetectorTask;
  preferences: AppPreferences;
  cameraEnabled: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  overlayRef: RefObject<HTMLCanvasElement | null>;
  streamRef: RefObject<MediaStream | null>;
  startCamera: () => Promise<MediaStream>;
  syncCanvasSize: () => void;
  clearOverlay: () => void;
};

export type MotionDetectorControls = {
  isDetecting: boolean;
  isLoading: boolean;
  status: string;
  modelStatus: string;
  detections: Array<PersonDetection | HandGestureDetection>;
  lastInferenceMs: number | null;
  frameTimings: FrameTimings | null;
  playerPositions: number[];
  playerPositionsRef: RefObject<number[]>;
  gameplayInputRef: RefObject<GameplayInputFrame>;
  error: string | null;
  clearDetectionState: () => void;
  resetDetector: () => void;
  startDetection: () => Promise<boolean>;
  stopDetection: () => void;
};
