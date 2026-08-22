import { TRACK_WIDTH } from '../gameConstants';

export const HAND_RHYTHM_ROW_Y = [3.35, 1.95, 0.55] as const;

export function handRhythmPlayerWidth(playerCount: number): number {
  const normalizedPlayerCount = Math.max(1, playerCount);
  return normalizedPlayerCount === 1 ? 7.2 : TRACK_WIDTH / normalizedPlayerCount;
}
