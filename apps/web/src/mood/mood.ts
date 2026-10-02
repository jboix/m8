/**
 * How the character is feeling, and what that does to how easily it reacts.
 * Section 6 of docs/architecture.md.
 *
 * Four numbers, each drifting back to a baseline. They live in the browser
 * rather than on the server because they modulate salience in real time, and
 * the fast loop cannot wait for a round trip to decide whether something was
 * worth noticing.
 */
import type { Mood } from '@m8/shared';

/** Where each one settles when nothing is happening. */
const BASELINE: Mood = { arousal: 0.25, curiosity: 0.4, boredom: 0.15, valence: 0.55 };

/** Seconds for each to cover about two thirds of the way back to baseline. */
const DECAY: Mood = { arousal: 12, curiosity: 45, boredom: 30, valence: 90 };

/** How fast boredom rises with nothing to do, per second. */
const BOREDOM_RATE = 0.022;

/**
 * What it takes to fire when the character feels nothing in particular.
 *
 * @remarks
 * Set against the weights in `fusion/weights.ts`: a wave or somebody arriving
 * should clear it on its own, a smile or a noise should not, and two or three
 * small things together should.
 */
const BASE_THRESHOLD = 0.7;

/** How far boredom can lower that. A bored character reacts to more. */
const BOREDOM_RELIEF = 0.45;

/**
 * How far arousal can raise it, so a door closing mid-conversation can wait.
 *
 * @remarks
 * Deliberately smaller than it looks like it should be. Events raise arousal
 * themselves, and the threshold is read on the tick after, so too much here and
 * an event raises the bar against itself and nothing ever fires.
 */
const AROUSAL_GUARD = 0.45;

/** A running mood. */
export interface MoodTracker {
  /**
   * Let time pass.
   * @param deltaSeconds - How much.
   * @param engaged - Whether a conversation is going on, which is what stops
   * boredom rising.
   */
  step(deltaSeconds: number, engaged: boolean): void;
  /**
   * Push it about.
   * @param change - How much to add to each, before clamping.
   */
  nudge(change: Partial<Mood>): void;
  /** How it is feeling now. */
  mood(): Mood;
  /**
   * What it currently takes to react to something.
   * @returns The salience threshold. Lower when bored, higher when busy.
   */
  threshold(): number;
}

/**
 * Hold a value between 0 and 1.
 *
 * @param value - The value.
 * @returns The value, brought into range.
 */
function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Drift one value back towards where it settles.
 *
 * @param value - Where it is.
 * @param target - Where it settles.
 * @param seconds - Its time constant.
 * @param deltaSeconds - How much time passed.
 * @returns The new value.
 */
function settle(value: number, target: number, seconds: number, deltaSeconds: number): number {
  return value + (target - value) * Math.min(1, deltaSeconds / seconds);
}

/**
 * Build a mood.
 *
 * @param start - Where to begin. Defaults to the baseline.
 * @returns A running mood.
 */
export function createMood(start: Mood = BASELINE): MoodTracker {
  const now: Mood = { ...start };

  return {
    step(deltaSeconds, engaged) {
      for (const key of Object.keys(now) as (keyof Mood)[]) {
        now[key] = settle(now[key], BASELINE[key], DECAY[key], deltaSeconds);
      }
      // Boredom is the one that does not merely decay: it grows, and nothing
      // but something actually happening brings it down.
      if (!engaged) now.boredom = clamp(now.boredom + BOREDOM_RATE * deltaSeconds);
    },

    nudge(change) {
      for (const [key, amount] of Object.entries(change) as [keyof Mood, number][]) {
        now[key] = clamp(now[key] + amount);
      }
    },

    mood: () => ({ ...now }),
    threshold: () =>
      Math.max(0.25, BASE_THRESHOLD - now.boredom * BOREDOM_RELIEF + now.arousal * AROUSAL_GUARD),
  };
}
