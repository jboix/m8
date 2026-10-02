/**
 * Batches what the local senses picked up and hands it to the server, where it
 * becomes part of the session's raw log. Section 9 of docs/architecture.md.
 *
 * Only the slow kinds that mean something on their own. Motion and voice
 * levels arrive many times a second and say nothing a summary could use.
 */
import { MAX_BATCH_EVENTS, type SenseEvent, type SenseEventType } from '@m8/shared';
import type { Bus, Unsubscribe } from '../bus/bus.ts';

/** The kinds worth keeping. */
const KEPT_TYPES: readonly SenseEventType[] = [
  'presence',
  'vision.gesture',
  'sound.class',
  'sound.loud',
  'salience.fired',
  'alone',
  'mood',
];

/** How often a batch goes up. */
const FLUSH_MS = 5000;

/**
 * Start batching.
 *
 * @param bus - Where the senses publish.
 * @param send - Called with each batch. Never called with an empty one.
 * @returns Stops it. Whatever is still waiting goes up first.
 */
export function startEventLog(bus: Bus, send: (events: SenseEvent[]) => void): Unsubscribe {
  let waiting: SenseEvent[] = [];

  /** Send what has collected, if anything has. */
  function flush(): void {
    if (waiting.length === 0) return;
    send(waiting);
    waiting = [];
  }

  const subscriptions = KEPT_TYPES.map((type) =>
    bus.on(type, (event) => {
      waiting.push(event);
      if (waiting.length >= MAX_BATCH_EVENTS) flush();
    }),
  );
  const timer = setInterval(flush, FLUSH_MS);

  return () => {
    clearInterval(timer);
    for (const unsubscribe of subscriptions) unsubscribe();
    flush();
  };
}
