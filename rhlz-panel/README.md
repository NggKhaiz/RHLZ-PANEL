# RHLZ 🦅

```
██████╗  █████╗ ██╗   ██╗███████╗███╗   ██╗    ██╗  ██╗██╗   ██╗██████╗
██╔══██╗██╔══██╗██║   ██║██╔════╝████╗  ██║    ██║  ██║██║   ██║██╔══██╗
██████╔╝███████║██║   ██║█████╗  ██╔██╗ ██║    ███████║██║   ██║██████╔╝
██╔══██╗██╔══██║╚██╗ ██╔╝██╔══╝  ██║╚██╗██║    ██╔══██║██║   ██║██╔══██╗
██║  ██║██║  ██║ ╚████╔╝ ███████╗██║ ╚████║    ██║  ██║╚██████╔╝██████╔╝
╚═╝  ╚═╝╚═╝  ╚═╝  ╚═══╝  ╚══════╝╚═╝  ╚═══╝    ╚═╝  ╚═╝ ╚═════╝ ╚═════╝
        ⟨ RHLZ ⟩ · Compact control plane for game servers and jailed code runtimes.
        Powered by the Cypher security core · © RHLZ
```

Welcome to **RHLZ** (panel UI: **RHLZ Panel**) — a production
game-server management and container-orchestration platform built for
Minecraft and generic game servers.

**Version:** `3.1.0` · **Tagline:** Compact control plane for game servers and jailed code runtimes.
**Security core:** Cypher

![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178c6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6-646cff?logo=vite&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)
![Tailwind](https://img.shields.io/badge/TailwindCSS-4-06b6d4?logo=tailwindcss&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.IO-4-010101?logo=socket.io&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-yellow)

📚 **Documentation:** [Terminal Setup Guide](docs/SETUP.md) ·
[API Reference](docs/API.md) · [Architecture](docs/ARCHITECTURE.md) · [Deployment](docs/DEPLOYMENT.md) · [Docker](docs/DOCKER.md) · [Security](docs/SECURITY.md)

---

## ✨ Features
- ⚡ **Dual Runtime Modes**: Run servers natively via host processes or isolated Docker containers (`itzg/minecraft-server`, generic node/python images).
- ☕ **Multi-Version Java Engine**: Built-in support for Java 8, 11, 16, 17, 21, and 25 with automatic version detection.
- 📡 **Telemetry & Nodes**: Live CPU, RAM, and Disk telemetry graphs and support for Pterodactyl Wings daemons.
- 🌐 **Built-in Playit.gg Tunnels**: Allocate public IPs and custom hostnames without opening router ports.
- 💻 **Real-Time Web Terminal**: WebSocket console stream with color-coded log parsing and live command execution.
- 📁 **Complete File Manager**: Web-based file explorer, syntax-highlighted code editor, zip/unzip, and SFTP support.
- 🧹 **RHLZ Keeper**: Automatic housekeeping — temp hygiene, backup retention, log rotation, disk guard, and crash-recovery data integrity.
- 🔄 **One-Click Updates**: Automated background self-updating script (`update.sh`).
- 🌍 **Multi-language runtimes**: deploy Node.js, Python, Go, Rust, C/C++, C#, Ruby, PHP and Bash apps with hard memory/CPU caps per container.
- 🔐 **Cypher security core**: SSRF guard, zip-slip + symlink hardening, crypto-miner scan, progressive brute-force lockout, constant-time auth, audit log.

---

## 📦 Quick Installation

Unattended production install:

```bash
curl -fsSL https://raw.githubusercontent.com/NggKhaiz/RHLZ-PANEL/main/rhlz-panel/install.sh | bash -s -- --yes --runtime docker --admin admin:ChangeMe_now
# or from a checkout:
bash install.sh --yes --runtime docker --admin admin:ChangeMe_now
```

Interactive menu (TTY, no flags): `bash install.sh`. Flags: `--help`.

> **Security:** set `RHLZ_SESSION_SECRET` (or `JWT_SECRET` fallback). The installer generates a 32-byte secret and never overwrites an existing `.env`.

---

## 🔄 Updating
```bash
bash update.sh --yes
```

## 🗑️ Uninstallation
Uninstall while safely preserving your game server worlds and files in `.data/`:
```bash
bash uninstall.sh --yes          # keeps .data/
bash uninstall.sh --yes --purge  # also removes .data/
```

---

## 📄 License & Attribution

This project is licensed under the **MIT License** with attribution requirements.

> **Important**: You are free to use, modify, host, and distribute this project, but you **MUST give proper attribution and credit to the original author (Jishnu / the upstream panel by Jishnu)** in all copies or derivative works.

See the [LICENSE](./LICENSE) file for complete license terms (RHLZ's
copyright sits above the upstream license, which is kept intact).

## 🙏 CREDITS
- **RHLZ Panel** is a rebranded, hardened, and extended distribution of the **the upstream panel by Jishnu** project by **Jishnu** (https://github.com/JishnuTheGamer/RHLZ), used under its MIT license with attribution.
- Special thanks to the upstream author and the open-source Minecraft server ecosystem (PaperMC, itzg, Playit.gg) that make this panel possible.

---

*© 2026 RHLZ. All rights reserved.*
