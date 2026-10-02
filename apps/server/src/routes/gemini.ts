/**
 * The Gemini account, as the setup screen and the settings see it: the key,
 * masked, which model does which job, and the daily limit.
 */
import { GeminiChoiceChange, GeminiKeyChange } from '@m8/shared';
import { type Context, Hono } from 'hono';
import { AccountRefusal, type GeminiAccount } from '../gemini/account.ts';
import { GeminiError } from '../gemini/rest.ts';

/**
 * Answer a failed request with what went wrong.
 *
 * @param context - The request.
 * @param error - What failed.
 * @param refused - The status for a request Gemini or the account refused.
 * @returns 400 or the given status for a refusal, 502 when Gemini could not
 * be reached or failed on its side. The message is always passed on, because
 * it says what to do.
 */
function failed(context: Context, error: unknown, refused: 400 | 409 = 400) {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof AccountRefusal) return context.json({ error: message }, refused);
  if (error instanceof GeminiError && error.status < 500 && error.status !== 429) {
    return context.json({ error: message }, 400);
  }
  return context.json({ error: message }, 502);
}

/**
 * Build the account routes.
 *
 * @param account - The account.
 * @returns A Hono app exposing `GET /api/gemini`, `PATCH /api/gemini` to
 * change the models or the limit, `PUT /api/gemini/key` to check and store a
 * key, and `GET /api/gemini/models`. The key never leaves the server.
 */
export function gemini(account: GeminiAccount): Hono {
  return new Hono()
    .get('/api/gemini', async (context) => context.json(await account.view()))
    .patch('/api/gemini', async (context) => {
      const change = GeminiChoiceChange.safeParse(await context.req.json().catch(() => ({})));
      if (!change.success) return context.json({ error: 'Bad change.' }, 400);
      try {
        return context.json(await account.choose(change.data));
      } catch (error) {
        return failed(context, error);
      }
    })
    .put('/api/gemini/key', async (context) => {
      const change = GeminiKeyChange.safeParse(await context.req.json().catch(() => ({})));
      if (!change.success) return context.json({ error: 'That does not look like a key.' }, 400);
      try {
        return context.json(await account.setKey(change.data.key));
      } catch (error) {
        return failed(context, error);
      }
    })
    .get('/api/gemini/models', async (context) => {
      try {
        return context.json(await account.models());
      } catch (error) {
        return failed(context, error, 409);
      }
    });
}
