import { describe, expect, test } from 'vitest';
import type { PersonDetection } from '../pose-detection/detectionSchema';
import { assignPlayerDetections, createPlayerTrackingState } from './playerTracking';

function person(id: number | undefined, centerX: number): PersonDetection {
  return {
    id,
    label: 'person',
    score: 0.9,
    box: { xmin: centerX - 10, ymin: 0, xmax: centerX + 10, ymax: 100 },
  };
}

describe('assignPlayerDetections', () => {
  test('keeps tracked people in stable player slots when they cross', () => {
    const first = assignPlayerDetections({
      detections: [person(1, 100), person(2, 400)],
      frameWidth: 500,
      mirrored: false,
      playerCount: 2,
      previousPositions: [0.33, 0.67],
      previousState: createPlayerTrackingState(2),
      nowMs: 0,
    });
    const crossed = assignPlayerDetections({
      detections: [person(2, 150), person(1, 350)],
      frameWidth: 500,
      mirrored: false,
      playerCount: 2,
      previousPositions: first.positions,
      previousState: first.state,
      nowMs: 100,
    });

    expect(first.state.trackIds).toEqual([1, 2]);
    expect(crossed.state.trackIds).toEqual([1, 2]);
    expect(crossed.positions).toEqual([0.7, 0.3]);
    expect(crossed.detections.map((detection) => detection?.id)).toEqual([1, 2]);
  });

  test('expires missing track assignments using injected time', () => {
    const first = assignPlayerDetections({
      detections: [person(1, 100), person(2, 400)],
      frameWidth: 500,
      mirrored: false,
      playerCount: 2,
      previousPositions: [0.33, 0.67],
      previousState: createPlayerTrackingState(2),
      nowMs: 0,
    });
    const afterTimeout = assignPlayerDetections({
      detections: [person(3, 250)],
      frameWidth: 500,
      mirrored: false,
      playerCount: 2,
      previousPositions: first.positions,
      previousState: first.state,
      nowMs: 2_001,
    });

    expect(afterTimeout.state.trackIds).toEqual([3, null]);
    expect(afterTimeout.positions[0]).toBe(0.5);
  });

  test('orders untracked detections in displayed mirrored order', () => {
    const result = assignPlayerDetections({
      detections: [person(undefined, 100), person(undefined, 400)],
      frameWidth: 500,
      mirrored: true,
      playerCount: 2,
      previousPositions: [0.33, 0.67],
      previousState: createPlayerTrackingState(2),
      nowMs: 0,
    });

    expect(result.positions).toEqual([0.19999999999999996, 0.8]);
    expect(result.detections.map((detection) => detection?.box.xmin)).toEqual([390, 90]);
  });
});
