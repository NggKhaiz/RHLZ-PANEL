import React from "react";
import { Link } from "react-router-dom";
import { BookOpen, Terminal, Server, KeyRound, ShieldCheck, Box, Cloud, Rocket, ArrowRight, CheckCircle2 } from "lucide-react";
import { PRODUCT_NAME, PANEL_UI_NAME, VERSION, TAGLINE } from "../brand";

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-muted font-mono text-xs font-bold text-theme-500">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-theme-500">Documentation · Web tutorial</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-foreground">
          {PRODUCT_NAME} Panel — getting started
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{TAGLINE}</p>
      </div>

      <div className="space-y-10">
        {/* 60-second start */}
        <section className="glass-panel rounded-2xl p-6">
          <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-foreground">
            <Terminal className="h-4 w-4 text-theme-500" /> 60-second start
          </h2>
          <div className="space-y-4">
            <Step n="1" title="Install on Linux (no systemd)">
              <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[11px] text-theme-300">bash install.sh --yes --runtime docker --admin admin:ChangeMe_now</code> —
              installs Node, deps, builds the panel, and registers <span className="font-mono">pm2</span> with a
              <span className="font-mono"> @reboot</span> cron for boot persistence. Docker/PaaS users can skip to step 3.
            </Step>
            <Step n="2" title="Configure the environment">
              Copy <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[11px] text-theme-300">.env.example</code> →{" "}
              <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[11px] text-theme-300">.env</code> and set{" "}
              <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[11px] text-theme-300">RHLZ_SESSION_SECRET</code>{" "}
              (a strong random value). Unset, the secure core generates and persists one to <span className="font-mono">.data/secret</span> (0600).
            </Step>
            <Step n="3" title="Run">
              <span className="font-mono">pm2 start dist/server.cjs --name rhlz-panel</span> (or{" "}
              <span className="font-mono">node dist/server.cjs</span>, or your PaaS start command). Open{" "}
              <span className="font-mono">http://&lt;host&gt;:6767</span> and sign in.
            </Step>
            <Step n="4" title="Harden in two minutes">
              <ul className="mt-2 space-y-1">
                <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-theme-500" /> Enable Two-Factor Authentication (TOTP) in <Link className="text-theme-400 underline" to="/account">Account</Link>.</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-theme-500" /> Put the panel behind HTTPS (Caddy/nginx) and set <span className="font-mono">PANEL_CORS_ORIGINS</span>.</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-theme-500" /> Create scoped API keys in <Link className="text-theme-400 underline" to="/api-keys">API Keys</Link> — they are shown once and hashed at rest.</li>
              </ul>
            </Step>
          </div>
        </section>

        {/* Concepts */}
        <section className="glass-panel rounded-2xl p-6">
          <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-foreground">
            <Server className="h-4 w-4 text-theme-500" /> Core concepts
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { icon: <Server className="h-4 w-4 text-theme-400" />, t: "Servers", d: "Game or app workloads with a runtime (docker, local, or mock), hard memory/CPU caps, and per-server files, backups, worlds, plugins and mods." },
              { icon: <Box className="h-4 w-4 text-theme-400" />, t: "Runtimes & languages", d: "Minecraft/proxy images plus Node, Python, Go, Rust, C/C++, C#, Ruby, PHP and Bash apps via official images + a startup command." },
              { icon: <KeyRound className="h-4 w-4 text-theme-400" />, t: "API keys", d: "rhlz_ prefixed, hashed at rest, scope fail-closed, revocable. Never shown twice." },
              { icon: <ShieldCheck className="h-4 w-4 text-theme-400" />, t: "Security core", d: "Server-scope authorization, path containment, SSRF + zip-slip + miner guards, progressive lockout, audit log, optional TOTP 2FA." },
              { icon: <Cloud className="h-4 w-4 text-theme-400" />, t: "Nodes", d: "rhlz-node agents on remote hosts (Docker proxy + constant-time key auth). Register under Nodes." },
              { icon: <Rocket className="h-4 w-4 text-theme-400" />, t: "Deploy", d: "Native Linux (pm2 + cron), Docker/Compose, or free PaaS — no systemd anywhere." },
            ].map((c) => (
              <div key={c.t} className="rounded-xl border border-border-subtle bg-muted/40 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">{c.icon} {c.t}</div>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{c.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* API + sandbox quick reference */}
        <section className="glass-panel rounded-2xl p-6">
          <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-foreground">
            <BookOpen className="h-4 w-4 text-theme-500" /> API & sandbox quick reference
          </h2>
          <pre className="overflow-x-auto rounded-xl border border-border-subtle bg-black/40 p-4 font-mono text-[11px] leading-relaxed text-theme-200">
{`GET  /api/health            -> {status:"ok", product:"RHLZ"}
POST /api/auth/login        {username,password}  -> token | {twoFactorRequired,tempToken}
POST /api/auth/2fa/setup    (auth)               -> secret + QR + recovery codes
POST /api/auth/2fa/login    {tempToken,code}     -> token
GET  /api/servers           (auth)               -> server list
POST /api/servers/:id/start (auth+access)
POST /api/run               (auth + rate limit)  -> run jailed guest code
     body: {lang, code, timeout?, memoryMB?}  langs: js,ts,py,bash,go,rust,ruby,php,c,cpp,java,csharp,sql`}
          </pre>
          <p className="mt-3 text-xs text-muted-foreground">
            Guest code runs with a hard timeout (8s default, 15s max), memory + process + write caps, output capped at 64 KB,
            best-effort network isolation, non-root drop, and miner/abuse denylists (xmrig, stratum, cryptonight, fork bombs,
            curl-pipe-sh, metadata hosts). Missing host toolchains return a clear "runtime not installed" state — never a crash.
            Hard isolation requires the container runtime; the sandbox is a first line of defense.
          </p>
        </section>

        {/* Deploy targets */}
        <section className="glass-panel rounded-2xl p-6">
          <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-foreground">
            <Cloud className="h-4 w-4 text-theme-500" /> Deploy anywhere (no systemd)
          </h2>
          <div className="flex flex-wrap gap-2 text-xs">
            {["Ubuntu/Debian/CentOS/Alpine", "pm2 + @reboot cron", "supervisord", "Docker", "Docker Compose", "Heroku", "Render", "Railway", "Fly.io", "Koyeb", "Cyclic", "Qovery"].map((t) => (
              <span key={t} className="rounded-full border border-border bg-muted px-2.5 py-1 font-medium text-muted-foreground">{t}</span>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Full walkthrough: <span className="font-mono">docs/SETUP.md</span>, <span className="font-mono">docs/DEPLOYMENT.md</span>,
            <span className="font-mono"> docs/API.md</span> and the security ledger <span className="font-mono">docs/SECURITY-LOOP.md</span>.
          </p>
        </section>

        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {PRODUCT_NAME} Panel v{VERSION} · {TAGLINE}
          <ArrowRight className="h-3.5 w-3.5" />
          <Link className="text-theme-400 underline hover:text-theme-300" to="/servers">Go to servers</Link>
        </p>
      </div>
    </div>
  );
}
