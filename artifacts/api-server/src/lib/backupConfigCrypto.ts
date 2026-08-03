import { encryptRaw, decryptRaw, type EncryptedParts } from "./crypto";

/**
 * Encrypts the custom-cloud backup destination config (bucket name + service
 * account key JSON) before it's stored in backup_schedules.custom_cloud_config.
 * Thin wrapper over crypto.ts's shared AES-256-GCM primitive (Phase 4
 * generalized this out — same {iv,authTag,ciphertext} storage shape as
 * before, so already-stored rows keep decrypting unchanged).
 */

export type EncryptedBackupConfig = EncryptedParts;

const KEY_ENV_VAR = "BACKUP_CONFIG_ENCRYPTION_KEY";

export function encryptBackupConfig(plain: object): EncryptedBackupConfig {
  return encryptRaw(JSON.stringify(plain), KEY_ENV_VAR);
}

export function decryptBackupConfig<T = Record<string, unknown>>(enc: EncryptedBackupConfig): T {
  return JSON.parse(decryptRaw(enc, KEY_ENV_VAR)) as T;
}
