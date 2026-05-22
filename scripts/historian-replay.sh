#!/usr/bin/env bash
# historian-replay.sh — replay the round-7 close-out writes against the team DB.
#
# Context: the Supabase tenant was unreachable at session close, so the retro and
# 5 lessons were written to disk only. Run this once DB connectivity is restored
# to populate the team DB and promote the lessons to the user layer.
#
# Idempotency: this script is NOT idempotent. Re-running creates duplicate delta
# records. Only run if `team read latest retro aihu-v1-framework` confirms the
# retro is missing.
#
# Usage:
#   bash scripts/historian-replay.sh

set -euo pipefail

TOPIC=aihu-v1-framework
ROUND=7

echo "== 1. Writing retro =="
team write delta retro "$TOPIC" \
  --title "session retro — v1.0 cutover (9/10) + Bug 1-class cleanup + research arc" \
  --round "$ROUND" \
  --file docs/retros/aihu-v1-framework-2026-05-22.md

echo
echo "== 2. Writing + promoting lessons =="

write_and_promote () {
  local title="$1"
  local file="$2"
  echo "--- $title ---"
  # Capture the new record_id from `team write` stdout.
  local rid
  rid=$(team write delta lesson "$TOPIC" \
          --title "$title" \
          --round "$ROUND" \
          --file "$file" \
        | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' \
        | head -1)
  if [ -z "$rid" ]; then
    echo "ERROR: could not parse record_id from team write output" >&2
    exit 1
  fi
  echo "  record_id: $rid"
  team promote "$rid" "$file"
}

write_and_promote \
  "Cross-package version drift (Bug 3 class)" \
  docs/lessons/cross-package-version-drift.md

write_and_promote \
  "publish-all.sh PKGS array completeness audit" \
  docs/lessons/publish-all-pkgs-array.md

write_and_promote \
  "Release-PR autogen artifact regen" \
  docs/lessons/release-pr-autogen-sync.md

write_and_promote \
  "Compiler version bump for grammar changes" \
  docs/lessons/compiler-grammar-needs-changeset.md

write_and_promote \
  "Scout dispatch subagent_type" \
  docs/lessons/scout-subagent-type.md

echo
echo "== Done =="
echo "Topic: $TOPIC (still ACTIVE, round still $ROUND, v1.0.10 still OPEN)"
echo "Verify: team read latest retro $TOPIC | head -20"
