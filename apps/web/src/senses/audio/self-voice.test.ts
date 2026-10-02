/**
 * The character not reacting to itself.
 *
 * A window covers 975 ms ending at its timestamp, so the question is never
 * "was it talking now" but "was it talking at any point in that second".
 */
import { describe, expect, test } from 'bun:test';
import { overlapsSpeech } from './self-voice.ts';

describe('a window that caught the character talking', () => {
  test('is dropped while it is mid-sentence', () => {
    expect(overlapsSpeech(10_000, 10_000)).toBe(true);
  });

  test('is dropped when it only started talking halfway through', () => {
    expect(overlapsSpeech(9_500, 10_000)).toBe(true);
  });

  test('is dropped for a moment after it stops, for the tail in the room', () => {
    expect(overlapsSpeech(8_900, 10_000)).toBe(true);
  });

  test('is kept once the room is actually quiet again', () => {
    expect(overlapsSpeech(8_000, 10_000)).toBe(false);
  });

  test('is kept when it has never said anything', () => {
    expect(overlapsSpeech(Number.NEGATIVE_INFINITY, 10_000)).toBe(false);
  });

  test('nothing gets through until a full window has passed since the last word', () => {
    // 975 ms of window plus 700 ms of tail: anything sooner overlaps.
    for (let gap = 0; gap < 1675; gap += 100) {
      expect(overlapsSpeech(10_000 - gap, 10_000)).toBe(true);
    }
    expect(overlapsSpeech(10_000 - 1700, 10_000)).toBe(false);
  });
});
