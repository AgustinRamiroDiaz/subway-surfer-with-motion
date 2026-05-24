import type { HandGestureDetection, PersonDetection, PoseKeypoint } from '../pose-detection/detectionSchema';

const KEYPOINT_CONFIDENCE = 0.2;

export type JumpDuckGuide = {
  playerIndex: number;
  jumpY: number;
  duckY: number;
  leftX: number;
  rightX: number;
};

export type VerticalAction = 'jump' | 'run' | 'duck';
export type HorizontalAction = 'left' | 'center' | 'right';
export type JumpDuckCell = `${VerticalAction}-${HorizontalAction}`;

export type PoseVerticalMetrics = {
  eyesY: number;
  shouldersY: number;
  eyeToShoulderDistance: number;
  faceCenterX: number;
  shoulderCenterX: number;
  shoulderHalfWidth: number;
  armsUp: boolean;
};

export type PlayerCalibration = PoseVerticalMetrics;

export type CalibrationSample = PoseVerticalMetrics;

export type CalibrationRun = {
  startedAt: number | null;
  samples: CalibrationSample[][];
  players: PlayerCalibration[] | null;
};

function findKeypoint(detection: PersonDetection | HandGestureDetection | null, label: string): PoseKeypoint | null {
  const keypoint = detection?.keypoints?.find((item) => item.label === label);
  if (!keypoint || keypoint.score < KEYPOINT_CONFIDENCE) {
    return null;
  }
  return keypoint;
}

function averageKeypointY(keypoints: Array<PoseKeypoint | null>): number | null {
  const visibleKeypoints = keypoints.filter((keypoint): keypoint is PoseKeypoint => keypoint !== null);
  if (!visibleKeypoints.length) {
    return null;
  }

  return visibleKeypoints.reduce((sum, keypoint) => sum + keypoint.y, 0) / visibleKeypoints.length;
}

function averageKeypointX(keypoints: Array<PoseKeypoint | null>): number | null {
  const visibleKeypoints = keypoints.filter((keypoint): keypoint is PoseKeypoint => keypoint !== null);
  if (!visibleKeypoints.length) {
    return null;
  }

  return visibleKeypoints.reduce((sum, keypoint) => sum + keypoint.x, 0) / visibleKeypoints.length;
}

export function getPoseVerticalMetrics(detection: PersonDetection | HandGestureDetection | null): PoseVerticalMetrics | null {
  if (detection?.label === 'hand') {
    return null;
  }
  const leftEye = findKeypoint(detection, 'Left Eye');
  const rightEye = findKeypoint(detection, 'Right Eye');
  const nose = findKeypoint(detection, 'Nose');
  const leftShoulder = findKeypoint(detection, 'Left Shoulder');
  const rightShoulder = findKeypoint(detection, 'Right Shoulder');
  const leftWrist = findKeypoint(detection, 'Left Wrist');
  const rightWrist = findKeypoint(detection, 'Right Wrist');
  const eyesY = averageKeypointY([leftEye, rightEye]) ?? nose?.y ?? null;
  const shouldersY = averageKeypointY([leftShoulder, rightShoulder]);
  const faceCenterX = averageKeypointX([leftEye, rightEye]) ?? nose?.x ?? null;
  const shoulderCenterX = averageKeypointX([leftShoulder, rightShoulder]);

  if (eyesY === null || shouldersY === null || faceCenterX === null || shoulderCenterX === null || !leftShoulder || !rightShoulder) {
    return null;
  }

  const eyeToShoulderDistance = Math.max(1, shouldersY - eyesY);
  const shoulderHalfWidth = Math.max(1, Math.abs(rightShoulder.x - leftShoulder.x) / 2);

  return {
    eyesY,
    shouldersY,
    eyeToShoulderDistance,
    faceCenterX,
    shoulderCenterX,
    shoulderHalfWidth,
    armsUp: Boolean(leftWrist && rightWrist && leftWrist.y < eyesY && rightWrist.y < eyesY),
  };
}

export function averageMetrics(samples: CalibrationSample[]): PlayerCalibration | null {
  if (!samples.length) {
    return null;
  }

  const total = samples.reduce(
    (sum, sample) => ({
      eyesY: sum.eyesY + sample.eyesY,
      shouldersY: sum.shouldersY + sample.shouldersY,
      eyeToShoulderDistance: sum.eyeToShoulderDistance + sample.eyeToShoulderDistance,
      faceCenterX: sum.faceCenterX + sample.faceCenterX,
      shoulderCenterX: sum.shoulderCenterX + sample.shoulderCenterX,
      shoulderHalfWidth: sum.shoulderHalfWidth + sample.shoulderHalfWidth,
    }),
    { eyesY: 0, shouldersY: 0, eyeToShoulderDistance: 0, faceCenterX: 0, shoulderCenterX: 0, shoulderHalfWidth: 0 }
  );

  return {
    eyesY: total.eyesY / samples.length,
    shouldersY: total.shouldersY / samples.length,
    eyeToShoulderDistance: total.eyeToShoulderDistance / samples.length,
    faceCenterX: total.faceCenterX / samples.length,
    shoulderCenterX: total.shoulderCenterX / samples.length,
    shoulderHalfWidth: total.shoulderHalfWidth / samples.length,
    armsUp: true,
  };
}

export function createCalibrationRun(playerCount: number): CalibrationRun {
  return {
    startedAt: null,
    samples: Array.from({ length: playerCount }, () => []),
    players: null,
  };
}

export function calibrationToGuides(players: PlayerCalibration[]): JumpDuckGuide[] {
  return players.map((player, playerIndex) => ({
    playerIndex,
    jumpY: player.eyesY - player.eyeToShoulderDistance / 2,
    duckY: player.shouldersY,
    leftX: player.shoulderCenterX - player.shoulderHalfWidth,
    rightX: player.shoulderCenterX + player.shoulderHalfWidth,
  }));
}

export function getVerticalAction(
  detection: PersonDetection | HandGestureDetection | null,
  calibration: PlayerCalibration | undefined
): VerticalAction {
  const metrics = getPoseVerticalMetrics(detection);
  if (!metrics || !calibration || calibration.eyeToShoulderDistance <= 0) {
    return 'run';
  }

  const jumpTargetY = calibration.eyesY - calibration.eyeToShoulderDistance / 2;
  const duckTargetY = calibration.shouldersY;

  if (metrics.eyesY <= jumpTargetY) {
    return 'jump';
  }

  if (metrics.eyesY >= duckTargetY) {
    return 'duck';
  }

  return 'run';
}

export function getHorizontalAction(
  detection: PersonDetection | HandGestureDetection | null,
  calibration: PlayerCalibration | undefined
): HorizontalAction {
  const metrics = getPoseVerticalMetrics(detection);
  if (!metrics || !calibration || calibration.shoulderHalfWidth <= 0) {
    return 'center';
  }

  const leftThreshold = calibration.shoulderCenterX - calibration.shoulderHalfWidth;
  const rightThreshold = calibration.shoulderCenterX + calibration.shoulderHalfWidth;

  if (metrics.faceCenterX <= leftThreshold) {
    return 'left';
  }

  if (metrics.faceCenterX >= rightThreshold) {
    return 'right';
  }

  return 'center';
}

export function getJumpDuckCell(
  detection: PersonDetection | HandGestureDetection | null,
  calibration: PlayerCalibration | undefined
): JumpDuckCell {
  return `${getVerticalAction(detection, calibration)}-${getHorizontalAction(detection, calibration)}`;
}
