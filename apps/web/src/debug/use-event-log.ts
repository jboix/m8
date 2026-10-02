/**
 * A window onto what has recently crossed the bus. It samples on a timer rather
 * than rendering per event, because the bus runs at camera rate and React does
 * not need to.
 */
import type { SenseEvent } from '@m8/shared';
import { useEffect, useState } from 'react';
import type { Bus } from '../bus/bus.ts';

/** How many events the timeline keeps. Older ones fall off the end. */
const CAPACITY = 300;

/** How often the list is handed to React. */
const SAMPLE_MS = 120;

/** One event as the timeline sees it. */
export interface LoggedEvent {
  /**
   * Position in the stream. Events carry no identity of their own, and two of
   * them can share a timestamp, so the list needs its own counter to key rows
   * by.
   */
  seq: number;
  /** What happened. */
  event: SenseEvent;
}

/**
 * Watch the bus.
 *
 * @param bus - The bus to listen to.
 * @returns The most recent events, newest first, refreshed a few times a second.
 */
export function useEventLog(bus: Bus): LoggedEvent[] {
  const [events, setEvents] = useState<LoggedEvent[]>([]);

  useEffect(() => {
    let buffer: LoggedEvent[] = [];
    let dirty = false;
    let seq = 0;

    const stop = bus.subscribe((event) => {
      seq += 1;
      buffer = [{ seq, event }, ...buffer].slice(0, CAPACITY);
      dirty = true;
    });
    const timer = setInterval(() => {
      if (!dirty) return;
      dirty = false;
      setEvents(buffer);
    }, SAMPLE_MS);

    return () => {
      stop();
      clearInterval(timer);
    };
  }, [bus]);

  return events;
}
