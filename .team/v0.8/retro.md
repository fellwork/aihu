# Retro — v0.8 CLI Scaffolder + Hello World Template

**Date:** 2026-05-03
**Session type:** Mode 2 — single TypeScript Builder
**PR:** #43 (`feat/v0.8-cli-scaffolder` → `main` at `b35ee76`)
**Fix commit:** `90c95dc` — `fix(v0.8): classify @aihu/cli as build-dev-only in check-size-rows`

---

## What shipped

| Sub-item | Description |
|----------|-------------|
| v0.8.1 | `@aihu/cli` package with `aihu app`, `aihu page`, `aihu component`, `aihu plugin`, `aihu migrate` commands; stdlib-only arg parsing; zero runtime deps |
| v0.8.2 | Hello World template: `package.json`, `aihu.config.ts`, `vite.config.ts`, `src/pages/index.aihu`, `src/layouts/default.aihu` |
| v0.8.5 | Plugin scaffold template: `aihu-plugin-<name>/` with `package.json` + `src/index.ts` |
| docs | `docs/cli.md` light-off procedure covering prerequisites, `npx aihu app` walkthrough, dev cycle, `aihu migrate` usage |
| v0.8.3 (partial) | Post-scaffold UX message printed after `aihu app` (the print-to-stdout portion shipped; full first-run UX deferred to v0.9 docs work) |

**Deferred:** v0.8.4 (light-off docs page in `docs/site/`) — deferred to v0.9 docs pass. v0.8.3 full first-run UX (interactive prompts, Vite integration) — deferred pending v0.9 Vite compiler integration.

**TS tests:** 534 → 570 (+36, 65 test files)
**Rust tests:** 209 (unchanged — TS-only milestone)
**Size:** 8/8 PASS (no change — CLI is build-time only, no browser bundle row)

---

## Final gate walk

**Rust tests:** 209 (unchanged)
**TS tests:** 534 → 570 (+36, 65 test files)
**Main HEAD at close:** `90c95dc`
**Size:** all 8 rows pass within budgets (CLI has no size row — build-time only)
**check:size-rows:** PASS after fix at `90c95dc` (see finding below)
**Typecheck:** pre-existing `agent-service:typecheck` failure only; no new errors

**Package sizes (`bun run size`) — unchanged from v0.7:**

| Package | Size | Budget | Headroom |
|---------|------|--------|----------|
| `@aihu/context` | 249 B | 300 B | +51 B |
| `@aihu/signals` | 1.67 kB | 1970 B | +261 B |
| `@aihu/arbor` | 2.06 kB | 2200 B | +89 B |
| `@aihu/runtime` | 1.14 kB | 1170 B | +7 B |
| `@aihu/agent` | 117 B | 200 B | +83 B |
| `@aihu/data` | 778 B | 800 B | +22 B |
| `@aihu/router` | 818 B | 1536 B | +718 B |
| `@aihu/agent-service` | 580 B | 600 B | +20 B |

---

## Notable findings

### Finding 1: Commit message test count discrepancy (+17 vs +36 actual)

The PR #43 commit message described "+17 tests" for the CLI package. The actual test delta was +36 (from 534 to 570). The discrepancy arose because the commit message reflected an early test count estimate made during planning (15 minimum per director note), and the final `cli.test.ts` landed with 36 tests from the start. The gate walk count (`bun run test`) is authoritative; commit message per-item counts are estimates. See Learning #39.

### Finding 2: check-size-rows omission (resolved at 90c95dc)

The initial PR #43 did not classify `@aihu/cli` in `check-size-rows`. The `check:size-rows` lint script enforces that every package in the workspace is tagged as either `BROWSER_BUNDLE` (has a size row) or `BUILD_DEV_ONLY` (build-time tool, exempt). The omission was caught post-merge and fixed at `90c95dc` by adding `@aihu/cli` to the `BUILD_DEV_ONLY` list. No behavior change; purely a policy compliance fix.

**Root cause:** The CLI package was added to the workspace monorepo structure but the `check-size-rows` registration step was not included in the Builder's sub-item checklist. Any new package added to the workspace requires a simultaneous `check-size-rows` classification.

**Process fix:** Add "register new package in check-size-rows" as a required step on the Builder's package-creation checklist, parallel to the existing "add or exempt from .size-limit.json" step.

---

## Learnings

See `.team/learnings.md` — Learning #39 added this session.

---

## v0.9 is next

v0.9 = docs and testing pass. No new features. Sub-items:
- v0.9.1 — `docs/site/` Markdown site (Getting Started + API reference per package)
- v0.9.2 — End-to-end test coverage (scaffold → dev server flow)
- v0.9.3 — Dep-free re-audit (zero non-`@aihu/*` runtime deps)
- v0.9.4 — v1.0 release-pipeline rehearsal
- v0.9.5 — `llms.txt` + MCP support validation

Director note at `.team/v0.9/director-note-session-start.md`.
