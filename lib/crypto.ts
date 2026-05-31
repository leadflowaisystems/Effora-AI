/**
 * AES-256-GCM encryption for storing integration credentials in DB.
 * Key comes from ENCRYPTION_KEY env var (64 hex chars = 32 bytes).
 *
 * Format stored in DB: "<iv_b64>:<tag_b64>:<data_b64>"
 *
 * Only callable from server-side code (Node.js runtime).
 * Edge runtime does NOT have Node crypto — never import in middleware.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALG = "aes-256-gcm";

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "[Effora AI] ENCRYPTION_KEY must be a 64-char hex string (32 bytes).\n" +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  return Buffer.from(hex, "hex");
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv(ALG, getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag(); // 128-bit auth tag
  return [
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

export function decryptSecret(encoded: string): string {
  const parts = encoded.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted value format");
  const [ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = createDecipheriv(ALG, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/** Returns true if the string looks like an encrypted value (not a raw key). */
export function isEncrypted(value: string): boolean {
  return value.split(":").length === 3;
}
