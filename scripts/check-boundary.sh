#!/usr/bin/env bash
set -euo pipefail

if grep -R -n -E '@aihu/(signals|arbor|runtime)' packages/server/src packages/agent-readiness/src; then
  echo "FAIL: boundary violation found"
  exit 1
fi

echo "AC-7 PASS: hard boundary intact"
