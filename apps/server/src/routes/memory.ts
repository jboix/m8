/**
 * The memory, as the settings dialog and the debug panel see it. Section 12 of docs/architecture.md.
 *
 * Reading is the point. The writes are the ones a person needs when a character
 * has learned something it should not have: forget a fact, forget everything,
 * and put the self-model back to an earlier version.
 */
import type { Database } from 'bun:sqlite';
import { FaceToLearn, type MemorySnapshot, SelfModelRollback } from '@m8/shared';
import { Hono } from 'hono';
import { recentEpisodes, rollbackSelfModel, selfModelVersions } from '../memory/episodes.ts';
import { forgetFace, knownFaces, learnFace } from '../memory/faces.ts';
import { forgetFact, topFacts } from '../memory/facts.ts';
import { forgetEverything } from '../memory/forget.ts';

/** How many rows of each kind the browser is shown. */
const SHOWN = 200;

/**
 * Read everything the memory browser shows.
 *
 * @param db - The memory.
 * @returns Facts by importance, episodes and self-model versions newest first.
 */
function snapshot(db: Database): MemorySnapshot {
  return {
    facts: topFacts(db, SHOWN),
    episodes: recentEpisodes(db, SHOWN),
    selfModel: selfModelVersions(db).slice(0, SHOWN),
    faces: knownFaces(db),
  };
}

/**
 * Build the memory routes.
 *
 * @param db - The memory.
 * @returns A Hono app exposing `GET /api/memory`, `DELETE /api/memory` to forget
 * everything, `DELETE /api/memory/facts/:id` and `POST
 * /api/memory/self-model/rollback`. Every write answers with the new snapshot.
 */
export function memory(db: Database): Hono {
  return new Hono()
    .get('/api/memory', (context) => context.json(snapshot(db)))
    .delete('/api/memory', (context) => {
      forgetEverything(db);
      return context.json(snapshot(db));
    })
    .delete('/api/memory/facts/:id', (context) => {
      if (!forgetFact(db, Number(context.req.param('id')))) {
        return context.json({ error: 'No such fact.' }, 404);
      }
      return context.json(snapshot(db));
    })
    .get('/api/memory/faces', (context) => context.json(knownFaces(db)))
    .post('/api/memory/faces', async (context) => {
      const asked = FaceToLearn.safeParse(await context.req.json().catch(() => ({})));
      if (!asked.success) return context.json({ error: 'Bad face.' }, 400);
      learnFace(db, asked.data.name, asked.data.embedding, Date.now());
      return context.json(snapshot(db));
    })
    .delete('/api/memory/faces/:id', (context) => {
      if (!forgetFace(db, Number(context.req.param('id')))) {
        return context.json({ error: 'No such face.' }, 404);
      }
      return context.json(snapshot(db));
    })
    .post('/api/memory/self-model/rollback', async (context) => {
      const asked = SelfModelRollback.safeParse(await context.req.json().catch(() => ({})));
      if (!asked.success) return context.json({ error: 'Bad version.' }, 400);
      if (rollbackSelfModel(db, asked.data.version, Date.now()) === null) {
        return context.json({ error: 'No such version.' }, 404);
      }
      return context.json(snapshot(db));
    });
}
