/** The spring settles on its target, overshoots when underdamped, and survives a long frame. */
import { describe, expect, test } from 'bun:test';
import { restingSpring, type SpringConfig, type SpringState, stepSpring } from './spring.ts';

/** Underdamped: the shape every rig parameter uses. */
const bouncy: SpringConfig = { stiffness: 200, dampingRatio: 0.6 };
/** Critically damped: what reduced motion asks for. */
const calm: SpringConfig = { stiffness: 200, dampingRatio: 1 };

/**
 * Run a spring for a while at a fixed frame rate.
 *
 * @param config - The spring to run.
 * @param target - Where it is pulled.
 * @param frames - How many 60 Hz frames to run.
 * @returns Every state it passed through, the start excluded.
 */
function run(config: SpringConfig, target: number, frames: number): SpringState[] {
  const states: SpringState[] = [];
  let state = restingSpring(0);
  for (let frame = 0; frame < frames; frame++) {
    state = stepSpring(state, target, config, 1 / 60);
    states.push(state);
  }
  return states;
}

describe('stepSpring', () => {
  test('settles on the target', () => {
    const states = run(bouncy, 1, 240);

    expect(states.at(-1)?.value).toBeCloseTo(1, 4);
    expect(states.at(-1)?.velocity).toBeCloseTo(0, 3);
  });

  test('overshoots when the damping ratio is below one', () => {
    const peak = Math.max(...run(bouncy, 1, 120).map((state) => state.value));

    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThan(1.2);
  });

  test('does not overshoot when critically damped', () => {
    const peak = Math.max(...run(calm, 1, 120).map((state) => state.value));

    expect(peak).toBeLessThanOrEqual(1.001);
  });

  test('leaves a resting spring on its target alone', () => {
    const state = stepSpring(restingSpring(0.5), 0.5, bouncy, 1 / 60);

    expect(state.value).toBeCloseTo(0.5, 10);
    expect(state.velocity).toBeCloseTo(0, 10);
  });

  test('stays finite across a backgrounded tab', () => {
    const state = stepSpring(restingSpring(0), 1, bouncy, 12);

    expect(Number.isFinite(state.value)).toBe(true);
    expect(state.value).toBeLessThan(1.2);
  });

  test('treats a negative delta as no time passing', () => {
    const state = stepSpring(restingSpring(0), 1, bouncy, -1);

    expect(state).toEqual({ value: 0, velocity: 0 });
  });

  test('ignores a target that is not a finite number', () => {
    const moving = stepSpring(restingSpring(0), 1, bouncy, 1 / 60);

    expect(stepSpring(moving, Number.NaN, bouncy, 1 / 60)).toBe(moving);
    expect(stepSpring(moving, Number.POSITIVE_INFINITY, bouncy, 1 / 60)).toBe(moving);
  });
});
