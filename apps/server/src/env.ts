/**
 * The server's environment, read once at startup and validated. Every key the
 * process needs is named here, so a missing one fails on boot with a readable
 * message instead of at the first request.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/**
 * The repo root, from this module rather than from the working directory. The
 * dev script runs with `apps/server` as its cwd, so a relative default would
 * point somewhere that does not exist.
 */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** The shape of the environment the server runs in. */
const Environment = z.object({
  /** Port the Hono app listens on. `--port` on the command line wins. */
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  /**
   * The address it listens on. Every interface by default, so a phone on the
   * same network can reach it. `--host` on the command line wins.
   */
  HOST: z.string().min(1).default('0.0.0.0'),
  /**
   * The key a browser has to give before it may open a session or read the
   * memory. Optional: without it the server is open, which is right for
   * localhost and wrong for anything other people can reach.
   */
  M8_ACCESS_KEY: z.string().min(12).optional(),
  /** The SQLite file his memory lives in. Created on first start. */
  MEMORY_DB_PATH: z.string().default(join(REPO_ROOT, 'data/m8.sqlite')),
  /**
   * Where the key that seals the Gemini key lives. Generated on first start.
   * Kept apart from the database, so a copy of the database does not carry it.
   */
  M8_KEYS_DIR: z.string().default(join(REPO_ROOT, 'keys')),
  /** Directory the production web build was written to, served at the root. */
  WEB_DIST: z.string().default(join(REPO_ROOT, 'apps/web/dist')),
  /** Set by the dev script; Vite serves the page and proxies here instead. */
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

/** The validated environment. */
export type Environment = z.infer<typeof Environment>;

/**
 * Read and validate the process environment.
 *
 * @param flags - What the command line set, which wins over the environment.
 * @returns The validated environment.
 * @throws {Error} When a required variable is missing or malformed, listing
 * every problem at once rather than the first.
 */
export function readEnvironment(flags: Record<string, string | undefined> = {}): Environment {
  const parsed = Environment.safeParse({ ...Bun.env, ...flags });
  if (parsed.success) return parsed.data;

  const problems = parsed.error.issues
    .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(`Environment is not usable. See .env.example.\n${problems}`);
}
