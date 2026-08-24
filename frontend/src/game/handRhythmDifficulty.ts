export const HAND_RHYTHM_DIFFICULTIES = ['easy', 'medium', 'hard'] as const;

export type HandRhythmDifficulty = (typeof HAND_RHYTHM_DIFFICULTIES)[number];

export const DEFAULT_HAND_RHYTHM_DIFFICULTY: HandRhythmDifficulty = 'medium';

export function isHandRhythmDifficulty(value: unknown): value is HandRhythmDifficulty {
  return HAND_RHYTHM_DIFFICULTIES.includes(value as HandRhythmDifficulty);
}
