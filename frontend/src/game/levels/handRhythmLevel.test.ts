import { describe, expect, test } from 'vitest';
import { isHandRhythmPlayerReady } from './handRhythmLevel';

describe('Hand Rhythm player readiness', () => {
  test('requires an open palm in the middle of the player section', () => {
    expect(isHandRhythmPlayerReady({
      gesture: 'Open_Palm',
      normalizedX: 0.25,
      normalizedY: 0.5,
    }, 0, 2)).toBe(true);
    expect(isHandRhythmPlayerReady({
      gesture: 'Victory',
      normalizedX: 0.25,
      normalizedY: 0.5,
    }, 0, 2)).toBe(false);
    expect(isHandRhythmPlayerReady({
      gesture: 'Open_Palm',
      normalizedX: 0.49,
      normalizedY: 0.5,
    }, 0, 2)).toBe(false);
  });

  test('uses the second player section for its local center', () => {
    expect(isHandRhythmPlayerReady({
      gesture: 'Open_Palm',
      normalizedX: 0.75,
      normalizedY: 0.5,
    }, 1, 2)).toBe(true);
    expect(isHandRhythmPlayerReady(null, 1, 2)).toBe(false);
  });
});
