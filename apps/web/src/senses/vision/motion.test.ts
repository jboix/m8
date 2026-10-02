/** Frame differencing reports where something moved, and stays quiet otherwise. */
import { describe, expect, test } from 'bun:test';
import { createMotionDetector, MOTION_CELLS } from './motion.ts';

/**
 * A flat grid, optionally with one region brightened.
 *
 * @param base - Brightness everywhere.
 * @param patch - A square to brighten, in cell coordinates.
 * @returns The grid.
 */
function grid(base: number, patch?: { x: number; y: number; size: number; value: number }) {
  const cells = new Uint8ClampedArray(MOTION_CELLS * MOTION_CELLS).fill(base);
  if (!patch) return cells;
  for (let row = patch.y; row < patch.y + patch.size; row++) {
    for (let column = patch.x; column < patch.x + patch.size; column++) {
      cells[row * MOTION_CELLS + column] = patch.value;
    }
  }
  return cells;
}

describe('the motion detector', () => {
  test('says nothing about the first frame it ever sees', () => {
    expect(createMotionDetector().compare(grid(100))).toBeNull();
  });

  test('says nothing about a still scene', () => {
    const detector = createMotionDetector();
    detector.compare(grid(100));

    expect(detector.compare(grid(100))).toBeNull();
  });

  test('ignores changes below the noise floor', () => {
    const detector = createMotionDetector();
    detector.compare(grid(100));

    expect(detector.compare(grid(108))).toBeNull();
  });

  test('finds where something moved, mirrored', () => {
    const detector = createMotionDetector();
    detector.compare(grid(100));
    // A patch on the left of the image, which is the viewer's right.
    const motion = detector.compare(grid(100, { x: 1, y: 1, size: 4, value: 255 }));

    expect(motion).not.toBeNull();
    expect(motion?.x).toBeGreaterThan(0.7);
    expect(motion?.y).toBeLessThan(0.3);
  });

  test('reports more magnitude for more movement', () => {
    const small = createMotionDetector();
    small.compare(grid(100));
    const little = small.compare(grid(100, { x: 0, y: 0, size: 3, value: 255 }));

    const large = createMotionDetector();
    large.compare(grid(100));
    const lots = large.compare(grid(100, { x: 0, y: 0, size: 14, value: 255 }));

    expect(lots?.magnitude).toBeGreaterThan(little?.magnitude ?? 1);
    expect(lots?.magnitude).toBeLessThanOrEqual(1);
  });

  test('compares against the previous frame, not the first one', () => {
    const detector = createMotionDetector();
    detector.compare(grid(100));
    detector.compare(grid(100, { x: 5, y: 5, size: 5, value: 255 }));

    expect(detector.compare(grid(100, { x: 5, y: 5, size: 5, value: 255 }))).toBeNull();
  });
});
