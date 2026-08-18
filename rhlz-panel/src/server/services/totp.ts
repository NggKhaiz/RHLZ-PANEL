/**
 * RHLZ — TOTP two-factor helpers (RFC 6238) built on `otpauth`.
 * Handles secret generation, otpauth:// URI construction, code verification
 * with a small clock-drift window, and one-time recovery codes (hashed at
 * rest with bcrypt).
 */
import { Secret, TOTP } from "otpauth";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { PRODUCT_NAME } from "../../brand.js";

const ISSUER = "RHLZ";
const PERIOD = 30;
const DIGITS = 6;
const DRIFT_WINDOW = 1; // +/- one period of clock tolerance

export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

export function buildTotpUri(secretBase32: string, label: string): string {
  const totp = new TOTP({
    issuer: ISSUER,
    label,
    algorithm: "SHA1",
    digits: DIGITS,
    period: PERIOD,
    secret: secretBase32,
  });
  return totp.toString();
}

/** Returns true when `code` matches the secret (allowing +/- one period). */
export function verifyTotpCode(secretBase32: string, code: string): boolean {
  const totp = new TOTP({
    issuer: ISSUER,
    label: PRODUCT_NAME,
    algorithm: "SHA1",
    digits: DIGITS,
    period: PERIOD,
    secret: secretBase32,
  });
  const delta = totp.validate({ token: String(code).replace(/\s+/g, ""), window: DRIFT_WINDOW });
  return delta !== null;
}

/** Generates N recovery codes (shown once) and returns their bcrypt hashes. */
export function generateRecoveryCodes(count = 10): { plain: string[]; hashed: string[] } {
  const plain: string[] = [];
  const hashed: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = "RVN-" + crypto.randomBytes(5).toString("hex").toUpperCase();
    plain.push(code);
    hashed.push(bcrypt.hashSync(code, 10));
  }
  return { plain, hashed };
}

/** Verifies a recovery code; returns true and (for single-use codes) the index to remove. */
export async function verifyRecoveryCode(code: string, hashedCodes: string[]): Promise<number> {
  const clean = String(code).trim().toUpperCase();
  for (let i = 0; i < hashedCodes.length; i++) {
    if (await bcrypt.compare(clean, hashedCodes[i])) return i;
  }
  return -1;
}
