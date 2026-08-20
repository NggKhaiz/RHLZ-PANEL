import { test } from "node:test";
import assert from "node:assert";
import path from "node:path";
import fs from "fs-extra";

test("power-action 409 message is documented in lifecycle controller", async () => {
  const src = await fs.readFile(path.join(process.cwd(), "src/server/controllers/servers.ts"), "utf8");
  assert.ok(src.includes("Another power action is already in progress"));
  assert.ok(src.includes("powerBusy"));
});
