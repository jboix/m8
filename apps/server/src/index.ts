/**
 * The server entry. Reads the environment, opens the memory and the secret
 * box, tidies the memory, builds the app, and listens.
 */
import { createApp } from './app.ts';
import { networkUrls, readFlags } from './cli.ts';
import { readEnvironment } from './env.ts';
import { createGeminiAccount } from './gemini/account.ts';
import { createCompleter } from './gemini/text.ts';
import { openDatabase } from './memory/db.ts';
import { closeAbandonedSessions, runHousekeeping } from './memory/housekeeping.ts';
import { personaFor } from './persona.ts';
import { websocket } from './routes/live.ts';
import { readOrCreateRootKey } from './secrets/root-key.ts';
import { openSecretBox } from './secrets/secret-box.ts';
import { closeOpenCalls } from './usage/ledger.ts';

const environment = readEnvironment({ ...readFlags(Bun.argv.slice(2)) });
const db = openDatabase(environment.MEMORY_DB_PATH);
const box = await openSecretBox(
  readOrCreateRootKey(environment.M8_KEYS_DIR, environment.MEMORY_DB_PATH),
);
const account = createGeminiAccount({ db, box, fetcher: fetch, now: Date.now });
const complete = createCompleter(account, db);

/** How often the memory is tidied while the server runs. */
const HOUSEKEEPING_EVERY_MS = 6 * 3_600_000;

/** Tidy the memory once. A failure is reported and tried again next time. */
function keepHouse(): void {
  runHousekeeping({
    db,
    complete,
    personaFor,
    now: Date.now,
  }).catch((error: unknown) => {
    console.warn(`Housekeeping did not finish: ${String(error)}`);
  });
}

// Nothing can be live yet, so any session still open was cut off by a crash.
closeAbandonedSessions(db, Date.now());
closeOpenCalls(db);
keepHouse();
setInterval(keepHouse, HOUSEKEEPING_EVERY_MS);

for (const url of networkUrls(environment.HOST, environment.PORT)) console.warn(`Network: ${url}`);

export default {
  hostname: environment.HOST,
  port: environment.PORT,
  fetch: createApp(environment, db, account, complete).fetch,
  // Bun needs this alongside `fetch`, or every upgrade is refused.
  websocket,
};
