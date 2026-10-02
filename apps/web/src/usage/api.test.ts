/** The usage route from the browser, against a server that is a function. */
import { afterEach, describe, expect, test } from 'bun:test';
import { readUsage } from './api.ts';

/** The fetch the tests replace. */
const realFetch = globalThis.fetch;

/** The URLs asked for. */
let asked: string[] = [];

/**
 * Answer every request with one response.
 *
 * @param status - The status.
 * @param body - The JSON body.
 */
function answer(status: number, body: unknown): void {
  asked = [];
  globalThis.fetch = (async (url: string) => {
    asked.push(url);
    return Response.json(body, { status });
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

/** A report with nothing in it. */
const EMPTY = { from: 1000, to: 2000, buckets: [], pricesCheckedOn: '2026-03-01' };

describe('the usage client', () => {
  test('asks for everything since a moment and parses the report', async () => {
    answer(200, EMPTY);

    expect(await readUsage(1000)).toEqual(EMPTY);
    expect(asked).toEqual(['/api/usage?from=1000']);
  });

  test('throws the server message on failure', async () => {
    answer(400, { error: 'The report reaches back 92 days at most.' });

    await expect(readUsage(0)).rejects.toThrow('The report reaches back 92 days at most.');
  });

  test('throws the status when the failure has no message', async () => {
    answer(502, null);

    await expect(readUsage(0)).rejects.toThrow('The server answered 502.');
  });

  test('rejects a report that does not match the contract', async () => {
    answer(200, { from: 1000 });

    await expect(readUsage(1000)).rejects.toThrow();
  });
});
