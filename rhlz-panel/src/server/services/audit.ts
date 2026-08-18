/**
 * RHLZ — append-only audit log.
 * JSONL lines in .data/logs/audit.log (0600). Never throws: audit failures
 * must not take down panel requests. Callers pass an event name + metadata.
 */
import fs from "fs-extra";
import path from "path";

let initialized = false;

function auditFile(): string {
  return path.join(process.cwd(), ".data", "logs", "audit.log");
}

function ensureReady(): void {
  if (initialized) return;
  try {
    fs.ensureDirSync(path.dirname(auditFile()));
    if (!fs.existsSync(auditFile())) {
      fs.writeFileSync(auditFile(), "", { mode: 0o600 });
    }
    try {
      fs.chmodSync(auditFile(), 0o600);
    } catch {}
    initialized = true;
  } catch {
    initialized = false;
  }
}

export async function audit(event: string, meta: Record<string, unknown> = {}): Promise<void> {
  try {
    ensureReady();
    const line = JSON.stringify({ t: new Date().toISOString(), event, ...meta });
    await fs.appendFile(auditFile(), line + "\n");
  } catch {
    // best-effort; never throw
  }
}
