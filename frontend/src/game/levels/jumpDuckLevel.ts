import * as THREE from 'three';
import {
  averageMetrics,
  calibrationToGuides,
  getJumpDuckCell,
  getPoseVerticalMetrics,
  type CalibrationRun,
  type HorizontalAction,
  type JumpDuckCell,
  type JumpDuckGuide,
  type PlayerCalibration,
  type VerticalAction,
} from '../../motion-mapping/jumpDuckActions';
import type { PoseInput } from '../../motion-mapping/gameplayInput';
import { playerTrackX } from '../trackWorld';

export const JUMP_DUCK_SPAWN_INTERVAL_MS = 1700;
export const JUMP_DUCK_CALIBRATION_MS = 3000;
export const JUMP_DUCK_MIN_SAMPLES = 10;

export type JumpDuckCalibrationState = {
  calibrated: boolean;
  progress: number;
};

export type JumpDuckPlayerMotion = {
  cell: JumpDuckCell;
  targetX: number;
  actionOffsetY: number;
  scaleY: number;
};

export type JumpDuckCalibrationUpdate =
  | {
      status: 'calibrating';
      progress: number;
    }
  | {
      status: 'calibrated';
      players: PlayerCalibration[];
      guides: JumpDuckGuide[];
    }
  | {
      status: 'unchanged';
    };

export function getInitialJumpDuckActions(playerCount: number): JumpDuckCell[] {
  return Array.from({ length: playerCount }, () => 'run-center');
}

export function getJumpDuckPlayerMotion(
  pose: PoseInput | null,
  calibration: PlayerCalibration | undefined,
  playerIndex: number,
  playerCount: number
): JumpDuckPlayerMotion {
  const cell = getJumpDuckCell(pose, calibration);
  const [verticalAction, horizontalAction] = cell.split('-') as [VerticalAction, HorizontalAction];
  const targetX = playerTrackX(playerIndex, playerCount) +
    (horizontalAction === 'left' ? -0.62 : horizontalAction === 'right' ? 0.62 : 0);
  const actionOffsetY = verticalAction === 'jump'
    ? 0.72
    : verticalAction === 'duck'
      ? -0.08
      : 0;

  return {
    cell,
    targetX,
    actionOffsetY,
    scaleY: verticalAction === 'duck' ? 0.72 : 1,
  };
}

export function updateJumpDuckCalibration(
  calibration: CalibrationRun,
  poses: Array<PoseInput | null>,
  now: number,
  lastProgress: number
): JumpDuckCalibrationUpdate {
  if (calibration.startedAt === null) {
    calibration.startedAt = now;
  }

  poses.forEach((pose, index) => {
    const metrics = getPoseVerticalMetrics(pose);
    if (metrics?.armsUp) {
      calibration.samples[index]?.push(metrics);
    }
  });

  const elapsedRatio = THREE.MathUtils.clamp((now - calibration.startedAt) / JUMP_DUCK_CALIBRATION_MS, 0, 1);
  const sampleRatio = Math.min(
    ...calibration.samples.map((samples) => THREE.MathUtils.clamp(samples.length / JUMP_DUCK_MIN_SAMPLES, 0, 1))
  );
  const progress = Math.min(elapsedRatio, sampleRatio);
  const roundedProgress = Math.round(progress * 100) / 100;

  const hasSamples = calibration.samples.every((samples) => samples.length >= JUMP_DUCK_MIN_SAMPLES);
  if (elapsedRatio >= 1 && hasSamples) {
    const players = calibration.samples.map((samples) => averageMetrics(samples));
    if (players.every((player): player is PlayerCalibration => player !== null)) {
      calibration.players = players;
      return {
        status: 'calibrated',
        players,
        guides: calibrationToGuides(players),
      };
    }
  }

  if (roundedProgress !== lastProgress) {
    return { status: 'calibrating', progress };
  }

  return { status: 'unchanged' };
}
