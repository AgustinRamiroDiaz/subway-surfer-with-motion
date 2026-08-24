import type { HandInput } from '../../../motion-mapping/gameplayInput';
import type { HandRhythmCell } from '../../levels/handRhythmLevel';

export function isHandRhythmTargetMatch(
  hand: HandInput | null,
  actualCell: HandRhythmCell,
  expectedGesture: string,
  expectedCell: HandRhythmCell
): boolean {
  return hand?.gesture === expectedGesture &&
    actualCell.row === expectedCell.row &&
    actualCell.column === expectedCell.column;
}
