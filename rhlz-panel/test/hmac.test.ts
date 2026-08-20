import { test } from "node:test";
import assert from "node:assert";
import { signRequest, verifyRequestSign } from "../src/server/utils/hmac.js";
import { parseArgv } from "../src/server/utils/argv.js";
import { getSoftware, isKnownSoftware, SOFTWARE_TYPES } from "../src/server/services/softwareCatalog.js";
import { scrubbedEnv } from "../src/server/services/local.js";

test("hmac: valid signature accepted", () => {
  const date = new Date().toISOString();
  const sign = signRequest("secret", "POST", "/v1.41/containers/json", date, "{}");
  assert.ok(verifyRequestSign({ secret: "secret", method: "POST", path: "/v1.41/containers/json", date, sign, body: "{}" }));
});

test("hmac: wrong key rejected", () => {
  const date = new Date().toISOString();
  const sign = signRequest("secret", "GET", "/health", date, "");
  assert.ok(!verifyRequestSign({ secret: "other", method: "GET", path: "/health", date, sign, body: "" }));
});

test("hmac: skew > 5 min rejected", () => {
  const date = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const sign = signRequest("secret", "GET", "/x", date, "");
  assert.ok(!verifyRequestSign({ secret: "secret", method: "GET", path: "/x", date, sign, body: "" }));
});

test("parseArgv honors quotes", () => {
  assert.deepStrictEqual(parseArgv('java -jar "my server.jar" --nogui'), ["java", "-jar", "my server.jar", "--nogui"]);
});

test("catalog contains required minecraft and proxy ids", () => {
  for (const id of ["paper", "spigot", "bukkit", "purpur", "folia", "vanilla", "forge", "fabric", "neoforge", "quilt", "mohist", "arclight", "custom", "velocity", "bungeecord", "waterfall"]) {
    assert.ok(isKnownSoftware(id), id);
  }
  assert.strictEqual(getSoftware("paper")?.family, "minecraft");
  assert.ok(SOFTWARE_TYPES.length >= 20);
});

test("scrubbedEnv does not include session secret", () => {
  const prev = process.env.RHLZ_SESSION_SECRET;
  process.env.RHLZ_SESSION_SECRET = "leaked-secret-value";
  const env = scrubbedEnv({ PORT: "25565" });
  assert.strictEqual((env as any).RHLZ_SESSION_SECRET, undefined);
  assert.strictEqual(env.PORT, "25565");
  if (prev === undefined) delete process.env.RHLZ_SESSION_SECRET;
  else process.env.RHLZ_SESSION_SECRET = prev;
});
