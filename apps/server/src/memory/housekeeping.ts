/**
 * Keeps the memory from growing without bound, and picks up what was dropped.
 * Section 9 of docs/architecture.md.
 *
 * Runs when the server starts and a few times a day after that. Every step is
 * safe to run twice.
 */
import type { Database } from 'bun:sqlite';
import type { TextRequest } from '../gemini/text.ts';
import { summarizeSession } from './summarizer.ts';

/** One day. */
const DAY_MS = 86_400_000;

/** How long a finished session's raw log is kept. Its episode outlives it. */
const EVENTS_KEPT_MS = 3 * DAY_MS;

/** How long a fact nobody ever recalled is given before it is dropped. */
const UNUSED_FACT_KEPT_MS = 30 * DAY_MS;

/** The importance at and below which an unused fact may be dropped. */
const DROPPABLE_IMPORTANCE = 2;

/** How far back a session that was never summarized is still worth the attempt. */
const RETRY_WITHIN_MS = EVENTS_KEPT_MS;

/** Which facts may go: minor, never recalled, old, current, and not standing in for another. */
const UNUSED = `
  WHERE importance <= ?1 AND use_count = 0 AND created_at < ?2 AND superseded_by IS NULL
    AND id NOT IN (SELECT superseded_by FROM facts WHERE superseded_by IS NOT NULL)`;

/**
 * How long a session has to have been over before it counts as missed. A
 * session that ended a moment ago is still being summarized.
 */
const RETRY_AFTER_MS = 5 * 60_000;

/** A session that ended without becoming an episode. */
export interface MissedSession {
  /** The session. */
  id: number;
  /** Who it was with. */
  person: string;
  /** The language code it was held in. */
  language: string;
}

/**
 * Delete the raw log of sessions that ended long enough ago.
 *
 * @param db - The memory.
 * @param now - The present.
 * @returns How many rows went.
 */
export function pruneEvents(db: Database, now: number): number {
  const result = db
    .query(
      `DELETE FROM events WHERE session_id IN (
         SELECT id FROM sessions WHERE ended_at IS NOT NULL AND ended_at < ?
       )`,
    )
    .run(now - EVENTS_KEPT_MS);
  return result.changes;
}

/**
 * Drop facts that were never worth much and were never recalled.
 *
 * @param db - The memory.
 * @param now - The present.
 * @returns How many facts went. A fact that replaced another is kept, because
 * deleting it would bring the out of date one back.
 */
export function dropUnusedFacts(db: Database, now: number): number {
  const before = now - UNUSED_FACT_KEPT_MS;
  // Counted first: the index's triggers make `changes` count their own writes too.
  const doomed = db
    .query<{ count: number }, [number, number]>(`SELECT count(*) AS count FROM facts ${UNUSED}`)
    .get(DROPPABLE_IMPORTANCE, before);
  db.query(`DELETE FROM facts ${UNUSED}`).run(DROPPABLE_IMPORTANCE, before);
  return doomed?.count ?? 0;
}

/**
 * Close sessions a crash left open, so they can be summarized and pruned.
 *
 * @param db - The memory.
 * @param now - The present. Call this only at startup, when no session can be live.
 * @returns How many were closed.
 */
export function closeAbandonedSessions(db: Database, now: number): number {
  const result = db
    .query("UPDATE sessions SET ended_at = ?, end_reason = 'abandoned' WHERE ended_at IS NULL")
    .run(now);
  return result.changes;
}

/**
 * Find recent sessions somebody spoke in that never became an episode.
 *
 * @param db - The memory.
 * @param now - The present.
 * @returns The sessions, oldest first, so their episodes are written in order.
 */
export function missedSessions(db: Database, now: number): MissedSession[] {
  return db
    .query<MissedSession, [number, number]>(
      `SELECT sessions.id, sessions.person, sessions.language FROM sessions
       LEFT JOIN episodes ON episodes.session_id = sessions.id
       WHERE sessions.ended_at >= ?1 AND sessions.ended_at <= ?2 AND episodes.id IS NULL
         AND EXISTS (SELECT 1 FROM events WHERE events.session_id = sessions.id AND events.type = 'turn')
       ORDER BY sessions.id`,
    )
    .all(now - RETRY_WITHIN_MS, now - RETRY_AFTER_MS);
}

/** What a round of housekeeping needs from the world. */
export interface HousekeepingDeps {
  /** The memory. */
  db: Database;
  /**
   * Ask a text model.
   * @param request - The prompt.
   * @returns The reply.
   */
  complete: (request: TextRequest) => Promise<string>;
  /**
   * Load the persona a session was held under.
   * @param who - The session's language code and the person's name.
   * @returns The persona, slots filled.
   */
  personaFor: (who: { language: string; name: string }) => Promise<string>;
  /**
   * The clock.
   * @returns Milliseconds since the epoch.
   */
  now: () => number;
}

/** What one round did. */
export interface Housekept {
  /** Raw log rows deleted. */
  eventsPruned: number;
  /** Facts dropped. */
  factsDropped: number;
  /** Missed sessions that now have an episode. */
  sessionsSummarized: number;
}

/**
 * Summarize the sessions that were missed, oldest first.
 *
 * @param deps - The memory, the model, the persona loader and the clock.
 * @returns How many now have an episode. One that fails is left for the next
 * round, and does not stop the ones after it.
 */
async function summarizeMissed(deps: HousekeepingDeps): Promise<number> {
  let summarized = 0;
  for (const session of missedSessions(deps.db, deps.now())) {
    const persona = await deps.personaFor({ language: session.language, name: session.person });
    const stored = await summarizeSession(
      { ...deps, persona, person: session.person },
      session.id,
    ).catch(() => null);
    if (stored) summarized += 1;
  }
  return summarized;
}

/**
 * Run one round of housekeeping.
 *
 * @param deps - The memory, the model, the persona loader and the clock.
 * @returns What it did. Missed sessions are summarized before anything is
 * pruned, so a log is never deleted while it is still the only record.
 */
export async function runHousekeeping(deps: HousekeepingDeps): Promise<Housekept> {
  const sessionsSummarized = await summarizeMissed(deps);
  return {
    sessionsSummarized,
    eventsPruned: pruneEvents(deps.db, deps.now()),
    factsDropped: dropUnusedFacts(deps.db, deps.now()),
  };
}
