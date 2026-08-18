import { test } from "node:test";
import assert from "node:assert";
import { csrfProtection, generateCsrfToken, readCookie } from "../src/server/middleware/csrf.js";

function makeReq(method: string, authVia: string, header?: string, cookie?: string, hasSession = false) {
  return {
    method,
    headers: header ? { "x-rhlz-csrf": header } : {},
    cookies: hasSession ? { rhlz_session: "sess", rhlz_csrf: cookie } : cookie ? { rhlz_csrf: cookie } : {},
    authVia,
  } as any;
}

test("csrf: requests without a session cookie are not blocked", () => {
  let next = false;
  csrfProtection(makeReq("POST", "bearer"), {} as any, () => { next = true; });
  assert.ok(next);
});

test("csrf: GET requests skip the check", () => {
  let next = false;
  csrfProtection(makeReq("GET", "cookie"), {} as any, () => { next = true; });
  assert.ok(next);
});

test("csrf: cookie-authenticated mutation without header -> 403", () => {
  const res = { status: (c: number) => ({ json: (b: any) => { assert.strictEqual(c, 403); assert.ok(b.error); } }) } as any;
  csrfProtection(makeReq("POST", "cookie", undefined, "abc", true), res, () => { assert.fail("should not call next"); });
});

test("csrf: matching header+cookie passes; mismatch rejected", () => {
  let next = false;
  csrfProtection(makeReq("POST", "cookie", "tok123", "tok123", true), {} as any, () => { next = true; });
  assert.ok(next);

  const res = { status: (c: number) => ({ json: () => { assert.strictEqual(c, 403); } }) } as any;
  csrfProtection(makeReq("POST", "cookie", "tok123", "other", true), res, () => { assert.fail("mismatch must fail"); });
});

test("csrf: token generator + cookie parser helpers", () => {
  assert.strictEqual(generateCsrfToken().length, 48);
  assert.strictEqual(readCookie("a=1; rhlz_session=abc123; b=2", "rhlz_session"), "abc123");
  assert.strictEqual(readCookie("a=1", "rhlz_session"), null);
});
