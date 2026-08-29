import { positionToWorldX } from '../trackLayout';

export function getSidewaysPlayerTargetX(position: number): number {
  return positionToWorldX(position);
}
