/**
 * Frame differencing: how much changed since the last frame, and roughly where.
 * No model, no landmarks, and it notices a door opening behind you that the face
 * landmarker has no opinion about.
 */

/** Grid the frame is reduced to before comparing. Coarse on purpose. */
const CELLS = 24;

/** Per-cell brightness change below this is sensor noise, not movement. */
const NOISE_FLOOR = 14;

/** Scales the fraction of changed cells into the 0 to 1 the contract wants. */
const MAGNITUDE_GAIN = 4;

/** What one frame changed. */
export interface Motion {
  /** Centre of the change, normalised and already mirrored. */
  x: number;
  /** Vertical centre. */
  y: number;
  /** How much changed, 0 to 1. */
  magnitude: number;
}

/** Holds the previous frame's grid so the next one has something to differ from. */
export interface MotionDetector {
  /**
   * Compare a frame against the one before it.
   * @param luma - One brightness per cell, row major, `CELLS * CELLS` long.
   * @returns What moved, or `null` on the first frame and when nothing did.
   */
  compare(luma: Uint8ClampedArray): Motion | null;
}

/** Where the changed cells were, and how many there were. */
interface Changes {
  changed: number;
  sumX: number;
  sumY: number;
}

/**
 * Count the cells that changed and where they sat.
 *
 * @param luma - This frame's grid.
 * @param before - The previous frame's grid, the same length.
 * @returns The count and the summed coordinates, for a centroid.
 */
function accumulate(luma: Uint8ClampedArray, before: Uint8ClampedArray): Changes {
  let changed = 0;
  let sumX = 0;
  let sumY = 0;
  for (let cell = 0; cell < luma.length; cell++) {
    if (Math.abs((luma[cell] ?? 0) - (before[cell] ?? 0)) < NOISE_FLOOR) continue;
    changed += 1;
    sumX += cell % CELLS;
    sumY += Math.floor(cell / CELLS);
  }
  return { changed, sumX, sumY };
}

/**
 * Build a detector.
 *
 * @returns One with no history, which reports nothing for its first frame.
 */
export function createMotionDetector(): MotionDetector {
  let previous: Uint8ClampedArray | null = null;

  return {
    compare(luma) {
      const before = previous;
      previous = luma.slice();
      if (!before || before.length !== luma.length) return null;

      const { changed, sumX, sumY } = accumulate(luma, before);
      if (changed === 0) return null;

      const magnitude = Math.min(1, (changed / luma.length) * MAGNITUDE_GAIN);
      // Mirrored, like every other coordinate the character sees.
      return {
        x: 1 - sumX / changed / (CELLS - 1),
        y: sumY / changed / (CELLS - 1),
        magnitude,
      };
    },
  };
}

/** How many cells across the grid is, for whoever builds the luma. */
export const MOTION_CELLS = CELLS;
