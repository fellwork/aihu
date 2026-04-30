#!/usr/bin/env bash
set -euo pipefail

FORBIDDEN=("process\." "require(" "fs\." "path\.join" "http\.createServer")
FAIL=0

for f in packages/server/dist/index.js packages/agent-readiness/dist/index.js; do
  if [ ! -f "$f" ]; then
    echo "SKIP: $f not built yet"
    continue
  fi
  for g in "${FORBIDDEN[@]}"; do
    if grep -qE "$g" "$f" 2>/dev/null; then
      echo "FAIL: $f contains forbidden token: $g"
      FAIL=1
    fi
  done
done

[ $FAIL -eq 0 ] && echo "AC-6 PASS: no forbidden globals" || exit 1
