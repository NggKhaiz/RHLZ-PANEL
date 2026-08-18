import { test } from "node:test";
import assert from "node:assert";
import { assertSafeDownloadUrl } from "../src/server/utils/ssrf.js";

test("ssrf: blocks loopback/private/link-local/cgnat/ula", async () => {
  const blocked = [
    "http://127.0.0.1:8080/x.jar",
    "http://169.254.169.254/latest/meta-data/",
    "http://10.0.0.5/x.jar",
    "http://192.168.1.1/x.jar",
    "http://172.16.0.1/x.jar",
    "http://100.64.0.1/x.jar",
    "http://[::1]:8080/x.jar",
    "http://[fe80::1]/x.jar",
    "http://[fc00::1]/x.jar",
    "http://localhost:8080/x.jar",
    "ftp://example.com/x.jar",
    "file:///etc/passwd",
  ];
  for (const u of blocked) {
    const r = await assertSafeDownloadUrl(u);
    assert.ok(!r.ok, `should block ${u} -> ${JSON.stringify(r)}`);
  }
});

test("ssrf: allows public urls and public ips", async () => {
  const ok = ["https://api.modrinth.com/v2/project/paper", "http://8.8.8.8/x.jar", "https://github.com/a/b/releases/x.jar"];
  for (const u of ok) {
    const r = await assertSafeDownloadUrl(u);
    assert.ok(r.ok, `should allow ${u}`);
  }
});

test("ssrf: malformed input rejected", async () => {
  assert.ok(!(await assertSafeDownloadUrl("")).ok);
  assert.ok(!(await assertSafeDownloadUrl("not a url")).ok);
  assert.ok(!(await assertSafeDownloadUrl("x".repeat(3000))).ok);
});
