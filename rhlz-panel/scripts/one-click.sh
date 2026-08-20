#!/usr/bin/env bash
# Thin wrapper: unattended production install.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec bash "$ROOT/install.sh" --yes "$@"
