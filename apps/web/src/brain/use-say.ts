/**
 * The one way to put a line of text into the live session. It holds lines while
 * the session is opening, and tells the floor when a line asks for an answer.
 */
import type { SessionState } from '@m8/shared';
import { type RefObject, useCallback, useEffect } from 'react';
import type { BrainClient } from './client.ts';
import type { Floor } from './floor.ts';

/** How many lines are held while the session opens. Beyond this they are stale. */
const PENDING = 4;

/** A line waiting for somewhere to go. */
export interface Line {
  /** What to say. */
  text: string;
  /** True asks for a reply, false leaves it silently in context. */
  answer: boolean;
}

/**
 * A way to put lines into the session that holds them while it is opening.
 *
 * @remarks
 * The line that matters most is the one about somebody arriving, and that is
 * exactly the moment the session is still connecting. Dropping it is why the
 * character never greeted anybody.
 *
 * @param state - Where the session is up to.
 * @param live - The client, once there is one.
 * @param pending - Lines waiting for somewhere to go.
 * @param floor - Told when a line asks for an answer.
 * @returns The `say` the panel and fusion both use.
 */
export function useSay(
  state: SessionState['state'],
  live: RefObject<BrainClient | null>,
  pending: RefObject<Line[]>,
  floor: Floor,
): (text: string, answer: boolean) => void {
  useEffect(() => {
    if (state !== 'live' || !live.current) return;
    const held = pending.current;
    pending.current = [];
    for (const line of held) deliver(live.current, line, floor);
  }, [state, live, pending, floor]);

  return useCallback(
    (text: string, answer: boolean) => {
      const client = state === 'live' ? live.current : null;
      if (!client) {
        pending.current = [...pending.current, { text, answer }].slice(-PENDING);
        return;
      }
      deliver(client, { text, answer }, floor);
    },
    [state, live, pending, floor],
  );
}

/**
 * Put one line into a live session.
 *
 * @param client - The session.
 * @param line - What to say, and whether to ask for an answer.
 * @param floor - Told when an answer is now owed.
 */
function deliver(client: BrainClient, line: Line, floor: Floor): void {
  if (!line.answer) {
    client.note(line.text);
    return;
  }
  floor.asked();
  client.interrupt(line.text);
}
