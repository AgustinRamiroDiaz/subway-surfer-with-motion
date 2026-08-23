import { describe, expect, test } from 'vitest';
import { TRACK_MAX_X, TRACK_MIN_X, TRACK_WIDTH } from './gameConstants';
import { getHandRhythmPlayerMotion } from './levels/handRhythmLevel';
import { handRhythmPlayerWidth } from './levels/handRhythmLayout';
import { getJumpDuckPlayerMotion } from './levels/jumpDuckLevel';
import { playerTrackWidth, playerTrackX, positionToWorldX } from './trackLayout';

describe('lane-based player layout', () => {
  test('splits the track width into one centered segment per player', () => {
    expect(playerTrackX(0, 1)).toBe(0);
    expect(playerTrackWidth(1)).toBeCloseTo(4.6);

    const fourPlayerCenters = Array.from({ length: 4 }, (_, index) => playerTrackX(index, 4));
    const segmentWidth = TRACK_WIDTH / 4;

    expect(playerTrackWidth(4)).toBeCloseTo(segmentWidth);
    expect(fourPlayerCenters).toEqual([
      TRACK_MIN_X + segmentWidth * 0.5,
      TRACK_MIN_X + segmentWidth * 1.5,
      TRACK_MIN_X + segmentWidth * 2.5,
      TRACK_MIN_X + segmentWidth * 3.5,
    ]);
    expect(fourPlayerCenters[0]).toBeGreaterThan(TRACK_MIN_X);
    expect(fourPlayerCenters[3]).toBeLessThan(TRACK_MAX_X);
  });

  test('uses the same visible lane centers for hand rhythm and jump-duck players', () => {
    const playerCount = 4;

    for (let index = 0; index < playerCount; index += 1) {
      const expectedX = playerTrackX(index, playerCount);

      expect(getHandRhythmPlayerMotion(null, index, playerCount).targetX).toBeCloseTo(expectedX);
      expect(getJumpDuckPlayerMotion(null, undefined, index, playerCount).targetX).toBeCloseTo(expectedX);
    }
  });

  test('quantizes hand rhythm detections to a configurable 2x2 grid', () => {
    const hand = {
      gesture: 'Open_Palm',
      normalizedX: 0.25,
      normalizedY: 0.25,
    };

    expect(getHandRhythmPlayerMotion(hand, 0, 1, 2).cell).toEqual({ row: 0, column: 0 });
  });

  test('keeps the world emoji at the exact registered hand coordinate', () => {
    const motion = getHandRhythmPlayerMotion({
      gesture: 'Victory',
      normalizedX: 0.25,
      normalizedY: 0.2,
      normalizedWidth: 0.1,
      normalizedHeight: 0.2,
    }, 0, 1, 3);

    expect(motion.emojiWorldX).toBeCloseTo(positionToWorldX(0.25));
    expect(motion.emojiWorldY).toBeCloseTo(3.35 - 0.2 * (3.35 - 0.55));
    expect(motion.emojiWorldWidth).toBeCloseTo(0.72);
    expect(motion.emojiWorldHeight).toBeCloseTo(0.56);
    expect(motion.targetX).not.toBe(motion.emojiWorldX);
  });

  test('expands one-player hand rhythm while splitting the arena for multiple players', () => {
    expect(handRhythmPlayerWidth(1)).toBe(7.2);
    expect(handRhythmPlayerWidth(2)).toBeCloseTo(TRACK_WIDTH / 2);
  });
});
