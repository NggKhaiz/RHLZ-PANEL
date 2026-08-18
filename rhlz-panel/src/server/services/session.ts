import { Response } from "express";
import { generateCsrfToken } from "../middleware/csrf.js";
import { isProduction } from "../config.js";

/**
 * RHLZ — httpOnly session cookie + double-submit CSRF cookie.
 * The session JWT lives in an httpOnly cookie (immune to XSS token theft);
 * a non-httpOnly `rhlz_csrf` cookie is echoed back in the X-RHLZ-CSRF header
 * on every mutating request.
 */
const SESSION_MAX_AGE = 24 * 60 * 60 * 1000; // 24h, matches the default token TTL

export function setSessionCookies(res: Response, token: string): void {
  const secure = isProduction();
  res.cookie("rhlz_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  res.cookie("rhlz_csrf", generateCsrfToken(), {
    httpOnly: false,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export function clearSessionCookies(res: Response): void {
  res.clearCookie("rhlz_session", { path: "/" });
  res.clearCookie("rhlz_csrf", { path: "/" });
}
