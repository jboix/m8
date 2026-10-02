/** Asking where somebody went. */
import { describe, expect, test } from 'bun:test';
import { createMissing } from './missing.ts';
import { AWAY_LINE } from './templates.ts';

describe('createMissing', () => {
  test('asks once, and only when the floor has been free for a moment', () => {
    const missing = createMissing();
    missing.absorb({ type: 'alone', ts: 1, stage: 'looking' });

    expect(missing.step(0)).toBeNull();
    expect(missing.step(2)).toBe(AWAY_LINE);
    expect(missing.step(10)).toBeNull();
  });

  test('does not ask when they are already back', () => {
    const missing = createMissing();
    missing.absorb({ type: 'alone', ts: 1, stage: 'looking' });
    missing.absorb({ type: 'presence', ts: 2, state: 'present' });

    expect(missing.step(10)).toBeNull();
  });

  test('does not ask once he has started to nod off', () => {
    const missing = createMissing();
    missing.absorb({ type: 'alone', ts: 1, stage: 'looking' });
    missing.absorb({ type: 'alone', ts: 2, stage: 'drowsy' });

    expect(missing.step(10)).toBeNull();
  });
});
