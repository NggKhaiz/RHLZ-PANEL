/**
 * RHLZ — authenticated encryption for sensitive at-rest values (TOTP
 * secrets). AES-256-GCM with a key derived from the panel's JWT secret, so
 * the secret is never stored in plaintext and never depends on a second
 * key-management system.
 */
import crypto from "crypto";
import { getJwtSecret } from "../config.js";

function deriveKey(): Buffer {
  return crypto.createHash("sha256").update(getJwtSecret()).digest();
}

export function encryptSecret(plain: string): string {
  const key = deriveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Invalid encrypted payload");
  const decipher = crypto.createDecipheriv("aes-256-gcm", deriveKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}
