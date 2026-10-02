/** Forgets everything, for the person who asks him to. */
import type { Database } from 'bun:sqlite';

/**
 * Delete every memory: the facts, the episodes, the self-model, the raw log,
 * and every finished session.
 *
 * @remarks
 * A session that is still open keeps its row, because the relay is writing to
 * it. Its log so far goes with the rest, so only what is said from now on can
 * become an episode.
 *
 * @param db - The memory.
 */
export function forgetEverything(db: Database): void {
  db.transaction(() => {
    db.run('DELETE FROM self_model');
    db.run('DELETE FROM episodes');
    db.run('DELETE FROM events');
    db.run('DELETE FROM facts');
    db.run('DELETE FROM faces');
    db.run('DELETE FROM sessions WHERE ended_at IS NOT NULL');
  })();
}
