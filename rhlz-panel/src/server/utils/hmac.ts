import crypto from "crypto";

const SKEW_MS = 5 * 60 * 1000;

export function sha256Hex(body: Buffer | string): string {
  return crypto.createHash("sha256").update(body || "").digest("hex");
}

export function signRequest(secret: string, method: string, path: string, date: string, body: Buffer | string): string {
  const payload = `${method.toUpperCase()}\n${path}\n${date}\n${sha256Hex(body)}`;
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export function verifyRequestSign(opts: {
  secret: string;
  method: string;
  path: string;
  date?: string;
  sign?: string;
  body?: Buffer | string;
  now?: number;
}): boolean {
  const { secret, method, path, date, sign, body = "", now = Date.now() } = opts;
  if (!date || !sign) return false;
  const ts = Date.parse(date);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > SKEW_MS) return false;
  const expected = signRequest(secret, method, path, date, body);
  const a = Buffer.from(String(sign));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
