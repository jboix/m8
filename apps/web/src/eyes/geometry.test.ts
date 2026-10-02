import { describe, expect, test } from 'bun:test';
import { eyePath } from './geometry.ts';

/**
 * The numbers in a path, in order.
 *
 * @param path - An SVG path.
 * @returns Every coordinate in it.
 */
function numbers(path: string): number[] {
  return (path.match(/-?\d+(\.\d+)?(e-?\d+)?/g) ?? []).map(Number);
}

/** An open eye. */
const OPEN = { top: -110, bottom: 110, smile: 0 };

describe('the bottom edge of the eye', () => {
  test('with no bow, both feet are at the middle and the edge is flat there', () => {
    // M, the top right curve, then the curve down to the right foot.
    const path = numbers(eyePath(OPEN));
    const foot = { x: path[12], y: path[13] };
    expect(foot).toEqual({ x: 0, y: 110 });
  });

  test('a vanishing bow draws the plain edge, so a settling spring leaves no trace', () => {
    const plain = numbers(eyePath(OPEN));
    const nearly = numbers(eyePath({ ...OPEN, bow: 1e-7 }));
    const furthest = Math.max(
      ...plain.map((value, index) => Math.abs(value - (nearly[index] ?? 0))),
    );
    expect(furthest).toBeLessThan(0.001);
  });

  test('a bow lifts the middle and leaves the feet down, out to the sides', () => {
    const path = numbers(eyePath({ ...OPEN, bow: 50 }));
    const foot = { x: path[12] ?? 0, y: path[13] };
    const crest = { x: path[18], y: path[19] };
    expect(foot.x).toBeGreaterThan(50);
    expect(foot.y).toBe(110);
    expect(crest).toEqual({ x: 0, y: 60 });
  });

  test('an eye at the depth of a reflex blink has no bow left', () => {
    // A blink through the lid springs only gets the opening down to about 48.
    const blinking = { top: 10, bottom: 58, smile: 0 };

    expect(eyePath({ ...blinking, bow: 42 })).toBe(eyePath(blinking));
  });

  test('a half shut eye has no bow, and a mostly open one has all of it', () => {
    const half = { top: -8, bottom: 110, smile: 0 };
    const mostly = { top: -90, bottom: 110, smile: 0 };

    expect(eyePath({ ...half, bow: 42 })).toBe(eyePath(half));
    expect(numbers(eyePath({ ...mostly, bow: 42 }))).toContain(110 - 42);
  });

  test('the bow fades smoothly between the two', () => {
    const between = { top: -43, bottom: 110, smile: 0 };
    const crest = numbers(eyePath({ ...between, bow: 42 })).find(
      (value) => value > 110 - 42 && value < 110,
    );

    expect(crest).toBeDefined();
  });
});
