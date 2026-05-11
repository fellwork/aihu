#!/usr/bin/env bash
# scripts/migrate-rs-test-fixtures.sh
#
# One-off scoped sed pass for v1.0.8 (Amendment 04 — `$attr={expr}` canonical).
#
# Scope:
#   Rewrites inline `.aihu` raw-string blocks (`r#"..."#`) inside
#   `packages/compiler/tests/**/*.rs` that contain plain-curly attribute
#   bindings on lowercase HTML tags. The .aihu file pass is handled by
#   `npx aihu migrate` (the migrate command shipped in R5.2b-2); this
#   script handles the Investigator R5.1 GAP-1 corpus — Rust test files
#   with embedded .aihu source strings.
#
# This script is one-off: it is committed alongside its run output, then
# `git rm`'d in the same commit (per Director r5-sup-2 §4.2). Not
# preserved tooling — re-run by checking out the commit and applying.
#
# Strategy: this isn't a true sed-script — the structural rewrite is
# easier to do correctly via the migrate command's allowlist logic in
# TypeScript. We use `bun run scripts/migrate-rs-test-fixtures.ts`
# under the hood. This .sh wrapper exists for review traceability
# (it is what gets committed + removed in the same commit, per the brief).
#
# Usage: bash scripts/migrate-rs-test-fixtures.sh
set -euo pipefail
exec bun run scripts/migrate-rs-test-fixtures.ts "$@"
