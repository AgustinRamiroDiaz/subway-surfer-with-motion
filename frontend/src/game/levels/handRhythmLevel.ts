import type { HandGestureDetection } from '../../pose-detection/detectionSchema';
import { playerTrackWidth, playerTrackX } from '../trackWorld';

export type HandRhythmGesture =
  | 'Closed_Fist'
  | 'Open_Palm'
  | 'Pointing_Up'
  | 'Thumb_Down'
  | 'Thumb_Up'
  | 'Victory'
  | 'ILoveYou';

export const GESTURE_TO_EMOJI: Record<string, string> = {
  Closed_Fist: '✊',
  Open_Palm: '🖐️',
  Pointing_Up: '☝️',
  Thumb_Down: '👎',
  Thumb_Up: '👍',
  Victory: '✌️',
  ILoveYou: '🤟',
  None: '❓',
};

export const HAND_RHYTHM_GESTURES: HandRhythmGesture[] = [
  'Closed_Fist',
  'Open_Palm',
  'Pointing_Up',
  'Thumb_Down',
  'Thumb_Up',
  'Victory',
  'ILoveYou',
];

export const HAND_RHYTHM_SPAWN_INTERVAL_MS = 1500;
export const HAND_RHYTHM_GRID_SIZES = [2, 3] as const;
export type HandRhythmGridSize = (typeof HAND_RHYTHM_GRID_SIZES)[number];
export const DEFAULT_HAND_RHYTHM_GRID_SIZE: HandRhythmGridSize = 3;
export const HAND_RHYTHM_ROW_Y = [1.72, 1.16, 0.6] as const;

export type HandRhythmCell = { row: number; column: number };

export type HandRhythmPlayerMotion = {
  gesture: string;
  targetX: number;
  targetY: number;
  cell: HandRhythmCell;
};

export function getHandRhythmCell(
  detection: HandGestureDetection | null,
  playerIndex: number,
  playerCount: number,
  frameWidth: number,
  frameHeight: number,
  gridSize: HandRhythmGridSize = DEFAULT_HAND_RHYTHM_GRID_SIZE
): HandRhythmCell {
  if (!detection || !frameWidth || !frameHeight) {
    return { row: 1, column: 1 };
  }

  const centerX = ((detection.box.xmin + detection.box.xmax) / 2) / frameWidth;
  const centerY = ((detection.box.ymin + detection.box.ymax) / 2) / frameHeight;
  const sectionStart = playerIndex / Math.max(1, playerCount);
  const localX = (centerX - sectionStart) * Math.max(1, playerCount);

  return {
    row: Math.min(gridSize - 1, Math.max(0, Math.floor(centerY * gridSize))),
    column: Math.min(gridSize - 1, Math.max(0, Math.floor(localX * gridSize))),
  };
}

export function getHandRhythmCellWorldPosition(
  cell: HandRhythmCell,
  playerIndex: number,
  playerCount: number,
  gridSize: HandRhythmGridSize = DEFAULT_HAND_RHYTHM_GRID_SIZE
): { x: number; y: number } {
  const cellWidth = playerTrackWidth(playerCount) / gridSize;
  return {
    x: playerTrackX(playerIndex, playerCount) + (cell.column - (gridSize - 1) / 2) * cellWidth,
    y: HAND_RHYTHM_ROW_Y[Math.round(cell.row * (HAND_RHYTHM_ROW_Y.length - 1) / (gridSize - 1))] ?? HAND_RHYTHM_ROW_Y[1],
  };
}

export function getHandRhythmPlayerMotion(
  detection: HandGestureDetection | null,
  playerIndex: number,
  playerCount: number,
  _frameWidth: number,
  _frameHeight: number,
  gridSize: HandRhythmGridSize = DEFAULT_HAND_RHYTHM_GRID_SIZE
): HandRhythmPlayerMotion {
  const targetX = playerTrackX(playerIndex, playerCount);

  if (!detection) {
    return {
      gesture: 'None',
      targetX,
      targetY: HAND_RHYTHM_ROW_Y[1],
      cell: { row: 1, column: 1 },
    };
  }

  const cell = getHandRhythmCell(detection, playerIndex, playerCount, _frameWidth, _frameHeight, gridSize);
  const cellPosition = getHandRhythmCellWorldPosition(cell, playerIndex, playerCount, gridSize);

  return {
    gesture: detection.gesture,
    targetX: cellPosition.x,
    targetY: cellPosition.y,
    cell,
  };
}
