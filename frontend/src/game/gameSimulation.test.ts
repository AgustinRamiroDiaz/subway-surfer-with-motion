import { describe, expect, test } from 'vitest';
import {
  advanceGameSimulation,
  clearHitStatus,
  createDefaultStats,
  createGameSimulationClock,
  findJumpDuckPieceHits,
  isPlayerInCollisionRange,
  randomIndex,
  recordDodgedObstacle,
  recordPlayerHit,
  recordPlayerMiss,
} from './gameSimulation';

describe('game simulation', () => {
  test('advances with capped deltas and deterministic spawn timing', () => {
    const clock = createGameSimulationClock(1_000, 1_500);
    const first = advanceGameSimulation(clock, 1_016, 'running', 1_500);
    const second = advanceGameSimulation(first.clock, 3_000, 'running', 1_500);

    expect(first.shouldSpawn).toBe(true);
    expect(first.deltaSeconds).toBeCloseTo(0.016);
    expect(second.shouldSpawn).toBe(true);
    expect(second.deltaSeconds).toBe(0.05);
  });

  test('freezes spawn time while paused', () => {
    const clock = createGameSimulationClock(1_000, 1_500);
    const running = advanceGameSimulation(clock, 1_010, 'running', 1_500);
    const paused = advanceGameSimulation(running.clock, 10_010, 'paused', 1_500);
    const resumed = advanceGameSimulation(paused.clock, 10_020, 'running', 1_500);

    expect(resumed.shouldSpawn).toBe(false);
    expect(resumed.deltaSeconds).toBeCloseTo(0.01);
  });

  test('updates score immutably', () => {
    const initial = createDefaultStats(2);
    const hit = recordPlayerHit(initial, 1, 2);
    const missed = recordPlayerMiss(hit, 0);
    const dodged = recordDodgedObstacle(missed);

    expect(initial).toEqual({
      dodged: 0,
      hits: [0, 0],
      misses: [0, 0],
      status: 'running',
      hitPlayer: null,
    });
    expect(clearHitStatus(dodged)).toEqual({
      dodged: 1,
      hits: [0, 2],
      misses: [1, 0],
      status: 'running',
      hitPlayer: null,
    });
  });

  test('resolves collision and level actions without Three.js objects', () => {
    expect(isPlayerInCollisionRange({
      kind: 'sideways',
      obstacleX: 0,
      obstacleY: 0,
      obstacleZ: 2,
      playerX: 0.1,
      playerY: 100,
      playerZ: 2.1,
      alreadyHit: false,
      radiusX: 0.5,
      radiusZ: 0.5,
    })).toBe(true);

    const hits = findJumpDuckPieceHits([
      { cell: 'bottom-left', blockedVerticals: ['run'], blockedHorizontals: ['left'] },
      { cell: 'top-right', blockedVerticals: ['jump'], blockedHorizontals: ['right'] },
    ], new Set(), 0, 'run-left');
    expect(hits).toEqual([{ key: '0:bottom-left', pieceIndex: 0 }]);
  });

  test('uses an injected random source', () => {
    expect(randomIndex(4, () => 0.74)).toBe(2);
  });
});
