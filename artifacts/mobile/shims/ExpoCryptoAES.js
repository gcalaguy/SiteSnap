/**
 * Shim for ExpoCryptoAES — pure WebCrypto implementation.
 *
 * @clerk/clerk-expo v2 uses expo-crypto@55 which exposes ExpoCryptoAES as a
 * native module. Expo Go SDK 54 bundles an incompatible version of that module,
 * causing "cannot override host object" errors when registerWebModule is called.
 *
 * This shim replaces ./ExpoCryptoAES (resolved by metro.config.js) with a
 * standalone implementation that does NOT call registerWebModule, avoiding the
 * crash entirely while providing the same API surface.
 */

// --- Utility helpers (inlined from expo-crypto/build/aes/web-utils.js) ---

function hexToUintArray(hexString) {
  const byteLength = hexString.length / 2;
  const bytes = new Uint8Array(byteLength);
  for (let i = 0; i < hexString.length; i += 2) {
    bytes[i >>> 1] = parseInt(hexString.substring(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes) {
  const hex = [];
  for (let i = 0; i < bytes.length; i++) {
    const current = bytes[i] < 0 ? bytes[i] + 256 : bytes[i];
    hex.push((current >>> 4).toString(16));
    hex.push((current & 0xf).toString(16));
  }
  return hex.join("");
}

function base64ToUintArray(base64String) {
  const binaryString = atob(base64String);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function uint8ArrayToBase64(uint8Array) {
  let binaryString = "";
  for (let i = 0; i < uint8Array.length; i++) {
    binaryString += String.fromCharCode(uint8Array[i]);
  }
  return btoa(binaryString);
}

function binaryInputBytes(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer);
  if (typeof input === "string") return base64ToUintArray(input);
  throw new Error("Cannot parse serializable input as ArrayBuffer");
}

// --- AESKeySize enum values ---
const AESKeySize = { AES128: 128, AES192: 192, AES256: 256 };

// --- EncryptionKey ---

class EncryptionKey {
  constructor(key, size) {
    this.key = key;
    this.keySize = size;
  }

  static async generate(size) {
    const keySize = size ?? AESKeySize.AES256;
    const key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: keySize },
      true,
      ["encrypt", "decrypt"]
    );
    return new EncryptionKey(key, keySize);
  }

  static async import(input, encoding) {
    let bytes;
    if (typeof input === "string") {
      bytes = encoding === "base64" ? base64ToUintArray(input) : hexToUintArray(input);
    } else {
      bytes = input;
    }
    const key = await crypto.subtle.importKey("raw", bytes, "AES-GCM", true, [
      "encrypt",
      "decrypt",
    ]);
    return new EncryptionKey(key, bytes.byteLength * 8);
  }

  async bytes() {
    const buffer = await crypto.subtle.exportKey("raw", this.key);
    return new Uint8Array(buffer);
  }

  async encoded(encoding) {
    const bytes = await this.bytes();
    return encoding === "base64" ? uint8ArrayToBase64(bytes) : bytesToHex(bytes);
  }

  get size() {
    return this.keySize;
  }
}

// --- SealedData ---

const DEFAULT_IV_LENGTH = 12;
const DEFAULT_TAG_LENGTH = 16;
const defaultConfig = { ivLength: DEFAULT_IV_LENGTH, tagLength: DEFAULT_TAG_LENGTH };

class SealedData {
  constructor(buffer, config) {
    this.buffer = buffer;
    this.config = config;
  }

  static fromCombined(combined, config) {
    const buffer = binaryInputBytes(combined).buffer;
    return new SealedData(buffer, config ?? defaultConfig);
  }

  static fromParts(iv, ciphertext, tag) {
    const ciphertextBytes = binaryInputBytes(ciphertext);
    const ivBytes = binaryInputBytes(iv);
    const ivLength = ivBytes.byteLength;
    if (!tag) tag = DEFAULT_TAG_LENGTH;
    if (typeof tag === "number") {
      const totalLength = ivLength + ciphertextBytes.byteLength;
      const combined = new Uint8Array(totalLength);
      combined.set(ivBytes);
      combined.set(ciphertextBytes, ivLength);
      return new SealedData(combined.buffer, { ivLength, tagLength: tag });
    }
    const tagBytes = binaryInputBytes(tag);
    const tagLength = tagBytes.byteLength;
    const totalLength = ivLength + ciphertextBytes.byteLength + tagLength;
    const combined = new Uint8Array(totalLength);
    combined.set(ivBytes);
    combined.set(ciphertextBytes, ivLength);
    combined.set(tagBytes, totalLength - tagLength);
    return new SealedData(combined.buffer, { ivLength, tagLength });
  }

  get ivSize() { return this.config.ivLength; }
  get tagSize() { return this.config.tagLength; }
  get combinedSize() { return this.buffer.byteLength; }

  async iv(encoding) {
    const bytes = new Uint8Array(this.buffer, 0, this.ivSize);
    return encoding === "base64" ? uint8ArrayToBase64(bytes) : bytes;
  }

  async tag(encoding) {
    const offset = this.combinedSize - this.tagSize;
    const bytes = new Uint8Array(this.buffer, offset, this.tagSize);
    return encoding === "base64" ? uint8ArrayToBase64(bytes) : bytes;
  }

  async combined(encoding) {
    const bytes = new Uint8Array(this.buffer);
    return encoding === "base64" ? uint8ArrayToBase64(bytes) : bytes;
  }

  async ciphertext(options) {
    const includeTag = options?.includeTag ?? false;
    const useBase64 = options?.encoding === "base64";
    const taggedCiphertextLength = this.combinedSize - this.ivSize;
    const ciphertextLength = includeTag
      ? taggedCiphertextLength
      : taggedCiphertextLength - this.tagSize;
    const bytes = new Uint8Array(this.buffer, this.ivSize, ciphertextLength);
    return useBase64 ? uint8ArrayToBase64(bytes) : bytes;
  }
}

// --- AesCryptoModule (no registerWebModule) ---

class AesCryptoModule {
  constructor() {
    this.EncryptionKey = EncryptionKey;
    this.SealedData = SealedData;
  }

  async encryptAsync(plaintext, key, options = {}) {
    const {
      nonce = DEFAULT_IV_LENGTH,
      tagLength = DEFAULT_TAG_LENGTH,
      additionalData: aad,
    } = options;
    const iv =
      typeof nonce === "number"
        ? crypto.getRandomValues(new Uint8Array(nonce))
        : binaryInputBytes(nonce);
    const baseParams = { name: "AES-GCM", iv, tagLength: tagLength * 8 };
    const gcmParams = aad
      ? { ...baseParams, additionalData: binaryInputBytes(aad) }
      : baseParams;
    const ciphertextWithTag = await crypto.subtle.encrypt(
      gcmParams,
      key.key,
      binaryInputBytes(plaintext)
    );
    return SealedData.fromParts(iv, ciphertextWithTag, tagLength);
  }

  async decryptAsync(sealedData, key, options = {}) {
    const { additionalData: aad, output } = options;
    const iv = await sealedData.iv();
    const baseParams = {
      name: "AES-GCM",
      iv,
      tagLength: sealedData.tagSize * 8,
    };
    const gcmParams = aad
      ? { ...baseParams, additionalData: binaryInputBytes(aad) }
      : baseParams;
    const taggedCiphertext = await sealedData.ciphertext({ includeTag: true });
    const plaintextBuffer = await crypto.subtle.decrypt(
      gcmParams,
      key.key,
      taggedCiphertext
    );
    const bytes = new Uint8Array(plaintextBuffer);
    return output === "base64" ? uint8ArrayToBase64(bytes) : bytes;
  }
}

export default new AesCryptoModule();
