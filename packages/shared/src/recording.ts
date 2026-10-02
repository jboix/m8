/**
 * A saved event stream. The point of the format is that fusion, mood and the
 * brain can be worked on without sitting in front of a camera, so it has to
 * carry everything a session needs to run the same way twice.
 */
import { z } from 'zod';
import { SenseEvent } from './events.ts';

/** A session of events, replayable onto a bus. */
export const Recording = z.object({
  /** Bumped when the shape changes, so an old file fails loudly. */
  version: z.literal(1),
  /** What the session was, in a few words. Written by hand in the panel. */
  label: z.string().max(120).default(''),
  /** Wall clock at the start, for sorting recordings. Never used for playback. */
  recordedAt: z.number().int(),
  /**
   * The brainstem's random seed for this session. Replaying with it gives the
   * same blinks and the same wander, which is what makes "the recording drives
   * the eyes identically" a claim that can be checked rather than eyeballed.
   */
  seed: z.number().int().nonnegative(),
  /** In the order they happened. Playback times them from the first `ts`. */
  events: z.array(SenseEvent),
});

/** A saved event stream. */
export type Recording = z.infer<typeof Recording>;
