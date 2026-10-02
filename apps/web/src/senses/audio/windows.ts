/**
 * Cutting the microphone into the lengths the classifier scores.
 *
 * Pure, and separate from `ambient.ts` because that module reaches for the
 * worklet and a worklet needs a browser. This is the part worth a test.
 */

/** The rate YAMNet was trained at, and what the classifier expects. */
export const AMBIENT_RATE = 16_000;

/** Samples per window: 0.975 seconds, the length YAMNet scores in one go. */
export const AMBIENT_WINDOW = 15_600;

/** One window of the room, with how loud it was. */
export interface AmbientWindow {
  /** The samples, at {@link AMBIENT_RATE}. */
  samples: Float32Array;
  /** Loudness in dBFS, from -100 for silence to 0 for clipping. */
  db: number;
  /** When the window ended, on the same clock as every other event. */
  ts: number;
}

/**
 * Loudness of a window, in dBFS.
 *
 * @param samples - The window.
 * @returns Decibels, floored at -100 so silence is a number rather than
 * negative infinity.
 */
export function loudness(samples: Float32Array): number {
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  const rms = Math.sqrt(sum / Math.max(1, samples.length));
  return Math.max(-100, 20 * Math.log10(Math.max(rms, 1e-5)));
}

/**
 * Collect worklet frames into whole windows.
 *
 * @param onWindow - Called once per full window.
 * @returns A function to feed each frame to.
 */
export function windower(onWindow: (window: AmbientWindow) => void): (frame: Float32Array) => void {
  const window = new Float32Array(AMBIENT_WINDOW);
  let filled = 0;
  return (frame) => {
    let offset = 0;
    while (offset < frame.length) {
      const room = Math.min(frame.length - offset, AMBIENT_WINDOW - filled);
      window.set(frame.subarray(offset, offset + room), filled);
      filled += room;
      offset += room;
      if (filled < AMBIENT_WINDOW) continue;
      const samples = window.slice(0);
      filled = 0;
      onWindow({ samples, db: loudness(samples), ts: performance.now() });
    }
  };
}
