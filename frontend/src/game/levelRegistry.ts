import type { TranslationKey } from '../app/i18n';
import type {
  GameplayInputFrame,
  PoseInput,
  PosePlayerInput,
} from '../motion-mapping/gameplayInput';
import type { JumpDuckCell, PlayerCalibration } from '../motion-mapping/jumpDuckActions';
import type { DetectorBackendId, DetectorTask } from '../pose-detection/aiDetector';
import { PLAYER_BASE_Y } from './gameConstants';
import type { RunnerGameId } from './gameTypes';
import {
  getHandRhythmPlayerMotion,
  type HandRhythmGridSize,
} from './levels/handRhythmLevel';
import {
  getJumpDuckPlayerMotion,
  JUMP_DUCK_SPAWN_INTERVAL_MS,
} from './levels/jumpDuckLevel';
import {
  getSidewaysPlayerTargetX,
  SIDEWAYS_LEVEL_SPAWN_INTERVAL_MS,
} from './levels/sidewaysLevel';
import { HAND_RHYTHM_SPAWN_INTERVAL_MS } from './levels/handRhythmLevel';

export type LevelPlayerMotion = {
  targetX: number;
  targetY: number;
  targetScaleY: number;
  pose: PoseInput | null;
  gesture: string | null;
  jumpDuckCell: JumpDuckCell | null;
};

export type LevelPlayerMotionContext = {
  inputFrame: GameplayInputFrame;
  playerIndex: number;
  playerCount: number;
  calibration: PlayerCalibration | undefined;
  handRhythmGridSize: HandRhythmGridSize;
};

export type RunnerLevelDefinition = {
  id: RunnerGameId;
  modeLabelKey: TranslationKey;
  titleKey: TranslationKey;
  detectorTask: DetectorTask;
  defaultBackend: DetectorBackendId;
  inputKind: GameplayInputFrame['kind'];
  requiresCalibration: boolean;
  spawnIntervalMs: number;
  getPlayerMotion: (context: LevelPlayerMotionContext) => LevelPlayerMotion;
};

function getPosePlayer(context: LevelPlayerMotionContext): PosePlayerInput | undefined {
  return context.inputFrame.kind === 'pose'
    ? context.inputFrame.players[context.playerIndex]
    : undefined;
}

export const RUNNER_LEVELS: readonly RunnerLevelDefinition[] = [
  {
    id: 'sideways',
    modeLabelKey: 'game.sidewaysMode',
    titleKey: 'game.sidewaysTitle',
    detectorTask: 'pose',
    defaultBackend: 'mediapipe',
    inputKind: 'pose',
    requiresCalibration: false,
    spawnIntervalMs: SIDEWAYS_LEVEL_SPAWN_INTERVAL_MS,
    getPlayerMotion: (context) => {
      const player = getPosePlayer(context);
      return {
        targetX: getSidewaysPlayerTargetX(player?.normalizedX ?? 0.5),
        targetY: PLAYER_BASE_Y,
        targetScaleY: 1,
        pose: player?.pose ?? null,
        gesture: null,
        jumpDuckCell: null,
      };
    },
  },
  {
    id: 'jump-duck',
    modeLabelKey: 'game.jumpDuckMode',
    titleKey: 'game.jumpDuckTitle',
    detectorTask: 'pose',
    defaultBackend: 'mediapipe',
    inputKind: 'pose',
    requiresCalibration: true,
    spawnIntervalMs: JUMP_DUCK_SPAWN_INTERVAL_MS,
    getPlayerMotion: (context) => {
      const player = getPosePlayer(context);
      const motion = getJumpDuckPlayerMotion(
        player?.pose ?? null,
        context.calibration,
        context.playerIndex,
        context.playerCount
      );
      return {
        targetX: motion.targetX,
        targetY: PLAYER_BASE_Y + motion.actionOffsetY,
        targetScaleY: motion.scaleY,
        pose: player?.pose ?? null,
        gesture: null,
        jumpDuckCell: motion.cell,
      };
    },
  },
  {
    id: 'hand-rhythm',
    modeLabelKey: 'game.handRhythmMode',
    titleKey: 'game.handRhythmTitle',
    detectorTask: 'gesture',
    defaultBackend: 'mediapipe-gesture',
    inputKind: 'gesture',
    requiresCalibration: false,
    spawnIntervalMs: HAND_RHYTHM_SPAWN_INTERVAL_MS,
    getPlayerMotion: (context) => {
      const hand = context.inputFrame.kind === 'gesture'
        ? context.inputFrame.players[context.playerIndex]?.hand ?? null
        : null;
      const motion = getHandRhythmPlayerMotion(
        hand,
        context.playerIndex,
        context.playerCount,
        context.handRhythmGridSize
      );
      return {
        targetX: motion.targetX,
        targetY: motion.targetY,
        targetScaleY: 1,
        pose: null,
        gesture: motion.gesture,
        jumpDuckCell: null,
      };
    },
  },
] as const;

export function getRunnerLevel(gameId: RunnerGameId): RunnerLevelDefinition {
  return RUNNER_LEVELS.find((level) => level.id === gameId) ?? RUNNER_LEVELS[0];
}
