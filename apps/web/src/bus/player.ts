/**
 * Plays a recording back onto a bus, on the clock it was captured on. Nothing
 * downstream can tell the difference between this and a camera, which is the
 * whole point.
 */
import type { Recording, SenseEvent } from '@m8/shared';
import type { Bus } from './bus.ts';

/** A replay in progress. */
export interface Player {
  /** How far through, 0 to 1. */
  progress(): number;
  /** Stop early. Safe to call after it has finished. */
  stop(): void;
}

/** How a replay is driven. */
export interface PlayerOptions {
  /** Speed multiplier. 2 runs a five-minute session in two and a half minutes. */
  rate?: number;
  /** Called once the last event has gone out. */
  onFinished?: () => void;
  /**
   * Schedules the next event. Defaults to `setTimeout`. A test passes a manual
   * queue here and gets a replay with no clock in it at all.
   */
  schedule?: (run: () => void, delayMs: number) => () => void;
}

/**
 * Default scheduler.
 *
 * @param run - What to run.
 * @param delayMs - How long to wait.
 * @returns A cancel.
 */
function timeoutScheduler(run: () => void, delayMs: number): () => void {
  const timer = setTimeout(run, delayMs);
  return () => {
    clearTimeout(timer);
  };
}

/**
 * Replay a recording.
 *
 * @param bus - Where the events go.
 * @param recording - What to play. An empty one finishes immediately.
 * @param options - Rate, completion callback and scheduler.
 * @returns The running player.
 */
export function playRecording(bus: Bus, recording: Recording, options: PlayerOptions = {}): Player {
  const { rate = 1, onFinished, schedule = timeoutScheduler } = options;
  const events: SenseEvent[] = recording.events;
  const origin = events[0]?.ts ?? 0;
  let index = 0;
  let cancel: (() => void) | undefined;
  let stopped = false;

  /** Send event `index`, then queue the one after it. */
  function step(): void {
    const event = events[index];
    if (stopped || !event) return;
    index += 1;
    bus.publish(event);
    queue();
  }

  /** Wait out the gap to the next event, at the playback rate. */
  function queue(): void {
    const next = events[index];
    if (!next || stopped) {
      if (!next) onFinished?.();
      return;
    }
    const previous = events[index - 1]?.ts ?? origin;
    cancel = schedule(step, Math.max(0, (next.ts - previous) / rate));
  }

  queue();

  return {
    progress: () => (events.length === 0 ? 1 : index / events.length),
    stop() {
      stopped = true;
      cancel?.();
    },
  };
}
