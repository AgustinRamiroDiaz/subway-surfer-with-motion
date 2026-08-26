import type { TranslationKey } from '../app/i18n';
import type { GameplayInputFrame, PoseInput, PosePlayerInput } from '../motion-mapping/gameplayInput';
import type { JumpDuckCell, PlayerCalibration } from '../motion-mapping/jumpDuckActions';
import type { DetectorBackendId, DetectorTask } from '../pose-detection/aiDetector';
import { PLAYER_BASE_Y } from './gameConstants';
import type { PoseRunnerGameId, RunnerGameId } from './gameTypes';
import { getJumpDuckPlayerMotion, JUMP_DUCK_SPAWN_INTERVAL_MS } from './levels/jumpDuckLevel';
import { getSidewaysPlayerTargetX, SIDEWAYS_LEVEL_SPAWN_INTERVAL_MS } from './levels/sidewaysLevel';

export type GameDescriptor = {
  id: RunnerGameId;
  modeLabelKey: TranslationKey;
  titleKey: TranslationKey;
  detectorTask: DetectorTask;
  defaultBackend: DetectorBackendId;
};

export type CameraFraming = {
  positionY: number;
  positionZ: number;
  targetZ: number;
};

export type PoseRunnerPlayerMotion = {
  targetX: number;
  targetY: number;
  targetScaleY: number;
  pose: PoseInput | null;
  jumpDuckCell: JumpDuckCell | null;
};

export type PoseRunnerMotionContext = {
  inputFrame: GameplayInputFrame;
  playerIndex: number;
  playerCount: number;
  calibration: PlayerCalibration | undefined;
};

export type PoseRunnerLevelDefinition = GameDescriptor & {
  id: PoseRunnerGameId;
  requiresCalibration: boolean;
  spawnIntervalMs: number;
  camera: CameraFraming;
  getPlayerMotion: (context: PoseRunnerMotionContext) => PoseRunnerPlayerMotion;
};

const RUNNER_CAMERA: CameraFraming = {
  positionY: 2.45,
  positionZ: 9.6,
  targetZ: -5,
};

export const GAME_CATALOG: readonly GameDescriptor[] = [
  { id: 'sideways', modeLabelKey: 'game.sidewaysMode', titleKey: 'game.sidewaysTitle', detectorTask: 'pose', defaultBackend: 'mediapipe' },
  { id: 'jump-duck', modeLabelKey: 'game.jumpDuckMode', titleKey: 'game.jumpDuckTitle', detectorTask: 'pose', defaultBackend: 'mediapipe' },
  { id: 'hand-rhythm', modeLabelKey: 'game.handRhythmMode', titleKey: 'game.handRhythmTitle', detectorTask: 'gesture', defaultBackend: 'mediapipe-gesture' },
  { id: 'climber', modeLabelKey: 'game.climberMode', titleKey: 'game.climberTitle', detectorTask: 'gesture', defaultBackend: 'mediapipe-gesture' },
] as const;

function getPosePlayer(context: PoseRunnerMotionContext): PosePlayerInput | undefined {
  return context.inputFrame.kind === 'pose'
    ? context.inputFrame.players[context.playerIndex]
    : undefined;
}

export const POSE_RUNNER_LEVELS: readonly PoseRunnerLevelDefinition[] = [
  {
    ...GAME_CATALOG[0],
    id: 'sideways',
    requiresCalibration: false,
    spawnIntervalMs: SIDEWAYS_LEVEL_SPAWN_INTERVAL_MS,
    camera: RUNNER_CAMERA,
    getPlayerMotion: (context) => {
      const player = getPosePlayer(context);
      return {
        targetX: getSidewaysPlayerTargetX(player?.normalizedX ?? 0.5),
        targetY: PLAYER_BASE_Y,
        targetScaleY: 1,
        pose: player?.pose ?? null,
        jumpDuckCell: null,
      };
    },
  },
  {
    ...GAME_CATALOG[1],
    id: 'jump-duck',
    requiresCalibration: true,
    spawnIntervalMs: JUMP_DUCK_SPAWN_INTERVAL_MS,
    camera: RUNNER_CAMERA,
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
        jumpDuckCell: motion.cell,
      };
    },
  },
] as const;

export function getGameDescriptor(gameId: RunnerGameId): GameDescriptor {
  return GAME_CATALOG.find((game) => game.id === gameId) ?? GAME_CATALOG[0];
}

export function getPoseRunnerLevel(gameId: PoseRunnerGameId): PoseRunnerLevelDefinition {
  return POSE_RUNNER_LEVELS.find((level) => level.id === gameId) ?? POSE_RUNNER_LEVELS[0];
}
