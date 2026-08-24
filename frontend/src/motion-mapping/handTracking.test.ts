import { describe, expect, test } from 'vitest';
import type { HandInput } from './gameplayInput';
import { assignHandsByNearestPosition, createHandTrackingState } from './handTracking';

function hand(normalizedX: number, normalizedY: number, gesture: string): HandInput {
  return { normalizedX, normalizedY, gesture };
}

describe('hand tracking', () => {
  test('keeps hand slots attached to the nearest prior position when detector order changes', () => {
    const first = assignHandsByNearestPosition([
      [hand(0.2, 0.5, 'Left'), hand(0.8, 0.5, 'Right')],
    ], createHandTrackingState(1));
    const second = assignHandsByNearestPosition([
      [hand(0.78, 0.5, 'Right next'), hand(0.22, 0.5, 'Left next')],
    ], first.state);

    expect(second.handsByPlayer[0].map((item) => item?.gesture)).toEqual(['Left next', 'Right next']);
  });

  test('leaves the missing slot empty without moving the remaining hand', () => {
    const first = assignHandsByNearestPosition([
      [hand(0.2, 0.5, 'Left'), hand(0.8, 0.5, 'Right')],
    ], createHandTrackingState(1));
    const missingLeft = assignHandsByNearestPosition([
      [hand(0.76, 0.52, 'Right')],
    ], first.state);

    expect(missingLeft.handsByPlayer[0].map((item) => item?.gesture ?? null)).toEqual([null, 'Right']);
  });

  test('tracks each player section independently', () => {
    const result = assignHandsByNearestPosition([
      [hand(0.1, 0.4, 'P1')],
      [hand(0.9, 0.6, 'P2')],
    ], createHandTrackingState(2));

    expect(result.handsByPlayer.map((hands) => hands[0]?.gesture)).toEqual(['P1', 'P2']);
  });
});
