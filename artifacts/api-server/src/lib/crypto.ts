import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Shared AES-256-GCM primitive behind every at-rest secret in this codebase
 * (Phase 4) — generalized from backupConfigCrypto.ts, which was previously
 * the only encryption in the app and hardcoded to one env var/one storage
 * shape. Callers pick their own storage shape:
 *  - backupConfigCrypto.ts keeps its existing {iv,authTag,ciphertext} object
 *    shape (unchanged, so already-stored backup configs keep decrypting).
 *  - encryptSecret/decryptOrPassthrough below give a single envelope string
 *    for plain `text` columns — used for email OAuth tokens.
 */

export interface EncryptedParts {
  iv: string;
  authTag: string;
  ciphertext: string;
}

function loadKey(keyEnvVar: string): Buffer {
  const raw = process.env[keyEnvVar];
  if (!raw) {
    throw new Error(`${keyEnvVar} not set — required to encrypt/decrypt this value.`);
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(`${keyEnvVar} must decode to exactly 32 bytes (base64-encoded AES-256 key).`);
  }
  return key;
}

export function encryptRaw(plaintext: string, keyEnvVar: string): EncryptedParts {
  const key = loadKey(keyEnvVar);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

export function decryptRaw(parts: EncryptedParts, keyEnvVar: string): string {
  const key = loadKey(keyEnvVar);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(parts.iv, "base64"));
  decipher.setAuthTag(Buffer.from(parts.authTag, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(parts.ciphertext, "base64")), decipher.final()]);
  return plaintext.toString("utf8");
}

const ENVELOPE_PREFIX = "enc:v1:";

export function isEncryptedSecret(value: string): boolean {
  return value.startsWith(ENVELOPE_PREFIX);
}

/** Encrypts a plain string into a single self-contained envelope string. */
export function encryptSecret(plaintext: string, keyEnvVar: string): string {
  return `${ENVELOPE_PREFIX}${JSON.stringify(encryptRaw(plaintext, keyEnvVar))}`;
}

/**
 * Decrypts a value produced by encryptSecret. Values that don't carry the
 * envelope marker are returned unchanged — legacy plaintext stored before
 * encryption was added for that column. Callers should re-encrypt on their
 * next write so every row transparently upgrades over time (see
 * repositories/emailIntegrations.ts's token read/write paths).
 */
export function decryptOrPassthrough(value: string, keyEnvVar: string): string {
  if (!isEncryptedSecret(value)) return value;
  const parts = JSON.parse(value.slice(ENVELOPE_PREFIX.length)) as EncryptedParts;
  return decryptRaw(parts, keyEnvVar);
}
