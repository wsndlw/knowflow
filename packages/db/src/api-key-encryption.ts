import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ENCRYPTION_PREFIX = "enc";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const PLACEHOLDER_KEY = "replace-with-32-byte-base64-key";

export function requireModelApiKeyEncryptionKey(): Buffer {
  const encoded = process.env["MODEL_API_KEY_ENCRYPTION_KEY"];
  if (encoded === undefined || encoded.trim().length === 0 || encoded === PLACEHOLDER_KEY) {
    throw new Error("MODEL_API_KEY_ENCRYPTION_KEY must be a real 32-byte base64 key");
  }

  const key = Buffer.from(encoded, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error("MODEL_API_KEY_ENCRYPTION_KEY must decode to exactly 32 bytes");
  }

  return key;
}

export function encryptApiKey(apiKey: string): string {
  const key = requireModelApiKeyEncryptionKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: AUTH_TAG_BYTES });
  const ciphertext = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    ENCRYPTION_PREFIX,
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

export function decryptApiKey(encryptedApiKey: string): string {
  const [prefix, ivEncoded, authTagEncoded, ciphertextEncoded] = encryptedApiKey.split(":");
  if (
    prefix !== ENCRYPTION_PREFIX ||
    ivEncoded === undefined ||
    authTagEncoded === undefined ||
    ciphertextEncoded === undefined
  ) {
    throw new Error("Encrypted API key has invalid format");
  }

  const key = requireModelApiKeyEncryptionKey();
  const iv = Buffer.from(ivEncoded, "base64");
  const authTag = Buffer.from(authTagEncoded, "base64");
  const ciphertext = Buffer.from(ciphertextEncoded, "base64");
  if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES || ciphertext.length === 0) {
    throw new Error("Encrypted API key payload is invalid");
  }

  const decipher = createDecipheriv("aes-256-gcm", key, iv, {
    authTagLength: AUTH_TAG_BYTES,
  });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 8) {
    return "****";
  }

  return `${apiKey.slice(0, 3)}****${apiKey.slice(-4)}`;
}
