import { TRACK_WIDTH } from '../gameConstants';
import { playerTrackX } from '../trackLayout';

export const HAND_RHYTHM_ROW_Y = [3.35, 1.95, 0.55] as const;

export function handRhythmPlayerWidth(playerCount: number): number {
  const normalizedPlayerCount = Math.max(1, playerCount);
  return normalizedPlayerCount === 1 ? 7.2 : TRACK_WIDTH / normalizedPlayerCount;
}

export type HandRhythmGridBounds = {
  bottom: number;
  centerX: number;
  centerY: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
};

export function getHandRhythmGridBounds(
  playerIndex: number,
  playerCount: number,
  gridSize: number
): HandRhythmGridBounds {
  const normalizedGridSize = Math.max(2, gridSize);
  const width = handRhythmPlayerWidth(playerCount);
  const cellHeight = (HAND_RHYTHM_ROW_Y[0] - HAND_RHYTHM_ROW_Y[2]) / (normalizedGridSize - 1);
  const height = cellHeight * normalizedGridSize;
  const centerX = playerTrackX(playerIndex, playerCount);
  const centerY = (HAND_RHYTHM_ROW_Y[0] + HAND_RHYTHM_ROW_Y[2]) / 2;

  return {
    bottom: centerY - height / 2,
    centerX,
    centerY,
    height,
    left: centerX - width / 2,
    right: centerX + width / 2,
    top: centerY + height / 2,
    width,
  };
}
