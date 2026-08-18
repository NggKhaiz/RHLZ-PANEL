import { test } from "node:test";
import assert from "node:assert";
import path from "node:path";
import { resolveServerPath, resolveBackupPath, relJoin } from "../src/server/utils/paths.js";

const BASE = path.resolve(process.cwd(), ".data", "servers", "abc123");

test("resolveServerPath: root and normal paths stay inside", () => {
  for (const p of ["/", "", ".", "/plugins", "/plugins/MyPlugin", "config.yml", "/world/region/r.0.0.mca"]) {
    const r = resolveServerPath("abc123", p);
    assert.ok(r.ok, `expected ok for ${JSON.stringify(p)} -> ${JSON.stringify(r)}`);
    if (r.ok) {
      const rel = path.relative(BASE, r.path);
      assert.ok(!rel.startsWith("..") && !path.isAbsolute(rel), `escaped for ${p}: ${r.path}`);
    }
  }
});

test("resolveServerPath: traversal is always rejected", () => {
  const evil = ["../.env", "../../etc/passwd", "/../../etc", "..\\..\\win", "a/../../b", "%2e%2e/x", "C:\\windows", "a/../..", "..%2f..%2fetc"];
  for (const p of evil) {
    const r = resolveServerPath("abc123", p);
    assert.ok(!r.ok, `expected rejection for ${JSON.stringify(p)} -> ${JSON.stringify(r)}`);
  }
});

test("resolveServerPath: malformed server id rejected", () => {
  for (const id of ["..", "a/b", "", "x;rm"]) {
    assert.ok(!resolveServerPath(id, "/").ok, `id ${id} should be rejected`);
  }
});

test("resolveServerPath: fuzz - random strings never escape", () => {
  const chars = "abc/..\\-_. 123";
  for (let i = 0; i < 500; i++) {
    let s = "";
    const len = 1 + Math.floor(Math.random() * 20);
    for (let j = 0; j < len; j++) s += chars[Math.floor(Math.random() * chars.length)];
    const r = resolveServerPath("abc123", s);
    if (r.ok) {
      const rel = path.relative(BASE, r.path);
      assert.ok(!rel.startsWith("..") && !path.isAbsolute(rel), `fuzz escaped: ${JSON.stringify(s)} -> ${r.path}`);
    }
  }
});

test("resolveBackupPath: traversal rejected, normal ok", () => {
  assert.ok(!resolveBackupPath("abc123", "../users.json").ok);
  assert.ok(resolveBackupPath("abc123", "backup-2026.zip").ok);
});

test("relJoin never normalizes away traversal", () => {
  const joined = relJoin("/", "../../x.zip");
  assert.ok(joined.includes(".."));
  assert.ok(!resolveServerPath("abc123", joined).ok, "relJoin output must still be rejected");
});
