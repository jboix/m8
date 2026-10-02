/** The secret box, and the root key file it is built on. */
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readOrCreateRootKey } from './root-key.ts';
import { openSecretBox } from './secret-box.ts';

/**
 * A fresh root key.
 *
 * @returns 32 random bytes.
 */
function rootKey(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(32));
}

describe('openSecretBox', () => {
  test('opens what it sealed, and the sealed value does not show the secret', async () => {
    const box = await openSecretBox(rootKey());
    const sealed = await box.seal('my-gemini-key', 'gemini.key');

    expect(sealed).not.toContain('my-gemini-key');
    expect(await box.open(sealed, 'gemini.key')).toBe('my-gemini-key');
  });

  test('refuses a value sealed for another owner', async () => {
    const box = await openSecretBox(rootKey());
    const sealed = await box.seal('my-gemini-key', 'gemini.key');

    await expect(box.open(sealed, 'other.key')).rejects.toThrow('does not open');
  });

  test('refuses a value sealed with another root key', async () => {
    const sealed = await (await openSecretBox(rootKey())).seal('my-gemini-key', 'gemini.key');
    const other = await openSecretBox(rootKey());

    await expect(other.open(sealed, 'gemini.key')).rejects.toThrow('does not open');
  });
});

describe('readOrCreateRootKey', () => {
  test('generates the key once, readable by its owner only, and reads it back', () => {
    const root = mkdtempSync(join(tmpdir(), 'm8-keys-'));
    const keysDir = join(root, 'keys');

    const first = readOrCreateRootKey(keysDir, join(root, 'data', 'm8.sqlite'));
    const second = readOrCreateRootKey(keysDir, join(root, 'data', 'm8.sqlite'));

    expect(first.length).toBe(32);
    expect(second).toEqual(first);
    expect(statSync(join(keysDir, 'secret.key')).mode & 0o777).toBe(0o600);
  });

  test('refuses a keys directory inside the database directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'm8-keys-'));

    expect(() => readOrCreateRootKey(join(root, 'keys'), join(root, 'm8.sqlite'))).toThrow(
      'inside the database',
    );
  });
});
