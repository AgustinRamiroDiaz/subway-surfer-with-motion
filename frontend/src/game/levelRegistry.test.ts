import { describe, expect, test } from 'vitest';
import { RUNNER_LEVELS, getRunnerLevel } from './levelRegistry';

describe('runner level registry', () => {
  test('contains one complete definition for every runner level', () => {
    expect(RUNNER_LEVELS.map((level) => level.id)).toEqual([
      'sideways',
      'jump-duck',
      'hand-rhythm',
    ]);
    expect(new Set(RUNNER_LEVELS.map((level) => level.id)).size).toBe(RUNNER_LEVELS.length);
  });

  test('declares detector compatibility alongside each level', () => {
    expect(getRunnerLevel('sideways')).toMatchObject({
      detectorTask: 'pose',
      defaultBackend: 'mediapipe',
      inputKind: 'pose',
    });
    expect(getRunnerLevel('hand-rhythm')).toMatchObject({
      detectorTask: 'gesture',
      defaultBackend: 'mediapipe-gesture',
      inputKind: 'gesture',
    });
  });

  test('maps player input through level-specific motion behavior', () => {
    const motion = getRunnerLevel('sideways').getPlayerMotion({
      inputFrame: {
        kind: 'pose',
        players: [{ normalizedX: 0.75, pose: null }],
      },
      playerIndex: 0,
      playerCount: 1,
      calibration: undefined,
      handRhythmGridSize: 3,
    });

    expect(motion.targetX).toBeGreaterThan(0);
    expect(motion.pose).toBeNull();
  });
});
