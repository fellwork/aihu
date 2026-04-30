# State — Track: plan-a

**Last updated:** 2026-04-30 (post-Round-N close)
**Written by:** Team Lead (post-Round-N closeout: Phase 4 + Phase 5 + signals headroom recovery + arbor v0+1 cleanup all landed)
**Track:** plan-a (TypeScript runtime family — signals → arbor → runtime → agent)
**Active branch:** `claude/scribe-phase-3-team-Za4UQ`
**Develop-on branch (all sessions):** `claude/scribe-phase-3-team-Za4UQ`
**Team branch HEAD:** `135c53c` (Round N close: 3 merge commits — signals headroom, Phase 5, arbor cleanup)

---

## What shipped

| Phase | Package | Status | PR / commit |
|---|---|---|---|
| 1 | Scaffold | ✅ Done | #1 |
| 2 | `@scribe/signals` | ✅ Done — base | #2 |
| 2.5 | Bench-spike + perf | ✅ Done — cellx fix, wide-fanout recovery, "ahead of alien-signals on all benches" | #6, #8 |
| 3 | `@scribe/arbor` | ✅ Done | #7 |
| 3.5 | Arbor v0+1 cleanup | ✅ Done — telemetry.ts extracted, mount.ts 195→150 lines, `_activeMountDisposers` de-exported | team `135c53c` |
| 4 | `@scribe/runtime` | ✅ Done — `defineElement` + `defineComponent` + `DefineOptions` + `ShadowMode` | team merge commit (Phase 4 PASS first try) |
| 5 | `@scribe/agent` | ✅ Done — `getAgentMetadata` + `registerAgentMetadata` + `AgentMetadata` registry | team merge commit (Phase 5 PASS WITH NOTES, 3 LOW all ACCEPT) |

**Final v0 footprint (all 4 packages, gz, post-Round-N):**

| Package | Size | Budget | Headroom |
|---|---|---|---|
| `@scribe/signals` | 1.53 kB | 1.7 kB | 172 B (10%) |
| `@scribe/arbor` | 1.28 kB | 2.05 kB | 772 B (38%) |
| `@scribe/runtime` | 438 B | 1.02 kB | 586 B (57%) |
| `@scribe/agent` | 72 B | 100 B | 28 B (28%) |
| **Combined** | **3.32 kB** | **4.0 kB** | **~680 B (17%)** |

**Test count:** 131 (124 unit + 7 agent + 3 integration). All green.

**Round N delta:**
- +49 tests (16 runtime + 7 agent + 1 arbor pre-existing audit + 27 minor in-suite adjustments)
- Signals: 1.55 kB → 1.53 kB (recovered 42 B raw gz from 3 candidates) + budget bumped 1.6 kB → 1.7 kB (earned by cellx + deep-perf wins per Investigator §6)
- Arbor: telemetry concern extracted to its own module; mount.ts at exactly 150 lines (Learning #13 cap)

---

## Active specs (status)

| Spec | Status | Tasks |
|---|---|---|
| `.team/phase-4/spec-runtime.md` | ✅ Shipped | Tasks 20–22 + `defineComponent` (§1.5 ratified) |
| `.team/phase-5/spec-agent.md` | ✅ Shipped | Tasks 23–24 |

No active build specs. Round N+1 is bench-spike work driven by `.team/phase-2-5-bench-spike.md` pattern, not a fresh package spec.

---

## Open items

| Item | Priority | Status |
|---|---|---|
| ~~Telemetry tree-shake fix~~ | ✅ CLOSED | Shipped in PR #7. |
| ~~Signals 49 B headroom investigation~~ | ✅ CLOSED | Investigation done; recovery applied (42 B raw gz); budget bumped 1.6 → 1.7 kB. |
| ~~Arbor v0+1 cleanup (Phase 3 Findings 1+2+3)~~ | ✅ CLOSED | Round N close: telemetry.ts extracted, mount.ts at 150-line cap, `_activeMountDisposers` de-exported, missing test was already pre-shipped upstream. |
| **Round N+1 — Arbor SOTA bench + signals memory dimension + competitor-parity workloads** | HIGH | Director-deferred to dedicated session. Learning #11 enforcement: arbor has zero SOTA receipts; signals has only time receipts (no memory). Round N+1 closes both gaps. |
| Phase 4 LOW findings (build-manifest cleanup) | LOW (v0+1) | 2 LOW found by Phase 4 Verifier; non-blocking; logged for v0+1 cleanup pass. |
| Phase 5 LOW findings (3 cosmetic) | LOW (v0+1) | Co-located `AgentMetadata`, moon.yml precedent, index.ts export order. All ACCEPTed; non-blocking. |
| README.md correction (signals docs) | ✅ CLOSED | Round N close: `MAX_BATCH_ITERATIONS` no longer described as public export. |
| mount.ts at 150-line cap | INFO | Any further additions will breach Learning #13. Worth a CI line-count check, or a note in the Learning entry. Round N+1+ consideration. |
| Plan staleness banner (Option 1) | LOW | Doc-only, 10 min. Update `docs/superpowers/plans/2026-04-24-scribe-v0-plan-a-ts-runtime.md` to acknowledge Phases 4+5 shipped. |
| ~~Branch protection audit on `main`~~ | DEFERRED to v1 | User policy: local CI only until v1. Re-evaluate at v1 cutover. |
| **Re-enable CI before v1 ships** | HIGH (at v1) | `.github/workflows/plan-a.yml` is `workflow_dispatch` only during v0. Restore push/pull_request triggers at v1 cutover; add branch protection to `main`. |

---

## Iteration budget

- Round N: 0 of 5 ping-pong rounds used per phase. All work PASSed first try.
- Round N+1 (next): bench-spike Mode 2 — fresh budget.

---

## Known repo facts (post-Round-N)

- `packages/runtime/` — exists with `defineElement` + `defineComponent` + types. 438 B / 1024 B.
- `packages/agent/` — exists with registry, AgentMetadata. 72 B / 100 B.
- `.size-limit.json` — 4 rows: signals (1700 B), arbor (2048 B), runtime (1024 B), agent (100 B).
- `packages/arbor/src/mount.ts` — 150 lines exactly. **Cap line — any addition breaches Learning #13.**
- `packages/arbor/src/telemetry.ts` — new in Round N (49 lines, internal-only).
- `bench/signals/` — exists with mitata-driven time benchmarks (cellx, wide-fanout-100, batched-writes-100); 6 competitors (alien, preact, vue, solid, sjs, scribe); `RESULTS.md` + `CHANGELOG.md`. **No memory benchmarks.**
- `bench/arbor/` — does NOT exist.
- All 4 package aliases pre-wired in `vitest.config.ts`.
- Learnings #1–22 all present in `.team/learnings.md`.

---

## Round N+1 scope (next session, deferred per Director)

**Mission:** close the two Learning #11 gaps that v0 cannot ship to first external eyes without:

1. **Arbor SOTA bench** — replicate Phase 2.5 bench-spike pattern at `bench/arbor/`. Workloads: 10k-leaf mount, deep tree update, wide-tree mount, attribute thrash, dispose churn. Comparators: lit-html, solid-js (DOM bindings), @vue/reactivity (effect-driven DOM), Preact (`htm` rendered), vanilla DOM baseline.
2. **Signals memory dimension** — add `bench/signals/src/memory.ts` runner. Same workloads × competitors matrix; metrics: peak heap during build, steady-state heap after N graphs, allocation-count delta via `v8.getHeapStatistics()`. `--expose-gc` for forced collections between phases.
3. **Competitor-parity workloads** — survey each competitor's named benches (alien-signals: deep-chain + dynamic-deps + GC profile; @vue/reactivity: reactive-object thrash + computed cascade + effect-scope teardown; solid-js: krausest js-framework-benchmark; @preact/signals-core: small-graph throughput; s-js: original sync-fine-grained micro). Lift the workloads we don't have. RESULTS.md gets a per-axis breakdown ("alien-signals' axes," "Vue's axes," etc.).
4. **CI gates extended** — memory regression ≥10% on `p50` of any new metric fails CI (mirrors existing time gate). Apply same shape to `bench/arbor/`.

After Round N+1: v0 is feature-complete with receipts. That's the natural ship gate.

---

## Durable references

- Plan: `docs/superpowers/plans/2026-04-24-scribe-v0-plan-a-ts-runtime.md`
- v0 spec: `docs/superpowers/specs/2026-04-23-scribe-v0-vertical-slice-design.md`
- Learnings: `.team/learnings.md`
- Phase 3 retro: `.team/phase-3/retro.md`
- Phase 3 verification: `.team/phase-3/verification-report.md`
- Phase 3 telemetry investigation: `.team/phase-3/telemetry-treeshake-investigation.md`
- Phase 4 spec: `.team/phase-4/spec-runtime.md`
- Phase 4 build-manifest: `.team/phase-4/build-manifest.md`
- Phase 4 verification: `.team/phase-4/verification-report.md`
- Phase 5 spec: `.team/phase-5/spec-agent.md`
- Phase 5 build-manifest: `.team/phase-5/build-manifest.md`
- Phase 5 verification: `.team/phase-5/verification-report.md`
- Signals headroom investigation: `.team/investigations/signals-headroom-investigation.md` (in worktree, will land via cherry-pick if needed)
- Signals headroom recovery verification: `.team/investigations/signals-headroom-recovery-verification.md` (in worktree)
- Arbor v0+1 cleanup verification: `.team/investigations/arbor-v01-cleanup-verification.md` (in worktree)
- Bench-spike playbook: `.team/phase-2-5-bench-spike.md`
- Cross-review: `.team/plan-a-cross-review-2026-04-29.md`
- Director-notes: `docs/topic-director-notes/plan-a-2026-04-30.md` (Round N route), `docs/topic-director-notes/plan-a-2026-04-30-round-N-post-phase-4.md` (Round N+1 setup)
