/**
 * The rule that keeps him from talking over anybody.
 *
 * Text put into the session ends whatever generation is in progress. So a fire
 * becomes an idle line only when nobody has had the floor for a while, and
 * otherwise it is dropped, not kept.
 */
import { describe, expect, test } from 'bun:test';
import { decideOutcome } from './fusion.ts';

describe('deciding what to do about a fire', () => {
  /** Long enough since anybody spoke, and since he last spoke up. */
  const QUIET = 30;

  test('a big spike makes him speak up when it has been quiet', () => {
    expect(decideOutcome(2, 1, QUIET, QUIET)).toBe('said');
  });

  test('something barely over the line is not worth it', () => {
    expect(decideOutcome(1.1, 1, QUIET, QUIET)).toBe('dropped');
  });

  test('nothing is said while anybody has the floor, however big', () => {
    // The floor being taken is what holds `quiet` at zero.
    expect(decideOutcome(2, 1, 0, QUIET)).toBe('dropped');
    expect(decideOutcome(40, 1, 0, QUIET)).toBe('dropped');
  });

  test('the second after somebody stops is not an invitation', () => {
    expect(decideOutcome(2, 1, 2, QUIET)).toBe('dropped');
  });

  test('he does not speak up twice in a row', () => {
    expect(decideOutcome(2, 1, QUIET, 5)).toBe('dropped');
  });

  test('a threshold raised by arousal takes more to cross', () => {
    expect(decideOutcome(2, 1, QUIET, QUIET)).toBe('said');
    expect(decideOutcome(2, 1.6, QUIET, QUIET)).toBe('dropped');
  });
});
