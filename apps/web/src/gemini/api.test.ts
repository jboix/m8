/** The account routes from the browser, against a server that is a function. */
import { afterEach, describe, expect, test } from 'bun:test';
import type { GeminiAccount } from '@m8/shared';
import { choose, readAccount, saveKey } from './api.ts';

/** The fetch the tests replace. */
const realFetch = globalThis.fetch;

/** What the requests looked like. */
let sent: { url: string; init: RequestInit | undefined }[] = [];

/**
 * Answer every request with one response.
 *
 * @param status - The status.
 * @param body - The JSON body.
 */
function answer(status: number, body: unknown): void {
  sent = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    sent.push({ url, init });
    return Response.json(body, { status });
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

/** An account with a key. */
const ACCOUNT: GeminiAccount = {
  key: '••••••••abcd',
  live: 'gemini-3.8-live',
  memory: 'gemini-3.8-flash',
  callsPerDay: 0,
  context: 'medium',
};

describe('the account client', () => {
  test('reads the account', async () => {
    answer(200, ACCOUNT);

    expect(await readAccount()).toEqual(ACCOUNT);
    expect(sent[0]?.url).toBe('/api/gemini');
  });

  test('sends a new key with PUT, as JSON', async () => {
    answer(200, ACCOUNT);

    await saveKey('a-new-key-1234');

    expect(sent[0]?.init?.method).toBe('PUT');
    expect(JSON.parse(String(sent[0]?.init?.body))).toEqual({ key: 'a-new-key-1234' });
  });

  test('passes on what the server said when it refuses', async () => {
    answer(400, { error: 'API key not valid. Please pass a valid API key.' });

    await expect(saveKey('bad-key-1234')).rejects.toThrow('API key not valid');
  });

  test('says the status when the server sends no message', async () => {
    answer(502, null);

    await expect(choose({ callsPerDay: 3 })).rejects.toThrow('The server answered 502.');
  });
});
