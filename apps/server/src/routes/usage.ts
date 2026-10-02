/** What he has spent, for the usage section of the settings. Section 7.6 of docs/architecture.md. */
import type { Database } from 'bun:sqlite';
import { MAX_USAGE_DAYS, UsageQuery } from '@m8/shared';
import { Hono } from 'hono';
import { usageReport } from '../usage/report.ts';

/** A day, in milliseconds. */
const DAY_MS = 86_400_000;

/**
 * Build the usage route.
 *
 * @param db - The database the ledger is in.
 * @param now - The clock.
 * @returns A Hono app exposing `GET /api/usage?from=<ms>`. A start further back
 * than {@link MAX_USAGE_DAYS} days is moved forward to that limit.
 */
export function usage(db: Database, now: () => number = Date.now): Hono {
  return new Hono().get('/api/usage', (context) => {
    const asked = UsageQuery.safeParse({ from: context.req.query('from') });
    if (!asked.success) return context.json({ error: 'Say where the report starts.' }, 400);
    const at = now();
    const from = Math.max(asked.data.from, at - MAX_USAGE_DAYS * DAY_MS);
    return context.json(usageReport(db, from, at));
  });
}
