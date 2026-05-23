import { describe, expect, test } from 'vitest';
import type { PersonDetection } from '../pose-detection/detectionSchema';
import { DEFAULT_PLAYER_POSITIONS, getDefaultPlayerPositions, getPlayerPositions } from './playerPositions';

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

  test('supports one to four configured players', () => {
    expect(getDefaultPlayerPositions(1)).toEqual([0.5]);
    expect(getDefaultPlayerPositions(3)).toEqual([0.25, 0.5, 0.75]);
    expect(getDefaultPlayerPositions(4)).toEqual([0.2, 0.4, 0.6, 0.8]);

    expect(getPlayerPositions([
      makeDetection(0, 50, 0.95),
      makeDetection(100, 150, 0.94),
      makeDetection(200, 250, 0.93),
      makeDetection(300, 350, 0.92),
    ], 400, false, 4)).toEqual([0.0625, 0.3125, 0.5625, 0.8125]);
  });

  test('orders mirrored camera positions by the displayed direction', () => {
    const detections = [
      makeDetection(40, 120, 0.95),
      makeDetection(360, 440, 0.9),
    ];

    expect(getPlayerPositions(detections, 500, true)).toEqual([0.19999999999999996, 0.84]);
  });
});
