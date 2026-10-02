/** The summarizer, with a model that says what the test tells it to. */

import type { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import type { TextRequest } from '../gemini/text.ts';
import { openDatabase } from './db.ts';
import { latestSelfModel, recentEpisodes } from './episodes.ts';
import { addFact, topFacts } from './facts.ts';
import { endSession, logTurn, startSession } from './sessions.ts';
import { readJsonObject, summarizeSession } from './summarizer.ts';

/**
 * A finished session with some back and forth in it.
 *
 * @param db - The memory to put it in.
 * @param turns - How many turns it has.
 * @returns The session's id.
 */
function sessionWith(db: Database, turns: number): number {
  const session = startSession(db, { person: 'Ada', language: 'en' }, 1);
  Array.from({ length: turns }).forEach((_, index) => {
    logTurn(db, session, {
      role: index % 2 === 0 ? 'user' : 'model',
      text: `line ${index}`,
      ts: 2,
    });
  });
  endSession(db, session, 'closed', 3);
  return session;
}

/**
 * A model that answers from a script.
 *
 * @param replies - What it says, in order.
 * @returns The completer, and the prompts it was given.
 */
function scripted(replies: string[]) {
  const prompts: string[] = [];
  const complete = (request: TextRequest) => {
    prompts.push(request.prompt);
    return Promise.resolve(replies[prompts.length - 1] ?? '');
  };
  return { complete, prompts };
}

/** Everything the summarizer needs apart from the memory and the model. */
const REST = { persona: 'You are m8.', person: 'Ada', now: () => 10 };

describe('readJsonObject', () => {
  test('finds the object inside a code fence', () => {
    expect(readJsonObject('```json\n{"summary":"x"}\n```')).toEqual({ summary: 'x' });
  });

  test('gives up quietly on anything else', () => {
    expect(readJsonObject('sorry, no')).toBeNull();
    expect(readJsonObject('{not json}')).toBeNull();
  });
});

describe('summarizeSession', () => {
  test('stores an episode, the facts and a self-model', async () => {
    const db = openDatabase(':memory:');
    const old = addFact(
      db,
      { kind: 'person', text: 'Ada lives in Girona', importance: 3, source: 'tool' },
      1,
    );
    const model = scripted([
      JSON.stringify({
        summary: 'Ada said she moved.',
        facts: [
          { text: 'Ada lives in Lausanne', kind: 'person', importance: 4, supersedes: old.id },
        ],
      }),
      'I know somebody who moves around a lot.',
    ]);

    const stored = await summarizeSession({ db, ...model, ...REST }, sessionWith(db, 4));

    expect(stored).toEqual({ episodeId: 1, newFacts: 1, selfModelVersion: 1 });
    expect(recentEpisodes(db, 1)[0]?.summary).toBe('Ada said she moved.');
    expect(topFacts(db, 5).map((fact) => fact.text)).toEqual(['Ada lives in Lausanne']);
    expect(latestSelfModel(db)?.fromEpisode).toBe(1);
    expect(model.prompts[0]).toContain(`${old.id}: Ada lives in Girona`);
    expect(model.prompts[1]).toContain('Ada said she moved.');
  });

  test('does not bother the model about a session nobody spoke in', async () => {
    const db = openDatabase(':memory:');
    const model = scripted([]);

    expect(await summarizeSession({ db, ...model, ...REST }, sessionWith(db, 2))).toBeNull();
    expect(model.prompts).toEqual([]);
  });

  test('stores nothing when the reply cannot be read', async () => {
    const db = openDatabase(':memory:');
    const model = scripted(['I would rather not.']);

    expect(await summarizeSession({ db, ...model, ...REST }, sessionWith(db, 4))).toBeNull();
    expect(recentEpisodes(db, 1)).toEqual([]);
  });
});
