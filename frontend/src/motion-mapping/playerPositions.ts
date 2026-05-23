import type { PersonDetection } from '../pose-detection/detectionSchema';

export const DEFAULT_PLAYER_POSITION = 0.5;
export const DEFAULT_PLAYER_POSITIONS = [0.33, 0.67] as const;
export const DEFAULT_PLAYER_COUNT = 2;
export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 4;

export function normalizePlayerCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_PLAYER_COUNT;
  }

  return Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, Math.round(value)));
}

export function getDefaultPlayerPositions(playerCount = DEFAULT_PLAYER_COUNT): number[] {
  const normalizedPlayerCount = normalizePlayerCount(playerCount);

  if (normalizedPlayerCount === DEFAULT_PLAYER_POSITIONS.length) {
    return [...DEFAULT_PLAYER_POSITIONS];
  }

  return Array.from(
    { length: normalizedPlayerCount },
    (_, index) => (index + 1) / (normalizedPlayerCount + 1)
  );
}

export function getPersonPosition(detection: PersonDetection, frameWidth: number): number {
  if (!frameWidth) {
    return DEFAULT_PLAYER_POSITION;
  }

  const nose = detection.keypoints?.find((keypoint) => keypoint.label === 'Nose');
  const referenceX = nose && Number.isFinite(nose.x)
    ? nose.x
    : (detection.box.xmin + detection.box.xmax) / 2;

  return Math.max(0, Math.min(1, referenceX / frameWidth));
}

export function getPlayerPositions(
  detections: PersonDetection[],
  frameWidth: number,
  cameraMirrored: boolean,
  playerCount = DEFAULT_PLAYER_COUNT
): number[] {
  const fallbackPositions = getDefaultPlayerPositions(playerCount);

  if (!detections.length) {
    return fallbackPositions;
  }

  const detectedPositions = detections
    .slice(0, fallbackPositions.length)
    .map((detection) => {
      const position = getPersonPosition(detection, frameWidth);
      return cameraMirrored ? 1 - position : position;
    })
    .sort((left, right) => left - right);

  return fallbackPositions.map((fallbackPosition, index) => detectedPositions[index] ?? fallbackPosition);
}
