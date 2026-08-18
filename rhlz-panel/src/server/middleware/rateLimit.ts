import { Request, Response, NextFunction } from "express";
import { audit } from "../services/audit.js";

interface Bucket {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_PER_IP = 40;
const MAX_PER_ACCOUNT = 10;

const ipBuckets = new Map<string, Bucket>();
const accountBuckets = new Map<string, Bucket>();

// Progressive lockout state: consecutive auth failures per account escalate
// the lockout duration (1m, 2m, 4m, ... capped at 1h).
const failureTracker = new Map<string, { count: number; lockUntil: number }>();

function prune(map: Map<string, Bucket>, now: number) {
  for (const [key, bucket] of map) {
    if (bucket.resetAt < now) map.delete(key);
  }
}

function clientIp(req: Request): string {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) return xff.split(",")[0].trim();
  if (Array.isArray(xff) && xff.length && typeof xff[0] === "string") return xff[0].split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

function touch(bucketMap: Map<string, Bucket>, key: string, max: number, now: number): boolean {
  const existing = bucketMap.get(key);
  if (existing) {
    if (existing.resetAt < now) {
      bucketMap.set(key, { count: 1, resetAt: now + WINDOW_MS });
      return true;
    }
    if (existing.count >= max) return false;
    existing.count += 1;
    return true;
  }
  bucketMap.set(key, { count: 1, resetAt: now + WINDOW_MS });
  return true;
}

/** Records a failed authentication for `account` and escalates its lockout. */
export function recordAuthFailure(account: string): void {
  const key = account.trim().toLowerCase();
  if (!key) return;
  const cur = failureTracker.get(key) || { count: 0, lockUntil: 0 };
  const count = cur.count + 1;
  // 1m, 2m, 4m, 8m ... capped at 1h of lockout.
  const lockMs = Math.min(60_000 * 2 ** (count - 1), 3_600_000);
  failureTracker.set(key, { count, lockUntil: Date.now() + lockMs });
}

/** Clears the lockout/failure state for `account` after a successful login. */
export function clearAuthFailures(account: string): void {
  failureTracker.delete(account.trim().toLowerCase());
}

/** Milliseconds of lockout remaining for `account` (0 = not locked). */
export function authLockRemaining(account: string): number {
  const key = account.trim().toLowerCase();
  const cur = failureTracker.get(key);
  if (!cur) return 0;
  const rem = cur.lockUntil - Date.now();
  if (rem <= 0) {
    failureTracker.delete(key);
    return 0;
  }
  return rem;
}

/**
 * Sliding-window in-memory rate limiter for authentication endpoints.
 * Limits per client IP and per account name, PLUS progressive per-account
 * lockout with escalating backoff. Intended as a coarse brute-force
 * mitigation; production deployments should additionally front the panel
 * with a real reverse-proxy limiter.
 */
export function createAuthRateLimiter() {
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    prune(ipBuckets, now);
    prune(accountBuckets, now);

    const ip = clientIp(req);
    if (!touch(ipBuckets, `ip:${ip}`, MAX_PER_IP, now)) {
      return res.status(429).json({ error: "Too many attempts from this address. Please try again later." });
    }

    const rawAccount = req.body?.username ?? req.body?.email ?? req.body?.identifier ?? "";
    const account = String(rawAccount).trim().toLowerCase();
    if (account) {
      // Progressive lockout check first (escalating backoff).
      const remaining = authLockRemaining(account);
      if (remaining > 0) {
        void audit("auth.lockout_served", { account, retryAfterSec: Math.ceil(remaining / 1000), ip });
        res.setHeader("Retry-After", String(Math.ceil(remaining / 1000)));
        return res.status(429).json({
          error: `Too many failed attempts for this account. Locked for ${Math.ceil(remaining / 1000)}s.`,
        });
      }
      if (!touch(accountBuckets, `acc:${account}`, MAX_PER_ACCOUNT, now)) {
        return res.status(429).json({ error: "Too many attempts for this account. Please try again later." });
      }
    }

    next();
  };
}

/**
 * Per-IP limiter for the code sandbox (guest execution is expensive).
 */
export function createRunLimiter(limit = 30) {
  const buckets = new Map<string, Bucket>();
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    prune(buckets, now);
    const ip = clientIp(req);
    if (!touch(buckets, `run:${ip}`, limit, now)) {
      return res.status(429).json({ error: "Sandbox rate limit exceeded. Please slow down." });
    }
    next();
  };
}

/**
 * Coarse per-IP limiter for mutating API endpoints (non-GET). Generous limit
 * so legitimate bulk operations are unaffected; stops floods from a single
 * address. Override with MUTATION_LIMIT.
 */
export function createMutationLimiter(limit = 1000) {
  const buckets = new Map<string, Bucket>();
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
    const now = Date.now();
    prune(buckets, now);
    const ip = clientIp(req);
    if (!touch(buckets, `mut:${ip}`, limit, now)) {
      return res.status(429).json({ error: "Too many requests. Please slow down." });
    }
    next();
  };
}
