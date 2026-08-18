/**
 * Central runtime configuration & secret handling (RHLZ Secure Core).
 *
 * SECURITY POLICY (JWT secret):
 *  1. Use JWT_SECRET from the environment when present and not a known
 *     placeholder / too short.
 *  2. Otherwise use the persisted secret in .data/secret (created with 0600
 *     permissions on first boot) so sessions survive restarts.
 *  3. Otherwise GENERATE a cryptographically random 256-bit secret, persist
 *     it to .data/secret with 0600 perms, and log a warning.
 *
 * A guessable default is never shipped and the panel never refuses to run
 * because of a missing secret - it creates a strong one instead.
 */
import crypto from "crypto";
import fs from "fs-extra";
import path from "path";

const KNOWN_PLACEHOLDERS = new Set([
  "your-secure-random-jwt-secret-here",
  "change-me",
  "secret",
]);

function isUsableSecret(secret: string | undefined): boolean {
  return !!secret && !KNOWN_PLACEHOLDERS.has(secret) && secret.length >= 16;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

const SECRET_FILE = () => path.join(process.cwd(), ".data", "secret");

export function getJwtSecret(): string {
  const envSecret = process.env.RHLZ_SESSION_SECRET || process.env.JWT_SECRET;
  if (isUsableSecret(envSecret)) return envSecret as string;

  // 2. Persisted secret from a previous boot.
  try {
    if (fs.existsSync(SECRET_FILE())) {
      const persisted = fs.readFileSync(SECRET_FILE(), "utf8").trim();
      if (isUsableSecret(persisted)) return persisted;
    }
  } catch {}

  // 3. Generate, persist with 0600, warn.
  const generated = crypto.randomBytes(32).toString("hex");
  try {
    fs.ensureDirSync(path.dirname(SECRET_FILE()));
    fs.writeFileSync(SECRET_FILE(), generated, { mode: 0o600 });
    try {
      fs.chmodSync(SECRET_FILE(), 0o600);
    } catch {}
    console.warn(
      "[RHLZ] RHLZ_SESSION_SECRET was not set - generated a random secret and persisted it to .data/secret (0600). " +
        "Set RHLZ_SESSION_SECRET in the environment to take full control."
    );
  } catch (err) {
    console.warn(
      "[RHLZ] Could not persist generated session secret to .data/secret - " +
        "sessions will be invalidated on every restart."
    );
  }
  return generated;
}

/**
 * JWT access-token lifetime. Short-lived by default (RHLZ: leak window is
 * kept small); override with JWT_EXPIRES (e.g. "1h", "8h", "1d").
 */
export type JwtExpiresValue = `${number}${"s" | "m" | "h" | "d"}`;

export function getJwtExpires(): JwtExpiresValue {
  const raw = (process.env.JWT_EXPIRES || "24h").trim();
  return /^\d+[smhd]$/.test(raw) ? (raw as JwtExpiresValue) : "24h";
}

/**
 * Origins explicitly allowed to call the API and to open socket.io
 * connections. Configure via PANEL_CORS_ORIGINS (comma separated).
 * Same-origin requests (no Origin header) and localhost (dev) are always
 * allowed.
 */
export function getAllowedOrigins(): string[] {
  return (process.env.PANEL_CORS_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
