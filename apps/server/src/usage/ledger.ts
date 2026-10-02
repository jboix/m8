/**
 * What every call to Gemini spent, one row per call and one per live turn,
 * priced when it is written so a later price change does not rewrite history.
 */
import type { Database } from 'bun:sqlite';
import { costOf, NO_TOKENS, type TokenCounts, type UsagePurpose } from '@m8/shared';

/** A call about to be made. */
export interface CallToRecord {
  /** When. */
  at: number;
  /** What for. */
  purpose: UsagePurpose;
  /** Which model. */
  model: string;
  /** The session it belongs to, when there is one. */
  sessionId?: number | null | undefined;
}

/** The columns a token count is stored in, in the order of {@link countValues}. */
const COUNT_COLUMNS = [
  'input_text',
  'input_audio',
  'input_image',
  'cached_text',
  'cached_audio',
  'cached_image',
  'output_text',
  'output_audio',
  'thinking',
] as const;

/**
 * A token count as column values.
 *
 * @param counts - The tokens.
 * @returns One number per column of {@link COUNT_COLUMNS}, in the same order.
 */
function countValues(counts: TokenCounts): number[] {
  return [
    counts.inputText,
    counts.inputAudio,
    counts.inputImage,
    counts.cachedText,
    counts.cachedAudio,
    counts.cachedImage,
    counts.outputText,
    counts.outputAudio,
    counts.thinking,
  ];
}

/**
 * Price a count.
 *
 * @param model - The model.
 * @param counts - The tokens.
 * @param at - When, because a price can change on a date.
 * @returns The cost and the saving in micro-dollars. The cost is null for a
 * model with no price, so a total can say what it could not price.
 */
function priced(model: string, counts: TokenCounts, at: number) {
  const cost = costOf(model, counts, at);
  return { cost: cost?.costMicros ?? null, saved: cost?.savedMicros ?? 0 };
}

/**
 * Write one row.
 *
 * @param db - The database.
 * @param kind - `call` for a call made, `turn` for a live turn's tokens.
 * @param call - When, what for, which model, which session.
 * @param counts - The tokens.
 * @returns The row's id.
 */
function insert(db: Database, kind: 'call' | 'turn', call: CallToRecord, counts: TokenCounts) {
  const { cost, saved } = priced(call.model, counts, call.at);
  const columns = ['at', 'kind', 'purpose', 'model', 'session_id', ...COUNT_COLUMNS];
  const values = [call.at, kind, call.purpose, call.model, call.sessionId ?? null];
  const row = db
    .query<{ id: number }, (string | number | null)[]>(
      `INSERT INTO usage (${columns.join(', ')}, cost_micros, saved_micros)
       VALUES (${[...columns, 'c', 's'].map(() => '?').join(', ')}) RETURNING id`,
    )
    .get(...values, ...countValues(counts), cost, saved);
  return row?.id ?? 0;
}

/**
 * Record a call as it is made, before its tokens are known. It counts against
 * the daily limit from now on, whether or not it succeeds.
 *
 * @param db - The database.
 * @param call - When, what for, which model, which session.
 * @returns The row's id, for {@link settleCall}.
 */
export function openCall(db: Database, call: CallToRecord): number {
  return insert(db, 'call', call, NO_TOKENS);
}

/**
 * Fill in the tokens a call used, and its price.
 *
 * @param db - The database.
 * @param id - The row {@link openCall} returned.
 * @param counts - The tokens Gemini reported.
 */
export function settleCall(db: Database, id: number, counts: TokenCounts): void {
  const row = db
    .query<{ at: number; model: string }, [number]>('SELECT at, model FROM usage WHERE id = ?')
    .get(id);
  if (!row) return;
  const { cost, saved } = priced(row.model, counts, row.at);
  db.query(
    `UPDATE usage SET ${COUNT_COLUMNS.map((column) => `${column} = ?`).join(', ')},
       cost_micros = ?, saved_micros = ? WHERE id = ?`,
  ).run(...countValues(counts), cost, saved, id);
}

/**
 * Record one live turn's tokens.
 *
 * @param db - The database.
 * @param turn - When, which model, which session. The purpose is the conversation.
 * @param counts - The tokens Gemini reported for the turn.
 */
export function recordTurn(
  db: Database,
  turn: Omit<CallToRecord, 'purpose'>,
  counts: TokenCounts,
): void {
  insert(db, 'turn', { ...turn, purpose: 'conversation' }, counts);
}

/**
 * Count the calls made since a moment. A live turn is not a call: the session
 * it belongs to was counted when it opened.
 *
 * @param db - The database.
 * @param since - The start of the window. A call made exactly then is outside it.
 * @returns How many calls.
 */
export function callsSince(db: Database, since: number): number {
  const row = db
    .query<{ calls: number }, [number]>(
      "SELECT count(*) AS calls FROM usage WHERE kind = 'call' AND at > ?",
    )
    .get(since);
  return row?.calls ?? 0;
}

/**
 * Mark when a live session's call stopped. Only the first end counts.
 *
 * @param db - The database.
 * @param id - The session's call row.
 * @param at - When it stopped.
 */
export function endCall(db: Database, id: number, at: number): void {
  db.query('UPDATE usage SET ended_at = ? WHERE id = ? AND ended_at IS NULL').run(at, id);
}

/**
 * Close the live calls a crash left open, at their last turn, or at their start
 * when they had none. Nothing can be live when the server starts.
 *
 * @param db - The database.
 * @returns How many were closed.
 */
export function closeOpenCalls(db: Database): number {
  return db.run(
    `UPDATE usage SET ended_at = coalesce(
       (SELECT max(turn.at) FROM usage AS turn
        WHERE turn.kind = 'turn' AND turn.session_id = usage.session_id),
       at)
     WHERE kind = 'call' AND purpose = 'conversation' AND ended_at IS NULL`,
  ).changes;
}
