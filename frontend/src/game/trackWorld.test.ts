import { describe, expect, test } from 'vitest';
import { TRACK_MAX_X, TRACK_MIN_X, TRACK_WIDTH } from './gameConstants';
import { getHandRhythmPlayerMotion } from './levels/handRhythmLevel';
import { getJumpDuckPlayerMotion } from './levels/jumpDuckLevel';
import { playerTrackWidth, playerTrackX } from './trackWorld';

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

      expect(getHandRhythmPlayerMotion(null, index, playerCount, 640, 480).targetX).toBeCloseTo(expectedX);
      expect(getJumpDuckPlayerMotion(null, undefined, index, playerCount).targetX).toBeCloseTo(expectedX);
    }
  });

  test('quantizes hand rhythm detections to a configurable 2x2 grid', () => {
    const detection = {
      label: 'hand' as const,
      score: 1,
      gesture: 'Open_Palm',
      box: { xmin: 20, ymin: 20, xmax: 80, ymax: 80 },
    };

    expect(getHandRhythmPlayerMotion(detection, 0, 1, 200, 200, 2).cell).toEqual({ row: 0, column: 0 });
  });
});
