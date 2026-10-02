/**
 * The decoration on top of an expression: a tint, a mark inside the eye, or a
 * prop beside it.
 *
 * A flourish reads the emotion and the intensity the face is already showing.
 * It never writes to the rig, and with every flourish switched off the face is
 * exactly what it was. This module is the state only: what is showing
 * and how far along it is. `flourish-writer.ts` draws it.
 */
import type { Emotion } from '@m8/shared';

/** The flourishes, named by the emotion each one decorates. */
export const FLOURISH_KINDS = [
  ...(['happy', 'sleepy', 'shy', 'sad'] as const),
  ...(['annoyed', 'skeptical', 'excited', 'thinking'] as const),
  ...(['stressed', 'shocked'] as const),
];

/** One of the flourishes. */
export type FlourishKind = (typeof FLOURISH_KINDS)[number];

/** Which flourishes are switched on. */
export type FlourishSwitches = Record<FlourishKind, boolean>;

/** Every flourish on. */
export const ALL_FLOURISHES: FlourishSwitches = {
  happy: true,
  sleepy: true,
  shy: true,
  sad: true,
  annoyed: true,
  skeptical: true,
  excited: true,
  thinking: true,
  stressed: true,
  shocked: true,
};

/** One bubble drifting up from a sleepy eye. */
export interface Bubble {
  /** Where it started across, -1 to 1 around the spawn point. */
  x: number;
  /** How far up it has drifted, 0 just spawned to 1 about to pop. */
  rise: number;
  /** Its size, 0 to 1. */
  size: number;
  /** Which way it wobbles, in radians of phase. */
  phase: number;
}

/** Everything the writer needs to draw one frame of flourishes. */
export interface FlourishState {
  /** How much of each flourish is showing, 0 none to 1 full. */
  level: Record<FlourishKind, number>;
  /** The tear: 0 to 1 welling at the eye, 1 to 2 falling. Meaningless at level 0. */
  tear: number;
  /** The bubbles in the air, oldest first. */
  bubbles: Bubble[];
  /**
   * The thinking dots: how many are showing, as a number that climbs. 1.5 is
   * the first dot full and the second half way in. It wraps after a pause.
   */
  dots: number;
  /** The sweat drop: 0 to 1 welling at the side of the eye, 1 to 2 sliding down. */
  sweat: number;
  /** How long the trembling has run, in seconds. The writer shakes the pair from it. */
  tremble: number;
}

/** How fast a flourish fades in and out, per second. Quick enough to follow the face. */
const FADE_RATE = 5;

/** How long a tear wells before it falls, in seconds. */
const TEAR_WELL_SECONDS = 1.4;

/** How long a tear takes to fall, in seconds. */
const TEAR_FALL_SECONDS = 0.9;

/** How long between tears, in seconds. */
const TEAR_PAUSE_SECONDS = 1.1;

/** How long a sweat drop takes to well, in seconds. */
const SWEAT_WELL_SECONDS = 0.8;

/** How long a sweat drop takes to slide down, in seconds. Slower than a tear: it clings. */
const SWEAT_SLIDE_SECONDS = 1.6;

/** How long between sweat drops, in seconds. */
const SWEAT_PAUSE_SECONDS = 0.5;

/** How many thinking dots there are. The writer has this many circles. */
export const THINKING_DOTS = 3;

/** How long each thinking dot takes to pop in, in seconds. */
const DOT_SECONDS = 0.38;

/** How long all the dots stay before they start over, measured in dots. */
const DOTS_HOLD = 2;

/** How long a bubble takes to drift up and pop, in seconds. */
const BUBBLE_SECONDS = 2.6;

/** How long between bubbles at full intensity, in seconds. */
const BUBBLE_EVERY_SECONDS = 1.1;

/** The most bubbles in the air at once. The writer has this many circles. */
export const MAX_BUBBLES = 9;

/** The bubbles shown with reduced motion: two of them, part of the way up, not moving. */
const STILL_BUBBLES: Bubble[] = [
  { x: -0.4, rise: 0.25, size: 0.5, phase: 0 },
  { x: 0.5, rise: 0.6, size: 0.9, phase: 2 },
];

/** A flourish is not worth starting below this much emotion. */
const FAINT = 0.25;

/** The running flourishes. */
export interface Flourishes {
  /**
   * Let time pass.
   * @param deltaSeconds - How much.
   * @param expression - The emotion and the intensity currently held.
   * @returns What to draw.
   */
  step(deltaSeconds: number, expression: { emotion: Emotion; intensity: number }): FlourishState;
  /**
   * Switch flourishes on and off.
   * @param switches - Which ones are on.
   */
  setSwitches(switches: FlourishSwitches): void;
  /** Which flourishes are on. */
  switches(): FlourishSwitches;
}

/** How the flourishes are set up. */
export interface FlourishOptions {
  /**
   * The source of the bubbles' variation. Seeded, and separate from the
   * brainstem's, so adding flourishes did not change what old recordings do.
   */
  random: () => number;
  /** Honour `prefers-reduced-motion`: nothing drifts and nothing falls. */
  reducedMotion: boolean;
}

/**
 * Move a level toward its target.
 *
 * @param level - Where it is.
 * @param target - Where it is going.
 * @param deltaSeconds - How much time passed.
 * @returns The new level, exactly the target once it is close enough.
 */
function fade(level: number, target: number, deltaSeconds: number): number {
  const next = level + (target - level) * Math.min(1, FADE_RATE * deltaSeconds);
  return Math.abs(target - next) < 0.004 ? target : next;
}

/**
 * Advance the tear.
 *
 * @param tear - Where it is, 0 to 2, or beyond while pausing.
 * @param deltaSeconds - How much time passed.
 * @param still - True with reduced motion: it wells and stays.
 * @returns The new position, wrapped to the start after the pause.
 */
function stepTear(tear: number, deltaSeconds: number, still: boolean): number {
  if (tear < 1) return Math.min(1, tear + deltaSeconds / TEAR_WELL_SECONDS);
  if (still) return 1;
  if (tear < 2) return tear + deltaSeconds / TEAR_FALL_SECONDS;
  const paused = tear + deltaSeconds / TEAR_PAUSE_SECONDS;
  return paused >= 3 ? 0 : paused;
}

/**
 * Advance the sweat drop.
 *
 * @param sweat - Where it is, 0 to 2, or beyond while pausing.
 * @param deltaSeconds - How much time passed.
 * @param still - True with reduced motion: it wells and stays.
 * @returns The new position, wrapped to the start after the pause.
 */
function stepSweat(sweat: number, deltaSeconds: number, still: boolean): number {
  if (sweat < 1) return Math.min(1, sweat + deltaSeconds / SWEAT_WELL_SECONDS);
  if (still) return 1;
  if (sweat < 2) return sweat + deltaSeconds / SWEAT_SLIDE_SECONDS;
  const paused = sweat + deltaSeconds / SWEAT_PAUSE_SECONDS;
  return paused >= 3 ? 0 : paused;
}

/**
 * Advance the thinking dots.
 *
 * @param dots - How many are showing.
 * @param deltaSeconds - How much time passed.
 * @param still - True with reduced motion: all of them, not moving.
 * @returns The new count, wrapped to none after the hold.
 */
function stepDots(dots: number, deltaSeconds: number, still: boolean): number {
  if (still) return THINKING_DOTS;
  const next = dots + deltaSeconds / DOT_SECONDS;
  return next >= THINKING_DOTS + DOTS_HOLD ? 0 : next;
}

/** The bubbles in the air, and how long since the last one was blown. */
interface Air {
  /** The bubbles, oldest first. */
  bubbles: Bubble[];
  /** Seconds of sleepiness since the last bubble. */
  since: number;
}

/**
 * Age the bubbles, pop the old ones, and blow a new one when it is due.
 *
 * @param air - The bubbles so far.
 * @param deltaSeconds - How much time passed.
 * @param sleepy - How much of the sleepy flourish is showing.
 * @param options - The seeded random and whether motion is reduced.
 * @returns The bubbles now.
 */
function stepBubbles(
  air: Air,
  deltaSeconds: number,
  sleepy: number,
  options: FlourishOptions,
): Air {
  // With reduced motion nothing drifts. Two bubbles hang there while he is sleepy.
  if (options.reducedMotion) return { bubbles: sleepy > 0 ? STILL_BUBBLES : [], since: 0 };
  const bubbles = air.bubbles
    .map((bubble) => ({ ...bubble, rise: bubble.rise + deltaSeconds / BUBBLE_SECONDS }))
    .filter((bubble) => bubble.rise < 1);
  const since = air.since + deltaSeconds * sleepy;
  if (since < BUBBLE_EVERY_SECONDS || bubbles.length >= MAX_BUBBLES) return { bubbles, since };
  const { random } = options;
  const blown = {
    x: random() * 2 - 1,
    rise: 0,
    size: 0.4 + random() * 0.6,
    phase: random() * 6.28,
  };
  return { bubbles: [...bubbles, blown], since: 0 };
}

/**
 * How much of one flourish the expression asks for.
 *
 * @param kind - Which flourish.
 * @param on - Which flourishes are switched on.
 * @param expression - The emotion and the intensity currently held.
 * @returns The intensity when this is its emotion and it is on, otherwise 0.
 */
function wantedLevel(
  kind: FlourishKind,
  on: FlourishSwitches,
  expression: { emotion: Emotion; intensity: number },
): number {
  const wanted = on[kind] && expression.emotion === kind && expression.intensity >= FAINT;
  return wanted ? expression.intensity : 0;
}

/** The flourishes that loop while they show: where each one is in its cycle. */
type Cycles = Pick<FlourishState, 'tear' | 'dots' | 'sweat' | 'tremble'>;

/**
 * Advance every looping flourish. One that is not showing goes back to the
 * start of its cycle.
 *
 * @param cycles - Where each one is.
 * @param level - How much of each flourish is showing.
 * @param deltaSeconds - How much time passed.
 * @param still - True with reduced motion.
 * @returns Where each one is now.
 */
function stepCycles(
  cycles: Cycles,
  level: FlourishState['level'],
  deltaSeconds: number,
  still: boolean,
): Cycles {
  return {
    tear: level.sad > 0 ? stepTear(cycles.tear, deltaSeconds, still) : 0,
    dots: level.thinking > 0 ? stepDots(cycles.dots, deltaSeconds, still) : 0,
    sweat: level.stressed > 0 ? stepSweat(cycles.sweat, deltaSeconds, still) : 0,
    // With reduced motion the clock stays at zero, and the pair does not shake.
    tremble: level.stressed > 0 && !still ? cycles.tremble + deltaSeconds : 0,
  };
}

/**
 * Start the flourishes.
 *
 * @param options - The seeded random and whether motion is reduced.
 * @returns The running flourishes, with all of them on and nothing showing.
 */
export function createFlourishes(options: FlourishOptions): Flourishes {
  let on: FlourishSwitches = { ...ALL_FLOURISHES };
  const level: Record<FlourishKind, number> = {
    ...{ happy: 0, sleepy: 0, shy: 0, sad: 0 },
    ...{ annoyed: 0, skeptical: 0, excited: 0, thinking: 0 },
    ...{ stressed: 0, shocked: 0 },
  };
  let cycles: Cycles = { tear: 0, dots: 0, sweat: 0, tremble: 0 };
  let air: Air = { bubbles: [], since: 0 };

  return {
    step(deltaSeconds, expression) {
      const still = options.reducedMotion;
      for (const kind of FLOURISH_KINDS) {
        level[kind] = fade(level[kind], wantedLevel(kind, on, expression), deltaSeconds);
      }
      cycles = stepCycles(cycles, level, deltaSeconds, still);
      air = stepBubbles(air, deltaSeconds, level.sleepy, options);
      return { level: { ...level }, bubbles: air.bubbles, ...cycles };
    },
    setSwitches(switches) {
      on = { ...switches };
    },
    switches: () => ({ ...on }),
  };
}
