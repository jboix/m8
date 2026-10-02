/**
 * Who has the floor in the conversation. Anything put into the live session as
 * text ends whatever generation is in progress, so a line sent while the person
 * is talking, or while the answer to them is being made, costs them that answer.
 * Everything that wants to put text in asks here first.
 */

/**
 * Who has the floor.
 *
 * - `free`: nobody. Text may go in.
 * - `theirs`: the person is talking.
 * - `thinking`: an answer is owed and has not started arriving.
 * - `speaking`: he is talking.
 */
export type FloorHolder = 'free' | 'theirs' | 'thinking' | 'speaking';

/**
 * How long after the last fragment of their speech the person still has the
 * floor. Transcript fragments arrive a few words at a time, and a pause for
 * breath is not the end of a sentence.
 */
const THEIRS_MS = 1600;

/**
 * How long an answer can be owed before the floor is given up anyway. A turn
 * the model decided not to answer must not silence the senses for good.
 */
const OWED_MS = 8000;

/** Keeps track of who has the floor. */
export interface Floor {
  /** A fragment of the person's speech arrived. */
  heard(): void;
  /** A line that asks for an answer was put into the session. */
  asked(): void;
  /** The answer started arriving. */
  answered(): void;
  /**
   * Work out who has the floor.
   * @param speaking - Whether his voice is playing right now.
   * @returns The holder.
   */
  holder(speaking: boolean): FloorHolder;
}

/**
 * Start tracking the floor.
 *
 * @param now - Clock, injected for tests. Defaults to `performance.now`.
 * @returns The tracker.
 */
export function createFloor(now = () => performance.now()): Floor {
  let heardAt = Number.NEGATIVE_INFINITY;
  let owedSince: number | null = null;

  return {
    heard() {
      heardAt = now();
      owedSince = heardAt;
    },
    asked() {
      owedSince = now();
    },
    answered() {
      owedSince = null;
    },
    holder(speaking) {
      if (speaking) return 'speaking';
      const at = now();
      if (at - heardAt < THEIRS_MS) return 'theirs';
      return owedSince !== null && at - owedSince < OWED_MS ? 'thinking' : 'free';
    },
  };
}
