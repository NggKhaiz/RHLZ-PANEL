#!/usr/bin/env bash
# RHLZ Panel updater. --yes skips confirm. Build failures are fatal.

set -euo pipefail

C_RESET='\033[0m'
C_BOLD='\033[1m'
C_VIBRANT_CYAN='\033[38;5;45m'
C_DEEP_BLUE='\033[38;5;33m'
C_EMERALD='\033[38;5;48m'
C_CRIMSON='\033[38;5;196m'
C_WHITE='\033[38;5;255m'

YES=0
for arg in "$@"; do
    case "$arg" in
        --yes|-y) YES=1 ;;
        --help|-h)
            echo "Usage: bash update.sh [--yes]"
            exit 0
            ;;
    esac
done

echo -e "${C_VIBRANT_CYAN}${C_BOLD}  RHLZ PANEL — update${C_RESET}"

if [ ! -f "package.json" ]; then
    if [ -f "rhlz-panel/package.json" ]; then
        cd rhlz-panel
    else
        echo -e " ${C_CRIMSON}[✗ ERROR]${C_RESET} package.json not found."
        exit 1
    fi
fi

if [ "$YES" -ne 1 ] && [ -t 0 ]; then
    read -r -p "  Pull latest and rebuild? [y/N]: " confirm || true
    if [[ ! "${confirm:-}" =~ ^[Yy]$ ]]; then
        echo "Cancelled."
        exit 0
    fi
fi

echo -e " ${C_DEEP_BLUE}[INFO]${C_RESET} Fetching..."
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git fetch origin main 2>/dev/null || git fetch origin master 2>/dev/null || true
    git pull --ff-only origin main 2>/dev/null || git pull --ff-only origin master 2>/dev/null || {
        echo -e " ${C_CRIMSON}[✗ ERROR]${C_RESET} git pull --ff-only failed. Resolve locally and retry."
        exit 1
    }
fi

echo -e " ${C_DEEP_BLUE}[INFO]${C_RESET} Dependencies..."
npm ci --omit=dev --no-optional --no-audit --no-fund 2>/dev/null || npm install --no-audit --no-fund --quiet

echo -e " ${C_DEEP_BLUE}[INFO]${C_RESET} Building..."
npm run build

echo -e " ${C_DEEP_BLUE}[INFO]${C_RESET} Restarting rhlz-panel..."
if command -v pm2 &>/dev/null || command -v npx &>/dev/null; then
    npx pm2 restart rhlz-panel
fi

echo -e " ${C_EMERALD}${C_BOLD}[✓ SUCCESS]${C_RESET} ${C_WHITE}RHLZ Panel updated.${C_RESET}"
