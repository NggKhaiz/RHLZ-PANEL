import { test } from "node:test";
import assert from "node:assert";
import { recordAuthFailure, clearAuthFailures, authLockRemaining } from "../src/server/middleware/rateLimit.js";

test("progressive lockout escalates and clears", () => {
  recordAuthFailure("alice");
  const l1 = authLockRemaining("alice");
  assert.ok(l1 > 0 && l1 <= 60_000, `first lockout ~60s, got ${l1}`);
  clearAuthFailures("alice");
  assert.strictEqual(authLockRemaining("alice"), 0);
});

test("lockout grows with consecutive failures (1m -> 2m)", async () => {
  clearAuthFailures("bob");
  // simulate failures spaced beyond the lock (direct calls, no limiter between)
  for (let i = 0; i < 2; i++) {
    recordAuthFailure("bob");
    await new Promise((r) => setTimeout(r, 10));
  }
  const rem = authLockRemaining("bob");
  assert.ok(rem > 60_000, `second-stage lockout should exceed 60s, got ${rem}`);
});
