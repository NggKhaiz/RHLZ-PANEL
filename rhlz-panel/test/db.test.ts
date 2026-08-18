import { test } from "node:test";
import assert from "node:assert";
import fs from "fs-extra";
import path from "node:path";
import { writeJSON, readJSON, updateJSON } from "../src/server/services/db.js";

const F = "test_db_file.json";

test("db: write + read round trip", async () => {
  await writeJSON(F, [{ id: "a", n: 1 }]);
  const d = await readJSON(F);
  assert.deepStrictEqual(d, [{ id: "a", n: 1 }]);
  assert.ok(await fs.pathExists(path.join(process.cwd(), ".data", F + ".bak")));
});

test("db: updateJSON serializes concurrent read-modify-write", async () => {
  await writeJSON(F, []);
  await Promise.all(
    Array.from({ length: 20 }, (_, i) => updateJSON(F, (arr: any[]) => { arr.push(i); return arr; }))
  );
  const d = await readJSON(F);
  assert.strictEqual(d.length, 20, "no lost updates under concurrency");
});

test("db: readJSON returns null for missing/corrupt", async () => {
  assert.strictEqual(await readJSON("does_not_exist.json"), null);
  const p = path.join(process.cwd(), ".data", F);
  await fs.writeFile(p, "{corrupt");
  assert.strictEqual(await readJSON(F), null);
});

test.after(async () => {
  const p = path.join(process.cwd(), ".data", F);
  await fs.remove(p).catch(() => {});
  await fs.remove(p + ".bak").catch(() => {});
});
