import type { HandInput } from './gameplayInput';

export type HandTrackingState = {
  lastHandsByPlayer: Array<Array<HandInput | null>>;
};

export type HandTrackingResult = {
  handsByPlayer: Array<Array<HandInput | null>>;
  state: HandTrackingState;
};

const MAX_HAND_DISTANCE = Math.SQRT2 + 1;

export function createHandTrackingState(playerCount: number, handsPerPlayer = 2): HandTrackingState {
  return {
    lastHandsByPlayer: Array.from(
      { length: Math.max(0, playerCount) },
      () => Array.from({ length: Math.max(1, handsPerPlayer) }, () => null)
    ),
  };
}

function distance(left: HandInput, right: HandInput): number {
  return Math.hypot(left.normalizedX - right.normalizedX, left.normalizedY - right.normalizedY);
}

function permutations(values: number[], length: number): number[][] {
  if (length === 0) return [[]];
  return values.flatMap((value) => permutations(
    values.filter((candidate) => candidate !== value),
    length - 1
  ).map((rest) => [value, ...rest]));
}

function assignPlayerHands(
  detectedHands: HandInput[],
  previousHands: Array<HandInput | null>,
  handsPerPlayer: number
): { current: Array<HandInput | null>; next: Array<HandInput | null> } {
  const sortedHands = detectedHands
    .slice(0, handsPerPlayer)
    .sort((left, right) => left.normalizedX - right.normalizedX);
  const slots = Array.from({ length: handsPerPlayer }, (_, index) => index);
  const assignments = permutations(slots, sortedHands.length);
  const bestAssignment = assignments.reduce<{ slots: number[]; cost: number } | null>((best, candidate) => {
    const cost = candidate.reduce((total, slot, handIndex) => {
      const previous = previousHands[slot];
      return total + (previous ? distance(previous, sortedHands[handIndex]) : MAX_HAND_DISTANCE);
    }, 0);
    return best === null || cost < best.cost ? { slots: candidate, cost } : best;
  }, null)?.slots ?? [];

  const current = Array.from<HandInput | null>({ length: handsPerPlayer }).fill(null);
  const next = Array.from({ length: handsPerPlayer }, (_, index) => previousHands[index] ?? null);
  bestAssignment.forEach((slot, handIndex) => {
    const hand = sortedHands[handIndex];
    current[slot] = hand;
    next[slot] = hand;
  });
  return { current, next };
}

export function assignHandsByNearestPosition(
  detectedHandsByPlayer: HandInput[][],
  previousState: HandTrackingState,
  handsPerPlayer = 2
): HandTrackingResult {
  const playerCount = detectedHandsByPlayer.length;
  const fallbackState = createHandTrackingState(playerCount, handsPerPlayer);
  const assignments = detectedHandsByPlayer.map((detectedHands, playerIndex) => assignPlayerHands(
    detectedHands,
    previousState.lastHandsByPlayer[playerIndex] ?? fallbackState.lastHandsByPlayer[playerIndex],
    handsPerPlayer
  ));

  return {
    handsByPlayer: assignments.map(({ current }) => current),
    state: { lastHandsByPlayer: assignments.map(({ next }) => next) },
  };
}
