/**
 * Sessions and their raw log. Section 9 of docs/architecture.md.
 *
 * Every function that stamps a row takes the time as an argument, so a test
 * decides what "yesterday" means.
 */
import type { Database } from 'bun:sqlite';
import { Mood } from '@m8/shared';

/** Who spoke one turn of a conversation. */
export type TurnRole = 'user' | 'model';

/** One finished turn of a conversation. */
export interface Turn {
  /** Who said it. */
  role: TurnRole;
  /** What was said, whole. */
  text: string;
  /** When it ended. */
  ts: number;
}

/** A finished session that has no episode yet. */
export interface LooseEnd {
  /** The session. */
  sessionId: number;
  /** When it ended. */
  endedAt: number;
  /** What was said in it. */
  turns: Turn[];
}

/** The event type a finished turn is stored under. */
const TURN_EVENT = 'turn';

/**
 * Record that somebody switched him on.
 *
 * @param db - The memory.
 * @param who - The person's name and the language code of the session.
 * @param now - When.
 * @returns The new session's id.
 */
export function startSession(
  db: Database,
  who: { person: string; language: string },
  now: number,
): number {
  const result = db
    .query('INSERT INTO sessions (started_at, person, language) VALUES (?, ?, ?)')
    .run(now, who.person, who.language);
  return Number(result.lastInsertRowid);
}

/**
 * Record that a session is over.
 *
 * @param db - The memory.
 * @param sessionId - Which one.
 * @param reason - Why it ended.
 * @param now - When.
 */
export function endSession(db: Database, sessionId: number, reason: string, now: number): void {
  db.query('UPDATE sessions SET ended_at = ?, end_reason = ? WHERE id = ?').run(
    now,
    reason,
    sessionId,
  );
}

/**
 * Append one row to a session's raw log.
 *
 * @param db - The memory.
 * @param sessionId - The session it happened in.
 * @param ts - When it happened.
 * @param type - What kind of thing it was.
 * @param payload - Its details. Stored as JSON.
 */
export function logEvent(
  db: Database,
  sessionId: number,
  ts: number,
  type: string,
  payload: unknown,
): void {
  db.query('INSERT INTO events (session_id, ts, type, payload) VALUES (?, ?, ?, ?)').run(
    sessionId,
    ts,
    type,
    JSON.stringify(payload),
  );
}

/**
 * Store one finished turn of the conversation.
 *
 * @param db - The memory.
 * @param sessionId - The session it was said in.
 * @param turn - Who said what, and when.
 */
export function logTurn(db: Database, sessionId: number, turn: Turn): void {
  logEvent(db, sessionId, turn.ts, TURN_EVENT, { role: turn.role, text: turn.text });
}

/**
 * Read a session's conversation back.
 *
 * @param db - The memory.
 * @param sessionId - Which one.
 * @returns Its turns, oldest first.
 */
export function turnsOf(db: Database, sessionId: number): Turn[] {
  return db
    .query<{ ts: number; payload: string }, [number, string]>(
      'SELECT ts, payload FROM events WHERE session_id = ? AND type = ? ORDER BY id',
    )
    .all(sessionId, TURN_EVENT)
    .map((row) => ({ ...(JSON.parse(row.payload) as Omit<Turn, 'ts'>), ts: row.ts }));
}

/** When a finished session ran. */
export interface SessionSpan {
  /** When it opened. */
  startedAt: number;
  /** When it closed. */
  endedAt: number;
  /** How he was feeling when it closed, or null when that was never reported. */
  mood: Mood | null;
}

/**
 * Find the last time he was switched on.
 *
 * @param db - The memory.
 * @returns The most recent session that has ended, or null when none has.
 */
export function lastSession(db: Database): SessionSpan | null {
  const row = db
    .query<{ startedAt: number; endedAt: number; mood: string | null }, []>(
      `SELECT started_at AS startedAt, ended_at AS endedAt, mood FROM sessions
       WHERE ended_at IS NOT NULL ORDER BY id DESC LIMIT 1`,
    )
    .get();
  if (!row) return null;
  const mood = Mood.safeParse(JSON.parse(row.mood ?? 'null'));
  return { ...row, mood: mood.success ? mood.data : null };
}

/**
 * Record how he is feeling, replacing what the session had before.
 *
 * @param db - The memory.
 * @param sessionId - The session he is feeling it in.
 * @param mood - The four values.
 */
export function saveMood(db: Database, sessionId: number, mood: Mood): void {
  db.query('UPDATE sessions SET mood = ? WHERE id = ?').run(JSON.stringify(mood), sessionId);
}

/**
 * Find the most recent finished session that was never summarized.
 *
 * @param db - The memory.
 * @param since - Sessions that ended before this are too old to matter.
 * @returns The session and its turns, or null when every session somebody
 * spoke in has an episode, is still running, or ended before `since`.
 */
export function latestLooseEnd(db: Database, since: number): LooseEnd | null {
  const row = db
    .query<{ id: number; endedAt: number }, [number, string]>(
      `SELECT sessions.id, sessions.ended_at AS endedAt FROM sessions
       LEFT JOIN episodes ON episodes.session_id = sessions.id
       WHERE sessions.ended_at >= ?1 AND episodes.id IS NULL AND EXISTS (
         SELECT 1 FROM events WHERE events.session_id = sessions.id AND events.type = ?2
       )
       ORDER BY sessions.id DESC LIMIT 1`,
    )
    .get(since, TURN_EVENT);
  if (!row) return null;
  return { sessionId: row.id, endedAt: row.endedAt, turns: turnsOf(db, row.id) };
}
