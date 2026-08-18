/**
 * RHLZ — minimal per-server schedule runner.
 *
 * Schedules are plain entries in settings.json (admin-managed), e.g.:
 *   schedules: [{ id, serverId, action: "start"|"stop"|"restart", time: "HH:MM", enabled }]
 *
 * The keeper loop calls `runDueSchedules()` once a minute. This is a process
 * manager, not an OS scheduler — no cron, no systemd. Start/stop/restart are
 * supported; backup-on-schedule is deferred (WONTFIX) because it duplicates
 * the HTTP backup path.
 */
import { readJSON, writeJSON } from "./db.js";
import { panelEvents } from "../events.js";
import { audit } from "./audit.js";
import { startServerRuntime, stopServerRuntime, restartServerRuntime } from "./runtime.js";
import { isMinecraftSoftware } from "./minecraft.js";

export interface ScheduleEntry {
  id: string;
  serverId: string;
  action: "start" | "stop" | "restart";
  time: string; // "HH:MM" 24-hour
  enabled: boolean;
}

const lastRun = new Map<string, number>(); // schedule id -> epoch ms of last trigger

export function parseScheduleTime(t: string): { h: number; m: number } | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(t || "").trim());
  if (!m) return null;
  return { h: parseInt(m[1], 10), m: parseInt(m[2], 10) };
}

/** True when `now` falls inside the minute window for the schedule's time. */
export function isDue(entry: ScheduleEntry, now: Date): boolean {
  if (!entry.enabled) return false;
  const parsed = parseScheduleTime(entry.time);
  if (!parsed) return false;
  const hhmm = now.getHours() * 60 + now.getMinutes();
  const target = parsed.h * 60 + parsed.m;
  return hhmm === target;
}

async function power(serverId: string, action: string): Promise<void> {
  const servers: any[] = (await readJSON("servers.json")) || [];
  const idx = servers.findIndex((s) => s.id === serverId);
  if (idx === -1) return;
  const server = servers[idx];
  if (server.runtimeType === "local" && !isMinecraftSoftware(server.type) && !server.startupCommand) {
    return; // generic local runtimes require a startup command; skip silently
  }
  switch (action) {
    case "start":
      if (!server.containerId) server.containerId = await startServerRuntime(server);
      await startServerRuntime(server);
      server.status = "online";
      break;
    case "stop":
      await stopServerRuntime(server);
      server.status = "offline";
      break;
    case "restart":
      await restartServerRuntime(server);
      server.status = "online";
      break;
    default:
      return;
  }
  server.startedAt = server.status === "online" ? new Date().toISOString() : null;
  servers[idx] = server;
  await writeJSON("servers.json", servers);
}

/** Runs every schedule whose HH:MM matches the current minute (deduped). */
export async function runDueSchedules(now: Date = new Date()): Promise<number> {
  let ran = 0;
  try {
    const settings = (await readJSON("settings.json")) || {};
    const schedules: ScheduleEntry[] = Array.isArray(settings.schedules) ? settings.schedules : [];
    for (const entry of schedules) {
      if (!isDue(entry, now)) continue;
      const last = lastRun.get(entry.id) || 0;
      if (now.getTime() - last < 90_000) continue; // dedupe within the minute window
      lastRun.set(entry.id, now.getTime());
      try {
        await power(entry.serverId, entry.action);
        await audit("schedule.ran", { scheduleId: entry.id, serverId: entry.serverId, action: entry.action });
        panelEvents.emit("log", entry.serverId, `[RHLZ] Scheduled ${entry.action} triggered.\r\n`);
        ran++;
      } catch (e) {
        await audit("schedule.failed", { scheduleId: entry.id, serverId: entry.serverId, action: entry.action, error: (e as Error).message });
      }
    }
  } catch {}
  return ran;
}
