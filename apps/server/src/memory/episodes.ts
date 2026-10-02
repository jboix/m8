/**
 * What each session came to, and the self-model those episodes rewrite.
 * Section 9 of docs/architecture.md.
 */
import type { Database } from 'bun:sqlite';
import type { Episode, SelfModelVersion } from '@m8/shared';

/**
 * Store what a session came to.
 *
 * @param db - The memory.
 * @param sessionId - The session summarized.
 * @param summary - The summary.
 * @param now - When.
 * @returns The new episode's id.
 */
export function addEpisode(db: Database, sessionId: number, summary: string, now: number): number {
  const result = db
    .query('INSERT INTO episodes (session_id, summary, created_at) VALUES (?, ?, ?)')
    .run(sessionId, summary, now);
  return Number(result.lastInsertRowid);
}

/**
 * The latest episodes.
 *
 * @param db - The memory.
 * @param limit - The most to return.
 * @returns Newest first.
 */
export function recentEpisodes(db: Database, limit: number): Episode[] {
  return db
    .query<Episode, [number]>(
      `SELECT id, session_id AS sessionId, summary, created_at AS createdAt
       FROM episodes ORDER BY id DESC LIMIT ?`,
    )
    .all(limit);
}

/**
 * Every version of how he describes himself.
 *
 * @param db - The memory.
 * @returns Newest first.
 */
export function selfModelVersions(db: Database): SelfModelVersion[] {
  return db
    .query<SelfModelVersion, []>(
      `SELECT version, body, created_at AS createdAt, from_episode AS fromEpisode
       FROM self_model ORDER BY version DESC`,
    )
    .all();
}

/**
 * How he describes himself now.
 *
 * @param db - The memory.
 * @returns The newest version, or null before the first episode.
 */
export function latestSelfModel(db: Database): SelfModelVersion | null {
  return selfModelVersions(db)[0] ?? null;
}

/**
 * Store a new version of the self-model.
 *
 * @param db - The memory.
 * @param body - The text, first person.
 * @param fromEpisode - The episode that prompted it, or null.
 * @param now - When.
 * @returns The new version number.
 */
export function addSelfModel(
  db: Database,
  body: string,
  fromEpisode: number | null,
  now: number,
): number {
  const result = db
    .query('INSERT INTO self_model (body, created_at, from_episode) VALUES (?, ?, ?)')
    .run(body, now, fromEpisode);
  return Number(result.lastInsertRowid);
}

/**
 * Make an older self-model the current one. History is kept: the old text is
 * stored again as the newest version.
 *
 * @param db - The memory.
 * @param version - The version to return to.
 * @param now - When.
 * @returns The new version number, or null when there is no such version.
 */
export function rollbackSelfModel(db: Database, version: number, now: number): number | null {
  const row = db
    .query<{ body: string }, [number]>('SELECT body FROM self_model WHERE version = ?')
    .get(version);
  return row ? addSelfModel(db, row.body, null, now) : null;
}
