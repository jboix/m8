/** The self-model diff. */
import { describe, expect, test } from 'bun:test';
import { diffWords } from './text-diff.ts';

describe('diffWords', () => {
  test('marks what was replaced, and keeps the rest', () => {
    expect(diffWords('I like big mugs', 'I like small mugs a lot')).toEqual([
      { kind: 'same', text: 'I like' },
      { kind: 'removed', text: 'big' },
      { kind: 'added', text: 'small' },
      { kind: 'same', text: 'mugs' },
      { kind: 'added', text: 'a lot' },
    ]);
  });

  test('treats a first version as all new', () => {
    expect(diffWords('', 'I am new')).toEqual([{ kind: 'added', text: 'I am new' }]);
  });

  test('says nothing changed when nothing did', () => {
    expect(diffWords('same words', 'same  words')).toEqual([{ kind: 'same', text: 'same words' }]);
  });
});
