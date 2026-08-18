import { test } from "node:test";
import assert from "node:assert";
import fs from "fs-extra";
import path from "node:path";
import { scanForMinerSignatures } from "../src/server/utils/minerScan.js";

const TMP = path.join(process.cwd(), ".data", "miner-test");

test("miner scan: detects known miner signatures", async () => {
  await fs.ensureDir(TMP);
  const bad = path.join(TMP, "evil.jar");
  await fs.writeFile(bad, Buffer.concat([Buffer.from("PK\x03\x04 normal jar bytes "), Buffer.from("XMRig stratum+tcp://pool"), Buffer.alloc(64)]));
  const r = await scanForMinerSignatures(bad);
  assert.strictEqual(r.blocked, true);
  assert.ok(r.label);
});

test("miner scan: benign jar passes", async () => {
  await fs.ensureDir(TMP);
  const good = path.join(TMP, "ok.jar");
  await fs.writeFile(good, Buffer.concat([Buffer.from("PK\x03\x04 normal plugin bytes "), Buffer.alloc(128)]));
  const r = await scanForMinerSignatures(good);
  assert.strictEqual(r.blocked, false);
});

test.after(async () => { await fs.remove(TMP).catch(() => {}); });
