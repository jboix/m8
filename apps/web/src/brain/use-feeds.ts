/**
 * What goes up to the server alongside the microphone while a session is
 * live: the camera frames the model sees, and the log of what the local senses
 * picked up.
 */
import type { SessionState } from '@m8/shared';
import { type RefObject, useEffect } from 'react';
import type { Bus } from '../bus/bus.ts';
import type { BrainClient } from './client.ts';
import { startEventLog } from './event-log.ts';
import { startFrames } from './frames.ts';

/** Where the two feeds come from. */
interface FeedSources {
  /** The camera the vision sense has open, or null. */
  stream: MediaStream | null;
  /** Where the senses publish. */
  bus: Bus;
}

/**
 * Run both feeds for as long as the session is live.
 *
 * @param state - Where the session is up to.
 * @param live - The client, once there is one.
 * @param sources - The camera and the bus.
 */
export function useFeeds(
  state: SessionState['state'],
  live: RefObject<BrainClient | null>,
  { stream, bus }: FeedSources,
): void {
  useEffect(() => {
    if (state !== 'live' || !stream) return;
    const frames = startFrames(stream, (jpeg) => live.current?.sendFrame(jpeg));
    return () => {
      frames.stop();
    };
  }, [state, live, stream]);

  useEffect(() => {
    if (state !== 'live') return;
    return startEventLog(bus, (events) => live.current?.sendEvents(events));
  }, [state, live, bus]);
}
