import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

/**
 * RHLZ — double-submit CSRF protection for cookie-authenticated sessions.
 *
 * The SPA sends every mutating request with an `X-RHLZ-CSRF` header that
 * echoes the non-httpOnly `rhlz_csrf` cookie set at login. The check keys on
 * the PRESENCE of the `rhlz_session` cookie (ordering-independent: it does not
 * depend on auth middleware having run), so any request carrying the session
 * cookie must also carry the CSRF header. Bearer/API-key requests without the
 * session cookie skip the check. Combined with `SameSite=Lax` cookies,
 * cross-site attacks cannot read the cookie and cannot forge the header.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
  // Only requests carrying the session cookie are at risk.
  if (!req.cookies?.rhlz_session) return next();

  const header = req.headers["x-rhlz-csrf"];
  const cookie = req.cookies?.rhlz_csrf;
  if (
    typeof header !== "string" ||
    typeof cookie !== "string" ||
    header.length === 0 ||
    cookie.length === 0
  ) {
    return res.status(403).json({ error: "Forbidden: missing CSRF token" });
  }
  const a = Buffer.from(header);
  const b = Buffer.from(cookie);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(403).json({ error: "Forbidden: invalid CSRF token" });
  }
  next();
}

export function generateCsrfToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

/** Parses a single cookie value out of a raw Cookie header (socket.io handshakes). */
export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key === name) {
      try {
        return decodeURIComponent(part.slice(idx + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}
