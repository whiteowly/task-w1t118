#!/usr/bin/env bash
set -euo pipefail

echo "[run_tests] Running static checks..."
docker compose run --rm app sh -c "npm install && npm run lint && npm run format"

echo "[run_tests] Running unit tests..."
docker compose run --rm app sh -c "npm install && npm run test:unit"

echo "[run_tests] Running API tests..."
docker compose run --rm app sh -c "npm install && npm run test:api"

echo "[run_tests] Running E2E tests..."
docker compose run --rm app sh -c "npm install && npx playwright install chromium && npm run test:e2e"

echo "[run_tests] Running build..."
docker compose run --rm app sh -c "npm install && npm run build"

echo "[run_tests] All checks completed."
