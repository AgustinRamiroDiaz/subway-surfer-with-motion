import type {
  HorizontalAction,
  JumpDuckCell,
  VerticalAction,
} from '../motion-mapping/jumpDuckActions';
import type { GamePhase, GameStats, JumpDuckObstaclePiece, PoseRunnerGameId } from './gameTypes';

export type RandomSource = () => number;

export type GameSimulationClock = {
  lastTickAt: number;
  lastSpawnAt: number;
  statusResetAt: number | null;
};

export type GameSimulationStep = {
  clock: GameSimulationClock;
  deltaSeconds: number;
  shouldSpawn: boolean;
  shouldClearHitStatus: boolean;
};

export function createDefaultStats(playerCount: number): GameStats {
  return {
    dodged: 0,
    hits: Array.from({ length: playerCount }, () => 0),
    misses: Array.from({ length: playerCount }, () => 0),
    status: 'running',
    hitPlayer: null,
  };
}

export function createGameSimulationClock(nowMs: number, spawnIntervalMs: number): GameSimulationClock {
  return {
    lastTickAt: nowMs,
    lastSpawnAt: nowMs - spawnIntervalMs,
    statusResetAt: null,
  };
}

export function advanceGameSimulation(
  clock: GameSimulationClock,
  nowMs: number,
  phase: GamePhase,
  spawnIntervalMs: number,
  spawningEnabled = true
): GameSimulationStep {
  const elapsedMs = Math.max(0, nowMs - clock.lastTickAt);

  if (phase !== 'running') {
    return {
      clock: {
        lastTickAt: nowMs,
        lastSpawnAt: clock.lastSpawnAt + elapsedMs,
        statusResetAt: clock.statusResetAt === null ? null : clock.statusResetAt + elapsedMs,
      },
      deltaSeconds: 0,
      shouldSpawn: false,
      shouldClearHitStatus: false,
    };
  }

  const shouldSpawn = spawningEnabled && nowMs - clock.lastSpawnAt > spawnIntervalMs;
  const shouldClearHitStatus = clock.statusResetAt !== null && nowMs > clock.statusResetAt;

  return {
    clock: {
      lastTickAt: nowMs,
      lastSpawnAt: shouldSpawn ? nowMs : clock.lastSpawnAt,
      statusResetAt: shouldClearHitStatus ? null : clock.statusResetAt,
    },
    deltaSeconds: Math.min(0.05, elapsedMs / 1_000),
    shouldSpawn,
    shouldClearHitStatus,
  };
}

export function delayNextSpawn(clock: GameSimulationClock, nowMs: number): GameSimulationClock {
  return { ...clock, lastSpawnAt: nowMs };
}

export function scheduleHitStatusReset(
  clock: GameSimulationClock,
  nowMs: number,
  durationMs: number
): GameSimulationClock {
  return { ...clock, statusResetAt: nowMs + durationMs };
}

export function recordPlayerHit(stats: GameStats, playerIndex: number, hitCount: number): GameStats {
  return {
    dodged: stats.dodged,
    hits: stats.hits.map((hits, index) => index === playerIndex ? hits + hitCount : hits),
    misses: stats.misses,
    status: 'hit',
    hitPlayer: playerIndex + 1,
  };
}

export function recordPlayerMiss(stats: GameStats, playerIndex: number): GameStats {
  return {
    ...stats,
    misses: stats.misses.map((misses, index) => index === playerIndex ? misses + 1 : misses),
  };
}

export function recordDodgedObstacle(stats: GameStats): GameStats {
  return { ...stats, dodged: stats.dodged + 1 };
}

export function clearHitStatus(stats: GameStats): GameStats {
  return { ...stats, status: 'running', hitPlayer: null };
}

type CollisionInput = {
  kind: PoseRunnerGameId;
  obstacleX: number;
  obstacleY: number;
  obstacleZ: number;
  playerX: number;
  playerY: number;
  playerZ: number;
  alreadyHit: boolean;
  radiusX: number;
  radiusZ: number;
};

export function isPlayerInCollisionRange(input: CollisionInput): boolean {
  const canHitPlayer = input.kind !== 'sideways' || !input.alreadyHit;
  return canHitPlayer &&
    Math.abs(input.obstacleX - input.playerX) < input.radiusX &&
    Math.abs(input.obstacleZ - input.playerZ) < input.radiusZ;
}

export type JumpDuckPieceHit = {
  key: string;
  pieceIndex: number;
};

export function findJumpDuckPieceHits(
  pieces: Array<Pick<JumpDuckObstaclePiece, 'cell' | 'blockedVerticals' | 'blockedHorizontals'>>,
  existingHitKeys: ReadonlySet<string>,
  playerIndex: number,
  cell: JumpDuckCell
): JumpDuckPieceHit[] {
  const [verticalAction, horizontalAction] = cell.split('-') as [VerticalAction, HorizontalAction];

  return pieces.flatMap((piece, pieceIndex) => {
    const key = `${playerIndex}:${piece.cell}`;
    const isHit = !existingHitKeys.has(key) &&
      piece.blockedVerticals.includes(verticalAction) &&
      piece.blockedHorizontals.includes(horizontalAction);
    return isHit ? [{ key, pieceIndex }] : [];
  });
}

export function randomIndex(length: number, random: RandomSource): number {
  if (length <= 0) {
    return 0;
  }
  return Math.min(length - 1, Math.max(0, Math.floor(random() * length)));
}
