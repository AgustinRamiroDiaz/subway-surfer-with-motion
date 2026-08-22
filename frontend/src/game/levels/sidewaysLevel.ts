import { SPAWN_INTERVAL_MS } from '../gameConstants';
import { positionToWorldX } from '../trackLayout';

export const SIDEWAYS_LEVEL_SPAWN_INTERVAL_MS = SPAWN_INTERVAL_MS;

export function getSidewaysPlayerTargetX(position: number): number {
  return positionToWorldX(position);
}
