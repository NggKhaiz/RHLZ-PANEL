import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import qrcode from "qrcode";
import { readJSON, writeJSON } from "../services/db.js";
import { getJwtSecret, getJwtExpires } from "../config.js";
import { encryptSecret, decryptSecret } from "../services/secretBox.js";
import { generateTotpSecret, buildTotpUri, verifyTotpCode, generateRecoveryCodes, verifyRecoveryCode } from "../services/totp.js";
import { audit } from "../services/audit.js";
import { recordAuthFailure, clearAuthFailures } from "../middleware/rateLimit.js";
import { setSessionCookies } from "../services/session.js";

const JWT_SECRET = getJwtSecret();

// Minimal in-memory replay guard: prevents the same TOTP code from being
// accepted twice within the same 30s window (per user, per process).
const totpReplay = new Map<string, { window: number; at: number }>();
const REPLAY_TTL_MS = 5 * 60 * 1000;

function currentTotpWindow(): number {
  return Math.floor(Date.now() / 1000 / 30);
}

function signToken(user: any): string {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, passwordVersion: user.passwordVersion || 0 },
    JWT_SECRET,
    { expiresIn: getJwtExpires() }
  );
}

function signTemp2faToken(user: any): string {
  return jwt.sign(
    { id: user.id, scope: "2fa", passwordVersion: user.passwordVersion || 0 },
    JWT_SECRET,
    { expiresIn: "5m" }
  );
}

function loadUserById(id: string) {
  return readJSON("users.json").then((users: any[]) => (users || []).find((u) => u.id === id));
}

/** Step 1 — generate secret + QR + recovery codes (not yet enabled). */
export const setup2fa = async (req: Request, res: Response) => {
  try {
    const me = (req as any).user;
    const user = await loadUserById(me.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.totp?.enabled) return res.status(400).json({ error: "Two-factor authentication is already enabled" });

    const secret = generateTotpSecret();
    const { plain, hashed } = generateRecoveryCodes(10);
    const label = user.username || user.id;

    user.totp = {
      enabled: false,
      pendingSecretEnc: encryptSecret(secret),
      recoveryCodes: hashed,
      createdAt: new Date().toISOString(),
    };

    const users: any[] = (await readJSON("users.json")) || [];
    const idx = users.findIndex((u: any) => u.id === user.id);
    if (idx !== -1) users[idx] = user;
    await writeJSON("users.json", users);

    const uri = buildTotpUri(secret, label);
    const qr = await qrcode.toDataURL(uri);

    void audit("auth.2fa.setup", { userId: user.id });
    res.json({ secret, uri, qr, recoveryCodes: plain, label });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to start 2FA setup" });
  }
};

/** Step 2 — confirm a code from the authenticator app; activate 2FA. */
export const verify2faSetup = async (req: Request, res: Response) => {
  try {
    const me = (req as any).user;
    const { code } = req.body;
    if (!code || typeof code !== "string") return res.status(400).json({ error: "Verification code is required" });

    const user = await loadUserById(me.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.totp?.enabled) return res.status(400).json({ error: "Two-factor authentication is already enabled" });
    if (!user.totp?.pendingSecretEnc) return res.status(400).json({ error: "No pending 2FA setup found" });

    const secret = decryptSecret(user.totp.pendingSecretEnc);
    if (!verifyTotpCode(secret, code)) return res.status(401).json({ error: "Invalid verification code" });

    user.totp.enabled = true;
    user.totp.secretEnc = user.totp.pendingSecretEnc;
    delete user.totp.pendingSecretEnc;

    const users: any[] = (await readJSON("users.json")) || [];
    const idx = users.findIndex((u: any) => u.id === user.id);
    if (idx !== -1) users[idx] = user;
    await writeJSON("users.json", users);

    void audit("auth.2fa.enabled", { userId: user.id });
    res.json({ success: true, message: "Two-factor authentication enabled" });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to verify 2FA code" });
  }
};

/** Disable 2FA (requires a valid code from the authenticator app). */
export const disable2fa = async (req: Request, res: Response) => {
  try {
    const me = (req as any).user;
    const { code } = req.body;
    if (!code || typeof code !== "string") return res.status(400).json({ error: "Verification code is required" });

    const user = await loadUserById(me.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (!user.totp?.enabled || !user.totp.secretEnc) return res.status(400).json({ error: "Two-factor authentication is not enabled" });

    const secret = decryptSecret(user.totp.secretEnc);
    if (!verifyTotpCode(secret, code)) return res.status(401).json({ error: "Invalid verification code" });

    delete user.totp;
    const users: any[] = (await readJSON("users.json")) || [];
    const idx = users.findIndex((u: any) => u.id === user.id);
    if (idx !== -1) users[idx] = user;
    await writeJSON("users.json", users);

    void audit("auth.2fa.disabled", { userId: user.id });
    res.json({ success: true, message: "Two-factor authentication disabled" });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to disable 2FA" });
  }
};

/** Step 2 of login — validate the 2FA code (or a recovery code) and issue the session. */
export const login2fa = async (req: Request, res: Response) => {
  try {
    const { tempToken, code, username } = req.body;
    if (!tempToken || !code) return res.status(400).json({ error: "tempToken and code are required" });

    let payload: any;
    try {
      payload = jwt.verify(tempToken, JWT_SECRET);
    } catch {
      recordAuthFailure(username || "");
      return res.status(401).json({ error: "Session expired. Please sign in again." });
    }
    if (payload.scope !== "2fa") {
      return res.status(401).json({ error: "Invalid session" });
    }

    const user = await loadUserById(payload.id);
    if (!user) return res.status(401).json({ error: "User not found" });
    if ((user.passwordVersion || 0) !== (payload.passwordVersion || 0)) {
      return res.status(401).json({ error: "Session expired. Please sign in again." });
    }
    if (!user.totp?.enabled || !user.totp.secretEnc) {
      return res.status(400).json({ error: "Two-factor authentication is not enabled for this account" });
    }

    const secret = decryptSecret(user.totp.secretEnc);
    const window = currentTotpWindow();

    let accepted = false;
    let consumedRecovery: number | null = null;

    if (verifyTotpCode(secret, code)) {
      // Replay guard: same code must not be accepted twice in the same window.
      const prev = totpReplay.get(user.id);
      if (prev && prev.window === window) {
        return res.status(429).json({ error: "This code was already used. Wait for the next code." });
      }
      totpReplay.set(user.id, { window, at: Date.now() });
      accepted = true;
    } else {
      const idx = await verifyRecoveryCode(code, user.totp.recoveryCodes || []);
      if (idx >= 0) {
        accepted = true;
        consumedRecovery = idx;
      }
    }

    if (!accepted) {
      recordAuthFailure(username || user.username);
      void audit("auth.2fa.failed", { userId: user.id });
      return res.status(401).json({ error: "Invalid two-factor code" });
    }

    // Consume single-use recovery code.
    if (consumedRecovery !== null) {
      user.totp.recoveryCodes.splice(consumedRecovery, 1);
      const users: any[] = (await readJSON("users.json")) || [];
      const idx = users.findIndex((u: any) => u.id === user.id);
      if (idx !== -1) users[idx] = user;
      await writeJSON("users.json", users);
    }

    // Prune stale replay entries occasionally.
    if (totpReplay.size > 1000) {
      for (const [id, e] of totpReplay) if (Date.now() - e.at > REPLAY_TTL_MS) totpReplay.delete(id);
    }

    clearAuthFailures(username || user.username);
    void audit("auth.login", { username: user.username, ip: req.ip, method: "totp" });
    const token = signToken(user);
    setSessionCookies(res, token);
    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to complete 2FA login" });
  }
};
