import { describe, expect, test } from 'vitest';
import { isHandRhythmTargetMatch } from './handRhythmJudgment';

describe('Hand Rhythm judgment', () => {
  test('requires both the expected gesture and grid cell', () => {
    const hand = { gesture: 'Victory', normalizedX: 0.5, normalizedY: 0.5 };
    expect(isHandRhythmTargetMatch(hand, { row: 1, column: 1 }, 'Victory', { row: 1, column: 1 })).toBe(true);
    expect(isHandRhythmTargetMatch(hand, { row: 1, column: 0 }, 'Victory', { row: 1, column: 1 })).toBe(false);
  });
});
