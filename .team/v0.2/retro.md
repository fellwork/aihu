# v0.2 Retro

**Date:** 2026-05-03
**Milestone:** v0.2 — CLOSED (6 sub-items, 476 tests, dep-free)
**Written by:** Historian

---

## What shipped

6 sub-items across 5 PRs + 1 doc-edit PR, all merged to main:

| Sub-item | Title | Outcome |
|----------|-------|---------|
| v0.2.1 | `@aihu/plugin` + `defineAihuConfig.plugins` | New package, +12 tests |
| v0.2.2 | `@blockname {}` dual-grammar parser stub | Rust parser foundation, +6 Rust tests |
| v0.2.3 | arbor Compressor pass | 99 B recovered, +89 B headroom |
| v0.2.4 | size-row policy + `check:size-rows` CI lint | +7 tests, policy documented |
| v0.2.5 | `bun run size` named canonical path | 3 doc edits, no new tests |
| v0.2.6 | `@aihu/data` plugin registration shim | +3 tests; `@aihu/data` limit raised 750→800 B |

**Test delta:** 454 → 476 (+22 tests across 58 test files)

---

## What went well

**Automated session completed all 6 sub-items without human escalation.** The Mode 2 round-2 dispatch pattern (4-way parallel dispatch for v0.2.1 + v0.2.2 + v0.2.3 + v0.2.4, with v0.2.5 and v0.2.6 following) executed without stalls. All 5 PRs reached merge in a single session.

**v0.2.5 was already done from a prior worktree.** The build-path canonicalization work (naming `bun run size` as the canonical gate path) had been drafted as a doc-only commit in a prior session's worktree context. The v0.2 dispatch confirmed the existing work was correct and merged it directly. Zero rework.

**Compressor pass (v0.2.3) delivered above target.** 99 B recovered vs an estimated 83 B headroom goal. Brings arbor from +15 B headroom (post-v1-reconciliation, Learning #47 build-path-variance band) to +89 B — the cleanest arbor headroom since Round N+1.

**Plugin package design was clean.** v0.2.1 shipped `@aihu/plugin` with a well-defined `defineAihuConfig.plugins` extension point with no runtime deps. The new package follows all existing conventions (index.ts, size gate, vitest config alias).

**Rust parser stub (v0.2.2) is a clean foundation.** The `@blockname {}` dual-grammar parser stub added 6 Rust tests and establishes the parser surface required for v0.3 block grammar migration. The stub's interface is already aligned with the spec quartet's syntax migration requirements.

---

## What to watch

**v0.2.6 size assumption was wrong — plugin object literals have runtime cost.** The Director note for v0.2.6 framed the data plugin shim as "zero-runtime-bytes" because it used `import type` for type imports and a direct object literal for the plugin definition. In practice, the plugin registration shim added 28 B gz to the `@aihu/data` bundle even with the `import type` + object literal approach. The v0.2.6 Builder correctly identified the budget breach and raised the limit 750→800 B. The Director's assumption was incorrect.

**Pre-dispatch size modeling needs to include plugin shim bytes.** Any time a feature is framed as "just wires up X with import type," a quick `bun run size` before declaring "zero-runtime-footprint" is warranted. The cost of being wrong is a limit raise mid-session, which is a policy exception (per the framework plan §"What this roadmap does NOT do" item 4: "Re-opening any v0 size budget"). In this case the limit raise was clearly justified (FEATURE bytes, not DEBT bytes) — but it still required a policy exception that should be forecasted rather than discovered.

**v0.2.4 and v0.2.5 share `bench/signals/HARNESS.md`.** The Director note dispatched v0.2.4 and v0.2.5 as "touching non-overlapping files." In fact, both sub-items touched `bench/signals/HARNESS.md`. v0.2.5 was already complete from a prior worktree when v0.2.4 dispatched, so no merge conflict materialized. But the overlap would have caused a conflict if both had been dispatched in parallel. Parallel dispatch authorization must check shared docs, not just source files.

---

## Learnings

See Learning #37 in `.team/learnings.md`.

**Learning #37 (added this session):** Plugin shims have runtime byte cost even with `import type` — always run `bun run size` before claiming zero-runtime-footprint. The v0.2.6 data plugin shim used `import type` for all type imports and a direct object literal for registration. Even so, the gz bundle grew 28 B. The gzip compression does not distinguish between "types-only" authoring intent and actual emitted bytes — what matters is what the bundler outputs after tree-shaking. Object literals have non-zero object creation cost at bundle time, regardless of type annotation strategy.

---

## Session anti-pattern caught

**Director note shared-file assumption.** The v0.2 session-start Director note authorized parallel dispatch for v0.2.4 ("size-row policy") and v0.2.5 ("build-path canonical") on the basis that they "touch non-overlapping files." Both sub-items edit `bench/signals/HARNESS.md`. This was caught before it became a conflict only because v0.2.5 was already completed in a prior worktree (PR #34 merged ahead of the v0.2 round-2 dispatch). Anti-pattern: non-overlapping file claims should be backed by `git diff --name-only` comparison between sub-item working branches, not by the Director's recall of the spec's listed files.

---

## v0.3 preview

v0.3 is the block grammar migration milestone: 8 Rust compiler sub-items migrating `@blockname {}` from the v0.2.2 stub to a full dual-grammar parser + emitter. This is the first milestone where the Rust compiler gates a TypeScript surface change — the `@aihu/plugin` v0.2.1 surface is what v0.3 will exercise at the compiler boundary.
