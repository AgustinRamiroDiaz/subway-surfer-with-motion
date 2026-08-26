import { describe, expect, test } from 'vitest';
import { GAME_CATALOG, POSE_RUNNER_LEVELS, getGameDescriptor, getPoseRunnerLevel } from './levelRegistry';

describe('game catalog', () => {
  test('contains one descriptor for every selectable game', () => {
    expect(GAME_CATALOG.map((game) => game.id)).toEqual(['sideways', 'jump-duck', 'hand-rhythm', 'climber']);
    expect(new Set(GAME_CATALOG.map((game) => game.id)).size).toBe(GAME_CATALOG.length);
  });

  test('keeps detector compatibility in selection metadata', () => {
    expect(getGameDescriptor('sideways')).toMatchObject({ detectorTask: 'pose', defaultBackend: 'mediapipe' });
    expect(getGameDescriptor('hand-rhythm')).toMatchObject({ detectorTask: 'gesture', defaultBackend: 'mediapipe-gesture' });
    expect(getGameDescriptor('climber')).toMatchObject({ detectorTask: 'gesture', defaultBackend: 'mediapipe-gesture' });
  });
});

describe('pose runner levels', () => {
  test('contain only games that use the forward obstacle pipeline', () => {
    expect(POSE_RUNNER_LEVELS.map((level) => level.id)).toEqual(['sideways', 'jump-duck']);
  });

  test('map pose input without rhythm-only context', () => {
    const motion = getPoseRunnerLevel('sideways').getPlayerMotion({
      inputFrame: { kind: 'pose', players: [{ normalizedX: 0.75, pose: null }] },
      playerIndex: 0,
      playerCount: 1,
      calibration: undefined,
    });
    expect(motion.targetX).toBeGreaterThan(0);
    expect(motion.pose).toBeNull();
  });
});
