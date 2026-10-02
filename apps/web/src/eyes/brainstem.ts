/**
 * Everything the character does without being told: blinking, the small
 * involuntary jumps the eye makes while holding still, lids that ride the
 * vertical gaze, and slow wandering when nothing has its attention.
 *
 * No model ever drives this. It is what makes the face alive rather than
 * merely animated, and it keeps running when the network does not.
 */
import type { RigParams } from './rig.ts';

/** What the brainstem contributes to the pose on one frame. */
export interface BrainstemDrive {
  /** Added to horizontal gaze: micro-saccades plus idle wander. */
  gazeX: number;
  /** Added to vertical gaze. */
  gazeY: number;
  /** Added to both upper lids: the blink, and the lid riding the gaze. */
  upperLid: number;
  /** Added to both lower lids. A blink closes an eye from both edges at once. */
  lowerLid: number;
  /** Added to both pupil sizes: the slow swell that stands in for breathing. */
  pupil: number;
}

/** The autonomous half of the rig. */
export interface Brainstem {
  /**
   * Advance one frame.
   * @param deltaSeconds - Time since the last frame.
   * @param pose - The pose as it stands, read for the lid-follows-gaze coupling.
   * @param idle - True when nothing is asking the character to look anywhere.
   * @returns What to add to the pose.
   */
  step(deltaSeconds: number, pose: RigParams, idle: boolean): BrainstemDrive;
  /** Stop contributing anything, so the debug panel can see the rig alone. */
  setFrozen(frozen: boolean): void;
  /** Whether it is currently frozen. */
  isFrozen(): boolean;
}

/** How the brainstem is tuned. */
export interface BrainstemOptions {
  /** Under reduced motion there are no saccades, no wander, and slower blinks. */
  reducedMotion: boolean;
  /** Injected so tests can drive the timings. Defaults to `Math.random`. */
  random?: () => number;
}

/** Shortest and longest gap between blinks, in seconds. */
const BLINK_GAP = { min: 2.2, max: 6.5 };
/** How long one reflex blink takes, closing and opening. */
const BLINK_SECONDS = 0.24;
/**
 * Where in a blink the eye is fully shut. Closing is fast and opening is slow,
 * which is what a blink actually does, and a symmetric one reads as a shutter.
 */
const BLINK_CLOSED_AT = 0.36;
/**
 * How far each edge travels to shut the eye. The lids meet in the middle, so
 * each does half the distance.
 */
const BLINK_DEPTH = 0.47;
/** How often a blink comes in a pair, as people's do. */
const DOUBLE_BLINK_CHANCE = 0.18;
/** Gap between the two blinks of a pair, in seconds. */
const DOUBLE_BLINK_GAP = 0.16;
/** Gap between micro-saccades, in seconds. */
const SACCADE_GAP = { min: 0.3, max: 1.5 };
/** How far a micro-saccade jumps, in gaze units. */
const SACCADE_REACH = 0.045;

/**
 * How much of that survives while something has the character's attention.
 *
 * @remarks
 * Micro-saccades are what stop a still face reading as a photograph. On a face
 * that is already tracking a moving target they are noise on top of noise, and
 * the eyes look jittery rather than alive.
 */
const SACCADE_WHEN_WATCHING = 0.35;
/** Gap between idle wander targets, in seconds. */
const WANDER_GAP = { min: 2.4, max: 5.5 };
/** How far idle wander roams from centre. */
const WANDER_REACH = 0.34;
/** How fast the wander offset chases its target, per second. */
const WANDER_CHASE = 1.6;
/** How much the upper lid follows the vertical gaze. Looking down closes it. */
const LID_FOLLOWS_GAZE = 0.12;
/** How far the eyes swell and settle at rest. Small enough to feel, not see. */
const BREATH_DEPTH = 0.035;
/** Seconds per breath. */
const BREATH_PERIOD = 5.5;

/** The brainstem's private clocks and offsets. */
interface BrainstemState {
  elapsed: number;
  untilBlink: number;
  blinkRemaining: number;
  blinksQueued: number;
  untilSaccade: number;
  saccadeX: number;
  saccadeY: number;
  untilWander: number;
  wanderTargetX: number;
  wanderTargetY: number;
  wanderX: number;
  wanderY: number;
}

/**
 * Pick a value inside a range.
 *
 * @param range - Inclusive bounds.
 * @param random - The source of randomness.
 * @returns A value in the range.
 */
function between(range: { min: number; max: number }, random: () => number): number {
  return range.min + random() * (range.max - range.min);
}

/**
 * Advance the blink clock.
 *
 * @param state - Mutated in place.
 * @param deltaSeconds - Time since the last frame.
 * @param options - Supplies the randomness and the reduced-motion slowdown.
 * @returns How far the upper lids are closed by the blink, 0 to 1.
 */
function stepBlink(
  state: BrainstemState,
  deltaSeconds: number,
  options: Required<BrainstemOptions>,
): number {
  const slowdown = options.reducedMotion ? 1.8 : 1;

  if (state.blinkRemaining > 0) {
    state.blinkRemaining = Math.max(0, state.blinkRemaining - deltaSeconds);
    return BLINK_DEPTH * blinkCurve(1 - state.blinkRemaining / BLINK_SECONDS);
  }

  state.untilBlink -= deltaSeconds;
  if (state.untilBlink > 0) return 0;

  state.blinkRemaining = BLINK_SECONDS;
  const paired = state.blinksQueued > 0;
  state.blinksQueued = paired ? state.blinksQueued - 1 : blinksToQueue(options.random);
  state.untilBlink = paired
    ? DOUBLE_BLINK_GAP
    : between(BLINK_GAP, options.random) * slowdown + BLINK_SECONDS;
  return 0;
}

/**
 * How far shut a blink is at a point along its run.
 *
 * @param progress - 0 at the start of the blink, 1 at the end.
 * @returns 0 open, 1 shut. It reaches 1 early and eases back open.
 */
function blinkCurve(progress: number): number {
  if (progress <= BLINK_CLOSED_AT) return progress / BLINK_CLOSED_AT;
  const reopening = (progress - BLINK_CLOSED_AT) / (1 - BLINK_CLOSED_AT);
  return 1 - reopening ** 1.6;
}

/**
 * Decide whether the blink just started is the first of a pair.
 *
 * @param random - The source of randomness.
 * @returns 1 when a second blink should follow, 0 otherwise.
 */
function blinksToQueue(random: () => number): number {
  return random() < DOUBLE_BLINK_CHANCE ? 1 : 0;
}

/**
 * Advance the micro-saccade clock. Real eyes never hold perfectly still, and a
 * pair that does reads as a photograph.
 *
 * @param state - Mutated in place.
 * @param deltaSeconds - Time since the last frame.
 * @param random - The source of randomness.
 */
function stepSaccade(state: BrainstemState, deltaSeconds: number, random: () => number): void {
  state.untilSaccade -= deltaSeconds;
  if (state.untilSaccade > 0) return;

  state.untilSaccade = between(SACCADE_GAP, random);
  state.saccadeX = (random() * 2 - 1) * SACCADE_REACH;
  state.saccadeY = (random() * 2 - 1) * SACCADE_REACH;
}

/**
 * Advance the idle wander. The offset chases its target rather than jumping to
 * it, so wandering reads as drifting attention instead of as a saccade.
 *
 * @param state - Mutated in place.
 * @param deltaSeconds - Time since the last frame.
 * @param random - The source of randomness.
 */
function stepWander(state: BrainstemState, deltaSeconds: number, random: () => number): void {
  state.untilWander -= deltaSeconds;
  if (state.untilWander <= 0) {
    state.untilWander = between(WANDER_GAP, random);
    state.wanderTargetX = (random() * 2 - 1) * WANDER_REACH;
    state.wanderTargetY = (random() * 2 - 1) * WANDER_REACH * 0.7;
  }

  const chase = Math.min(1, WANDER_CHASE * deltaSeconds);
  state.wanderX += (state.wanderTargetX - state.wanderX) * chase;
  state.wanderY += (state.wanderTargetY - state.wanderY) * chase;
}

/**
 * The clocks a fresh brainstem starts with, already staggered so the first
 * blink is not synchronised with anything.
 *
 * @param random - The source of randomness.
 * @returns The initial state.
 */
function initialState(random: () => number): BrainstemState {
  return {
    elapsed: random() * BREATH_PERIOD,
    untilBlink: between(BLINK_GAP, random),
    blinkRemaining: 0,
    blinksQueued: 0,
    untilSaccade: between(SACCADE_GAP, random),
    saccadeX: 0,
    saccadeY: 0,
    untilWander: between(WANDER_GAP, random),
    wanderTargetX: 0,
    wanderTargetY: 0,
    wanderX: 0,
    wanderY: 0,
  };
}

/**
 * Advance every clock and report what the pose should gain.
 *
 * @param state - Mutated in place.
 * @param settings - Reduced motion and the randomness source.
 * @param deltaSeconds - Time since the last frame.
 * @param pose - The pose as it stands, for the lid-follows-gaze coupling.
 * @param idle - True when nothing is asking the character to look anywhere.
 * @returns The offsets for this frame.
 */
function drive(
  state: BrainstemState,
  settings: Required<BrainstemOptions>,
  deltaSeconds: number,
  pose: RigParams,
  idle: boolean,
): BrainstemDrive {
  state.elapsed += deltaSeconds;
  const blink = stepBlink(state, deltaSeconds, settings);
  if (!settings.reducedMotion) {
    stepSaccade(state, deltaSeconds, settings.random);
    if (idle) stepWander(state, deltaSeconds, settings.random);
  }

  const twitch = idle ? 1 : SACCADE_WHEN_WATCHING;
  return {
    gazeX: state.saccadeX * twitch + (idle ? state.wanderX : 0),
    gazeY: state.saccadeY * twitch + (idle ? state.wanderY : 0),
    // A lid that ignores where the eye is pointing looks like a shutter.
    upperLid: blink + Math.max(0, pose.gazeY) * LID_FOLLOWS_GAZE,
    lowerLid: blink,
    pupil: settings.reducedMotion
      ? 0
      : Math.sin((state.elapsed / BREATH_PERIOD) * 2 * Math.PI) * BREATH_DEPTH,
  };
}

/** What a frozen brainstem contributes: nothing at all. */
const STILL: BrainstemDrive = { gazeX: 0, gazeY: 0, upperLid: 0, lowerLid: 0, pupil: 0 };

/**
 * Build a brainstem.
 *
 * @param options - Reduced motion, and an optional randomness source for tests.
 * @returns A brainstem, already ticking toward its first blink.
 */
export function createBrainstem(options: BrainstemOptions): Brainstem {
  const settings: Required<BrainstemOptions> = { random: Math.random, ...options };
  const state = initialState(settings.random);
  let frozen = false;

  return {
    step: (deltaSeconds, pose, idle) =>
      frozen ? STILL : drive(state, settings, deltaSeconds, pose, idle),
    setFrozen(next) {
      frozen = next;
    },
    isFrozen: () => frozen,
  };
}
