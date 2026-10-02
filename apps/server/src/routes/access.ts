/**
 * The access key. One secret from the environment stands between the internet
 * and the two things worth protecting: the live session, which spends money on
 * the provider key, and the memory, which is personal.
 *
 * A browser gives the key once and is handed a cookie. The cookie is HttpOnly,
 * so no script can read it, and the browser attaches it to the websocket
 * upgrade by itself, which a header could not do.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { type AccessState, UnlockRequest } from '@m8/shared';
import { type Context, Hono, type MiddlewareHandler } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';

/** The cookie a browser that gave the key carries. */
const COOKIE = 'm8_access';

/** How long a browser stays trusted, in seconds. A year. */
const TRUSTED_SECONDS = 365 * 86_400;

/** How many wrong keys are tolerated before everybody has to wait. */
const MAX_WRONG_KEYS = 8;

/** How long the wait is. */
const LOCKOUT_MS = 10 * 60_000;

/**
 * Hash a key into what the cookie holds, so the key itself is never stored in a browser.
 *
 * @param key - The access key.
 * @returns Its SHA-256, as hex.
 */
function tokenFor(key: string): string {
  return createHash('sha256').update(`m8-access:${key}`).digest('hex');
}

/**
 * Compare two strings without the time taken saying where they differ.
 *
 * @param given - What arrived.
 * @param expected - What it should be.
 * @returns True when they are the same.
 */
function same(given: string, expected: string): boolean {
  const left = Buffer.from(given);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Whether a request comes from a browser that has given the key.
 *
 * @param context - The request.
 * @param key - The access key, or undefined when the server has none.
 * @returns True when there is no key, or the cookie matches it.
 */
function isGranted(context: Context, key: string | undefined): boolean {
  if (!key) return true;
  return same(getCookie(context, COOKIE) ?? '', tokenFor(key));
}

/**
 * Refuse a request from a browser that has not given the key.
 *
 * @param key - The access key, or undefined when the server has none.
 * @returns Middleware that answers 401, or lets the request through.
 */
export function requireAccess(key: string | undefined): MiddlewareHandler {
  return async (context, next) => {
    if (!isGranted(context, key)) return context.json({ error: 'The access key is needed.' }, 401);
    await next();
  };
}

/**
 * Build the routes a browser uses to find out whether it needs the key, and to give it.
 *
 * @param key - The access key, or undefined when the server has none.
 * @param now - The clock. Defaults to the real one.
 * @returns A Hono app exposing `GET /api/access` and `POST /api/access/unlock`.
 * Too many wrong keys, from anybody, lock unlocking for ten minutes.
 */
export function access(key: string | undefined, now: () => number = Date.now): Hono {
  let wrong: number[] = [];

  return new Hono()
    .get('/api/access', (context) => {
      const state: AccessState = { required: Boolean(key), granted: isGranted(context, key) };
      return context.json(state);
    })
    .post('/api/access/unlock', async (context) => {
      wrong = wrong.filter((at) => now() - at < LOCKOUT_MS);
      if (wrong.length >= MAX_WRONG_KEYS) return context.json({ error: 'Too many tries.' }, 429);

      const asked = UnlockRequest.safeParse(await context.req.json().catch(() => ({})));
      if (!key || !asked.success || !same(asked.data.key, key)) {
        wrong.push(now());
        return context.json({ error: 'That is not the key.' }, 401);
      }
      setCookie(context, COOKIE, tokenFor(key), {
        httpOnly: true,
        sameSite: 'Strict',
        path: '/',
        maxAge: TRUSTED_SECONDS,
        // A tunnel terminates https in front of this server, and says so.
        secure: context.req.header('x-forwarded-proto') === 'https',
      });
      return context.json({ required: true, granted: true } satisfies AccessState);
    });
}
