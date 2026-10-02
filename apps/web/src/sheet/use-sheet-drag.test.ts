import { describe, expect, test } from 'bun:test';
import { pullCloses } from './use-sheet-drag.ts';

describe('pullCloses', () => {
  test('a tap or a wobble leaves the sheet where it is', () => {
    expect(pullCloses(0, 0)).toBe(false);
    expect(pullCloses(30, 0.1)).toBe(false);
  });

  test('a pull far enough down closes it, however slow', () => {
    expect(pullCloses(120, 0)).toBe(true);
  });

  test('a flick closes it, however short', () => {
    expect(pullCloses(20, 1.2)).toBe(true);
  });

  test('a fast move back up does not', () => {
    expect(pullCloses(-20, 1.2)).toBe(false);
  });
});
