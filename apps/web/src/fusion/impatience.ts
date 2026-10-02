/**
 * What the character does when someone is there and nothing is happening.
 *
 * Waiting to be spoken to is what a tool does. After a stretch of quiet he gets
 * bored and starts something. This is the reptilian brain asking for
 * interaction, and what he starts comes from what he can see, hear or remember.
 */
import { IDLE_PREFIX } from './templates.ts';

/** How long someone has to be present and quiet before the first prod. */
const FIRST_PROD_SECONDS = 22;

/** How much longer each time, so it gets the message rather than nagging. */
const PROD_BACKOFF = 1.8;

/** How many times it will try before giving up and just being there. */
const MAX_PRODS = 3;

/** The prods, in order. Each is a line it is asked to answer. */
const PRODS = [
  `${IDLE_PREFIX} Nothing has happened for a while and you are bored. Make a remark about something you can see or hear right now. A remark, not a question.`,
  `${IDLE_PREFIX} Still quiet. Try a different idea: a wrong theory, a dare, a game, or something you were taught.`,
  `${IDLE_PREFIX} They seem busy. Say one short friendly thing, then settle down and wait.`,
];

/** A running impatience. */
export interface Impatience {
  /**
   * Let time pass.
   * @param deltaSeconds - How much.
   * @param present - Whether anyone is there to be impatient at.
   * @returns A line to say, or `null`.
   */
  step(deltaSeconds: number, present: boolean): string | null;
  /** The person talked to him, so start over, the count of prods included. */
  reset(): void;
  /** He just started something, so the quiet starts again. The count is kept. */
  spoke(): void;
}

/**
 * Build one.
 *
 * @returns An impatience that has just been satisfied.
 */
export function createImpatience(): Impatience {
  let quiet = 0;
  let prods = 0;

  return {
    step(deltaSeconds, present) {
      if (!present) {
        quiet = 0;
        return null;
      }
      quiet += deltaSeconds;
      if (prods >= MAX_PRODS) return null;
      if (quiet < FIRST_PROD_SECONDS * PROD_BACKOFF ** prods) return null;

      const line = PRODS[prods] ?? null;
      prods += 1;
      quiet = 0;
      return line;
    },

    reset() {
      quiet = 0;
      prods = 0;
    },

    spoke() {
      quiet = 0;
    },
  };
}
