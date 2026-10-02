/**
 * The Gemini account routes, from the browser. The server holds the key, so
 * the browser only ever sends a new one and reads it back masked.
 */
import {
  GeminiAccount,
  type GeminiChoiceChange,
  GeminiFailure,
  GeminiModelList,
  type GeminiModels,
} from '@m8/shared';

/**
 * Call an account route.
 *
 * @param path - The route.
 * @param init - The request, or nothing for a read.
 * @returns The parsed JSON reply.
 * @throws {Error} With the server's own message when it answers with an error.
 * It says what to do: a bad key, a model the key cannot use, Gemini down.
 */
async function call(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json' },
  });
  const body: unknown = await response.json().catch(() => null);
  if (response.ok) return body;
  throw new Error(
    GeminiFailure.safeParse(body).data?.error ?? `The server answered ${response.status}.`,
  );
}

/**
 * Read the account.
 *
 * @returns The masked key, the chosen models and the daily limit.
 */
export async function readAccount(): Promise<GeminiAccount> {
  return GeminiAccount.parse(await call('/api/gemini'));
}

/**
 * Give the server a new key. It checks the key with Gemini before it keeps it.
 *
 * @param key - The key as pasted.
 * @returns The account with the new key, masked, and the models it picked.
 */
export async function saveKey(key: string): Promise<GeminiAccount> {
  return GeminiAccount.parse(
    await call('/api/gemini/key', { method: 'PUT', body: JSON.stringify({ key }) }),
  );
}

/**
 * Change the models or the daily limit.
 *
 * @param change - What changes.
 * @returns The account as it is now.
 */
export async function choose(change: GeminiChoiceChange): Promise<GeminiAccount> {
  return GeminiAccount.parse(
    await call('/api/gemini', { method: 'PATCH', body: JSON.stringify(change) }),
  );
}

/**
 * List the models the stored key can use.
 *
 * @returns The live and text models, newest first.
 */
export async function listModels(): Promise<GeminiModels> {
  return GeminiModelList.parse(await call('/api/gemini/models'));
}
