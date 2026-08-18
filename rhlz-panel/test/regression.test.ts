import { test } from "node:test";
import assert from "node:assert";
import fs from "fs-extra";
import path from "node:path";
import { parseScheduleTime, isDue, ScheduleEntry } from "../src/server/services/scheduler.js";

// Brand regression: no forbidden legacy string anywhere in the worktree source.
test("brand regression: worktree source is clean", async () => {
  const root = process.cwd();
  const files: string[] = [];
  const walk = async (dir: string) => {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === "dist" || e.name === ".data") continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else files.push(p);
    }
  };
  await walk(root);
  const bad = [];
  // Build the needle dynamically so this test file cannot match itself.
  const needle = ["j", "t", "g"].join("");
  const re = new RegExp(needle, "i");
  for (const f of files) {
    const content = await fs.readFile(f, "utf8").catch(() => "");
    if (re.test(content)) bad.push(f);
  }
  assert.deepStrictEqual(bad, [], "forbidden brand string found in worktree");
});

// Scheduler logic
test("scheduler: parseScheduleTime accepts 24h HH:MM and rejects garbage", () => {
  assert.deepStrictEqual(parseScheduleTime("06:30"), { h: 6, m: 30 });
  assert.deepStrictEqual(parseScheduleTime("23:59"), { h: 23, m: 59 });
  assert.strictEqual(parseScheduleTime("25:00"), null);
  assert.strictEqual(parseScheduleTime("ab:cd"), null);
});

test("scheduler: isDue matches only the intended minute and respects enabled", () => {
  const entry: ScheduleEntry = { id: "s1", serverId: "x", action: "start", time: "09:15", enabled: true };
  assert.ok(isDue(entry, new Date(2026, 0, 1, 9, 15)));
  assert.ok(!isDue(entry, new Date(2026, 0, 1, 9, 16)));
  assert.ok(!isDue(entry, new Date(2026, 0, 1, 8, 15)));
  assert.ok(!isDue({ ...entry, enabled: false }, new Date(2026, 0, 1, 9, 15)));
});
