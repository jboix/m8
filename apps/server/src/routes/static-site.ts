/**
 * Serves the built web app in production. In development this mounts nothing:
 * Vite serves the page and proxies /api here instead, so the two setups differ
 * in exactly one place.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { etag } from 'hono/etag';
import type { Environment } from '../env.ts';

/** Vite puts a content hash in these filenames, so a cached copy is never stale. */
const HASHED_ASSETS = '/assets/';

/**
 * Choose the caching policy for one built file.
 *
 * Hashed assets are kept forever. Everything else, the sense workers and their
 * WASM runtimes included, is revalidated by ETag, so an unchanged 12 MB file
 * costs a 304 and a rebuilt one is picked up at once.
 *
 * @param path - The request path of the file.
 * @returns The `Cache-Control` value to send with it.
 */
function cacheControlFor(path: string): string {
  return path.startsWith(HASHED_ASSETS) ? 'public, max-age=31536000, immutable' : 'no-cache';
}

/**
 * Build the static-serving routes.
 *
 * @param environment - Supplies the build directory and the mode.
 * @returns A Hono app serving the build, or an empty one in development.
 */
export function staticSite(environment: Environment): Hono {
  const app = new Hono();
  if (environment.NODE_ENV !== 'production') return app;
  if (!existsSync(join(environment.WEB_DIST, 'index.html'))) {
    console.warn(`There is no web build in ${environment.WEB_DIST}. Run bun run build first.`);
  }

  app.use('/*', etag());
  app.use(
    '/*',
    serveStatic({
      root: environment.WEB_DIST,
      onFound: (_file, context) => {
        context.header('Cache-Control', cacheControlFor(context.req.path));
      },
    }),
  );
  // Client-side routing: anything the build did not answer is the app shell.
  app.get('/*', serveStatic({ path: `${environment.WEB_DIST}/index.html` }));
  return app;
}
