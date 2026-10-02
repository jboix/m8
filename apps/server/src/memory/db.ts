/** Opens the one SQLite file the character's memory lives in. */
import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { MIGRATIONS } from './migrations.ts';

/**
 * Bring a database up to the current schema.
 *
 * @param db - The database. Steps it has already had are skipped.
 */
function migrate(db: Database): void {
  const row = db.query<{ user_version: number }, []>('PRAGMA user_version').get();
  const applied = row?.user_version ?? 0;

  MIGRATIONS.slice(applied).forEach((step, offset) => {
    db.transaction(() => {
      db.run(step);
      db.run(`PRAGMA user_version = ${applied + offset + 1}`);
    })();
  });
}

/**
 * Open the memory, creating the file and its directory when they do not exist.
 *
 * @param path - Where the file lives, or `:memory:` for one that dies with the process.
 * @returns The database, migrated and ready.
 */
export function openDatabase(path: string): Database {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true, strict: true });
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');
  migrate(db);
  return db;
}
