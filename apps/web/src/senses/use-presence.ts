/**
 * Whether anyone is there, as far as the browser is concerned.
 *
 * Section 6: presence gates the live session. No face for a while closes it and
 * the eyes get sleepy; a face opens it again. That is both the character
 * behaving like something that notices you arrive, and the only thing stopping
 * an empty room from billing by the minute.
 */
import { useEffect, useState } from 'react';
import type { Bus } from '../bus/bus.ts';

/**
 * How long after the room empties before the session is closed.
 *
 * @remarks
 * Longer than tier 1's own absent threshold, because reopening costs a
 * reconnect and a bootstrap: somebody crossing the room should not cost a
 * session, but somebody leaving for lunch should.
 */
const CLOSE_AFTER_MS = 45_000;

/**
 * Watch for anyone being there.
 *
 * @param bus - Where presence events arrive.
 * @returns True while someone is there, staying true for a while after they
 * leave.
 */
export function usePresence(bus: Bus): boolean {
  const [present, setPresent] = useState(false);

  useEffect(() => {
    let closing: ReturnType<typeof setTimeout> | undefined;
    const off = bus.on('presence', (event) => {
      clearTimeout(closing);
      if (event.state === 'present') {
        setPresent(true);
        return;
      }
      closing = setTimeout(() => {
        setPresent(false);
      }, CLOSE_AFTER_MS);
    });

    return () => {
      clearTimeout(closing);
      off();
    };
  }, [bus]);

  return present;
}
