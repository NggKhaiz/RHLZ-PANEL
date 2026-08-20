#!/usr/bin/env bash
# RHLZ Panel uninstaller. Default preserves .data/. --purge removes it.

set -euo pipefail

C_RESET='\033[0m'
C_BOLD='\033[1m'
C_CRIMSON='\033[38;5;196m'
C_DEEP_BLUE='\033[38;5;33m'
C_EMERALD='\033[38;5;48m'
C_AMBER='\033[38;5;214m'
C_WHITE='\033[38;5;255m'
C_MUTED='\033[38;5;244m'

YES=0
PURGE=0
for arg in "$@"; do
    case "$arg" in
        --yes|-y) YES=1 ;;
        --purge) PURGE=1 ;;
        --help|-h)
            echo "Usage: bash uninstall.sh [--yes] [--purge]"
            echo "  --yes    skip confirmation"
            echo "  --purge  also delete .data/"
            exit 0
            ;;
    esac
done

echo -e "${C_CRIMSON}${C_BOLD}  RHLZ PANEL — uninstall${C_RESET}"
if [ "$PURGE" -eq 1 ]; then
    echo -e "  ${C_AMBER}WARNING:${C_RESET} --purge will delete .data/ (servers, users, secrets)."
else
    echo -e "  ${C_EMERALD}NOTE:${C_RESET} .data/ will be preserved."
fi

if [ "$YES" -ne 1 ]; then
    if [ ! -t 0 ]; then
        echo "Non-interactive uninstall requires --yes."
        exit 1
    fi
    read -r -p "  Uninstall RHLZ Panel? [y/N]: " confirm || true
    if [[ ! "${confirm:-}" =~ ^[Yy]$ ]]; then
        echo "Cancelled."
        exit 0
    fi
    if [ "$PURGE" -eq 1 ]; then
        read -r -p "  Type PURGE to delete .data/: " extra || true
        if [ "${extra:-}" != "PURGE" ] && [ "${extra:-}" != "--purge" ]; then
            echo "Purge not confirmed. Aborting."
            exit 1
        fi
    fi
fi

echo -e "  ${C_DEEP_BLUE}[INFO]${C_RESET} Stopping pm2..."
if command -v pm2 &>/dev/null || command -v npx &>/dev/null; then
    npx pm2 delete rhlz-panel 2>/dev/null || true
    npx pm2 delete raven-hub 2>/dev/null || true
    npx pm2 delete raven-panel 2>/dev/null || true
    npx pm2 save 2>/dev/null || true
fi

APP_DIR="."
if [ ! -f package.json ] && [ -d rhlz-panel ]; then
    APP_DIR="rhlz-panel"
fi

if [ "$PURGE" -eq 1 ]; then
    echo -e "  ${C_DEEP_BLUE}[INFO]${C_RESET} Removing .data/"
    rm -rf "${APP_DIR}/.data"
fi

echo -e "  ${C_DEEP_BLUE}[INFO]${C_RESET} Cleaning workspace (keeping .data unless --purge)..."
if [ -f "${APP_DIR}/package.json" ]; then
    (
        cd "$APP_DIR"
        find . -maxdepth 1 ! -name '.data' ! -name '.' ! -name '..' -exec rm -rf {} + 2>/dev/null || true
    )
fi

echo -e "  ${C_EMERALD}${C_BOLD}[✓ SUCCESS]${C_RESET} ${C_WHITE}RHLZ Panel uninstalled.${C_RESET}"
if [ "$PURGE" -ne 1 ]; then
    echo -e "  ${C_MUTED}Server data remains in .data/${C_RESET}"
fi
