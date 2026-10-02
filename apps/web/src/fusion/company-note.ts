/**
 * Tells the model who is in front of him when that changes: a face he knows
 * arrives, a second person appears, somebody leaves. The line goes in as a
 * note, never as a question, and only once the floor has been free a moment,
 * because text into the session ends whatever he is saying.
 */
import type { SenseEvent } from '@m8/shared';
import { toWhoLine } from './templates.ts';

/** How long a change has to hold before it is worth saying. */
const SETTLE_SECONDS = 2;

/** How long the floor has to have been free. */
const QUIET_SECONDS = 1.5;

/** The who-is-here notes. */
export interface CompanyNote {
  /**
   * Take one event in.
   * @param event - What happened.
   */
  absorb(event: SenseEvent): void;
  /**
   * Let time pass, and say what changed once it has settled.
   * @param seconds - How much time passed.
   * @param quiet - How long the floor has been free, in seconds.
   * @returns The line to put into the session, or `null`.
   */
  step(seconds: number, quiet: number): string | null;
}

/**
 * Keep the roster of faces in view up to date.
 *
 * @param names - Each face in view and its name, mutated in place.
 * @param event - What happened.
 * @returns True when the event was about a face.
 */
function follow(names: Map<string, string | null>, event: SenseEvent): boolean {
  switch (event.type) {
    case 'vision.face':
      if (!names.has(event.id)) names.set(event.id, null);
      return true;
    case 'vision.face.lost':
      names.delete(event.id);
      return true;
    case 'vision.person':
      names.set(event.id, event.name);
      return true;
    default:
      return false;
  }
}

/**
 * Start following who is in view.
 *
 * @returns The notes, with nobody in view yet.
 */
export function createCompanyNote(): CompanyNote {
  const names = new Map<string, string | null>();
  let said: string | null = null;
  let pending: string | null = null;
  let settled = 0;

  return {
    absorb(event) {
      if (!follow(names, event)) return;
      const line = toWhoLine([...names.values()]);
      if (line === pending) return;
      pending = line;
      settled = 0;
    },
    step(seconds, quiet) {
      settled += seconds;
      if (pending === null || pending === said) return null;
      if (settled < SETTLE_SECONDS || quiet < QUIET_SECONDS) return null;
      said = pending;
      return pending;
    },
  };
}
