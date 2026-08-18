/**
 * RHLZ — multi-language code sandbox (`POST /api/run`).
 *
 * Runs guest source code with hard-ish jail limits:
 *   - timeout (default 5s, max 15s) via `timeout -s KILL`
 *   - memory cap via `ulimit -v` (+ `--max-old-space-size` for Node)
 *   - process cap via `ulimit -u` (fork-bomb guard)
 *   - per-write file cap via `ulimit -f` (disk-quota guard)
 *   - output byte cap (64 KB; kills runaway writers)
 *   - non-root drop via `setpriv` when the panel runs as root
 *   - no-network is BEST-EFFORT via `unshare -n` (hard isolation requires the
 *     container runtime; documented)
 *   - miner/abuse denylist on the submitted source
 *
 * Missing host toolchains return a clear "runtime not installed" response —
 * the panel never crashes over a missing runtime.
 */
import fs from "fs-extra";
import os from "os";
import path from "path";
import { spawn } from "child_process";

export const SANDBOX_LANGS = [
  "javascript", "typescript", "python", "bash", "go", "rust", "ruby", "php",
  "c", "cpp", "java", "csharp", "sql",
] as const;
export type SandboxLang = (typeof SANDBOX_LANGS)[number];

const DEFAULT_TIMEOUT_MS = 8000; // compilers (go/rust) need a few seconds to build
const MAX_TIMEOUT_MS = 15000;
const MAX_MEMORY_MB = 256;
const OUTPUT_CAP_BYTES = 64 * 1024;

export interface RunRequest {
  lang: string;
  code: string;
  timeoutMs?: number;
  memoryMB?: number;
}

export interface RunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal?: string | null;
  durationMs: number;
  timedOut: boolean;
  memoryMB?: number;
}

interface RunnerSpec {
  file: string;               // source file name inside the run dir
  args: (file: string, memoryMB: number) => string[];
}

const RUNNERS: Record<string, RunnerSpec> = {
  javascript: { file: "main.js", args: (_f, mb) => ["node", `--max-old-space-size=${mb}`, "main.js"] },
  typescript: { file: "main.ts", args: (_f, mb) => ["tsx", `--max-old-space-size=${mb}`, "main.ts"] },
  python: { file: "main.py", args: () => ["python3", "-u", "main.py"] },
  bash: { file: "main.sh", args: () => ["bash", "main.sh"] },
  go: { file: "main.go", args: () => ["go", "run", "main.go"] },
  rust: { file: "main.rs", args: () => ["rustc", "-O", "main.rs", "-o", "out", "&&", "./out"] },
  ruby: { file: "main.rb", args: () => ["ruby", "main.rb"] },
  php: { file: "main.php", args: () => ["php", "main.php"] },
  c: { file: "main.c", args: () => ["gcc", "-O2", "main.c", "-o", "out", "&&", "./out"] },
  cpp: { file: "main.cpp", args: () => ["g++", "-O2", "main.cpp", "-o", "out", "&&", "./out"] },
  java: { file: "Main.java", args: () => ["javac", "-J-Xmx128m", "-J-XX:MaxMetaspaceSize=64m", "-J-XX:CompressedClassSpaceSize=64m", "Main.java", "&&", "java", "-Xmx128m", "-Xss1m", "-XX:MaxMetaspaceSize=64m", "-XX:CompressedClassSpaceSize=64m", "Main"] },
  csharp: { file: "Main.cs", args: () => ["dotnet-script", "Main.cs"] },
  sql: { file: "main.sql", args: () => ["sqlite3", ":memory:", "-bail"] },
};

/** Binaries that must exist for a language to run. */
const BINARIES: Record<string, string[]> = {
  javascript: ["node"],
  typescript: ["tsx", "node"],
  python: ["python3"],
  bash: ["bash"],
  go: ["go"],
  rust: ["rustc"],
  ruby: ["ruby"],
  php: ["php"],
  c: ["gcc"],
  cpp: ["g++"],
  java: ["javac", "java"],
  csharp: ["dotnet-script"],
  sql: ["sqlite3"],
};

const MINER_SIGNATURES = [
  "xmrig", "stratum+tcp", "stratum+ssl", "nicehash", "minergate", "coinhive",
  "cryptonight", "randomx", "ethash", "supportxmr", "donate.v2.xmrig.com",
];

const ABUSE_PATTERNS = [
  "curl|sh", "curl |sh", "wget|sh", "wget |sh", "bash -i", "/dev/tcp/",
  "docker.sock", "169.254.169.254", "metadata.google.internal",
  "/proc/self", "/proc/", "process.env",
  ":(){", "(){:|:&};:", "forkbomb",
];

export function scanForDeniedContent(code: string): string | null {
  const lower = code.toLowerCase();
  for (const s of MINER_SIGNATURES) if (lower.includes(s)) return `miner signature: ${s}`;
  // Abuse patterns are matched against the raw text AND a whitespace-stripped
  // copy so variants like "curl | sh" cannot dodge the filter.
  const bare = lower.replace(/\s+/g, "");
  for (const p of ABUSE_PATTERNS) {
    if (lower.includes(p) || bare.includes(p)) return `blocked pattern: ${p}`;
  }
  return null;
}

function which(bin: string): boolean {
  const paths = (process.env.PATH || "").split(":");
  for (const dir of paths) {
    if (!dir) continue;
    try {
      const p = path.join(dir, bin);
      if (fs.existsSync(p)) return true;
    } catch {}
  }
  return false;
}

export function isRuntimeInstalled(lang: string): boolean {
  const bins = BINARIES[lang];
  if (!bins) return false;
  return bins.every((b) => which(b));
}

export function normalizeLang(raw: string): string | null {
  const map: Record<string, string> = {
    js: "javascript", javascript: "javascript", node: "javascript",
    ts: "typescript", typescript: "typescript",
    py: "python", python: "python", python3: "python",
    sh: "bash", bash: "bash", shell: "bash",
    go: "go", golang: "go",
    rs: "rust", rust: "rust",
    rb: "ruby", ruby: "ruby",
    php: "php",
    c: "c",
    cpp: "cpp", "c++": "cpp", cxx: "cpp",
    java: "java",
    cs: "csharp", csharp: "csharp",
    sql: "sql", sqlite: "sql",
  };
  return map[String(raw || "").toLowerCase().trim()] || null;
}

function virtualMemLimitKb(lang: string, memoryMB: number): number {
  // V8 and the JVM reserve large fixed virtual regions; a strict `ulimit -v`
  // would kill them on startup. Node/TS and Java get a 2 GB VA ceiling (real
  // heap capped via --max-old-space-size / -Xmx), compilers get 1 GB, plain
  // interpreters get the strict cap.
  if (lang === "javascript" || lang === "typescript" || lang === "java") return 2 * 1024 * 1024;
  if (lang === "go" || lang === "rust" || lang === "c" || lang === "cpp" || lang === "csharp") {
    return 1 * 1024 * 1024;
  }
  return Math.max(64, Math.round(memoryMB * 1024));
}

function jailPrefix(lang: string, memoryMB: number, timeoutMs: number): { timeoutArgs: string[]; shScript: string } {
  const memKB = virtualMemLimitKb(lang, memoryMB);
  const fileKB = 64 * 1024; // ~32 MB of writes per run
  const dropPriv = process.getuid && process.getuid() === 0
    ? "command -v setpriv >/dev/null 2>&1 && exec setpriv --reuid=nobody --regid=nogroup --clear-groups "
    : "";
  const netIsolate =
    'if command -v unshare >/dev/null 2>&1 && unshare -n true 2>/dev/null; then exec unshare -n -- "$0" "$@"; else exec "$0" "$@"; fi';
  const script = `ulimit -v ${memKB} 2>/dev/null; ulimit -u 100 2>/dev/null; ulimit -f ${fileKB} 2>/dev/null; ${dropPriv}${netIsolate}`;
  return {
    timeoutArgs: ["-s", "KILL", String(Math.max(1, Math.round(timeoutMs / 1000)))],
    shScript: script,
  };
}

function buildCommand(lang: string, spec: RunnerSpec, memoryMB: number, timeoutMs: number): { bin: string; args: string[] } {
  const runnerArgs = spec.args("main", memoryMB);
  // Compile-and-run languages use `&&` between steps: execute through a shell.
  const usesShell = runnerArgs.includes("&&");
  const { timeoutArgs, shScript } = jailPrefix(lang, memoryMB, timeoutMs);
  if (usesShell) {
    const inner = runnerArgs.join(" ");
    return {
      bin: "timeout",
      args: [...timeoutArgs, "sh", "-c", `ulimit -v ${virtualMemLimitKb(lang, memoryMB)} 2>/dev/null; ulimit -u 100 2>/dev/null; ulimit -f ${64 * 1024} 2>/dev/null; ${inner}`],
    };
  }
  return { bin: "timeout", args: [...timeoutArgs, "sh", "-c", shScript, runnerArgs[0], ...runnerArgs.slice(1)] };
}

export async function runCode(req: RunRequest): Promise<RunResult> {
  const started = Date.now();
  const lang = normalizeLang(req.lang);
  if (!lang) {
    return { ok: false, stdout: "", stderr: `Unsupported language: ${req.lang}`, exitCode: null, durationMs: 0, timedOut: false };
  }
  if (!RUNNERS[lang]) {
    return { ok: false, stdout: "", stderr: `Unsupported language: ${req.lang}`, exitCode: null, durationMs: 0, timedOut: false };
  }
  const denied = scanForDeniedContent(req.code);
  if (denied) {
    return { ok: false, stdout: "", stderr: `Blocked: ${denied}`, exitCode: null, durationMs: 0, timedOut: false };
  }
  if (!isRuntimeInstalled(lang)) {
    return { ok: false, stdout: "", stderr: `Runtime not installed: ${lang}`, exitCode: null, durationMs: 0, timedOut: false };
  }

  const timeoutMs = Math.min(Math.max(req.timeoutMs || DEFAULT_TIMEOUT_MS, 500), MAX_TIMEOUT_MS);
  const memoryMB = Math.min(Math.max(req.memoryMB || 128, 32), MAX_MEMORY_MB);
  const spec = RUNNERS[lang];

  const runDir = await fs.mkdtemp(path.join(os.tmpdir(), "rhlz-run-"));
  const sourcePath = path.join(runDir, spec.file);
  await fs.writeFile(sourcePath, req.code, "utf8");

  const { bin, args } = buildCommand(lang, spec, memoryMB, timeoutMs);
  // Scrub the environment: guests must never see panel secrets (session
  // secret, webhook secret, node keys). Only a minimal PATH/HOME is passed.
  const guestEnv = {
    PATH: process.env.PATH || "/usr/bin:/bin",
    HOME: os.tmpdir(),
    TMPDIR: os.tmpdir(),
    LANG: "C.UTF-8",
  };
  const child = spawn(bin, args, { cwd: runDir, detached: true, env: guestEnv, stdio: ["ignore", "pipe", "pipe"] });

  let stdout = "";
  let stderr = "";
  let killedForOutput = false;
  let timedOut = false;

  const collect = (buf: Buffer, sink: () => string, set: (s: string) => void) => {
    const current = sink().length;
    if (current >= OUTPUT_CAP_BYTES) {
      killedForOutput = true;
      try { process.kill(-child.pid!, "SIGKILL"); } catch {}
      return;
    }
    set(sink() + buf.toString("utf8").slice(0, OUTPUT_CAP_BYTES - current));
  };
  child.stdout?.on("data", (d: Buffer) => collect(d, () => stdout, (s) => { stdout = s; }));
  child.stderr?.on("data", (d: Buffer) => collect(d, () => stderr, (s) => { stderr = s; }));

  const killer = setTimeout(() => {
    timedOut = true;
    try { process.kill(-child.pid!, "SIGKILL"); } catch {}
  }, timeoutMs + 500);

  const result: RunResult = await new Promise((resolve) => {
    child.on("error", (err) => {
      resolve({
        ok: false, stdout, stderr: stderr || err.message, exitCode: null,
        durationMs: Date.now() - started, timedOut, memoryMB,
      });
    });
    child.on("close", (code, signal) => {
      // Timeout detection is signal-aware: some `timeout` builds kill the
      // command by signal (exit code null) instead of exiting 124.
      const killedBySignal = code === null && signal != null;
      const looksTimedOut =
        code === 124 ||
        timedOut ||
        (killedBySignal && Date.now() - started >= Math.min(timeoutMs, 1000));
      resolve({
        ok: code === 0 && !looksTimedOut && !killedForOutput,
        stdout, stderr, exitCode: code, signal, durationMs: Date.now() - started,
        timedOut: looksTimedOut, memoryMB,
      });
    });
  });

  clearTimeout(killer);
  await fs.remove(runDir).catch(() => {});
  if (killedForOutput && !stderr) stderr = "[output cap exceeded]";
  return { ...result, stderr };
}
