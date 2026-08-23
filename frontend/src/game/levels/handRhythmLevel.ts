import type { HandInput } from '../../motion-mapping/gameplayInput';
import { playerTrackX, positionToWorldX } from '../trackLayout';
import { handRhythmPlayerWidth, HAND_RHYTHM_ROW_Y } from './handRhythmLayout';

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
export type HandRhythmCell = { row: number; column: number };

export type HandRhythmPlayerMotion = {
  gesture: string;
  targetX: number;
  targetY: number;
  cell: HandRhythmCell;
  emojiWorldX: number;
  emojiWorldY: number;
  emojiWorldWidth: number;
  emojiWorldHeight: number;
};

export function getHandRhythmCell(
  hand: HandInput | null,
  playerIndex: number,
  playerCount: number,
  gridSize: HandRhythmGridSize = DEFAULT_HAND_RHYTHM_GRID_SIZE
): HandRhythmCell {
  if (!hand) {
    return { row: 1, column: 1 };
  }

  const sectionStart = playerIndex / Math.max(1, playerCount);
  const localX = (hand.normalizedX - sectionStart) * Math.max(1, playerCount);

  return {
    row: Math.min(gridSize - 1, Math.max(0, Math.floor(hand.normalizedY * gridSize))),
    column: Math.min(gridSize - 1, Math.max(0, Math.floor(localX * gridSize))),
  };
}

export function getHandRhythmCellWorldPosition(
  cell: HandRhythmCell,
  playerIndex: number,
  playerCount: number,
  gridSize: HandRhythmGridSize = DEFAULT_HAND_RHYTHM_GRID_SIZE
): { x: number; y: number } {
  const cellWidth = handRhythmPlayerWidth(playerCount) / gridSize;
  return {
    x: playerTrackX(playerIndex, playerCount) + (cell.column - (gridSize - 1) / 2) * cellWidth,
    y: HAND_RHYTHM_ROW_Y[Math.round(cell.row * (HAND_RHYTHM_ROW_Y.length - 1) / (gridSize - 1))] ?? HAND_RHYTHM_ROW_Y[1],
  };
}

export function getHandRhythmPlayerMotion(
  hand: HandInput | null,
  playerIndex: number,
  playerCount: number,
  gridSize: HandRhythmGridSize = DEFAULT_HAND_RHYTHM_GRID_SIZE
): HandRhythmPlayerMotion {
  const targetX = playerTrackX(playerIndex, playerCount);

  if (!hand) {
    return {
      gesture: 'None',
      targetX,
      targetY: HAND_RHYTHM_ROW_Y[1],
      cell: { row: 1, column: 1 },
      emojiWorldX: targetX,
      emojiWorldY: HAND_RHYTHM_ROW_Y[1],
      emojiWorldWidth: 1.1,
      emojiWorldHeight: 1.1,
    };
  }

  const cell = getHandRhythmCell(hand, playerIndex, playerCount, gridSize);
  const cellPosition = getHandRhythmCellWorldPosition(cell, playerIndex, playerCount, gridSize);

  return {
    gesture: hand.gesture,
    targetX: cellPosition.x,
    targetY: cellPosition.y,
    cell,
    emojiWorldX: positionToWorldX(hand.normalizedX),
    emojiWorldY: HAND_RHYTHM_ROW_Y[0] - hand.normalizedY * (HAND_RHYTHM_ROW_Y[0] - HAND_RHYTHM_ROW_Y[2]),
    emojiWorldWidth: Math.max(0.35, (hand.normalizedWidth ?? 0.15) * handRhythmPlayerWidth(playerCount)),
    emojiWorldHeight: Math.max(0.35, (hand.normalizedHeight ?? 0.15) * (HAND_RHYTHM_ROW_Y[0] - HAND_RHYTHM_ROW_Y[2])),
  };
}
