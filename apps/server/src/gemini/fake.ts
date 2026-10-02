/**
 * A stand-in for the Gemini REST API, for tests: it lists a fixed set of
 * models, answers text requests, and refuses any key but one.
 */
import type { Database } from 'bun:sqlite';
import { openSecretBox } from '../secrets/secret-box.ts';
import { createGeminiAccount, type GeminiAccount } from './account.ts';
import type { Fetcher } from './rest.ts';

/** The only key the fake accepts. */
export const GOOD_KEY = 'good-key-0000-abcd';

/** What the fake lists, in the shape and the order the real endpoint uses. */
const LISTED = [
  { name: 'models/gemini-3.5-flash', supportedGenerationMethods: ['generateContent'] },
  { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] },
  { name: 'models/gemini-3.8-flash-tts', supportedGenerationMethods: ['generateContent'] },
  {
    name: 'models/gemini-3.1-flash-live-preview',
    supportedGenerationMethods: ['bidiGenerateContent'],
  },
  { name: 'models/gemini-3.8-live', supportedGenerationMethods: ['bidiGenerateContent'] },
];

/** What the fake heard, so a test can look at the requests. */
export interface FakeGemini {
  /** The fetch to hand to the code under test. */
  fetcher: Fetcher;
  /** Every request, with its URL, its key header and its parsed body. */
  requests: { url: string; key: string | null; body: unknown }[];
}

/**
 * Build the fake.
 *
 * @param reply - What every text request is answered with.
 * @returns The fetch, and the record of what it was asked.
 */
export function fakeGemini(reply = 'hello'): FakeGemini {
  const requests: FakeGemini['requests'] = [];
  const fetcher: Fetcher = async (url, init) => {
    const key = new Headers(init?.headers).get('x-goog-api-key');
    requests.push({ url, key, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (key !== GOOD_KEY) {
      return Response.json(
        { error: { message: 'API key not valid. Please pass a valid API key.\nMore detail.' } },
        { status: 400 },
      );
    }
    if (url.includes(':generateContent')) {
      return Response.json({
        candidates: [
          { content: { parts: [{ text: 'thinking aloud', thought: true }, { text: reply }] } },
        ],
        usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 4, thoughtsTokenCount: 30 },
      });
    }
    return Response.json({ models: LISTED });
  };
  return { fetcher, requests };
}

/**
 * Build an account on a fresh root key and the fake.
 *
 * @param db - The database the account keeps its settings in.
 * @param fetcher - The fetch to use, usually the fake's.
 * @param now - The clock.
 * @returns The account.
 */
export async function fakeAccount(
  db: Database,
  fetcher: Fetcher = fakeGemini().fetcher,
  now: () => number = Date.now,
): Promise<GeminiAccount> {
  const box = await openSecretBox(crypto.getRandomValues(new Uint8Array(32)));
  return createGeminiAccount({ db, box, fetcher, now });
}
