/**
 * Noticing that somebody has gone, and asking where they went.
 *
 * Falling asleep the moment a face leaves the frame reads as a machine
 * switching off. He looks for them and says so first, and only nods off when
 * nobody answers. The line waits for the floor: text put into the session ends
 * the sentence he is in the middle of, so he finishes it and then asks.
 */
import type { SenseEvent } from '@m8/shared';
import { AWAY_LINE } from './templates.ts';

/** How long the floor has to have been free before he asks. */
const ASK_AFTER_QUIET_SECONDS = 1.5;

/** Keeps track of whether there is somebody to ask after. */
export interface Missing {
  /**
   * Take one event in.
   * @param event - Anything from the bus. Only `alone` and `presence` matter.
   */
  absorb(event: SenseEvent): void;
  /**
   * See whether it is time to ask.
   * @param quiet - How long the floor has been free, in seconds.
   * @returns The line, once per leaving, or null. Nothing is returned once he
   * has started to nod off, because a question from a sleepy face is too late.
   */
  step(quiet: number): string | null;
}

/**
 * Start keeping track.
 *
 * @returns The tracker, with nobody to ask after yet.
 */
export function createMissing(): Missing {
  let wondering = false;

  return {
    absorb(event) {
      if (event.type === 'alone') wondering = event.stage === 'looking';
      if (event.type === 'presence' && event.state === 'present') wondering = false;
    },
    step(quiet) {
      if (!wondering || quiet < ASK_AFTER_QUIET_SECONDS) return null;
      wondering = false;
      return AWAY_LINE;
    },
  };
}
