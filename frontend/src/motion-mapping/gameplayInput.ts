import type {
  HandGestureDetection,
  PersonDetection,
} from '../pose-detection/detectionSchema';

export type PoseInputKeypoint = {
  label: string;
  x: number;
  y: number;
  z?: number;
  score: number;
};

export type PoseInput = {
  bounds: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
  keypoints: PoseInputKeypoint[];
};

export type HandInput = {
  gesture: string;
  normalizedX: number;
  normalizedY: number;
  normalizedWidth?: number;
  normalizedHeight?: number;
};

export type PosePlayerInput = {
  normalizedX: number;
  pose: PoseInput | null;
};

export type HandPlayerInput = {
  hand: HandInput | null;
};

export type GameplayInputFrame =
  | { kind: 'pose'; players: PosePlayerInput[] }
  | { kind: 'gesture'; players: HandPlayerInput[] };

export function toPoseInput(detection: PersonDetection | null): PoseInput | null {
  if (!detection) {
    return null;
  }

  return {
    bounds: {
      left: detection.box.xmin,
      top: detection.box.ymin,
      right: detection.box.xmax,
      bottom: detection.box.ymax,
    },
    keypoints: detection.keypoints ?? [],
  };
}

export function toHandInput(
  detection: HandGestureDetection | null,
  frameWidth: number,
  frameHeight: number
): HandInput | null {
  if (!detection || frameWidth <= 0 || frameHeight <= 0) {
    return null;
  }

  return {
    gesture: detection.gesture,
    normalizedX: ((detection.box.xmin + detection.box.xmax) / 2) / frameWidth,
    normalizedY: ((detection.box.ymin + detection.box.ymax) / 2) / frameHeight,
    normalizedWidth: Math.max(0, (detection.box.xmax - detection.box.xmin) / frameWidth),
    normalizedHeight: Math.max(0, (detection.box.ymax - detection.box.ymin) / frameHeight),
  };
}

export function createEmptyGameplayInputFrame(
  kind: GameplayInputFrame['kind'],
  normalizedPositions: number[]
): GameplayInputFrame {
  if (kind === 'gesture') {
    return {
      kind,
      players: normalizedPositions.map(() => ({ hand: null })),
    };
  }

  return {
    kind,
    players: normalizedPositions.map((normalizedX) => ({ normalizedX, pose: null })),
  };
}
