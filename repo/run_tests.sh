#!/usr/bin/env bash
set -euo pipefail

echo "[run_tests] Resetting docker services and volumes..."
docker compose down -v --remove-orphans >/dev/null 2>&1 || true

echo "[run_tests] Running static checks..."
docker compose run --rm app sh -c "sh scripts/npm-install-with-retry.sh && npm run lint && npm run format"

echo "[run_tests] Running unit tests..."
docker compose run --rm app sh -c "sh scripts/npm-install-with-retry.sh && npm run test:unit"

echo "[run_tests] Running API tests..."
docker compose run --rm app sh -c "sh scripts/npm-install-with-retry.sh && npm run test:api"

echo "[run_tests] Running E2E tests..."
docker compose run --rm app sh -c "sh scripts/npm-install-with-retry.sh && npm run test:e2e"

echo "[run_tests] Running build..."
docker compose run --rm app sh -c "sh scripts/npm-install-with-retry.sh && npm run build"

echo "[run_tests] All checks completed."
