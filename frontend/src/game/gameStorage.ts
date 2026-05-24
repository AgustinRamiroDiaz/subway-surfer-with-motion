import type { RunnerGameId } from './gameTypes';

export const GAME_SELECTION_STORAGE_KEY = 'motion-runner:selected-game:v1';

function isRunnerGameId(value: unknown): value is RunnerGameId {
  return value === 'sideways' || value === 'jump-duck' || value === 'hand-rhythm';
}

export function readStoredRunnerGameId(): RunnerGameId {
  if (typeof window === 'undefined') {
    return 'sideways';
  }

  try {
    const storedGameId = window.localStorage.getItem(GAME_SELECTION_STORAGE_KEY);
    return isRunnerGameId(storedGameId) ? storedGameId : 'sideways';
  } catch {
    return 'sideways';
  }
}

export function writeStoredRunnerGameId(gameId: RunnerGameId): void {
  try {
    window.localStorage.setItem(GAME_SELECTION_STORAGE_KEY, gameId);
  } catch {
    // Level selection is a convenience and should never block gameplay.
  }
}
