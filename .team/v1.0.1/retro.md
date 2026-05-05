# v1.0.1 Maintenance Session Retro

**Date:** 2026-05-03
**Session type:** Mode 3 (defect fix) + Mode 2 (design gap)
**Main HEAD at close:** c6e937d
**Tests at close:** 612 TS + 232 Rust

---

## What was fixed

7 items surfaced during the 6-track follow-up session, all shipped in a single `fix/v1.0.1-7items` branch:

| Item | Description | Commit | Mode |
|------|-------------|--------|------|
| 1 | `$each` spec-form: parser now requires `"list as item"` per §3.3; C302 on old bare form | `9c5427b` | Mode 3 |
| 2 | `$key` wrapping: codegen emits `(alias) => expr` not free expression | `9c5427b` | Mode 3 |
| 3 | Apostrophe parser bug: `@template` body no longer enters JS string-literal mode on `'` | `0ef9cd9` | Mode 3 |
| 4 | `$global`+`$reactive` semantics: combination targets `document.documentElement`; Amendment 02 in spec | `6747389` | Mode 2 |
| 5 | Postinstall path mismatch: `index.ts` fallback aligned to `bin/` (matches postinstall write target) | `5f465d2` | Mode 3 |
| 6 | Moon mangle-skip: `tasks.yml` build delegates to per-package `bun run build` | `dfdad36` | Mode 3 |
| 7 | TS6059 rootDir: **already in main** via T6 commit `71cedf3` from prior session | (confirmed) | N/A |

Plus: `bad5eeb` — examples migrated to spec-idiomatic `$each="items as item"` + `$key={item.id}` form.

---

## Methodology

- **Mode:** fw-agent-skill auto-mode, no user pauses
- **Topic Director:** 1 round — set design decisions for Items 1/2/4 (spec-authoritative), mode per item, 3-round parallelism plan
- **Round 1:** 3 concurrent builders (items 3, 1+2, 7) — all in worktrees
- **Round 2:** 2 concurrent builders (items 5, 6) — all in worktrees
- **Round 3:** 1 builder (item 4) — in worktree
- **Integration:** cherry-pick onto `fix/v1.0.1-7items` off `d9db3a7` (main)

---

## Merge mechanics

Builder 1B and 1C ran in the `claude/reverent-mestorf-749530` worktree (behind main at `2c47efd`), requiring cherry-picks. Builder 1C's TS6059 fix was skipped in cherry-pick (already in main). Item 7's duplicate commit from Builder 1C conflicted and was correctly identified as redundant.

---

## New learnings

- #48 — Builder worktrees inherit parent branch, not main (see `.team/learnings.md`)
- #49 — Chained git commands with `-C` must prefix every git command (see `.team/learnings.md`)
- #50 — `$key` expression form vs function-reference form; use expression form going forward

---

## Size gate at close (bun run size)

| Package | Size | Budget | Headroom |
|---------|------|--------|----------|
| `@aihu/context` | 249 B | 300 B | +51 B |
| `@aihu/signals` | 1.67 kB | 1970 B | +261 B |
| `@aihu/arbor` | 2.06 kB | 2200 B | +89 B |
| `@aihu/runtime` | 1.14 kB | 1170 B | +3 B |
| `@aihu/agent` | 142 B | 200 B | +58 B |
| `@aihu/data` | 778 B | 800 B | +22 B |
| `@aihu/router` | 818 B | 1536 B | +718 B |
| `@aihu/agent-service` | 580 B | 600 B | +20 B |
| `@aihu/agent-acp` | 590 B | 600 B | +10 B |
| `@aihu/agent-a2a` | 718 B | 720 B | +2 B |

All 10/10 PASS.

---

## Open items

None. All 7 surfaced issues are closed. The pre-existing `agent-service:typecheck` (TS6059 cross-package paths) and `compiler:typecheck` (TS6231 moon tsc path) failures remain; both are tracked as known pre-existing issues.
