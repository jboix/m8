/**
 * The only motion primitive in the rig. Every animated value is a damped
 * harmonic oscillator, which is what makes the character read as a body rather
 * than as a set of tweens: it overshoots a little and settles.
 */

/** How a single parameter moves toward its target. */
export interface SpringConfig {
  /** How hard the spring pulls. Higher settles sooner. */
  stiffness: number;
  /** Below 1 overshoots and rings, 1 settles cleanly, above 1 crawls in. */
  dampingRatio: number;
}

/** A spring's position and momentum between frames. */
export interface SpringState {
  /** The current value. */
  value: number;
  /** Rate of change, in units per second. */
  velocity: number;
}

/** Fixed integration step. Small enough that a stiff spring stays stable. */
const SUBSTEP_SECONDS = 1 / 240;

/**
 * Longest frame the rig will integrate. A backgrounded tab returns with a delta
 * of seconds; without this the character would snap rather than resume.
 */
const MAX_FRAME_SECONDS = 1 / 15;

/**
 * A spring sitting still at a value.
 *
 * @param value - Where it rests.
 * @returns The state, with no velocity.
 */
export function restingSpring(value: number): SpringState {
  return { value, velocity: 0 };
}

/**
 * Advance a spring toward its target.
 *
 * @param state - Where the spring is now. Not mutated.
 * @param target - Where it is being pulled.
 * @param config - Stiffness and damping ratio.
 * @param deltaSeconds - Time since the last frame. Clamped internally, so a
 * long frame slows the motion down rather than blowing it up.
 * @returns The new state. A target that is not a finite number leaves the
 * state as it was: a NaN that reached the value would stay there for every
 * frame after, and the eye it belongs to would never draw again.
 */
export function stepSpring(
  state: SpringState,
  target: number,
  config: SpringConfig,
  deltaSeconds: number,
): SpringState {
  if (!Number.isFinite(target)) return state;
  // Deriving damping from the ratio means a config reads as "how much does this
  // overshoot", instead of two numbers that only make sense together.
  const damping = config.dampingRatio * 2 * Math.sqrt(config.stiffness);
  let { value, velocity } = state;
  let remaining = Math.min(Math.max(deltaSeconds, 0), MAX_FRAME_SECONDS);

  while (remaining > 0) {
    const step = Math.min(remaining, SUBSTEP_SECONDS);
    velocity += (config.stiffness * (target - value) - damping * velocity) * step;
    value += velocity * step;
    remaining -= step;
  }

  return { value, velocity };
}
