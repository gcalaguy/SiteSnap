import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Encrypts the custom-cloud backup destination config (bucket name + service
 * account key JSON) before it's stored in backup_schedules.custom_cloud_config.
 * No encryption-at-rest convention exists elsewhere in this codebase (other
 * secrets, e.g. companies.resendApiKey, are stored plaintext) — this is scoped
 * narrowly to the one field that genuinely needs it.
 */

export interface EncryptedBackupConfig {
  iv: string;
  authTag: string;
  ciphertext: string;
}

function loadKey(): Buffer {
  const raw = process.env.BACKUP_CONFIG_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "BACKUP_CONFIG_ENCRYPTION_KEY not set — required to store a custom cloud storage backup destination.",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("BACKUP_CONFIG_ENCRYPTION_KEY must decode to exactly 32 bytes (base64-encoded AES-256 key).");
  }
  return key;
}

export function encryptBackupConfig(plain: object): EncryptedBackupConfig {
  const key = loadKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(plain), "utf8"), cipher.final()]);
  return {
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

export function decryptBackupConfig<T = Record<string, unknown>>(enc: EncryptedBackupConfig): T {
  const key = loadKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(enc.iv, "base64"));
  decipher.setAuthTag(Buffer.from(enc.authTag, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(enc.ciphertext, "base64")), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}
