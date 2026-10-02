/** The HTTP surface answers against a fake Gemini, on a memory that dies with the test. */
import type { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { GeminiAccount, GeminiModelList, MemorySnapshot, UsageReport } from '@m8/shared';
import { createApp } from './app.ts';
import type { Environment } from './env.ts';
import { fakeAccount, fakeGemini, GOOD_KEY } from './gemini/fake.ts';
import { createCompleter } from './gemini/text.ts';
import { openDatabase } from './memory/db.ts';
import { addSelfModel } from './memory/episodes.ts';
import { addFact } from './memory/facts.ts';
import { endSession, logTurn, startSession, turnsOf } from './memory/sessions.ts';

/** An environment with no access key and a memory that dies with the test. */
const environment: Environment = {
  PORT: 3001,
  HOST: '127.0.0.1',
  MEMORY_DB_PATH: ':memory:',
  M8_KEYS_DIR: './keys',
  WEB_DIST: './apps/web/dist',
  NODE_ENV: 'test',
};

/**
 * Build the application on a fake Gemini.
 *
 * @param db - The memory. A fresh one when not given.
 * @returns The app.
 */
async function appOn(db: Database = openDatabase(':memory:')) {
  const { fetcher } = fakeGemini();
  const account = await fakeAccount(db, fetcher);
  return createApp(environment, db, account, createCompleter(account, db, fetcher));
}

/**
 * Send JSON to the application.
 *
 * @param app - The application.
 * @param method - The HTTP method.
 * @param path - Where.
 * @param body - What, before it is encoded.
 * @returns The response.
 */
function send(app: Awaited<ReturnType<typeof appOn>>, method: string, path: string, body: unknown) {
  return app.request(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('the server application', () => {
  test('reports health without reaching anything else', async () => {
    const response = await (await appOn()).request('/health');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'ok' });
  });

  test('rejects a ping with an empty prompt before calling the model', async () => {
    const response = await send(await appOn(), 'POST', '/api/ping-model', { prompt: '' });

    expect(response.status).toBe(400);
  });

  test('reports a ping with no key as a gateway failure that says why', async () => {
    const response = await send(await appOn(), 'POST', '/api/ping-model', { prompt: 'hello' });

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: 'There is no Gemini key yet. Add one in the settings.',
    });
  });

  test('answers a ping through the memory model once there is a key', async () => {
    const app = await appOn();
    await send(app, 'PUT', '/api/gemini/key', { key: GOOD_KEY });

    const response = await send(app, 'POST', '/api/ping-model', { prompt: 'hello' });

    expect(await response.json()).toEqual({ text: 'hello' });
  });
});

describe('the usage route', () => {
  test('needs a start', async () => {
    expect((await (await appOn()).request('/api/usage')).status).toBe(400);
  });

  test('reports a ping that was made', async () => {
    const app = await appOn();
    await send(app, 'PUT', '/api/gemini/key', { key: GOOD_KEY });
    await send(app, 'POST', '/api/ping-model', { prompt: 'hello' });

    const report = UsageReport.parse(await (await app.request('/api/usage?from=0')).json());

    expect(report.buckets.map((bucket) => [bucket.purpose, bucket.calls])).toEqual([['ping', 1]]);
    expect(report.pricesCheckedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('the Gemini routes', () => {
  test('refuse a key Gemini refuses, and keep none', async () => {
    const app = await appOn();

    const refused = await send(app, 'PUT', '/api/gemini/key', { key: 'bad-key-1234' });

    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({
      error: 'API key not valid. Please pass a valid API key.',
    });
    expect(GeminiAccount.parse(await (await app.request('/api/gemini')).json()).key).toBeNull();
  });

  test('store a key masked, list its models, and change the choice', async () => {
    const app = await appOn();

    const stored = GeminiAccount.parse(
      await (await send(app, 'PUT', '/api/gemini/key', { key: GOOD_KEY })).json(),
    );
    const models = GeminiModelList.parse(await (await app.request('/api/gemini/models')).json());
    const changed = await send(app, 'PATCH', '/api/gemini', { callsPerDay: 100 });

    expect(stored.key).toBe('••••••••abcd');
    expect(models.live[0]?.id).toBe('gemini-3.8-live');
    expect(GeminiAccount.parse(await changed.json()).callsPerDay).toBe(100);
  });

  test('refuse to list models before there is a key', async () => {
    expect((await (await appOn()).request('/api/gemini/models')).status).toBe(409);
  });

  test('refuse a model the key cannot use', async () => {
    const app = await appOn();
    await send(app, 'PUT', '/api/gemini/key', { key: GOOD_KEY });

    const response = await send(app, 'PATCH', '/api/gemini', { live: 'gemini-9-live' });

    expect(response.status).toBe(400);
  });
});

describe('the memory routes', () => {
  test('show what is remembered, and forget a fact when asked', async () => {
    const db = openDatabase(':memory:');
    const kept = addFact(db, { kind: 'person', text: 'Ada', importance: 3, source: 'tool' }, 1);
    const app = await appOn(db);

    const before = MemorySnapshot.parse(await (await app.request('/api/memory')).json());
    const gone = await app.request(`/api/memory/facts/${kept.id}`, { method: 'DELETE' });

    expect(before.facts.map((fact) => fact.text)).toEqual(['Ada']);
    expect(MemorySnapshot.parse(await gone.json()).facts).toEqual([]);
    expect((await app.request('/api/memory/facts/99', { method: 'DELETE' })).status).toBe(404);
  });

  test('roll the self-model back by storing the old text again', async () => {
    const db = openDatabase(':memory:');
    addSelfModel(db, 'first', null, 1);
    addSelfModel(db, 'second', null, 2);

    const response = await (await appOn(db)).request('/api/memory/self-model/rollback', {
      method: 'POST',
      body: JSON.stringify({ version: 1 }),
    });

    expect(MemorySnapshot.parse(await response.json()).selfModel.map((row) => row.body)).toEqual([
      'first',
      'second',
      'first',
    ]);
  });

  test('forget everything when asked, and keep a session that is still open', async () => {
    const db = openDatabase(':memory:');
    addFact(db, { kind: 'person', text: 'Ada', importance: 3, source: 'tool' }, 1);
    addSelfModel(db, 'first', null, 1);
    const over = startSession(db, { person: 'Ada', language: 'en' }, 1);
    endSession(db, over, 'closed', 2);
    const live = startSession(db, { person: 'Ada', language: 'en' }, 3);
    logTurn(db, live, { role: 'user', text: 'forget me', ts: 4 });

    const response = await (await appOn(db)).request('/api/memory', { method: 'DELETE' });

    expect(MemorySnapshot.parse(await response.json())).toEqual({
      facts: [],
      episodes: [],
      selfModel: [],
      faces: [],
    });
    expect(db.query('SELECT id FROM sessions').all()).toEqual([{ id: live }]);
    expect(turnsOf(db, live)).toEqual([]);
  });
});
