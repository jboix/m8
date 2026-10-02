/** Faces come back as they went in, a person keeps only their newest few, and forgetting works. */

import { describe, expect, test } from 'bun:test';
import { FACE_EMBEDDING_SIZE } from '@m8/shared';
import { openDatabase } from './db.ts';
import { forgetFace, knownFaces, knownNames, learnFace } from './faces.ts';

/**
 * A unit embedding with one value set.
 *
 * @param at - Which value is 1.
 * @returns The embedding.
 */
function embedding(at: number): number[] {
  const values = new Array<number>(FACE_EMBEDDING_SIZE).fill(0);
  values[at] = 1;
  return values;
}

describe('faces', () => {
  test('come back exactly as they were learned, newest first', () => {
    const db = openDatabase(':memory:');
    learnFace(db, 'Ada', embedding(3), 1);
    learnFace(db, 'Bo', embedding(7), 2);

    const faces = knownFaces(db);

    expect(faces.map((face) => face.name)).toEqual(['Bo', 'Ada']);
    expect(faces[1]?.embedding).toEqual(embedding(3));
    expect(faces[1]?.createdAt).toBe(1);
  });

  test('keep only the newest five of one person', () => {
    const db = openDatabase(':memory:');
    for (let sample = 0; sample < 7; sample++) learnFace(db, 'Ada', embedding(sample), sample);

    const kept = knownFaces(db).map((face) => face.embedding.indexOf(1));

    expect(kept).toEqual([6, 5, 4, 3, 2]);
  });

  test('name each person once, in the order they were met', () => {
    const db = openDatabase(':memory:');
    learnFace(db, 'Ada', embedding(1), 1);
    learnFace(db, 'Bo', embedding(2), 2);
    learnFace(db, 'Ada', embedding(3), 3);

    expect(knownNames(db)).toEqual(['Ada', 'Bo']);
  });

  test('can be forgotten one at a time', () => {
    const db = openDatabase(':memory:');
    const id = learnFace(db, 'Ada', embedding(1), 1);

    expect(forgetFace(db, id)).toBe(true);
    expect(forgetFace(db, id)).toBe(false);
    expect(knownFaces(db)).toEqual([]);
  });
});
