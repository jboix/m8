/**
 * The server's settings: one JSON value per key in the `settings` table, each
 * read through a Zod schema.
 */
import type { Database } from 'bun:sqlite';
import type { z } from 'zod';

/**
 * Read one setting.
 *
 * @param db - The database.
 * @param key - The setting.
 * @param schema - What the value must look like.
 * @returns The value, or null when it was never written or no longer validates.
 */
export function readSetting<Value>(
  db: Database,
  key: string,
  schema: z.ZodType<Value>,
): Value | null {
  const row = db
    .query<{ value: string }, [string]>('SELECT value FROM settings WHERE key = ?')
    .get(key);
  if (!row) return null;
  try {
    return schema.safeParse(JSON.parse(row.value)).data ?? null;
  } catch {
    return null;
  }
}

/**
 * Write one setting, replacing what was there.
 *
 * @param db - The database.
 * @param key - The setting.
 * @param value - Anything JSON can hold.
 * @param now - The time of the write.
 */
export function writeSetting(db: Database, key: string, value: unknown, now: number): void {
  db.query(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(key, JSON.stringify(value), now);
}
