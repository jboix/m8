/** The self-model and its versions. */
import { describe, expect, test } from 'bun:test';
import { openDatabase } from './db.ts';
import { addSelfModel, latestSelfModel, rollbackSelfModel, selfModelVersions } from './episodes.ts';

describe('the self-model', () => {
  test('is versioned, and a rollback is a new version', () => {
    const db = openDatabase(':memory:');
    expect(latestSelfModel(db)).toBeNull();

    const first = addSelfModel(db, 'I am new.', null, 1);
    addSelfModel(db, 'I like cellos now.', null, 2);
    const restored = rollbackSelfModel(db, first, 3);

    expect(restored).toBe(3);
    expect(latestSelfModel(db)?.body).toBe('I am new.');
    expect(selfModelVersions(db)).toHaveLength(3);
    expect(rollbackSelfModel(db, 99, 4)).toBeNull();
  });
});
