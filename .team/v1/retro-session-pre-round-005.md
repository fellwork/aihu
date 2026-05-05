# Retro — Pre-Round-5 Blocker Session

**Date:** 2026-05-01
**HEAD at close:** `808f1c0`
**TS tests:** 320 green
**Rust tests:** 32 green

---

## § Scope

This was a blocker-resolution session, not a feature session. Four items were identified in the pre-Round-5 director note (`.team/v1/director-notes/pre-round-005-blockers.md`). Round 005 could not start without resolving at least Blockers 1, 2, and 3. Blocker 4 was noted as hardware-blocked and not a gate.

| # | Blocker | Mode | Outcome |
|---|---------|------|---------|
| 1 | `npx size-limit` fails — esbuild cannot resolve `@aihu/signals` / `@aihu/context` in `@aihu/data` bundle | Mode 2 (Build) | COMPLETE — commit `20d66b7` |
| 2 | Arbor bundle at 2151 B / 2200 B cap (49 B headroom) — Plan 1.4 viability unknown | Mode 1 (Investigate) | COMPLETE — filed at `.team/v1/arbor-bundle-investigation.md` |
| 3 | Compiler session-6 cleanup: BTreeMap, Vite investigation, topic summary | Mode 2 (Build) | COMPLETE — PR #14 merged at `808f1c0` |
| 4 | Track C 6.2-P1 bench validation (deep-chain) | No dispatch — hardware-blocked | DEFERRED — CONDITIONAL PASS unchanged |

---

## § What was resolved

### Blocker 1 — size-limit CLI fix

**Commit:** `20d66b7`

`npx size-limit` exited 1 with `Could not resolve '@aihu/signals'` and `Could not resolve '@aihu/context'` when evaluating `@aihu/data`'s bundle. Root cause: size-limit reads `peerDependencies` from the *workspace root* `package.json` to auto-populate the `ignore` list; the workspace root has no `peerDependencies`, so nothing was excluded for `@aihu/data`.

Fix: added `"ignore": ["@aihu/signals", "@aihu/context"]` to the `@aihu/data` entry in `.size-limit.json` only. No other entries were changed.

Result: `npx size-limit` exits 0. All 6 entries report sizes. `@aihu/data` at 306 B gz / 750 B limit (444 B headroom). Every Verifier can now run `npx size-limit` as a single clean gate without manual intervention.

### Blocker 2 — Arbor bundle investigation

**Document:** `.team/v1/arbor-bundle-investigation.md`

The concern was that 49 B headroom against the 2200 B cap might be insufficient for Plan 1.4 (Slots). The investigation used the canonical size-limit measurement (esbuild minified output) rather than raw `gzip -c`.

Key finding: raw gzip reported 2151 B; size-limit's esbuild minified pass reported **2117 B** — 34 B tighter. That gives **83 B headroom** against the 2200 B cap, not 49 B.

Slot cost estimate: a `slot()` primitive implemented as a `_makeElementLeaf` wrapper costs ~10–30 B gz in the minified bundle, well within 83 B.

**Decision:** PROCEED with Plan 1.4 (Slots) at the current 2200 B cap. No cap-raise needed. The Director may dispatch a Builder against Plan 1.4 without a budget review.

### Blocker 3 — Compiler session-6 cleanup

**PR #14, merged at `808f1c0`**

Three tasks:
1. **BTreeMap in `signals.rs`** — replaced `HashMap<String, String>` with `BTreeMap<String, String>` in `SignalMap`. Eliminates snapshot ordering non-determinism permanently. 32 Rust tests pass, affected snapshots re-accepted.
2. **Vite limitation documented** — `bun vite build` with `scribeCompilerPlugin()` does not work under Bun+Rollup4 ESM interop. Documented with a clear note in `packages/compiler/js/index.ts` JSDoc. The `transform()` function works correctly; only the Vite plugin hook is affected.
3. **Compiler topic summary written** — `.team/compiler/summaries/compiler-summary.md` now exists. Covers SFC → TypeScript pipeline, architecture, key decisions, 5 known limitations, and what a new engineer needs before touching the code.

Verifier: PASS on all 11 ACs. 32 Rust tests green, 320 TS tests green.

Build artifacts:
- `.team/compiler/build-manifest-session-6.md`
- `.team/compiler/verification-report-session-6.md`

---

## § What was deferred

### Blocker 4 — Track C 6.2-P1 (deep-chain bench)

Windows cannot produce reliable benchmark results for the `deep-propagation-100` workload. The 6.2-P1 optimization (Option D) is at CONDITIONAL PASS: correctness is fully verified; the ≤ 2.45 µs p50 target on `deep-propagation-100` cannot be confirmed on this hardware.

**Status unchanged.** Not a Round 5 gate per director note §Assessment.

Surface-to-user trigger: when Linux or macOS hardware is available, run `bun run bench` at repo root and update `.team/v1/state-track-c.md` plan 6.2-P1 status.

---

## § Learnings

New entries added to `.team/learnings.md`:

**#30** — `npx size-limit` / esbuild bundling fails on packages with unresolvable peer deps. The canonical fix is the `"ignore"` field in `.size-limit.json` per-entry. Never add the fix to entries that don't need it.

**#31** — The canonical size-limit measurement (esbuild minified output) is tighter than raw `gzip -c` by ~14 B or more. For authoritative headroom decisions, run `npx size-limit` against the built dist — not raw gzip. The raw gzip number is a floor, not an oracle.

---

## § Round 005 go-signal

**GO.**

All three Round 5 gates are clear:

| Gate | Status |
|------|--------|
| `npx size-limit` clean CI | CLEAR — commit `20d66b7` |
| Arbor headroom for Plan 1.4 | CLEAR — 83 B confirmed, 2117 B / 2200 B |
| Compiler track knowledge doc | CLEAR — `compiler-summary.md` exists |

**State at close:** `main` at `808f1c0`, 320 TS tests green, 32 Rust tests green.

**Director must open Round 005 with a scope-selection note** choosing between Plan 1.3 (Scoped Styles, compiler-adjacent) and Plan 1.4 (Slots, arbor-touching — 83 B headroom confirmed safe). Both are now unblocked.
