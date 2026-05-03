# State — Track: plan-a

**Last updated:** 2026-05-02 (post-v1-reconciliation Historian close)
**Written by:** Historian (v1-reconciliation closeout: spec quartet + v1 framework plan ratified to `docs/superpowers/`; 12 user decisions captured; learnings #34-36 added)
**Track:** plan-a (TypeScript runtime family — signals → arbor → runtime → agent)
**Active branch:** `claude/scribe-phase-3-team-Za4UQ`
**Develop-on branch (all sessions):** `claude/scribe-phase-3-team-Za4UQ`
**Team branch HEAD:** see `git log --oneline -1` (Round N+1 close: retro + learnings #23-27 + state update)

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
| N+1 | `bench/arbor` | ✅ Done — 6×6×2 SOTA harness; scribe fastest on mount + update vs JSDOM-compatible comparators | team branch merge |
| N+1 | `bench/signals` | ✅ Done — memory runner + 3 parity workloads; scribe wins cellx+dynamic-deps, loses deep-propagation | team branch merge |

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
| ~~Round N+1 — Arbor SOTA bench + signals memory dimension + competitor-parity workloads~~ | ✅ CLOSED | bench/arbor + bench/signals extended; both tracks merged; all gates pass. |
| solid-js + @vue/runtime-dom arbor bench — needs real browser runner (Playwright) | MEDIUM | Round N+2 |
| signals deep-propagation gap vs alien-signals (1.65×) | LOW | investigate in v0+1 signals work |
| memory bench quiesce protocol — current V8/Bun protocol gives GC-noise zeros for small graphs | LOW | v0+1 |
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
- `bench/signals/` — exists with mitata-driven time + memory benchmarks (cellx, wide-fanout-100, batched-writes-100, deep-propagation-100, dynamic-deps, creation-1to1000); 6 competitors; `RESULTS.md` + `CHANGELOG.md` + `HARNESS.md`. Memory runner at `src/memory.ts` (--expose-gc protocol). Gate extended with memory dimension.
- `bench/arbor/` — exists with 6 workloads × 6 competitors × 2 metrics (time + memory). gate.ts time-only. JSDOM-relative. solid-js/vue ERROR in all workloads (deferred to Round N+2 browser runner).
- All 4 package aliases pre-wired in `vitest.config.ts`.
- Learnings #1–27 all present in `.team/learnings.md`.

---

## Round N+1 scope — CLOSED

**Completed 2026-04-30.** Both tracks shipped:
1. bench/arbor/ — 6 workloads × 6 competitors × 2 metrics (time + memory). Scribe fastest on all mount + update workloads vs JSDOM-compatible comparators.
2. bench/signals/ — memory runner + 3 parity workloads (deep-propagation-100, dynamic-deps, creation-1to1000). Scribe wins on cellx, batched-writes, dynamic-deps, creation; loses deep-propagation to alien-signals (1.65×, documented as design-point gap).
3. CI gates extended — arbor gate.ts wired (time-only); signals gate extended with memory dimension.

v0 is feature-complete with receipts. Retro at `.team/round-n1/retro.md`. Learnings #23–27 in `.team/learnings.md`.

---

## Round N+2 scope (deferred)

Round N+2 (deferred): (1) browser-native arbor bench for solid-js and @vue/runtime-dom (Playwright runner) — JSDOM env gaps block both comparators (Learning #23); (2) signals deep-chain investigation — close the alien-signals deep-propagation gap (4.0 µs vs 2.4 µs, Learning #26); (3) memory bench protocol improvement — current V8/Bun GC-quiesce protocol gives noise zeros for small graphs (Learning #25). After Round N+2: v0 has complete receipts on all axes. That's the v0 → v1 cutover gate.

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

---

## v1-reconciliation session — CLOSED

**Closed 2026-05-02.** Multi-round Mode-2 planning session producing the
ratified v1 framework plan and spec quartet authority migration.

| Round | Output | Branch / commit |
|---|---|---|
| Director session-start | `.team/v1-reconciliation/director-note-session-start.md` | initial direction |
| Scout R1 (state map + Nuxt/Next gap) | `.team/v1-reconciliation/scout-report.md` | initial state at HEAD 7fa0957 |
| Architect R2 (initial roadmap draft) | `.team/v1-reconciliation/roadmap-draft.md` | superseded by R2.1 |
| Director Q6 research | `.team/v1-reconciliation/director-q6-research.md` | router middleware Option 1 |
| Investigator (`@route` + build-target) | `.team/v1-reconciliation/investigation-route-and-target.md` | both GAP, ~3-6 days |
| Scout R3 (spec quartet alignment) | `.team/v1-reconciliation/scout-spec-quartet-alignment.md` | ~62/95 GAP |
| Architect R2.1 (v0.2→1.0 roadmap) | `.team/v1-reconciliation/roadmap-v1.md` → `docs/superpowers/plans/2026-05-02-scribe-v1-framework.md` | moved at Builder R4 |
| Director validation | `.team/v1-reconciliation/director-r3-validation.md` | VALIDATE-WITH-NOTES (6 polish notes) |
| Builder R4 (migration) | merged at `6f2171b` | spec quartet to `docs/superpowers/specs/`; 6 polish notes applied inline |
| Verifier audit | `.team/v1-reconciliation/verification-builder-r4.md` | PASS-WITH-NOTES — READY-FOR-MERGE |

**User decisions ratified (12 total — listed individually to avoid the compound-bullet ambiguity Verifier flagged):**

1. Q3:A — file-based layouts (no `@layout {}` block syntax)
2. Q5:B — path convention `/server/_actions/` for server actions
3. Q6:A — middleware as provisional v0.6 surface
4. Q8 collapse — ratify Plugin Contract Spec as authority alongside the rest of the quartet
5. Q10:D — compiler-lowered Shield via `createShieldBoundary` helper reusing arbor's `ErrorHandler`
6. Q6 router middleware Option 1 — isomorphic API; +256 B router limit raise sequenced for v0.7
7. Interpretation A — full syntax migration to `@blockname { }` + `$attr` + `<$element>`
8. Milestone shape — 0.2 (basic features) → 0.9 (docs+testing) → 1.0 (cutover)
9. `docs/site/` Markdown for v1.0 docs (no separate documentation framework)
10. Naming Scheme A on Plugin Contract internals only (narrow rename pass)
11. Authority migration — MIGRATE v1 plan + spec quartet to `docs/superpowers/`
12. Path A amendments — apply inline + keep audit copies at `applied-amendments/`

**Key findings:**
- Spec quartet ~62/95 GAP from current scribe code; full syntax migration is a redesign, not extension
- v3 dep-free thesis (Learning #49) audit: scribe is essentially compliant at runtime today; only HMR client and select build-time tooling remain on Vite
- Router middleware Option 1 (isomorphic) keeps client-side nav guards inside `@scribe/*` (Option 2 would have pushed consumers to npm router-middleware libs)
- `<$shield>` is the spec quartet's name for ErrorBoundary; Approach D compiler-lowering keeps cost ~5-15 B framework-wide

**Learnings added (Historian close):**
- Learning #34 — Spec ratification surfaces cross-package naming collisions invisible to single-package audits
- Learning #35 — Spec-driven framework redesigns reveal scope as percentage-implemented, not features-missing
- Learning #36 — Compiler-lowered macro elements via existing primitives stays under runtime byte budgets

**Final-state gate walk on `main = 6f2171b` (Historian close, 2026-05-02):**
- Build (per-package `bun run --filter '@scribe/*' build`): all 8 packages PASS; `bun run build` aggregate fails on pre-existing `baselines:build` (no `rolldown.config` — known, non-blocking).
- Size: 8 / 8 PASS within budgets — context (+51 B), signals (+261 B), arbor (+15 B), runtime (+7 B), agent (+83 B), data (+39 B), router (+50 B), agent-service (+20 B). Arbor +15 B is on the conservative end of the Learning #47 build-path-variance band (+15 to +83 B observed across sessions); within tolerance.
- Tests: 454 / 454 passing (54 test files).
- Typecheck: pre-existing `agent-service:typecheck` failure only; no new errors introduced by this session.

**Open follow-ups (assigned to v1 milestones in roadmap):**
- arbor 15 B regression cleanup → v0.2.3
- router +256 B limit raise → v0.7.1
- runtime Compressor pass → conditional on v0.4 macro attribute landings (pre-authorized per Polish Note 5)
- build-path consistency canonical naming → v0.2.5
- CI re-enable → v1.0.1

Plan at `docs/superpowers/plans/2026-05-02-scribe-v1-framework.md`. Spec
quartet ratified at `docs/superpowers/specs/2026-05-02-spec-{block-structure,
template-attribute-syntax,macro-vocabulary,plugin-contract}.md`. Amendments
applied inline (Builder R4 path A choice — AMD-01 and AMD-03 were already
applied in spec text before migration; AMD-02 applied during migration with
**Option B path convention locked**). Audit copies of all three amendments at
`docs/superpowers/specs/applied-amendments/`.

### Durable references (v1)

- v1 framework plan: `docs/superpowers/plans/2026-05-02-scribe-v1-framework.md`
- Spec quartet authority: `docs/superpowers/specs/2026-05-02-spec-{block-structure,template-attribute-syntax,macro-vocabulary,plugin-contract}.md`
- Applied amendments audit: `docs/superpowers/specs/applied-amendments/2026-05-02-AMD-{01,02,03}-applied.md`
- Spec-amendments redirect: `docs/README.md`
- Director session-start: `.team/v1-reconciliation/director-note-session-start.md`
- Director Q6 research: `.team/v1-reconciliation/director-q6-research.md`
- Director validation: `.team/v1-reconciliation/director-r3-validation.md`
- Scout R1 (state map + Nuxt/Next gap): `.team/v1-reconciliation/scout-report.md`
- Scout R3 (spec quartet alignment): `.team/v1-reconciliation/scout-spec-quartet-alignment.md`
- Investigator (`@route` + build-target): `.team/v1-reconciliation/investigation-route-and-target.md`
- Verifier audit: `.team/v1-reconciliation/verification-builder-r4.md`
- Session retro: `.team/v1-reconciliation/retro.md`
- Assets package design stub (deferred): `.team/v1-reconciliation/assets-package-design-stub.md`
- Architect R2.1 source draft: migrated (was `.team/v1-reconciliation/roadmap-v1.md`; now `docs/superpowers/plans/2026-05-02-scribe-v1-framework.md`)
- **Canonical size command:** `bun run size` — see `bench/signals/HARNESS.md` "Build paths" and `.size-limit.json` README. Per Learning #47, do not cross-compare with moon-orchestrator path output.

---

## v0.2 — CLOSED

**Date:** 2026-05-03
**Written by:** Historian (v0.2 closeout: 6 sub-items shipped; 476 tests; dep-free; Learning #37 added)
**Main HEAD at close:** `faa2d17`

### Sub-items shipped

| Sub-item | PR | Branch | Commit | Notes |
|----------|-----|--------|--------|-------|
| v0.2.1 | #29 | feat/v0.2.1-plugin-entry-point | `8c76b41` | @scribe/plugin package + defineScribeConfig.plugins field; +12 tests |
| v0.2.2 | #30 | feat/v0.2.2-parser-stub | `3f6176a` | @blockname {} dual-grammar parser stub; +6 Rust tests |
| v0.2.3 | #32 | compressor/v0.2.3-arbor-cleanup | `f112ff6` | arbor Compressor pass; 99 B recovered; +89 B headroom |
| v0.2.4 | #31 | docs/v0.2.4-size-row-policy | `3433f28` | size-row policy + check:size-rows CI lint; +7 tests |
| v0.2.5 | #34 | docs/v0.2.5-build-path-canonical | `faa2d17` | 'bun run size' named canonical; 3 doc edits |
| v0.2.6 | #33 | feat/v0.2.6-data-plugin-registration | `8c4d33e` | @scribe/data plugin shim; +3 tests; NOTE: @scribe/data limit raised 750→800 B for plugin shim bytes |

### Final gate walk (verified by Team Lead)

**Tests:** 454 → 476 (+22 tests, 58 test files)

**Package sizes (`bun run size`):**

| Package | Size | Budget | Headroom |
|---------|------|--------|----------|
| `@scribe/context` | 249 B | 300 B | +51 B |
| `@scribe/signals` | 1.67 kB | 1970 B | +261 B |
| `@scribe/arbor` | 2.06 kB | 2200 B | +89 B |
| `@scribe/runtime` | 1.14 kB | 1170 B | +7 B |
| `@scribe/agent` | 117 B | 200 B | +83 B |
| `@scribe/data` | 778 B | 800 B | +22 B |
| `@scribe/router` | 1.45 kB | 1536 B | +50 B |
| `@scribe/agent-service` | 580 B | 600 B | +20 B |

**Typecheck:** pre-existing `agent-service:typecheck` failure only; no new errors.

**Dep envelope:** no new runtime deps added in v0.2.

### Notable finding: @scribe/data limit raise (v0.2.6)

The plugin registration shim added 28 B gz to the `@scribe/data` bundle even when using `import type` + a direct object literal. The v0.2.6 Builder raised the `@scribe/data` limit from 750→800 B. Per the framework plan §"What this roadmap does NOT do" item 4 ("Re-opening any v0 size budget"), this was NOT pre-authorized — however, per Learning #42 split rationale, these are FEATURE bytes (new plugin registration capability), not debt bytes. The Director note's assumption that the shim would be zero-runtime-bytes was incorrect. Documented as Learning #37.

### v0.3 is next

v0.3 = block grammar migration — 8 Rust compiler sub-items migrating `@blockname {}` from the v0.2.2 parser stub to a full dual-grammar parser + emitter.

### Durable references (v0.2)

- Retro: `.team/v0.2/retro.md`
- Learning #37: `.team/learnings.md`

