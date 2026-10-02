/** The seeded source repeats exactly, differs across seeds, and stays in range. */
import { describe, expect, test } from 'bun:test';
import { createSeededRandom, newSeed } from './random.ts';

/**
 * Draw a run of numbers.
 *
 * @param seed - The seed to draw from.
 * @param count - How many.
 * @returns The run.
 */
function draw(seed: number, count: number): number[] {
  const random = createSeededRandom(seed);
  return Array.from({ length: count }, () => random());
}

describe('createSeededRandom', () => {
  test('gives the same run for the same seed', () => {
    expect(draw(12345, 50)).toEqual(draw(12345, 50));
  });

  test('gives a different run for a different seed', () => {
    expect(draw(1, 20)).not.toEqual(draw(2, 20));
  });

  test('stays inside 0 to 1', () => {
    const run = draw(99, 2000);

    expect(Math.min(...run)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...run)).toBeLessThan(1);
  });

  test('spreads evenly enough to schedule blinks with', () => {
    const run = draw(7, 4000);
    const mean = run.reduce((total, value) => total + value, 0) / run.length;

    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
  });

  test('hands out seeds that survive a round trip through JSON', () => {
    const seed = newSeed();

    expect(Number.isInteger(seed)).toBe(true);
    expect(draw(seed, 5)).toEqual(draw(JSON.parse(JSON.stringify(seed)), 5));
  });
});
