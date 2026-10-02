/** He is told who is in front of him once it has settled, once, and only when the floor is free. */

import { describe, expect, test } from 'bun:test';
import type { SenseEvent } from '@m8/shared';
import { createCompanyNote } from './company-note.ts';
import { toWhoLine } from './templates.ts';

/** A face arriving. */
const face = (id: string): SenseEvent => ({
  type: 'vision.face',
  ts: 0,
  id,
  x: 0.5,
  y: 0.5,
  size: 0.3,
  facing: true,
});

/** A face being named. */
const person = (id: string, name: string | null): SenseEvent => ({
  type: 'vision.person',
  ts: 0,
  id,
  name,
  score: 0.7,
});

describe('toWhoLine', () => {
  test('says nothing about nobody, or about one stranger', () => {
    expect(toWhoLine([])).toBeNull();
    expect(toWhoLine([null])).toBeNull();
  });

  test('names who it can and counts the rest', () => {
    expect(toWhoLine(['Ada'])).toBe('[who] In front of you now: Ada.');
    expect(toWhoLine(['Ada', null])).toBe(
      '[who] In front of you now: Ada and somebody you do not know by sight.',
    );
    expect(toWhoLine([null, 'Bo', null, 'Ada'])).toBe(
      '[who] In front of you now: Bo, Ada and 2 people you do not know by sight.',
    );
  });
});

describe('the company note', () => {
  test('waits for the change to settle and the floor to be free', () => {
    const note = createCompanyNote();
    note.absorb(face('f1'));
    note.absorb(person('f1', 'Ada'));

    expect(note.step(1, 5)).toBeNull();
    expect(note.step(1.5, 0)).toBeNull();
    expect(note.step(0, 5)).toBe('[who] In front of you now: Ada.');
  });

  test('says each state once', () => {
    const note = createCompanyNote();
    note.absorb(face('f1'));
    note.absorb(person('f1', 'Ada'));
    note.step(3, 5);

    expect(note.step(3, 5)).toBeNull();
  });

  test('says nothing for one stranger, then speaks up when they are named', () => {
    const note = createCompanyNote();
    note.absorb(face('f1'));

    expect(note.step(3, 5)).toBeNull();
    note.absorb(person('f1', 'Bo'));
    expect(note.step(3, 5)).toBe('[who] In front of you now: Bo.');
  });

  test('starts the settling over when the roster changes again', () => {
    const note = createCompanyNote();
    note.absorb(face('f1'));
    note.absorb(person('f1', 'Ada'));
    note.step(1.5, 5);
    note.absorb(face('f2'));

    expect(note.step(1, 5)).toBeNull();
    expect(note.step(1.5, 5)).toBe(
      '[who] In front of you now: Ada and somebody you do not know by sight.',
    );
  });

  test('drops a change that undid itself before it settled', () => {
    const note = createCompanyNote();
    note.absorb(face('f1'));
    note.absorb(person('f1', 'Ada'));
    note.step(3, 5);
    note.absorb(face('f2'));
    note.step(1, 5);
    note.absorb({ type: 'vision.face.lost', ts: 0, id: 'f2' });

    expect(note.step(3, 5)).toBeNull();
  });
});
