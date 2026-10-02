/** Opening the memory, new and old. */
import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from './db.ts';
import { MIGRATIONS } from './migrations.ts';
import { lastSession } from './sessions.ts';

describe('openDatabase', () => {
  test('brings a new file all the way up', () => {
    const db = openDatabase(':memory:');

    expect(db.query('PRAGMA user_version').get()).toEqual({ user_version: MIGRATIONS.length });
  });

  test('applies only the steps an older file has not had, and keeps its rows', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'm8-memory-')), 'old.sqlite');
    const old = new Database(path, { create: true });
    old.run(MIGRATIONS[0] ?? '');
    old.run('PRAGMA user_version = 1');
    old.run(
      "INSERT INTO sessions (started_at, ended_at, person, language) VALUES (1, 2, 'Ada', 'en')",
    );
    old.close();

    const db = openDatabase(path);

    expect(db.query('PRAGMA user_version').get()).toEqual({ user_version: MIGRATIONS.length });
    expect(lastSession(db)).toEqual({ startedAt: 1, endedAt: 2, mood: null });
  });
});
