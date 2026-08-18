import express from "express";
import crypto from "crypto";
import { readJSON } from "../services/db.js";
import { PRODUCT_NAME, PANEL_UI_NAME } from "../../brand.js";
import { requireAuth } from "../middleware/auth.js";
import { createRunLimiter } from "../middleware/rateLimit.js";
import { runGuestCode } from "../controllers/run.js";
import { exec } from "child_process";

const router = express.Router();

router.get("/health", (req, res) => {
  res.json({ status: "ok", product: PRODUCT_NAME, panel: PANEL_UI_NAME, version: "3.2.0" });
});

// Liveness / readiness probes (PaaS health checks; public, no auth).
router.get("/healthz", (req, res) => {
  res.json({ status: "ok" });
});
router.get("/readyz", (req, res) => {
  res.json({ status: "ready" });
});

import authRoutes from "./auth.js";
import serverRoutes from "./servers.js";
import systemRoutes from "./system.js";
import apiKeyRoutes from "./api-keys.js";
import nodeRoutes from "./nodes.js";

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * GitHub Auto-Update Webhook endpoint.
 *
 * SECURITY: fail-closed. The webhook only works when GITHUB_WEBHOOK_SECRET is
 * configured; without it the endpoint is inert (503). When configured we
 * accept either:
 *  - the GitHub style `x-hub-signature-256: sha256=<hmac>` header (verified
 *    with timingSafeEqual over the raw request body), or
 *  - a plain `x-webhook-secret` / `?secret=` value (also constant-time).
 */
router.post("/webhook/github-update", async (req, res) => {
  const configuredSecret = process.env.GITHUB_WEBHOOK_SECRET;

  if (!configuredSecret) {
    return res.status(503).json({
      error: "Update webhook is not configured. Set GITHUB_WEBHOOK_SECRET in the panel environment to enable it.",
    });
  }

  const hubSignature = req.headers["x-hub-signature-256"];
  const webhookSecret = req.headers["x-webhook-secret"];
  const querySecret = req.query.secret;

  let valid = false;

  if (typeof hubSignature === "string") {
    // GitHub: "sha256=<hex hmac of raw body>"
    const provided = hubSignature.trim();
    const rawBody = (req as any).rawBody || Buffer.alloc(0);
    const expected = "sha256=" + crypto.createHmac("sha256", configuredSecret).update(rawBody).digest("hex");
    valid = safeEqual(provided, expected);
  } else if (typeof webhookSecret === "string") {
    valid = safeEqual(webhookSecret, configuredSecret);
  } else if (typeof querySecret === "string") {
    valid = safeEqual(querySecret, configuredSecret);
  }

  if (!valid) {
    return res.status(401).json({ error: "Invalid webhook secret" });
  }

  console.log(`[${PRODUCT_NAME}] GitHub push webhook triggered! Initiating automatic panel update...`);
  res.json({ success: true, message: "Automatic update triggered from GitHub push." });

  setTimeout(() => {
    exec("bash update.sh", (error, stdout, stderr) => {
      if (error) {
        console.error(`[${PRODUCT_NAME} Auto-Update Error]:`, error);
      }
      console.log(`[${PRODUCT_NAME} Auto-Update Output]:\n${stdout}`);
    });
  }, 1000);
});

router.use("/auth", authRoutes);
router.use("/servers", serverRoutes);
router.use("/system", systemRoutes);
router.use("/admin/api-keys", apiKeyRoutes);
router.use("/nodes", nodeRoutes);

// Multi-language code sandbox (auth + per-IP limit).
router.post("/run", requireAuth, createRunLimiter(), runGuestCode);

router.get("/settings", async (req, res) => {
  const settings = await readJSON("settings.json") || {};
  res.json({ 
    panelName: settings.panelName || PANEL_UI_NAME,
    panelLogo: settings.panelLogo || "",
    panelBackgroundImage: settings.panelBackgroundImage || "",
    panelBackgroundBlur: settings.panelBackgroundBlur !== undefined ? settings.panelBackgroundBlur : 10,
    enablePlayit: settings.enablePlayit !== undefined ? settings.enablePlayit : false,
    enableTutorial: settings.enableTutorial !== undefined ? settings.enableTutorial : true,
    enableLoginAnimation: settings.enableLoginAnimation !== undefined ? settings.enableLoginAnimation : true,
    enableRegistration: settings.enableRegistration !== undefined ? settings.enableRegistration : true,
    theme: settings.theme || "red",
    enableGoogleLogin: settings.enableGoogleLogin !== undefined ? settings.enableGoogleLogin : false,
    firebaseApiKey: settings.firebaseApiKey || "",
    firebaseAuthDomain: settings.firebaseAuthDomain || "",
    firebaseProjectId: settings.firebaseProjectId || "",
    firebaseStorageBucket: settings.firebaseStorageBucket || "",
    firebaseMessagingSenderId: settings.firebaseMessagingSenderId || "",
    firebaseAppId: settings.firebaseAppId || "",
    defaultRuntime: settings.defaultRuntime || process.env.DEFAULT_RUNTIME || "docker",
    runtimeLocked: settings.runtimeLocked !== undefined ? settings.runtimeLocked : (process.env.PANEL_RUNTIME_LOCKED === "true" || process.env.PANEL_RUNTIME_LOCKED === "1"),
    isDev: process.env.NODE_ENV === "development" || process.env.PORT === "30000" || process.env.PANEL_DEV_MODE === "true" || process.env.DEV_MODE === "true"
  });
});

export default router;
