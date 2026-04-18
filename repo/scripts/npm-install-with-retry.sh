#!/usr/bin/env sh
set -eu

max_attempts=3
attempt=1

while [ "$attempt" -le "$max_attempts" ]; do
  if npm install; then
    exit 0
  fi

  if [ "$attempt" -ge "$max_attempts" ]; then
    break
  fi

  echo "[npm-install-retry] attempt $attempt failed, retrying..."
  attempt=$((attempt + 1))
  sleep 5
done

echo "[npm-install-retry] failed after $max_attempts attempts."
exit 1
