#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if [ ! -d "$ROOT_DIR/node_modules" ]; then
  echo "[run_app] Installing dependencies..."
  npm install
fi

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-4173}"

echo "[run_app] Starting LocalOps scaffold at http://${HOST}:${PORT}"
exec npm run dev -- --host "$HOST" --port "$PORT"
