import { test } from "node:test";
import assert from "node:assert";
import { TOTP } from "otpauth";
import { generateTotpSecret, verifyTotpCode, generateRecoveryCodes, verifyRecoveryCode } from "../src/server/services/totp.js";
import { encryptSecret, decryptSecret } from "../src/server/services/secretBox.js";

test("totp: generated code verifies; wrong code rejected", () => {
  const secret = generateTotpSecret();
  const totp = new TOTP({ issuer: "RHLZ", label: "t", algorithm: "SHA1", digits: 6, period: 30, secret });
  const code = totp.generate();
  assert.strictEqual(verifyTotpCode(secret, code), true);
  assert.strictEqual(verifyTotpCode(secret, "000000"), false);
});

test("secretBox: roundtrip + tamper detection", () => {
  const enc = encryptSecret("JBSWY3DPEHPK3PXP");
  assert.notStrictEqual(enc, "JBSWY3DPEHPK3PXP");
  assert.strictEqual(decryptSecret(enc), "JBSWY3DPEHPK3PXP");
  const [iv, tag, data] = enc.split(":");
  assert.throws(() => decryptSecret(`${iv}:${tag}:AAAA`)); // corrupted ciphertext
});

test("recovery codes: 10 generated, verify matches, wrong rejected", async () => {
  const { plain, hashed } = generateRecoveryCodes(10);
  assert.strictEqual(plain.length, 10);
  assert.strictEqual(hashed.length, 10);
  assert.ok(hashed.every((h) => h.startsWith("$2")));
  const idx = await verifyRecoveryCode(plain[3], hashed);
  assert.strictEqual(idx, 3);
  assert.strictEqual(await verifyRecoveryCode("RVN-NOTACODE", hashed), -1);
});
