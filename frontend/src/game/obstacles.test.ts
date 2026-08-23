import { describe, expect, test } from 'vitest';
import { getHandRhythmTargetPlayers } from './obstacles';

describe('Hand Rhythm target spawning', () => {
  test('gives every player an independent target when the double chance misses', () => {
    const players = getHandRhythmTargetPlayers(4, 0.1, () => 0.5);

    expect(players).toEqual([0, 1, 2, 3]);
  });

  test('adds a second target for each player independently when the chance hits', () => {
    const values = [0, 0, 0, 0];
    const players = getHandRhythmTargetPlayers(4, 0.1, () => values.shift() ?? 0);

    expect(players).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });

  test('supports both targets for a single player', () => {
    expect(getHandRhythmTargetPlayers(1, 1, () => 0)).toEqual([0, 0]);
  });
});
