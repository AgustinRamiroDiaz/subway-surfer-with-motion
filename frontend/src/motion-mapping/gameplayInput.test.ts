import { describe, expect, test } from 'vitest';
import { createEmptyGameplayInputFrame, toHandInput, toPoseInput } from './gameplayInput';

describe('gameplay input adapters', () => {
  test('removes detector transport metadata from pose inputs', () => {
    const pose = toPoseInput({
      id: 9,
      label: 'person',
      score: 0.98,
      box: { xmin: 10, ymin: 20, xmax: 110, ymax: 220 },
      keypoints: [{ label: 'Nose', x: 60, y: 40, score: 0.9 }],
    });

    expect(pose).toEqual({
      bounds: { left: 10, top: 20, right: 110, bottom: 220 },
      keypoints: [{ label: 'Nose', x: 60, y: 40, score: 0.9 }],
    });
    expect(pose).not.toHaveProperty('id');
    expect(pose).not.toHaveProperty('score');
  });

  test('normalizes hand position before it reaches gameplay', () => {
    const hand = toHandInput({
      label: 'hand',
      score: 0.95,
      gesture: 'Victory',
      box: { xmin: 50, ymin: 20, xmax: 150, ymax: 100 },
    }, 400, 200);

    expect(hand).toEqual({ gesture: 'Victory', normalizedX: 0.25, normalizedY: 0.3 });
  });

  test('creates task-specific empty frames', () => {
    expect(createEmptyGameplayInputFrame('pose', [0.25, 0.75])).toEqual({
      kind: 'pose',
      players: [
        { normalizedX: 0.25, pose: null },
        { normalizedX: 0.75, pose: null },
      ],
    });
    expect(createEmptyGameplayInputFrame('gesture', [0.5])).toEqual({
      kind: 'gesture',
      players: [{ hand: null }],
    });
  });
});
