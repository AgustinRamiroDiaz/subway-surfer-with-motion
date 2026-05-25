import type { HandGestureDetection } from '../../pose-detection/detectionSchema';
import { playerTrackX } from '../trackWorld';

export type HandRhythmGesture = 'Victory' | 'Open_Palm' | 'Thumb_Up' | 'Closed_Fist';

export const GESTURE_TO_EMOJI: Record<string, string> = {
  Victory: '✌️',
  Open_Palm: '🖐️',
  Thumb_Up: '👍',
  Closed_Fist: '✊',
  None: '❓',
};

export const HAND_RHYTHM_GESTURES: HandRhythmGesture[] = [
  'Victory',
  'Open_Palm',
  'Thumb_Up',
  'Closed_Fist',
];

export const HAND_RHYTHM_SPAWN_INTERVAL_MS = 1500;

export type HandRhythmPlayerMotion = {
  gesture: string;
  targetX: number;
  targetY: number;
};

export function getHandRhythmPlayerMotion(
  detection: HandGestureDetection | null,
  playerIndex: number,
  playerCount: number,
  _frameWidth: number,
  _frameHeight: number
): HandRhythmPlayerMotion {
  // Players are stationary in Hand Rhythm mode
  const targetX = playerTrackX(playerIndex, playerCount);

  if (!detection) {
    return {
      gesture: 'None',
      targetX,
      targetY: 1.2,
    };
  }

  return {
    gesture: detection.gesture,
    targetX,
    targetY: 1.2, // Keep stationary at a consistent height
  };
}
