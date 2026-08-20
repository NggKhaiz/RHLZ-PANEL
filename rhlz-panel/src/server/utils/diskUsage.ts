import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";

const execFileAsync = promisify(execFile);
const cache = new Map<string, { gb: number; at: number }>();
const TTL_MS = 15_000;

/** Disk usage of a server data directory in GB, cached 15s. */
export async function serverDirDiskGb(serverId: string): Promise<number> {
  const dir = path.join(process.cwd(), ".data", "servers", serverId);
  const hit = cache.get(dir);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.gb;
  try {
    const { stdout } = await execFileAsync("du", ["-sb", dir], { timeout: 8000 });
    const bytes = parseInt(String(stdout).trim().split(/\s+/)[0], 10);
    const gb = Number.isFinite(bytes) ? bytes / (1024 * 1024 * 1024) : 0;
    cache.set(dir, { gb, at: Date.now() });
    return gb;
  } catch {
    cache.set(dir, { gb: 0, at: Date.now() });
    return 0;
  }
}
