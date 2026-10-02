/**
 * The durable memories, and the search over them. Section 9 of
 * docs/architecture.md.
 */
import type { Database } from 'bun:sqlite';
import type { Fact, FactKind } from '@m8/shared';

/** A memory about to be kept. */
export interface NewFact {
  /** What it is about. */
  kind: FactKind;
  /** One sentence that makes sense on its own. */
  text: string;
  /** 1 barely worth keeping, 5 never forget. */
  importance: number;
  /** Who is keeping it. */
  source: Fact['source'];
}

/** The columns every fact query selects, named as {@link Fact} names them. */
const FACT_COLUMNS = `
  facts.id, facts.kind, facts.text, facts.importance, facts.source,
  facts.created_at AS createdAt, facts.last_used_at AS lastUsedAt, facts.use_count AS useCount`;

/**
 * Turn what somebody typed or said into an FTS5 query that cannot fail to parse.
 *
 * @param query - Free text.
 * @returns Every word of two characters or more, quoted, prefix matched and
 * joined with OR. Empty when the text holds no such word.
 */
export function toFtsQuery(query: string): string {
  return wordsOf(query)
    .map((word) => `"${word}"*`)
    .join(' OR ');
}

/**
 * The words of a text worth searching for.
 *
 * @param text - Free text.
 * @returns Runs of letters and digits at least two characters long.
 */
function wordsOf(text: string): string[] {
  return (text.match(/[\p{L}\p{N}]+/gu) ?? []).filter((word) => word.length >= 2);
}

/**
 * Keep a memory, unless he already has it.
 *
 * @param db - The memory.
 * @param fact - What to keep.
 * @param now - When.
 * @returns The fact's id, and whether it was already known. A known fact
 * keeps the higher of the two importances.
 */
export function addFact(db: Database, fact: NewFact, now: number): { id: number; known: boolean } {
  const text = fact.text.trim();
  const existing = db
    .query<{ id: number }, [string]>(
      'SELECT id FROM facts WHERE superseded_by IS NULL AND lower(text) = lower(?)',
    )
    .get(text);
  if (existing) {
    db.query('UPDATE facts SET importance = max(importance, ?) WHERE id = ?').run(
      fact.importance,
      existing.id,
    );
    return { id: existing.id, known: true };
  }

  const result = db
    .query('INSERT INTO facts (kind, text, importance, source, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(fact.kind, text, fact.importance, fact.source, now);
  return { id: Number(result.lastInsertRowid), known: false };
}

/**
 * Retire a memory in favour of a newer one. It stops being recalled and
 * stays in the file.
 *
 * @param db - The memory.
 * @param oldId - The one that is out of date.
 * @param newId - The one that replaces it.
 */
export function supersedeFact(db: Database, oldId: number, newId: number): void {
  if (oldId === newId) return;
  db.query('UPDATE facts SET superseded_by = ? WHERE id = ? AND superseded_by IS NULL').run(
    newId,
    oldId,
  );
}

/**
 * Delete a memory for good, along with anything it had replaced.
 *
 * @param db - The memory.
 * @param id - The fact to forget.
 * @returns True when there was one.
 */
export function forgetFact(db: Database, id: number): boolean {
  const result = db
    .query(
      `WITH RECURSIVE doomed(id) AS (
         SELECT ?1 UNION SELECT facts.id FROM facts JOIN doomed ON facts.superseded_by = doomed.id
       )
       DELETE FROM facts WHERE id IN (SELECT id FROM doomed)`,
    )
    .run(id);
  return result.changes > 0;
}

/**
 * Note that some memories were just put in front of the model.
 *
 * @param db - The memory.
 * @param facts - The ones used.
 * @param now - When.
 */
function markUsed(db: Database, facts: Fact[], now: number): void {
  const mark = db.query(
    'UPDATE facts SET last_used_at = ?, use_count = use_count + 1 WHERE id = ?',
  );
  for (const fact of facts) mark.run(now, fact.id);
}

/**
 * Search the memories that are still current.
 *
 * @param db - The memory.
 * @param query - Free text. A few keywords work best.
 * @param limit - The most to return.
 * @param now - When, stamped on whatever is found.
 * @returns The best matches first. Falls back to substring matching when the
 * index finds nothing, which is what a language written without spaces needs.
 */
export function searchFacts(db: Database, query: string, limit: number, now: number): Fact[] {
  const found = searchIndex(db, query, limit);
  const facts = found.length > 0 ? found : searchSubstrings(db, query, limit);
  markUsed(db, facts, now);
  return facts;
}

/**
 * Search through the full text index.
 *
 * @param db - The memory.
 * @param query - Free text.
 * @param limit - The most to return.
 * @returns Matches by relevance, then importance.
 */
function searchIndex(db: Database, query: string, limit: number): Fact[] {
  const match = toFtsQuery(query);
  if (match === '') return [];
  return db
    .query<Fact, [string, number]>(
      `SELECT ${FACT_COLUMNS} FROM facts_fts JOIN facts ON facts.id = facts_fts.rowid
       WHERE facts_fts MATCH ? AND facts.superseded_by IS NULL
       ORDER BY bm25(facts_fts), facts.importance DESC LIMIT ?`,
    )
    .all(match, limit);
}

/**
 * Search by plain substring, one word at a time.
 *
 * @param db - The memory.
 * @param query - Free text.
 * @param limit - The most to return.
 * @returns Facts containing any word of the query, the important ones first.
 */
function searchSubstrings(db: Database, query: string, limit: number): Fact[] {
  const words = wordsOf(query);
  if (words.length === 0) return [];
  const anyWord = words.map(() => "facts.text LIKE '%' || ? || '%'").join(' OR ');
  return db
    .query<Fact, (string | number)[]>(
      `SELECT ${FACT_COLUMNS} FROM facts WHERE superseded_by IS NULL AND (${anyWord})
       ORDER BY importance DESC, created_at DESC LIMIT ?`,
    )
    .all(...words, limit);
}

/**
 * The memories worth having in mind before anyone speaks.
 *
 * @param db - The memory.
 * @param limit - The most to return.
 * @returns Current facts, by importance and then by how recently they mattered.
 */
export function topFacts(db: Database, limit: number): Fact[] {
  return db
    .query<Fact, [number]>(
      `SELECT ${FACT_COLUMNS} FROM facts WHERE superseded_by IS NULL
       ORDER BY importance DESC, coalesce(last_used_at, created_at) DESC LIMIT ?`,
    )
    .all(limit);
}
