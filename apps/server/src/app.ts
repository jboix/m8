/** Composition root for the HTTP surface. Every route family is mounted here. */
import type { Database } from 'bun:sqlite';
import { Hono } from 'hono';
import type { Environment } from './env.ts';
import type { GeminiAccount } from './gemini/account.ts';
import { type Completer, createCompleter } from './gemini/text.ts';
import { access, requireAccess } from './routes/access.ts';
import { gemini } from './routes/gemini.ts';
import { health } from './routes/health.ts';
import { live } from './routes/live.ts';
import { memory } from './routes/memory.ts';
import { pingModel } from './routes/ping-model.ts';
import { staticSite } from './routes/static-site.ts';
import { usage } from './routes/usage.ts';

/**
 * Build the server application.
 *
 * @param environment - Handed to the routes that need it, so nothing reads the
 * process environment on its own.
 * @param db - The memory, opened once and shared by every route that needs it.
 * @param account - The Gemini key, the chosen models and the daily limit.
 * @param complete - The one way to the memory model. Built from the account
 * when not given.
 * @returns The assembled Hono app.
 */
export function createApp(
  environment: Environment,
  db: Database,
  account: GeminiAccount,
  complete: Completer = createCompleter(account, db),
): Hono {
  const guard = requireAccess(environment.M8_ACCESS_KEY);
  return new Hono()
    .route('/', health)
    .route('/', access(environment.M8_ACCESS_KEY))
    .use('/live', guard)
    .use('/api/memory/*', guard)
    .use('/api/memory', guard)
    .use('/api/ping-model', guard)
    .use('/api/gemini/*', guard)
    .use('/api/gemini', guard)
    .use('/api/usage', guard)
    .route('/', live({ account, db, complete }))
    .route('/', gemini(account))
    .route('/', usage(db))
    .route('/', memory(db))
    .route('/', pingModel(complete))
    .route('/', staticSite(environment));
}
