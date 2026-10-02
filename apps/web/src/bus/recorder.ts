/**
 * Saves an event stream so it can be run again. Tuning salience means running
 * the same input while changing one number, and a person waving at a camera is
 * never the same input twice.
 */
import type { Recording, SenseEvent } from '@m8/shared';
import type { Bus } from './bus.ts';

/** A recording in progress. */
export interface Recorder {
  /** How many events are captured so far. */
  size(): number;
  /** Stop listening and hand back what was captured. */
  stop(label: string): Recording;
}

/**
 * Start capturing everything on a bus.
 *
 * @param bus - The bus to listen to.
 * @param seed - The brainstem seed in use, stored so a replay can reproduce the
 * same blinks and wander rather than only the same events.
 * @param now - Wall clock, injected for tests.
 * @returns The running recorder.
 */
export function startRecording(bus: Bus, seed: number, now = () => Date.now()): Recorder {
  const events: SenseEvent[] = [];
  const stop = bus.subscribe((event) => {
    events.push(event);
  });
  const recordedAt = now();

  return {
    size: () => events.length,
    stop(label) {
      stop();
      return { version: 1, label, recordedAt, seed, events: [...events] };
    },
  };
}
