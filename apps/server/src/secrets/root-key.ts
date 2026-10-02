/**
 * The root key the secret box derives from. The server generates it on first
 * start, in a directory apart from the database, so a copy of the database
 * does not carry it.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

/** Bytes of the root key. */
const KEY_LENGTH = 32;

/** The file the root key is kept in. */
const KEY_FILE = 'secret.key';

/**
 * Whether a path is a directory or lies inside it.
 *
 * @param path - The path.
 * @param directory - The directory.
 * @returns True when it does.
 */
function isWithin(path: string, directory: string): boolean {
  const between = relative(resolve(directory), resolve(path));
  return !between.startsWith('..') && !between.startsWith('/');
}

/**
 * Decode and check the root key.
 *
 * @param text - The file's text, base64.
 * @param path - Where it came from, for the message.
 * @returns The key.
 * @throws {Error} When it is not 32 bytes.
 */
function decodeKey(text: string, path: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(Buffer.from(text.trim(), 'base64'));
  if (bytes.length !== KEY_LENGTH) {
    throw new Error(`${path} must hold ${KEY_LENGTH} bytes in base64. Delete it to generate one.`);
  }
  return bytes;
}

/**
 * Read the root key, generating it with mode 0600 when it does not exist.
 *
 * @param keysDir - Where the key lives.
 * @param databasePath - Where the database lives, or `:memory:`.
 * @returns The key.
 * @throws {Error} When the keys directory is the database's directory or inside it.
 */
export function readOrCreateRootKey(
  keysDir: string,
  databasePath: string,
): Uint8Array<ArrayBuffer> {
  if (databasePath !== ':memory:' && isWithin(keysDir, dirname(databasePath))) {
    throw new Error(
      `M8_KEYS_DIR (${keysDir}) is inside the database's directory. Keep it apart, so a copy of the database does not carry the key.`,
    );
  }
  mkdirSync(keysDir, { recursive: true, mode: 0o700 });
  const path = join(keysDir, KEY_FILE);

  if (existsSync(path)) {
    if ((statSync(path).mode & 0o077) !== 0) {
      console.warn(`${path} can be read by other users. Run chmod 600 on it.`);
    }
    return decodeKey(readFileSync(path, 'utf8'), path);
  }

  const key = crypto.getRandomValues(new Uint8Array(KEY_LENGTH));
  writeFileSync(path, `${Buffer.from(key).toString('base64')}\n`, { mode: 0o600, flag: 'wx' });
  console.warn(`Generated ${path}. Back it up: without it the stored Gemini key does not open.`);
  return key;
}
