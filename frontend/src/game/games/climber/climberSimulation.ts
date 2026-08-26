import type { HandInput } from '../../../motion-mapping/gameplayInput';

export type Point = { x: number; y: number };
export type WallKnob = { id: string; position: Point; size: number; color: string };
export type ClimberFeedback = 'none' | 'grabbed' | 'released' | 'need-both' | 'climbing' | 'occupied' | 'no-knob';

export type ClimberState = {
  scrollY: number;
  grabbedKnobByHand: Array<string | null>;
  previousHandPoints: Array<Point | null>;
  previousGestures: Array<string | null>;
  feedback: ClimberFeedback;
  completed: boolean;
};

export const CLIMBER_WALL_HEIGHT = 30;
export const CLIMBER_VIEW_HEIGHT = 8.25;
export const CLIMBER_MAX_SCROLL = CLIMBER_WALL_HEIGHT - CLIMBER_VIEW_HEIGHT;
export const CLIMBER_GRAB_RADIUS = 0.58;
export const CLIMBER_PULL_DEAD_ZONE = 0.018;
export const CLIMBER_MAX_PULL_PER_FRAME = 0.24;

const KNOB_COLORS = ['#ffb84d', '#ff6b7d', '#70a9ff', '#73e2a7'] as const;

export const CLIMBER_KNOBS: readonly WallKnob[] = Array.from({ length: 38 }, (_, row) => {
  const y = 0.72 + row * 0.76;
  return [
    {
      id: `row-${row}-left`,
      position: { x: -1.22 + (row % 4) * 0.12, y },
      size: 0.2 + (row % 3) * 0.018,
      color: KNOB_COLORS[row % KNOB_COLORS.length],
    },
    {
      id: `row-${row}-right`,
      position: { x: 1.22 - ((row + 1) % 4) * 0.12, y: y + (row % 2 ? 0.12 : -0.08) },
      size: 0.19 + ((row + 1) % 3) * 0.018,
      color: KNOB_COLORS[(row + 2) % KNOB_COLORS.length],
    },
  ];
}).flat();

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function distance(left: Point, right: Point): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

export function createClimberState(handCount = 2): ClimberState {
  return {
    scrollY: 0,
    grabbedKnobByHand: Array.from({ length: handCount }, () => null),
    previousHandPoints: Array.from({ length: handCount }, () => null),
    previousGestures: Array.from({ length: handCount }, () => null),
    feedback: 'none',
    completed: false,
  };
}

export function mapHandToClimbingViewport(hand: HandInput, playerIndex: number, playerCount: number): Point {
  const count = Math.max(1, playerCount);
  const localX = clamp((hand.normalizedX - playerIndex / count) * count, 0, 1);
  return {
    x: (localX - 0.5) * 4.4,
    y: 0.48 + (1 - clamp(hand.normalizedY, 0, 1)) * (CLIMBER_VIEW_HEIGHT - 0.96),
  };
}

function nearestKnob(state: ClimberState, point: Point): WallKnob | null {
  const nearest = CLIMBER_KNOBS
    .map((knob) => ({ knob, distance: distance({ x: knob.position.x, y: knob.position.y - state.scrollY }, point) }))
    .sort((left, right) => left.distance - right.distance)[0];
  return nearest && nearest.distance <= CLIMBER_GRAB_RADIUS ? nearest.knob : null;
}

export function updateClimberFromHands(
  state: ClimberState,
  hands: Array<HandInput | null>,
  playerIndex: number,
  playerCount: number
): ClimberState {
  const handCount = Math.max(2, hands.length, state.grabbedKnobByHand.length);
  const next: ClimberState = {
    ...state,
    grabbedKnobByHand: Array.from({ length: handCount }, (_, index) => state.grabbedKnobByHand[index] ?? null),
    previousHandPoints: Array.from({ length: handCount }, (_, index) => state.previousHandPoints[index] ?? null),
    previousGestures: Array.from({ length: handCount }, (_, index) => state.previousGestures[index] ?? null),
    feedback: 'none',
  };
  const points = Array.from({ length: handCount }, (_, index) => {
    const hand = hands[index];
    return hand ? mapHandToClimbingViewport(hand, playerIndex, playerCount) : null;
  });
  let grabbedThisFrame = false;

  points.forEach((point, handIndex) => {
    const gesture = hands[handIndex]?.gesture ?? null;
    const previousGesture = next.previousGestures[handIndex];
    const grabbedKnob = next.grabbedKnobByHand[handIndex];
    if (gesture === 'Open_Palm' && grabbedKnob && previousGesture !== 'Open_Palm') {
      next.grabbedKnobByHand[handIndex] = null;
      next.feedback = 'released';
    } else if (gesture === 'Closed_Fist' && previousGesture !== 'Closed_Fist' && point && !grabbedKnob) {
      const knob = nearestKnob(next, point);
      if (!knob) next.feedback = 'no-knob';
      else if (next.grabbedKnobByHand.some((id, index) => index !== handIndex && id === knob.id)) next.feedback = 'occupied';
      else {
        next.grabbedKnobByHand[handIndex] = knob.id;
        next.feedback = 'grabbed';
        grabbedThisFrame = true;
      }
    }
    next.previousGestures[handIndex] = gesture;
  });

  const attachedHands = next.grabbedKnobByHand
    .map((knobId, index) => ({ knobId, index }))
    .filter((entry): entry is { knobId: string; index: number } => Boolean(entry.knobId));
  const bothAttached = attachedHands.length >= 2
    && new Set(attachedHands.map(({ knobId }) => knobId)).size >= 2
    && attachedHands.slice(0, 2).every(({ index }) => hands[index]?.gesture === 'Closed_Fist' && points[index]);

  if (bothAttached && !grabbedThisFrame && !next.completed) {
    const downwardPulls = attachedHands.slice(0, 2).map(({ index }) => {
      const previous = next.previousHandPoints[index];
      const current = points[index];
      return previous && current ? previous.y - current.y : 0;
    });
    const coordinatedPull = Math.min(...downwardPulls);
    if (coordinatedPull > CLIMBER_PULL_DEAD_ZONE) {
      const amount = Math.min(CLIMBER_MAX_PULL_PER_FRAME, coordinatedPull - CLIMBER_PULL_DEAD_ZONE);
      next.scrollY = clamp(next.scrollY + amount, 0, CLIMBER_MAX_SCROLL);
      next.completed = next.scrollY >= CLIMBER_MAX_SCROLL;
      next.feedback = 'climbing';
    }
  } else if (attachedHands.length === 1 && next.feedback === 'none') {
    next.feedback = 'need-both';
  }

  next.previousHandPoints = points;
  return next;
}
