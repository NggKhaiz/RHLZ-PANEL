import { test } from "node:test";
import assert from "node:assert";
import fs from "fs-extra";
import path from "node:path";
import { VERSION, PRODUCT_NAME, PANEL_UI_NAME } from "../src/brand.js";

test("VERSION is 3.1.0 and matches package.json", async () => {
  assert.strictEqual(VERSION, "3.1.0");
  const pkg = await fs.readJson(path.join(process.cwd(), "package.json"));
  assert.strictEqual(pkg.version, VERSION);
});

test("health payload constants match brand", () => {
  assert.strictEqual(PRODUCT_NAME, "RHLZ");
  assert.strictEqual(PANEL_UI_NAME, "RHLZ Panel");
});

test("webhook handler does not accept query secret", async () => {
  const src = await fs.readFile(path.join(process.cwd(), "src/server/routes/api.ts"), "utf8");
  assert.ok(!src.includes("query.secret"));
  assert.ok(!src.includes("req.query.secret"));
});

test("install.sh has no weak secret fallback and uses rhlz-panel pm2 name", async () => {
  const src = await fs.readFile(path.join(process.cwd(), "install.sh"), "utf8");
  assert.ok(!src.includes("rhlz_secret_key_"));
  assert.ok(src.includes('--name "${PM2_NAME}"') || src.includes("rhlz-panel"));
  assert.ok(src.includes("RHLZ_SESSION_SECRET"));
  assert.ok(src.includes("--yes"));
});

test("local spawn does not spread process.env", async () => {
  const src = await fs.readFile(path.join(process.cwd(), "src/server/services/local.ts"), "utf8");
  assert.ok(!src.includes("...process.env"));
  assert.ok(src.includes("scrubbedEnv"));
});

test("docker MC env does not hardcode RCON admin or UID 0", async () => {
  const src = await fs.readFile(path.join(process.cwd(), "src/server/services/docker.ts"), "utf8");
  assert.ok(!src.includes("RCON_PASSWORD=admin"));
  assert.ok(!src.includes("`UID=0`"));
});

test("server.ts does not force-start with if (true)", async () => {
  const src = await fs.readFile(path.join(process.cwd(), "server.ts"), "utf8");
  assert.ok(!src.includes("if (true)"));
  assert.ok(!src.includes("IS MAIN:"));
  assert.ok(src.includes('TEST_ENV !== "1"'));
});
