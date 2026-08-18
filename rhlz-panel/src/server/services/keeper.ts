/**
 * RHLZ Keeper - scheduled housekeeping service.
 *
 * Keeps the panel clean and stable without ever taking it down:
 *  - temp hygiene (purges stale .data/temp files),
 *  - backup pruning (retention policy per server),
 *  - server log rotation (panel.log rollover),
 *  - disk guard (warn via panelEvents; createServer blocks when critically full),
 *  - data integrity (on boot, corrupt .data/*.json is restored from the
 *    rolling .bak written by db.ts on every successful save).
 *
 * Every keeper task is crash-isolated (try/catch + log) and every action is
 * logged to .data/logs/keeper.log and surfaced through panelEvents
 * ("keeper" -> relayed to clients as "keeper_notice" -> notifications
 * dropdown).
 */
import fs from "fs-extra";
import path from "path";
import { promisify } from "util";
import { exec } from "child_process";
import { readJSON } from "./db.js";
import { panelEvents } from "../events.js";
import { runDueSchedules } from "./scheduler.js";

const execAsync = promisify(exec);

export interface KeeperNotice {
  id: string;
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
  timestamp: string;
  link?: string;
}

interface KeeperSettings {
  enabled?: boolean;
  intervalMinutes?: number;
  tempMaxAgeHours?: number;
  backupRetention?: number;
  diskWarnPercent?: number;
  diskBlockPercent?: number;
  logMaxBytes?: number;
}

const DEFAULTS = {
  enabled: true,
  intervalMinutes: 15,
  tempMaxAgeHours: 24,
  backupRetention: 10,
  diskWarnPercent: 85,
  diskBlockPercent: 95,
  logMaxBytes: 10 * 1024 * 1024,
} as const;

type ResolvedKeeperSettings = {
  enabled: boolean;
  intervalMinutes: number;
  tempMaxAgeHours: number;
  backupRetention: number;
  diskWarnPercent: number;
  diskBlockPercent: number;
  logMaxBytes: number;
};

let lastDiskWarningAt = 0;

function notice(title: string, message: string, type: KeeperNotice["type"], link?: string) {
  const n: KeeperNotice = {
    id: `keeper-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    message,
    type,
    timestamp: new Date().toISOString(),
    link,
  };
  panelEvents.emit("keeper", n);
  console.log(`[RHLZ-Keeper] [${type}] ${title}: ${message}`);
}

async function logKeeper(line: string) {
  try {
    const p = path.join(process.cwd(), ".data", "logs", "keeper.log");
    await fs.ensureDir(path.dirname(p));
    await fs.appendFile(p, `[${new Date().toISOString()}] ${line}\n`);
  } catch {}
}

export async function getKeeperSettings(): Promise<ResolvedKeeperSettings> {
  const settings = (await readJSON("settings.json")) || {};
  const k = (settings.keeper || {}) as Partial<KeeperSettings>;
  return {
    enabled: k.enabled ?? DEFAULTS.enabled,
    intervalMinutes: k.intervalMinutes ?? DEFAULTS.intervalMinutes,
    tempMaxAgeHours: k.tempMaxAgeHours ?? DEFAULTS.tempMaxAgeHours,
    backupRetention: k.backupRetention ?? DEFAULTS.backupRetention,
    diskWarnPercent: k.diskWarnPercent ?? DEFAULTS.diskWarnPercent,
    diskBlockPercent: k.diskBlockPercent ?? DEFAULTS.diskBlockPercent,
    logMaxBytes: k.logMaxBytes ?? DEFAULTS.logMaxBytes,
  };
}

async function diskUsagePercent(): Promise<number> {
  try {
    const { stdout } = await execAsync("df -P . | tail -1");
    const parts = stdout.trim().split(/\s+/);
    const pct = parseInt(parts[4]?.replace("%", "") || "0", 10);
    return Number.isFinite(pct) ? pct : 0;
  } catch {
    return 0;
  }
}

/** True when the host disk is at/above the block threshold (server creation is refused). */
export async function isDiskCriticallyFull(): Promise<boolean> {
  try {
    const settings = await getKeeperSettings();
    return (await diskUsagePercent()) >= settings.diskBlockPercent;
  } catch {
    return false;
  }
}

async function purgeTemp(settings: ResolvedKeeperSettings): Promise<number> {
  const dir = path.join(process.cwd(), ".data", "temp");
  if (!(await fs.pathExists(dir))) return 0;
  const cutoff = Date.now() - settings.tempMaxAgeHours * 3600 * 1000;
  const files = await fs.readdir(dir);
  let removed = 0;
  for (const f of files) {
    try {
      const st = await fs.stat(path.join(dir, f));
      if (st.mtimeMs < cutoff) {
        await fs.remove(path.join(dir, f));
        removed++;
      }
    } catch {}
  }
  return removed;
}

async function pruneBackups(settings: ResolvedKeeperSettings): Promise<number> {
  const dir = path.join(process.cwd(), ".data", "backups");
  if (!(await fs.pathExists(dir))) return 0;
  const servers = await fs.readdir(dir);
  let removed = 0;
  for (const sid of servers) {
    const sdir = path.join(dir, sid);
    try {
      const st = await fs.stat(sdir);
      if (!st.isDirectory()) continue;
      const files = (await fs.readdir(sdir)).filter((f) => f.endsWith(".zip"));
      files.sort((a, b) => {
        const ma = fs.statSync(path.join(sdir, a)).mtimeMs;
        const mb = fs.statSync(path.join(sdir, b)).mtimeMs;
        return mb - ma;
      });
      for (const f of files.slice(settings.backupRetention)) {
        await fs.remove(path.join(sdir, f));
        removed++;
      }
    } catch {}
  }
  return removed;
}

async function rotateServerLogs(settings: ResolvedKeeperSettings): Promise<number> {
  const dir = path.join(process.cwd(), ".data", "servers");
  if (!(await fs.pathExists(dir))) return 0;
  const servers = await fs.readdir(dir);
  let rotated = 0;
  for (const sid of servers) {
    const logPath = path.join(dir, sid, "panel.log");
    try {
      const st = await fs.stat(logPath);
      if (st.size > settings.logMaxBytes) {
        const old1 = `${logPath}.1`;
        const old2 = `${logPath}.2`;
        if (await fs.pathExists(old2)) await fs.remove(old2);
        if (await fs.pathExists(old1)) await fs.rename(old1, old2);
        await fs.rename(logPath, old1);
        rotated++;
      }
    } catch {}
  }
  return rotated;
}

async function checkDisk(settings: ResolvedKeeperSettings) {
  try {
    const pct = await diskUsagePercent();
    if (pct >= settings.diskWarnPercent && Date.now() - lastDiskWarningAt > 60 * 60 * 1000) {
      lastDiskWarningAt = Date.now();
      notice("Disk usage high", `Host storage usage reached ${pct}%. Free space before it affects server creation.`, "warning", "/admin/servers");
    }
  } catch {}
}

/**
 * Boot-time data integrity check: if any core .data/*.json file fails to
 * parse, restore it from the rolling .bak written on every successful save.
 * Never boots into a state that silently overwrites user data - restores are
 * reported, and files without a valid backup are left untouched (readJSON
 * already returns null for them).
 */
export async function verifyDataIntegrity(): Promise<string[]> {
  const restored: string[] = [];
  const files = [
    "users.json", "servers.json", "settings.json",
    "api_keys.json", "sftp_users.json", "wings_nodes.json", "nodes.json",
  ];
  for (const f of files) {
    const p = path.join(process.cwd(), ".data", f);
    if (!(await fs.pathExists(p))) continue;
    try {
      JSON.parse(await fs.readFile(p, "utf8"));
    } catch {
      const bak = `${p}.bak`;
      if (await fs.pathExists(bak)) {
        try {
          const parsed = JSON.parse(await fs.readFile(bak, "utf8"));
          await fs.writeFile(p, JSON.stringify(parsed, null, 2), "utf8");
          restored.push(`${f} (restored from .bak)`);
        } catch {
          restored.push(`${f} (no valid backup)`);
        }
      } else {
        restored.push(`${f} (no backup found)`);
      }
    }
  }
  return restored;
}

/** One full housekeeping pass. Crash-isolated: never takes the panel down. */
export async function runKeeperOnce(reason = "interval"): Promise<void> {
  let settings: ResolvedKeeperSettings;
  try {
    settings = await getKeeperSettings();
  } catch {
    return;
  }
  if (settings.enabled === false) return;

  try {
    const removed = await purgeTemp(settings);
    const pruned = await pruneBackups(settings);
    const rotated = await rotateServerLogs(settings);
    const scheduled = await runDueSchedules();
    if (removed || pruned || rotated) {
      const line = `housekeeping (${reason}): temp_purged=${removed} backups_pruned=${pruned} logs_rotated=${rotated} schedules_ran=${scheduled}`;
      await logKeeper(line);
      if (removed || pruned) {
        notice("Housekeeping complete", `Purged ${removed} stale temp file(s), pruned ${pruned} old backup(s).`, "info");
      }
    }
    await checkDisk(settings);
  } catch (err: any) {
    await logKeeper(`keeper task failed (isolated): ${err?.message || err}`);
  }
}

/** Starts the periodic keeper loop. Boot pass runs immediately. */
export function startKeeper(): void {
  void runKeeperOnce("boot");
  const timer = setInterval(() => void runKeeperOnce("interval"), DEFAULTS.intervalMinutes * 60 * 1000);
  timer.unref?.();
}
