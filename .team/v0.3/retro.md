# Retro — v0.3 Block Grammar Migration

**Date:** 2026-05-03
**Session type:** Mode 2 (Build/refactor) — single Builder round
**PR:** #35 (`feat/v0.3-block-grammar-migration` → `main` at `985674c`)

---

## What shipped

v0.3 migrated the `@blockname {}` parser stub (v0.2.2) to a fully-validated dual-grammar
parser with semantic analysis, deprecation warnings, and a conformance fixture suite.

| Sub-item | Description | Commit |
|----------|-------------|--------|
| v0.3.1 | @state/@template lowering — parse routing confirmed identical to HTML-form | `4768672` |
| v0.3.2 | sfc_conformance.rs — 22 new Rust tests covering all 4 block types | `4768672` |
| v0.3.3 | `$global` style scope detection — `$global` token in `@style` body maps to global-scope CSS | `29fb1df` |
| v0.3.4 | Deprecation warning — HTML-form `<script setup>` / `<template>` / `<style>` / `<agent>` tags emit `eprintln!` deprecation notice | `29fb1df` |
| v0.3.5 | `warn_undeclared_template_refs()` — checks template for `{identifier}` refs not declared in `@state` | `29fb1df` |
| v0.3.6 | `check_reserved_tokens()` — rejects `$$`, `$_`, `$0`…`$9` prefixes (C200–C203) | `29fb1df` |
| v0.3.7 | `@agent` block routing confirmed + comment header added to parse output | `29fb1df` |
| v0.3 fixtures | `bench/compiler-conformance/blocks/` — 5 `.aihu` + 5 `.golden.js` files | `4768672` |

**Rust tests:** 78 → 100 (+22, all green; 1 pre-existing ignored)
**TS tests:** 476 → 476 (unchanged — Rust-only milestone)
**Size:** unchanged — all 8 packages within budget (Rust compiler, no TS additions)

---

## Key finding

v0.2.2's `Grammar::At` body extraction (parse routing: detect `@blockname {`, extract body, map to block kind) was a complete parse-phase implementation. v0.3's actual scope was the semantic analysis layer on top: `$global` scope tagging, deprecation warnings, undeclared ref warnings, reserved-token rejection. This is a durable layer separation pattern for the compiler: **parse phase** (grammar routing, body extraction) → **analysis phase** (semantic validation, warnings, errors) → **emit phase** (lowering to JS).

The analysis-phase work was lightweight enough to fit in one Builder commit pair rather than the 8 sub-item schedule the Architect had planned, because the parse-phase infrastructure was already solid from v0.2.2.

---

## What worked

- Single-PR atomic delivery: all 8 sub-items as 2 commits, both green on first try.
- Conformance fixture pattern (`.aihu` + `.golden.js` pairs) validates lowering correctness at a glance; reusable for v0.4+ macro attribute fixtures.

## What to improve

- Rust tests currently counted per `test result:` block, not per binary total. Future Historian closes should run `cargo test 2>&1 | grep "test result" | awk '{sum+=$4} END {print sum}'` for the canonical count.
- The `warn_undeclared_template_refs` warning is stderr-only (eprintln!) — no structured diagnostic output yet. v0.4+ should unify warnings into a `Diagnostic` struct for later LSP integration (tracked as deferred in spec).
