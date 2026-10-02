/** The durable memories and the search over them. */
import { describe, expect, test } from 'bun:test';
import { openDatabase } from './db.ts';
import {
  addFact,
  forgetFact,
  type NewFact,
  searchFacts,
  supersedeFact,
  toFtsQuery,
  topFacts,
} from './facts.ts';

/**
 * A fact with everything but the text filled in.
 *
 * @param text - What it says.
 * @param importance - How much it matters.
 * @returns The fact, ready to keep.
 */
function fact(text: string, importance = 3): NewFact {
  return { kind: 'preference', text, importance, source: 'tool' };
}

describe('toFtsQuery', () => {
  test('quotes every word, so punctuation cannot break the query', () => {
    expect(toFtsQuery('coffee AND "milk" (x)')).toBe('"coffee"* OR "AND"* OR "milk"*');
  });

  test('is empty when there is nothing to search for', () => {
    expect(toFtsQuery('? !')).toBe('');
  });
});

describe('facts', () => {
  test('are found by a word, without accents mattering', () => {
    const db = openDatabase(':memory:');
    addFact(db, fact('Ada likes café con leche'), 1);
    addFact(db, fact('The cat is called Miso'), 1);

    expect(searchFacts(db, 'cafe', 5, 2).map((found) => found.text)).toEqual([
      'Ada likes café con leche',
    ]);
  });

  test('are found by substring in a language written without spaces', () => {
    const db = openDatabase(':memory:');
    addFact(db, fact('エイダは猫が好き'), 1);

    expect(searchFacts(db, '猫が', 5, 2)).toHaveLength(1);
  });

  test('count each time they are used', () => {
    const db = openDatabase(':memory:');
    addFact(db, fact('Ada plays the cello'), 1);
    searchFacts(db, 'cello', 5, 7);

    const [found] = topFacts(db, 5);
    expect(found?.useCount).toBe(1);
    expect(found?.lastUsedAt).toBe(7);
  });

  test('are not stored twice, and keep the higher importance', () => {
    const db = openDatabase(':memory:');
    const first = addFact(db, fact('Ada plays the cello', 2), 1);
    const second = addFact(db, fact('ada plays the cello ', 4), 2);

    expect(second).toEqual({ id: first.id, known: true });
    expect(topFacts(db, 5).map((found) => found.importance)).toEqual([4]);
  });

  test('stop being recalled once superseded', () => {
    const db = openDatabase(':memory:');
    const old = addFact(db, fact('Ada lives in Girona'), 1);
    const current = addFact(db, fact('Ada lives in Lausanne'), 2);
    supersedeFact(db, old.id, current.id);

    expect(searchFacts(db, 'Ada lives', 5, 3).map((found) => found.id)).toEqual([current.id]);
    expect(topFacts(db, 5)).toHaveLength(1);
  });

  test('are forgotten along with what they replaced', () => {
    const db = openDatabase(':memory:');
    const old = addFact(db, fact('Ada lives in Girona'), 1);
    const current = addFact(db, fact('Ada lives in Lausanne'), 2);
    supersedeFact(db, old.id, current.id);

    expect(forgetFact(db, current.id)).toBe(true);
    expect(searchFacts(db, 'Girona Lausanne', 5, 3)).toEqual([]);
    expect(forgetFact(db, current.id)).toBe(false);
  });

  test('come back most important first', () => {
    const db = openDatabase(':memory:');
    addFact(db, fact('minor', 1), 1);
    addFact(db, fact('major', 5), 2);

    expect(topFacts(db, 1).map((found) => found.text)).toEqual(['major']);
  });
});
