import { TRACK_MAX_X, TRACK_MIN_X, TRACK_WIDTH } from './gameConstants';

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function positionToWorldX(position: number): number {
  const normalizedPosition = clamp(position, 0, 1);
  return TRACK_MIN_X + (TRACK_MAX_X - TRACK_MIN_X) * normalizedPosition;
}

export function playerTrackX(index: number, playerCount: number): number {
  const normalizedPlayerCount = Math.max(1, playerCount);
  if (normalizedPlayerCount <= 1) {
    return 0;
  }

  const clampedIndex = clamp(index, 0, normalizedPlayerCount - 1);
  const segmentWidth = TRACK_WIDTH / normalizedPlayerCount;
  return TRACK_MIN_X + segmentWidth * (clampedIndex + 0.5);
}

export function playerTrackWidth(playerCount: number): number {
  const normalizedPlayerCount = Math.max(1, playerCount);
  return normalizedPlayerCount <= 1 ? 4.6 : TRACK_WIDTH / normalizedPlayerCount;
}
