import { describe, expect, test } from 'vitest';
import type { PersonDetection } from './aiDetector';
import { DEFAULT_PLAYER_POSITIONS, getPlayerPositions } from './poseOverlay';

function makeDetection(xmin: number, xmax: number, score: number): PersonDetection {
  return {
    label: 'person',
    score,
    box: {
      xmin,
      ymin: 0,
      xmax,
      ymax: 100,
    },
  };
}

describe('getPlayerPositions', () => {
  test('uses two detected people from left to right', () => {
    const detections = [
      makeDetection(360, 440, 0.95),
      makeDetection(40, 120, 0.9),
    ];

    expect(getPlayerPositions(detections, 500, false)).toEqual([0.16, 0.8]);
  });

  test('falls back to default slots when fewer than two people are visible', () => {
    expect(getPlayerPositions([], 500, false)).toEqual([...DEFAULT_PLAYER_POSITIONS]);
    expect(getPlayerPositions([makeDetection(220, 280, 0.95)], 500, false)).toEqual([0.5, 0.67]);
  });

  test('orders mirrored camera positions by the displayed direction', () => {
    const detections = [
      makeDetection(40, 120, 0.95),
      makeDetection(360, 440, 0.9),
    ];

    expect(getPlayerPositions(detections, 500, true)).toEqual([0.19999999999999996, 0.84]);
  });
});
