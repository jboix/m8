/**
 * Text from a Gemini model: the summaries, the self-model and the notes that
 * make up his memory. One request, one reply, over `generateContent`.
 */
import type { Database } from 'bun:sqlite';
import type { TokenCounts, UsagePurpose } from '@m8/shared';
import { z } from 'zod';
import { settleCall } from '../usage/ledger.ts';
import type { GeminiAccount, ModelCall } from './account.ts';
import { callGemini, type Fetcher } from './rest.ts';
import { countsFrom } from './usage-metadata.ts';

/** A text request. */
export interface TextRequest {
  /** The user turn. */
  prompt: string;
  /** Upper bound on the reply, because these calls are meant to be small. */
  maxTokens?: number;
  /** True asks for a reply that is one JSON object and nothing else. */
  json?: boolean;
  /** What the request is for, so the usage ledger can say where the money went. */
  purpose: UsagePurpose;
  /** The session it is about, when there is one. */
  sessionId?: number | null;
}

/** Asks the memory model, within the daily limit. */
export type Completer = (request: TextRequest) => Promise<string>;

/**
 * Tokens added to `maxTokens` for the model's thinking. Gemini counts thinking
 * against `maxOutputTokens`, and the thinking settings differ between models,
 * so the reply gets this much room on top instead.
 */
const THINKING_ROOM = 2048;

/** The reply a request gets when `maxTokens` is not given. */
const DEFAULT_MAX_TOKENS = 256;

/** The part of a `generateContent` reply read here. */
const TextReply = z.object({
  usageMetadata: z.unknown().optional(),
  candidates: z
    .array(
      z.object({
        content: z
          .object({
            parts: z
              .array(z.object({ text: z.string().optional(), thought: z.boolean().optional() }))
              .default([]),
          })
          .optional(),
      }),
    )
    .default([]),
});

/**
 * Send one text request.
 *
 * @param fetcher - The fetch to use.
 * @param call - The key and the model.
 * @param request - What to ask.
 * @returns The reply, trimmed, without the model's thoughts, and the tokens
 * Gemini says it used. The reply is empty when the model wrote nothing.
 * @throws {GeminiError} When Gemini refuses.
 */
async function generateText(
  fetcher: Fetcher,
  call: ModelCall,
  request: TextRequest,
): Promise<{ text: string; counts: TokenCounts }> {
  const reply = await callGemini(fetcher, `/models/${call.model}:generateContent`, call.apiKey, {
    contents: [{ role: 'user', parts: [{ text: request.prompt }] }],
    generationConfig: {
      maxOutputTokens: (request.maxTokens ?? DEFAULT_MAX_TOKENS) + THINKING_ROOM,
      ...(request.json ? { responseMimeType: 'application/json' } : {}),
    },
  });
  const parsed = TextReply.parse(reply);
  const parts = parsed.candidates[0]?.content?.parts ?? [];
  const text = parts
    .filter((part) => !part.thought)
    .map((part) => part.text ?? '')
    .join('')
    .trim();
  return { text, counts: countsFrom(parsed.usageMetadata) };
}

/**
 * Build the one way to the memory model that the whole server shares.
 *
 * @param account - Supplies the key and the model, and counts the call.
 * @param db - Where the tokens each call used are recorded.
 * @param fetcher - The fetch to use. The real one when not given.
 * @returns A function that sends a request. It rejects when there is no key,
 * the daily limit is reached, or Gemini refuses. A refused call stays in the
 * ledger with no tokens: it still counts against the limit.
 */
export function createCompleter(
  account: GeminiAccount,
  db: Database,
  fetcher: Fetcher = fetch,
): Completer {
  return async (request) => {
    const { purpose, sessionId } = request;
    const call = await account.forCall('memory', { purpose, sessionId });
    const { text, counts } = await generateText(fetcher, call, request);
    settleCall(db, call.usageId, counts);
    return text;
  };
}
