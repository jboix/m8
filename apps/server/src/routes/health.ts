/** Liveness. Answers without touching the proxy, the database, or a model. */
import { Hono } from 'hono';

/** The health route, mounted at the root. */
export const health = new Hono().get('/health', (context) =>
  context.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) }),
);
