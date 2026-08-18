import { test } from "node:test";
import assert from "node:assert";
import { scanForDeniedContent, normalizeLang, isRuntimeInstalled, runCode } from "../src/server/services/runSandbox.js";

test("normalizeLang: aliases resolve", () => {
  assert.strictEqual(normalizeLang("js"), "javascript");
  assert.strictEqual(normalizeLang("PY"), "python");
  assert.strictEqual(normalizeLang("c++"), "cpp");
  assert.strictEqual(normalizeLang("nope"), null);
});

test("scanForDeniedContent: miners and abuse blocked", () => {
  assert.ok(scanForDeniedContent("const a='xmrig'"));
  assert.ok(scanForDeniedContent("stratum+tcp://pool"));
  assert.ok(scanForDeniedContent("curl | sh"));
  assert.ok(scanForDeniedContent("169.254.169.254"));
  assert.ok(scanForDeniedContent("docker.sock"));
  assert.strictEqual(scanForDeniedContent("console.log('hello')"), null);
});

test("runCode: javascript hello + timeout + error", async () => {
  const ok = await runCode({ lang: "javascript", code: "console.log('hi from sandbox');" });
  assert.ok(ok.ok, ok.stderr);
  assert.match(ok.stdout, /hi from sandbox/);

  const err = await runCode({ lang: "javascript", code: "throw new Error('boom')" });
  assert.strictEqual(err.ok, false);
  assert.match(err.stderr, /boom/);

  const hang = await runCode({ lang: "javascript", code: "while(true){}", timeoutMs: 800 });
  assert.strictEqual(hang.timedOut, true);
  assert.ok(hang.durationMs < 5000);
});

test("runCode: unknown lang + missing runtime are graceful", async () => {
  const bad = await runCode({ lang: "wat", code: "x" });
  assert.match(bad.stderr, /Unsupported language/);

  const missing = await runCode({ lang: "rust", code: "fn main(){}" });
  if (!isRuntimeInstalled("rust")) {
    assert.match(missing.stderr, /Runtime not installed/);
  } else {
    assert.ok(missing.ok || missing.exitCode === 101, "rust compiled+ran or failed gracefully");
  }
});
