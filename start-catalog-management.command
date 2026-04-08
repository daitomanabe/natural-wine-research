#!/usr/bin/env zsh

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_ROOT"

if [ ! -d "node_modules" ]; then
  echo "[setup] node_modules not found. Running npm install..."
  npm install
fi

echo "[run] start-fresh.sh (cleans old processes, starts API + web, opens browser)"
./scripts/start-fresh.sh
