import { describe, expect, test } from 'vitest';
import type { HandInput } from '../../../motion-mapping/gameplayInput';
import {
  CLIMBER_KNOBS,
  CLIMBER_MAX_SCROLL,
  createClimberState,
  updateClimberFromHands,
} from './climberSimulation';

const fist = (x: number, y: number): HandInput => ({ gesture: 'Closed_Fist', normalizedX: x, normalizedY: y });
const open = (x: number, y: number): HandInput => ({ gesture: 'Open_Palm', normalizedX: x, normalizedY: y });
const fistAtFirstKnob = (): HandInput => fist(
  CLIMBER_KNOBS[0].position.x / 4.4 + 0.5,
  1 - (CLIMBER_KNOBS[0].position.y - 0.48) / (8.25 - 0.96)
);

describe('climber interaction', () => {
  test('a fist near a wall knob grabs it', () => {
    const grabbed = updateClimberFromHands(createClimberState(), [fistAtFirstKnob(), null], 0, 1);
    expect(grabbed.grabbedKnobByHand[0]).toBe(CLIMBER_KNOBS[0].id);
    expect(grabbed.feedback).toBe('grabbed');
  });

  test('two hands cannot grab the same knob', () => {
    const state = createClimberState();
    state.grabbedKnobByHand[0] = CLIMBER_KNOBS[0].id;
    state.previousGestures[0] = 'Closed_Fist';
    const next = updateClimberFromHands(state, [fistAtFirstKnob(), fistAtFirstKnob()], 0, 1);
    expect(next.grabbedKnobByHand[1]).toBeNull();
    expect(next.feedback).toBe('occupied');
  });

  test('one attached hand cannot move the wall', () => {
    const state = createClimberState();
    state.grabbedKnobByHand[0] = CLIMBER_KNOBS[0].id;
    state.previousGestures[0] = 'Closed_Fist';
    state.previousHandPoints[0] = { x: -1.1, y: 4 };
    const next = updateClimberFromHands(state, [fist(0.25, 0.7), null], 0, 1);
    expect(next.scrollY).toBe(0);
    expect(next.feedback).toBe('need-both');
  });

  test('both attached hands pulling down together move the view upward', () => {
    const state = createClimberState();
    state.grabbedKnobByHand = [CLIMBER_KNOBS[0].id, CLIMBER_KNOBS[1].id];
    state.previousGestures = ['Closed_Fist', 'Closed_Fist'];
    state.previousHandPoints = [{ x: -1, y: 5 }, { x: 1, y: 5 }];
    const next = updateClimberFromHands(state, [fist(0.27, 0.5), fist(0.73, 0.5)], 0, 1);
    expect(next.scrollY).toBeGreaterThan(0);
    expect(next.feedback).toBe('climbing');
  });

  test('one stationary hand prevents a pull', () => {
    const state = createClimberState();
    state.grabbedKnobByHand = [CLIMBER_KNOBS[0].id, CLIMBER_KNOBS[1].id];
    state.previousGestures = ['Closed_Fist', 'Closed_Fist'];
    state.previousHandPoints = [{ x: -1, y: 4.6 }, { x: 1, y: 4.125 }];
    const next = updateClimberFromHands(state, [fist(0.27, 0.5), fist(0.73, 0.5)], 0, 1);
    expect(next.scrollY).toBe(0);
  });

  test('opening a hand releases its knob', () => {
    const state = createClimberState();
    state.grabbedKnobByHand[0] = CLIMBER_KNOBS[0].id;
    state.previousGestures[0] = 'Closed_Fist';
    const next = updateClimberFromHands(state, [open(0.25, 0.9), null], 0, 1);
    expect(next.grabbedKnobByHand[0]).toBeNull();
    expect(next.feedback).toBe('released');
  });

  test('progress is clamped at the top and completes the climb', () => {
    const state = createClimberState();
    state.scrollY = CLIMBER_MAX_SCROLL - 0.01;
    state.grabbedKnobByHand = [CLIMBER_KNOBS.at(-2)!.id, CLIMBER_KNOBS.at(-1)!.id];
    state.previousGestures = ['Closed_Fist', 'Closed_Fist'];
    state.previousHandPoints = [{ x: -1, y: 5 }, { x: 1, y: 5 }];
    const next = updateClimberFromHands(state, [fist(0.27, 0.5), fist(0.73, 0.5)], 0, 1);
    expect(next.scrollY).toBe(CLIMBER_MAX_SCROLL);
    expect(next.completed).toBe(true);
  });
});
