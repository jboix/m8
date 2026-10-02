/** The access key, against the whole application. */
import { describe, expect, test } from 'bun:test';
import { AccessState } from '@m8/shared';
import { createApp } from '../app.ts';
import type { Environment } from '../env.ts';
import { fakeAccount } from '../gemini/fake.ts';
import { openDatabase } from '../memory/db.ts';
import { access } from './access.ts';

/** The key every locked server here is started with. */
const KEY = 'a-long-enough-key';

/**
 * Build the application.
 *
 * @param key - The access key, or undefined for an open server.
 * @returns The app, on a memory that dies with the test.
 */
async function appWith(key: string | undefined) {
  const environment: Environment = {
    PORT: 3001,
    HOST: '127.0.0.1',
    MEMORY_DB_PATH: ':memory:',
    M8_KEYS_DIR: './keys',
    WEB_DIST: './apps/web/dist',
    NODE_ENV: 'test',
    M8_ACCESS_KEY: key,
  };
  const db = openDatabase(':memory:');
  return createApp(environment, db, await fakeAccount(db));
}

/**
 * Give a key to an application.
 *
 * @param app - The application.
 * @param key - What to try.
 * @returns The response, whose cookie is the pass when the key was right.
 */
function unlock(app: Awaited<ReturnType<typeof appWith>>, key: string) {
  return app.request('/api/access/unlock', { method: 'POST', body: JSON.stringify({ key }) });
}

describe('a server with no key', () => {
  test('is open, and says so', async () => {
    const app = await appWith(undefined);

    expect(AccessState.parse(await (await app.request('/api/access')).json())).toEqual({
      required: false,
      granted: true,
    });
    expect((await app.request('/api/memory')).status).toBe(200);
  });
});

describe('a server with a key', () => {
  test('refuses the memory, the ping and the live session without it', async () => {
    const app = await appWith(KEY);

    expect((await app.request('/api/memory')).status).toBe(401);
    expect((await app.request('/api/memory/facts/1', { method: 'DELETE' })).status).toBe(401);
    expect((await app.request('/api/ping-model', { method: 'POST' })).status).toBe(401);
    expect((await app.request('/live')).status).toBe(401);
    expect((await app.request('/health')).status).toBe(200);
  });

  test('hands a cookie to whoever gives the key, and the cookie opens the memory', async () => {
    const app = await appWith(KEY);
    const unlocked = await unlock(app, KEY);
    const cookie = unlocked.headers.get('set-cookie') ?? '';

    expect(unlocked.status).toBe(200);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).not.toContain(KEY);

    const headers = { cookie: cookie.split(';')[0] ?? '' };
    expect((await app.request('/api/memory', { headers })).status).toBe(200);
    expect(await (await app.request('/api/access', { headers })).json()).toEqual({
      required: true,
      granted: true,
    });
  });

  test('refuses a wrong key and a made up cookie', async () => {
    const app = await appWith(KEY);

    expect((await unlock(app, 'not-the-key-at-all')).status).toBe(401);
    expect(
      (await app.request('/api/memory', { headers: { cookie: 'm8_access=nope' } })).status,
    ).toBe(401);
  });

  test('stops listening to guesses for a while after too many', async () => {
    let now = 0;
    const routes = access(KEY, () => now);
    const guess = (key: string) =>
      routes.request('/api/access/unlock', { method: 'POST', body: JSON.stringify({ key }) });

    for (let tries = 0; tries < 8; tries++) expect((await guess('wrong')).status).toBe(401);
    expect((await guess(KEY)).status).toBe(429);

    now = 11 * 60_000;
    expect((await guess(KEY)).status).toBe(200);
  });
});
