/**
 * Seals secrets at rest with AES-256-GCM. Each sealed value is bound to its
 * owner, the setting it belongs to, so a value copied to another row does not
 * open.
 */

/** The format version, the first byte of every sealed value. */
const FORMAT = 1;

/** Bytes of an AES-GCM IV. */
const IV_LENGTH = 12;

/** What the sealing key is derived for, so it never equals a key derived for anything else. */
const PURPOSE = 'm8/secrets/v1';

/** Seals and opens secrets. */
export interface SecretBox {
  /**
   * Encrypt a value.
   *
   * @param plaintext - The secret.
   * @param owner - The setting it belongs to. Opening it under another owner fails.
   * @returns The sealed value in base64: version, IV, ciphertext and tag.
   */
  seal(plaintext: string, owner: string): Promise<string>;
  /**
   * Decrypt a value sealed by {@link SecretBox.seal}.
   *
   * @param sealed - The sealed value in base64.
   * @param owner - The setting it was sealed for.
   * @returns The secret.
   * @throws {Error} When the value was altered, sealed under another owner, or
   * sealed with another root key.
   */
  open(sealed: string, owner: string): Promise<string>;
}

/**
 * Derive the sealing key from the root key.
 *
 * @param root - The root key, 32 bytes.
 * @returns An AES-GCM key that can only encrypt and decrypt.
 */
async function sealingKey(root: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const hkdf = await crypto.subtle.importKey('raw', root, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: encoder.encode('m8'), info: encoder.encode(PURPOSE) },
    hkdf,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypt a value.
 *
 * @param key - The sealing key.
 * @param plaintext - The secret.
 * @param owner - The setting it belongs to, bound in as additional data.
 * @returns Version, IV, ciphertext and tag, in base64.
 */
async function sealWith(key: CryptoKey, plaintext: string, owner: string): Promise<string> {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(owner) },
    key,
    encoder.encode(plaintext),
  );
  const sealed = new Uint8Array(1 + IV_LENGTH + encrypted.byteLength);
  sealed.set([FORMAT], 0);
  sealed.set(iv, 1);
  sealed.set(new Uint8Array(encrypted), 1 + IV_LENGTH);
  return Buffer.from(sealed).toString('base64');
}

/**
 * Decrypt a value.
 *
 * @param key - The sealing key.
 * @param sealed - Version, IV, ciphertext and tag, in base64.
 * @param owner - The setting it was sealed for.
 * @returns The secret.
 * @throws {Error} When the format is unknown or the value does not open.
 */
async function openWith(key: CryptoKey, sealed: string, owner: string): Promise<string> {
  const bytes = new Uint8Array(Buffer.from(sealed, 'base64'));
  if (bytes[0] !== FORMAT) throw new Error('The sealed secret has an unknown format.');
  const parameters = {
    name: 'AES-GCM',
    iv: bytes.slice(1, 1 + IV_LENGTH),
    additionalData: new TextEncoder().encode(owner),
  };
  const plain = await crypto.subtle
    .decrypt(parameters, key, bytes.slice(1 + IV_LENGTH))
    .catch(() => {
      throw new Error(
        'A secret in the database does not open with the key in the keys directory. Enter the Gemini key again.',
      );
    });
  return new TextDecoder().decode(plain);
}

/**
 * Build a secret box over a root key.
 *
 * @param root - The root key, 32 bytes.
 * @returns The box.
 */
export async function openSecretBox(root: Uint8Array<ArrayBuffer>): Promise<SecretBox> {
  const key = await sealingKey(root);
  return {
    seal: (plaintext, owner) => sealWith(key, plaintext, owner),
    open: (sealed, owner) => openWith(key, sealed, owner),
  };
}
