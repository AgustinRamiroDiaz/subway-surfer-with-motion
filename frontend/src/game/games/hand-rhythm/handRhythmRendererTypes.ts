import type { HandInput } from '../../../motion-mapping/gameplayInput';
import type { WorldProjection } from '../../shared/worldProjection';
import type { HandRhythmCell } from '../../levels/handRhythmLevel';
import type { RhythmNote } from '../../rhythmTiming';

export const HAND_RHYTHM_RENDERERS = ['canvas2d', 'three'] as const;
export type HandRhythmRendererId = (typeof HAND_RHYTHM_RENDERERS)[number];
export const DEFAULT_HAND_RHYTHM_RENDERER: HandRhythmRendererId = 'canvas2d';
export const HAND_RHYTHM_CAMERA_Z = 10.6;

export function isHandRhythmRendererId(value: unknown): value is HandRhythmRendererId {
  return HAND_RHYTHM_RENDERERS.includes(value as HandRhythmRendererId);
}

export type HandRhythmVisualTarget = {
  id: number;
  cell: HandRhythmCell;
  gesture: string;
  note: RhythmNote;
  result: 'pending' | 'hit' | 'missed';
  strength: number;
  targetPlayerIndex: number;
  z: number;
};

export type HandRhythmVisualState = {
  hands: HandInput[][];
  targets: HandRhythmVisualTarget[];
};

export type HandRhythmRenderer = {
  render: (state: HandRhythmVisualState, deltaSeconds: number) => void;
  resize: (width: number, height: number, videoAspectRatio: number) => WorldProjection;
  dispose: () => void;
};
