/**
 * The proof route: browser to Hono to the memory model and back. It shows
 * the key and the model work, and it is the first thing to try when a model
 * call stops working further up the stack.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { Completer } from '../gemini/text.ts';

/** What the browser may send. Absent, it gets the default one-liner. */
const PingRequest = z.object({
  prompt: z.string().min(1).max(500).default('Say hello in one short sentence.'),
});

/**
 * Build the ping route.
 *
 * @param complete - Asks the memory model. Passed in, so the route is callable
 * from a test with a fake model and counts against the same daily limit as
 * everything else.
 * @returns A Hono app exposing `POST /api/ping-model`.
 */
export function pingModel(complete: Completer): Hono {
  return new Hono().post('/api/ping-model', async (context) => {
    const body = await context.req.json().catch(() => ({}));
    const parsed = PingRequest.safeParse(body);
    if (!parsed.success) return context.json({ error: 'Bad prompt.' }, 400);

    try {
      const text = await complete({ prompt: parsed.data.prompt, purpose: 'ping' });
      return context.json({ text });
    } catch (error) {
      // A missing key, a spent limit or Gemini's own refusal: the message says
      // which, so it is worth returning verbatim.
      return context.json({ error: error instanceof Error ? error.message : String(error) }, 502);
    }
  });
}
