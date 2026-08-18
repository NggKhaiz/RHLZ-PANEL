/*
 *  ██████╗  █████╗ ██╗   ██╗███████╗███╗   ██╗    ██╗  ██╗██╗   ██╗██████╗
 * ██╔══██╗██╔══██╗██║   ██║██╔════╝████╗  ██║    ██║  ██║██║   ██║██╔══██╗
 * ██████╔╝███████║██║   ██║█████╗  ██╔██╗ ██║    ███████║██║   ██║██████╔╝
 * ██╔══██╗██╔══██║╚██╗ ██╔╝██╔══╝  ██║╚██╗██║    ██╔══██║██║   ██║██╔══██╗
 * ██║  ██║██║  ██║ ╚████╔╝ ███████╗██║ ╚████║    ██║  ██║╚██████╔╝██████╔╝
 * ╚═╝  ╚═╝╚═╝  ╚═╝  ╚═══╝  ╚══════╝╚═╝  ╚═══╝    ╚═╝  ╚═╝ ╚═════╝ ╚═════╝
 *  RHLZ · Compact control plane for game servers and jailed code runtimes.
 *  © 2026 RHLZ. All rights reserved.
 *  (Derived from an MIT-licensed upstream panel by Jishnu, see LICENSE)
 */
import "dotenv/config";
import express from "express";
import path from "path";
import cors from "cors";
import compression from "compression";
import cookieParser from "cookie-parser";
import { csrfProtection, readCookie } from "./src/server/middleware/csrf.js";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import fs from "fs-extra";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { getJwtSecret, getAllowedOrigins, isProduction } from "./src/server/config.js";
import { canAccessServer } from "./src/server/middleware/serverAccess.js";
import { createMutationLimiter } from "./src/server/middleware/rateLimit.js";
import { PRODUCT_NAME, PANEL_UI_NAME, VERSION, COPYRIGHT, ASCII_BANNER } from "./src/brand.js";

const app = express();
app.use(cookieParser());
app.set("trust proxy", true);
app.disable("x-powered-by");
const httpServer = createServer(app);

// Correlation IDs for forensics: honor an incoming X-Request-Id or mint one.
app.use((req, res, next) => {
  const incoming = req.headers["x-request-id"];
  const id = typeof incoming === "string" && /^[A-Za-z0-9-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
  (req as any).id = id;
  res.setHeader("X-Request-Id", id);
  next();
});

// ---------------------------------------------------------------------------
// CORS policy: same-origin / configured origins only (never wildcard).
// ---------------------------------------------------------------------------
const allowedOrigins = getAllowedOrigins();
const originCheck = (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
  if (!origin) return cb(null, true); // same-origin / non-browser clients
  if (allowedOrigins.includes(origin)) return cb(null, true);
  if (!isProduction() && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return cb(null, true);
  }
  return cb(null, false);
};

export const io = new SocketIOServer(httpServer, {
  cors: { origin: originCheck, credentials: true },
});
app.set("io", io);

// Initialize data folders
const DATA_DIR = path.join(process.cwd(), ".data");
const SERVERS_DIR = path.join(DATA_DIR, "servers");
const BACKUPS_DIR = path.join(process.cwd(), "backups");

fs.ensureDirSync(DATA_DIR);
fs.ensureDirSync(SERVERS_DIR);
fs.ensureDirSync(BACKUPS_DIR);
fs.ensureDirSync(path.join(DATA_DIR, "temp"));

if (!fs.existsSync(path.join(DATA_DIR, "users.json"))) fs.writeFileSync(path.join(DATA_DIR, "users.json"), "[]");
if (!fs.existsSync(path.join(DATA_DIR, "servers.json"))) fs.writeFileSync(path.join(DATA_DIR, "servers.json"), "[]");
if (!fs.existsSync(path.join(DATA_DIR, "settings.json"))) fs.writeFileSync(path.join(DATA_DIR, "settings.json"), "{}");

import { attachServerRuntimeSocket, getServerRuntimeLogs } from "./src/server/services/runtime.js";
import { reapOrphanedLocalProcesses } from "./src/server/services/local.js";
import { startKeeper, verifyDataIntegrity } from "./src/server/services/keeper.js";
import { ensureDataSchema } from "./src/server/services/schema.js";
import { panelEvents } from "./src/server/events.js";
import { readJSON } from "./src/server/services/db.js";

panelEvents.on("log", (serverId, data) => {
  io.to(`server_${serverId}`).emit("log", data);
});

// RHLZ Keeper notices -> all connected clients (surfaced in the
// notifications dropdown).
panelEvents.on("keeper", (notice) => {
  io.emit("keeper_notice", notice);
});


io.use((socket, next) => {
  // Browser sessions authenticate via the httpOnly session cookie;
  // non-browser clients may pass a Bearer JWT in handshake.auth.token.
  const authToken = socket.handshake.auth.token;
  const cookieToken = authToken ? null : readCookie(socket.handshake.headers.cookie, "rhlz_session");
  const token = authToken || cookieToken;
  if (!token) return next(new Error("Authentication error"));
  try {
    const verified = jwt.verify(token, getJwtSecret());
    (socket as any).user = verified;
    next();
  } catch (err) {
    next(new Error("Authentication error"));
  }
});

io.on("connection", (socket) => {
  socket.on("joinServer", async (serverId) => {
    // The user must actually have access to this server before joining its
    // console/log room - otherwise logs leak across accounts.
    try {
      const servers = (await readJSON("servers.json")) || [];
      const server = servers.find((s: any) => s.id === serverId);
      if (!server || !canAccessServer((socket as any).user, server)) {
        socket.emit("error", "Forbidden: you do not have access to this server");
        return;
      }
    } catch (e) {
      socket.emit("error", "Failed to verify server access");
      return;
    }

    socket.join(`server_${serverId}`);

    // Ensure logs are streamed if container is already running
    try {
      const serversJSON = await fs.readFile(path.join(DATA_DIR, "servers.json"), "utf8");
      const servers = JSON.parse(serversJSON);
      const server = Array.isArray(servers) ? servers.find((s: any) => s.id === serverId) : null;
      if (server && server.containerId) {
        const logs = await getServerRuntimeLogs(server);
        if (logs) {
           socket.emit("log", logs.trim() + "\n");
        }
        await attachServerRuntimeSocket(server, serverId);
      }
    } catch (e) {
      console.error(e);
    }
  });
  socket.on("leaveServer", (serverId) => {
    socket.leave(`server_${serverId}`);
  });
});

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Sane JSON body limits (upload bodies are handled by multer, not express.json).
app.use(express.json({
  limit: "25mb",
  verify: (req: any, _res, buf) => { req.rawBody = buf; }, // raw body for webhook HMAC
}));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));
app.use(cors({ origin: originCheck, credentials: true }));
app.use(compression({ threshold: 1024 })); // gzip API + static responses >= 1 KB

// Coarse per-IP flood guard for all mutating /api endpoints (RHLZ).
const mutationLimit = parseInt(process.env.MUTATION_LIMIT || "1000", 10);
app.use("/api", createMutationLimiter(Number.isFinite(mutationLimit) && mutationLimit > 0 ? mutationLimit : 1000));

// Double-submit CSRF protection for cookie-authenticated browser sessions.
app.use("/api", csrfProtection);

// API responses are never cached (freshness); hashed static assets are immutable.
app.use("/api", (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });

// Security headers + harmless product header
app.use((_req, res, next) => {
  res.setHeader("X-Powered-By", PRODUCT_NAME);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (isProduction() && process.env.PANEL_CSP === "true") {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' ws: wss:; script-src 'self' 'unsafe-inline'; frame-ancestors 'none'"
    );
  }
  next();
});

import apiRoutes from "./src/server/routes/api.js";
app.use("/api", apiRoutes);

// Central JSON error handler - never leak stack traces to clients in
// production, always answer with the API's JSON shape.
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (res.headersSent) {
    _next(err);
    return;
  }
  const status =
    err?.status || err?.statusCode || (err?.type === "entity.too.large" ? 413 : 500);
  console.error(`[Error] ${(req as any).id || "-"} ${req.method} ${req.url}:`, err?.message || err);
  res.status(status).json({
    error: isProduction() ? "Internal Server Error" : err?.message || "Internal Server Error",
  });
});

import { initSFTPServer } from "./src/server/services/sftp.js";

async function startServer() {
  // Kill child processes left behind by a previous crashed panel instance.
  const reaped = await reapOrphanedLocalProcesses().catch(() => []);
  if (reaped.length > 0) {
    console.log(`[RHLZ-Keeper] Reaped ${reaped.length} orphaned local server process(es): ${reaped.join(", ")}`);
  }

  // Boot-time data integrity: restore any corrupt .data/*.json from .bak.
  const restored = await verifyDataIntegrity().catch(() => []);
  if (restored.length > 0) {
    console.log(`[RHLZ-Keeper] Data integrity: ${restored.join(", ")}`);
  }

  // Additive schema backfill for records written by older versions.
  const backfilled = await ensureDataSchema().catch(() => []);
  if (backfilled.length > 0) {
    console.log(`[RHLZ] Schema backfilled: ${backfilled.join(", ")}`);
  }

  // Start the periodic housekeeping loop (RHLZ Keeper).
  startKeeper();

  await initSFTPServer();

  if (!isProduction()) {
    // Dev-only: vite is loaded lazily so the production bundle stays lean.
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: ["gtk.qzz.io"] },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(ASCII_BANNER);
    console.log(`${PANEL_UI_NAME} (${PRODUCT_NAME}) v${VERSION} — ${COPYRIGHT}`);
    console.log(`${PRODUCT_NAME} running on port ${PORT}`);
  });
}




// Only start server if not imported as a module in tests
const isMain = 
  (typeof require !== 'undefined' && require.main === module) || 
  (process.argv[1] && process.argv[1].includes('server.ts')) ||
  (process.argv[1] && process.argv[1].includes('server.cjs'));

console.log("IS MAIN:", isMain, "TEST_ENV:", process.env.TEST_ENV);
if (true) {
  startServer();
}


// Graceful shutdown: stop accepting connections, close servers, then exit.
let shuttingDown = false;
function gracefulShutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[RHLZ] ${signal} received - shutting down gracefully...`);
  const force = setTimeout(() => {
    console.error("[RHLZ] Shutdown timed out - forcing exit.");
    process.exit(1);
  }, 8000);
  force.unref();
  httpServer.close(() => {
    console.log("[RHLZ] HTTP server closed.");
    process.exit(0);
  });
  // Give in-flight socket.io connections a moment; the SFTP server closes
  // itself on SIGTERM/SIGINT (see sftp.ts).
}
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
  fs.writeFileSync('crash.log', String(err.stack));
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION:', reason);
  fs.writeFileSync('crash.log', String(reason));
});
