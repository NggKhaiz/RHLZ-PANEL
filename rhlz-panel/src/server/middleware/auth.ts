import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { getJwtSecret } from "../config.js";

const JWT_SECRET = getJwtSecret();

// Debounce api_keys.json last_used_at writes: at most one write per key per
// window, otherwise every authenticated API-key request rewrites the file
// (write amplification).
const lastUsedFlush = new Map<string, number>();
const LAST_USED_WINDOW_MS = 60_000;

/** API keys start with the current (rhlz-) or previous-generation (rvn-) prefixes. */
const isApiKeyToken = (token: string) =>
  token.startsWith("rhlz-") || token.startsWith("rhlz_") || token.startsWith("rvn-") || token.startsWith("rvn_");

const loadApiKey = async (token: string) => {
  const { readJSON, writeJSON } = await import("../services/db.js");
  const apiKeys = (await readJSON("api_keys.json")) || [];
  const digest = crypto.createHash("sha256").update(token).digest();
  const apiKey = apiKeys.find((k: any) => {
    if (typeof k.key_hash !== "string" || !/^[0-9a-f]{64}$/.test(k.key_hash)) return false;
    return crypto.timingSafeEqual(digest, Buffer.from(k.key_hash, "hex"));
  });
  if (!apiKey || apiKey.revoked) {
    return { error: "Invalid or revoked API key" as const, status: 401 as const };
  }
  if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
    return { error: "API key expired" as const, status: 401 as const };
  }

  // Update last_used_at (debounced to one write per key per minute)
  const now = Date.now();
  const lastFlush = lastUsedFlush.get(apiKey.id) || 0;
  if (now - lastFlush >= LAST_USED_WINDOW_MS) {
    apiKey.last_used_at = new Date().toISOString();
    lastUsedFlush.set(apiKey.id, now);
    await writeJSON("api_keys.json", apiKeys);
  }

  const users = await readJSON("users.json") || [];
  let role = "admin";
  if (apiKey.created_by !== "temp-admin") {
    const creator = users.find((u: any) => u.id === apiKey.created_by);
    if (creator) {
      role = creator.role;
    }
  }

  return { apiKey, role };
};

/**
 * Resolves the authenticated principal from a Bearer token:
 *  - API keys (current rhlz- / rvn- prefixes) -> { isApiKey, scopes }
 *  - JWTs -> decoded payload, with the user re-validated against users.json
 *    (existence + passwordVersion) so deleted/demoted accounts lose access.
 */
const authenticateToken = async (token: string): Promise<{ user?: any; error?: string; status?: number }> => {
  if (isApiKeyToken(token)) {
    const result = await loadApiKey(token);
    if (result.error) return { error: result.error, status: result.status };
    return {
      user: {
        id: result.apiKey.created_by,
        role: result.role,
        isApiKey: true,
        scopes: result.apiKey.scopes || [],
      },
    };
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (decoded.id !== "temp-admin") {
      const { readJSON } = await import("../services/db.js");
      const users = (await readJSON("users.json")) || [];
      const user = users.find((u: any) => u.id === decoded.id);
      if (!user) {
        return { error: "User not found", status: 401 };
      }
      if ((user.passwordVersion || 0) !== (decoded.passwordVersion || 0)) {
        return { error: "Session expired", status: 401 };
      }
      // Role changes are honored immediately instead of trusting the token
      // role; legacy accounts without a stored role keep their token role.
      if (typeof user.role === "string" && user.role.length > 0) {
        decoded.role = user.role;
      }
    }
    return { user: decoded };
  } catch (err) {
    return { error: "Invalid token", status: 401 };
  }
};

/** Resolves the session JWT from the httpOnly cookie (browser sessions). */
function tokenFromCookie(req: Request): string | null {
  const cookie = (req as any).cookies?.rhlz_session;
  return typeof cookie === "string" && cookie.length > 0 ? cookie : null;
}

export const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader && authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;
  const cookieToken = bearerToken ? null : tokenFromCookie(req);
  const token = bearerToken || cookieToken;
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as any).authVia = cookieToken && !bearerToken ? "cookie" : "bearer";

  try {
    const { user, error, status } = await authenticateToken(token);
    if (!user) {
      res.status(status || 401).json({ error: error || "Unauthorized" });
      return;
    }

    if (user.role !== "admin" && user.role !== "owner") {
      res.status(403).json({ error: "Forbidden: Admin access only" });
      return;
    }

    // API keys must carry full access (or the explicit "admin" scope) to hit admin routes.
    if (user.isApiKey) {
      const scopes: string[] = user.scopes || [];
      if (!scopes.includes("*") && !scopes.includes("admin")) {
        res.status(403).json({ error: "Forbidden: API key lacks admin scope" });
        return;
      }
    }

    (req as any).user = user;
    next();
  } catch (err) {
    res.status(500).json({ error: "Internal Server Error" });
  }
};

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader && authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;
  const cookieToken = bearerToken ? null : tokenFromCookie(req);
  const token = bearerToken || cookieToken;
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as any).authVia = cookieToken && !bearerToken ? "cookie" : "bearer";

  try {
    const { user, error, status } = await authenticateToken(token);
    if (!user) {
      res.status(status || 401).json({ error: error || "Unauthorized" });
      return;
    }

    // RHLZ: API keys are fail-closed. A key must declare a usable scope
    // ("*" for full access, or the coarse read/write/server/admin scopes);
    // keys with empty/unknown scopes are rejected everywhere.
    if (user.isApiKey) {
      const scopes: string[] = user.scopes || [];
      if (!scopes.some((sc) => ["*", "read", "write", "server", "admin"].includes(sc))) {
        res.status(403).json({ error: "Forbidden: API key has no valid scopes" });
        return;
      }
    }

    (req as any).user = user;
    next();
  } catch (err) {
    res.status(500).json({ error: "Internal Server Error" });
  }
};
