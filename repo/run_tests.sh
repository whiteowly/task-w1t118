#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "[run_tests] Installing dependencies..."
npm install

echo "[run_tests] Ensuring Playwright browser is available..."
npx playwright install chromium

echo "[run_tests] Running static checks..."
npm run lint
npm run format

echo "[run_tests] Running unit tests..."
npm run test:unit

echo "[run_tests] Running E2E tests..."
npm run test:e2e

echo "[run_tests] Running build..."
npm run build

echo "[run_tests] All scaffold checks completed."
