/**
 * Deprecated — browser sessions no longer use a localStorage token.
 * The session JWT lives in an httpOnly cookie (`rhlz_session`) set by the
 * server; XSS can no longer steal it. These helpers are kept only so older
 * call sites compile; they always return null and write nothing.
 */

export function getAuthToken(): string | null {
  return null;
}

export function setAuthToken(_token: string): void {}

export function clearAuthToken(): void {}
