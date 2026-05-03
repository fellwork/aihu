# Retro — v0.9 Docs and Testing Pass

**Date:** 2026-05-03
**Session type:** Mode 2 — single TypeScript Builder stream
**PR:** #44 (`feat/v0.9-docs-testing-pass` → `main` at `cf72e7d`)

---

## What shipped

| Sub-item | Description |
|----------|-------------|
| v0.9.1 | 12 Markdown docs pages in `docs/site/`; `scripts/build-docs.ts` handrolled static site generator (13 HTML output files, zero external deps) |
| v0.9.3 | `scripts/dep-check.ts` — dep-free audit; exits 0 on all packages |
| v0.9.4 | `scripts/hmr-check.ts` — confirms zero `@vitejs/client` in package sources |
| scripts | Root `package.json` gains `build:docs`, `check:deps`, `check:hmr` scripts |

**TS tests:** 570 → 570 (unchanged — docs+scripts only; all test gaps already filled by prior milestones)
**Rust tests:** 209 (unchanged)

---

## Test gap audit findings

All three v0.9.2 test gaps were already filled by prior milestone Builders:
- Router middleware: 13 tests in `packages/router/tests/v0.7.test.ts`
- `createServerCall`: covered in `packages/server/tests/v0.6b.test.ts`
- BuildTarget client elision: covered in `packages/compiler/tests/route_and_build_target.rs`

No new tests were needed; count held at 570.

---

## Final gate walk

**Rust tests:** 209 (unchanged)
**TS tests:** 570 (unchanged)
**Main HEAD at close:** `cf72e7d`
**`bun scripts/dep-check.ts`:** PASS (exit 0)
**`bun scripts/hmr-check.ts`:** PASS (exit 0)
**`bun scripts/build-docs.ts`:** PASS (13 HTML files)
**Size:** all 8 rows pass (no source changes)

---

## Deferred to v1.0

- v0.9.2 full e2e integration test suite
- v0.9.5 cross-runtime adapter completeness tests (requires Deno/Workers runtimes)
- v0.9.6 build-tool independence smoke test

---

## v1.0 is next

v1.0 = Cutover: CI re-enabled, branch protection on, release pipeline gate, dep-free final audit, dual-grammar deprecation removal, Naming Scheme A renames, npm tag + ship.
