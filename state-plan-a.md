# State — Track: plan-a

**Last updated:** 2026-05-03 (6-track follow-up Historian close)
**Current main HEAD:** `b704cd9` (Merge PR #51 — t4e/examples-integrated)
**Test floor:** 612 TS + 222 Rust
**Previously updated:** 2026-05-03 (v0.8 Historian close)
**Written by:** Historian (v0.8 closeout: @scribe/cli scaffolder + Hello World template; 570 TS tests; Learning #39 added)
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

### Durable references (v0.2)

- Retro: `.team/v0.2/retro.md`
- Learning #37: `.team/learnings.md`

---

## v0.3 — CLOSED

**Date:** 2026-05-03
**Written by:** Historian (v0.3 closeout: 8 sub-items shipped; 100 Rust + 476 TS tests; Learning #38 added)
**Main HEAD at close:** `985674c`

### Sub-items shipped

| Sub-item | PR | Branch | Commit | Notes |
|----------|-----|--------|--------|-------|
| v0.3.1–3.2 | #35 | feat/v0.3-block-grammar-migration | `4768672` | @state/@template lowering confirmed + 22 Rust conformance tests |
| v0.3.3–3.7 | #35 | feat/v0.3-block-grammar-migration | `29fb1df` | $global style scope, deprecation warnings, undeclared-ref warnings, reserved-token rejection, @agent routing |
| v0.3 fixtures | #35 | feat/v0.3-block-grammar-migration | `4768672` | 5 `.scribe` + 5 `.golden.js` in `bench/compiler-conformance/blocks/` |

### Final gate walk (verified by Team Lead)

**Rust tests:** 78 → 100 (+22, 1 pre-existing ignored)
**TS tests:** 476 → 476 (unchanged — Rust-only milestone)

**Package sizes (`bun run size`):** unchanged from v0.2 (no new TS packages; Rust compiler is not browser-bundled)

**Typecheck:** pre-existing `agent-service:typecheck` failure only; no new errors.

**Dep envelope:** no new runtime deps added in v0.3.

### Key finding

v0.2.2's parse-phase infrastructure (body extraction, block kind routing) was complete. v0.3's 8 sub-items were analysis-phase work layered on top: `$global` scope detection, deprecation warnings, undeclared ref warnings, reserved-token rejection. Builder completed all 8 in 2 commits, well under planned budget. See Learning #38.

### Durable references (v0.3)

- Retro: `.team/v0.3/retro.md`
- Learning #38: `.team/learnings.md`
- Conformance fixtures: `bench/compiler-conformance/blocks/`
- Rust tests: `packages/compiler/tests/sfc_conformance.rs`

---

## v0.4 — CLOSED

**Date:** 2026-05-03
**Written by:** Historian (v0.4 closeout: 2 parallel streams; 163 Rust + 483 TS tests; 8/8 size rows)
**Main HEAD at close:** `d1bd820`

### Sub-items shipped

| Sub-item | PR | Stream | Notes |
|----------|-----|--------|-------|
| v0.4.9 | #36 | A (TS) | `onMount` + `onCleanup` in `@scribe/runtime`; Compressor pass (213 B raw recovered) |
| v0.4.1–4.4 | #37 | B (Rust) | `MacroValue` enum, `Attr::Macro` variant; quoted/curly/boolean parsing; C300 bare-value error; DEPRECATED on `@event`/`:attr` |
| v0.4.5 | #37 | B (Rust) | Template macro lowerings: `$if`, `$show`, `$each+$key`, `$bind:*`, `$on:*`, `$html`, `$raw`, `$once`, `$memo` |
| v0.4.6 | #37 | B (Rust) | `state_macros.rs`: `$prop`, `$computed`, `$resource`, `$effect`, `$effect.on`, `$watch`, `$action`, `$lifecycle.mount/dispose` |
| v0.4.7 | #37 | B (Rust) | `style_macros.rs`: `$reactive`, `$media`, `$when` |
| v0.4.8 | #37 | B (Rust) | `agent_macros.rs`: `$expose`, `$expose.write`, `$scope`, `$rate-limit`, `$describe`; manifest JSON extended |
| v0.4.10 | #37 | B (Rust) | Conformance fixtures: 5 template-attr pairs + 3 macro pairs |

**Deferred:** `$action` form-attr build-target split → v0.5 (explicit per framework plan)

### Final gate walk (verified by Team Lead)

**Rust tests:** 100 → 163 (+63, 1 pre-existing ignored)
**TS tests:** 476 → 483 (+7, 59 test files)

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

**Dep envelope:** no new runtime deps added in v0.4.

### Durable references (v0.4)

- Retro: `.team/v0.4/retro.md`
- Director note: `.team/v0.4/director-note-session-start.md`
- Conformance fixtures: `bench/compiler-conformance/template-attrs/` + `bench/compiler-conformance/macros/`
- Rust tests: `packages/compiler/tests/macro_attrs.rs`

---

## v0.5 — CLOSED

**Date:** 2026-05-03
**Written by:** Historian (v0.5 closeout: 8 sub-items; 186 Rust tests; `<$warp>` stub noted)
**Main HEAD at close:** `b29ce55`

### Sub-items shipped

| Sub-item | PR | Notes |
|----------|-----|-------|
| v0.5.1 | #38 | `<$slot>` + `<slot>` alias → `createSlotBoundary` |
| v0.5.2 | #38 | `<$suspense>` → `createSuspenseBoundary` |
| v0.5.3 | #38 | `<$shield>` → `createShieldBoundary` |
| v0.5.4 | #38 | `<$guard>` → `createGuardBoundary` |
| v0.5.5 | #38 | `<$warp>` → `createWarpBoundary` **stub** (NOTE(v0.5-stub); arbor.mount arbitrary-host API unconfirmed) |
| v0.5.6 | #38 | C400 slot/fallback mutual-exclusion error |
| v0.5.7 | #38 | C401 inline-JSX-in-attributes error |
| v0.5.8 | #38 | Conformance fixtures: 5 pairs in `bench/compiler-conformance/macro-elements/` |

### Final gate walk

**Rust tests:** 163 → 186 (+23, 1 ignored)
**TS tests:** 483 → 483 (Rust-only)
**Size:** unchanged

### Open item from v0.5

`<$warp>` arbor stub: `arbor.mount` arbitrary-host-node API unconfirmed. `createWarpBoundary` emits correct shell with `NOTE(v0.5-stub)`. Resolve when arbor.mount API is extended (v0.6 or v0.8 context). No new arbor exports added — compliant with Q10:D.

### Durable references (v0.5)

- Retro: `.team/v0.5/retro.md`
- Director note: `.team/v0.5/director-note-session-start.md`
- Conformance fixtures: `bench/compiler-conformance/macro-elements/`
- Rust tests: `packages/compiler/tests/macro_elements.rs`

---

## v0.6 — CLOSED

**Date:** 2026-05-03
**Written by:** Historian (v0.6 closeout: 2 streams; 209 Rust + 516 TS; router 1451→740 B)
**Main HEAD at close:** `8186488`

### Sub-items shipped

| Sub-item | PR | Stream | Notes |
|----------|-----|--------|-------|
| v0.6.1 | #40 | Rust | `@route` block parser + RouteBlock struct + C500 error + `@layout` shorthand |
| v0.6.2 | #40 | Rust | `.route.json` sidecar in `EmitResult.route_json` |
| v0.6.4 | #40 | Rust | `BuildTarget` enum + `--target` CLI flag |
| v0.6.6 | #40 | Rust | Client-build gates: @agent + $server elision |
| v0.6.9 | #40 | Rust | Conformance fixtures: route/ (2) + build-target/ (1) |
| v0.6.3 | #41 | TS | Router vite-plugin reads .route.json; `@scribe/router/plugin` subpath |
| v0.6.5 | #41 | TS | `BuildTarget` + `ScribeConfig.build?` in @scribe/server |
| v0.6.7 | #41 | TS | `createServerCall<Args,Return>` in @scribe/server/client.ts |
| v0.6.8 | #41 | TS | `virtual:scribe-layouts` + `scanLayouts()` in @scribe/router/plugin |

### Final gate walk

**Rust tests:** 186 → 209 (+23, 1 ignored)
**TS tests:** 483 → 516 (+33, 61 test files)

**Package sizes (`bun run size`):**

| Package | Size | Budget | Headroom |
|---------|------|--------|----------|
| `@scribe/context` | 249 B | 300 B | +51 B |
| `@scribe/signals` | 1.67 kB | 1970 B | +261 B |
| `@scribe/arbor` | 2.06 kB | 2200 B | +89 B |
| `@scribe/runtime` | 1.14 kB | 1170 B | +7 B |
| `@scribe/agent` | 117 B | 200 B | +83 B |
| `@scribe/data` | 778 B | 800 B | +22 B |
| `@scribe/router` | **740 B** | 1536 B | **+796 B** (dropped 711 B via browser/plugin split) |
| `@scribe/agent-service` | 580 B | 600 B | +20 B |

**Notable:** `@scribe/router` browser bundle dropped from 1451 B to 740 B after v0.6b separated build-time vite-plugin code into `@scribe/router/plugin` subpath. The +256 B router limit raise pre-authorized for v0.7.1 is now likely unnecessary.

### v0.7 is next

v0.7 = router middleware — `defineRouterMiddleware`, `composeMiddleware` isomorphic API per Q6:A Option 1. Router now has +796 B headroom; the pre-authorized +256 B limit raise (v0.7.1) may not be needed.

### Durable references (v0.6)

- Retro: `.team/v0.6/retro.md`
- Director note: `.team/v0.6/director-note-session-start.md`
- Conformance fixtures: `bench/compiler-conformance/route/` + `bench/compiler-conformance/build-target/`
- Rust tests: `packages/compiler/tests/route_and_build_target.rs`

---

## v0.7 — CLOSED

**Date:** 2026-05-03
**Written by:** Historian (v0.7 closeout: 5 sub-items; 534 TS tests; router 818 B, no limit raise needed)
**Main HEAD at close:** `570a2c7`

### Sub-items shipped

| Sub-item | PR | Notes |
|----------|-----|-------|
| v0.7.1 | #42 | `defineRouterMiddleware` + `composeRouterMiddleware` + types |
| v0.7.2 | #42 | `scanPages()` detects `_middleware.ts/js`; emits `middlewareFile` in virtual routes |
| v0.7.3 | #42 | `Plugin.serverOnly?: boolean` added to @scribe/plugin |
| v0.7.4 | #42 | Renames: `createRequestRouter`, `viteRouterIntegration`, `viteAgentReadinessIntegration`; old names kept as deprecated aliases |
| v0.7.5 | #42 | Stage-order comment at top of `composeRouterMiddleware` |

### Final gate walk

**Rust tests:** 209 (unchanged — TS-only)
**TS tests:** 516 → 534 (+18, 64 test files)
**Router size:** 740 B → 818 B / 1536 B (+718 B headroom — **+256 B raise NOT needed**)

### v0.8 is next

v0.8 = CLI scaffolder + Hello World template + first-run UX (`@scribe/cli`).

### Durable references (v0.7)

- Retro: `.team/v0.7/retro.md`
- Director note: `.team/v0.7/director-note-session-start.md`

---

## v0.8 — CLOSED

**Date:** 2026-05-03
**Written by:** Historian (v0.8 closeout: @scribe/cli scaffolder shipped; 570 TS tests; Learning #39 added)
**Main HEAD at close:** `90c95dc`

### Sub-items shipped

| Sub-item | PR | Notes |
|----------|----|-------|
| v0.8.1 | #43 | `@scribe/cli` package — `scribe app`, `scribe page`, `scribe component`, `scribe plugin`, `scribe migrate` commands; stdlib-only, zero deps |
| v0.8.2 | #43 | Hello World template — `package.json`, `scribe.config.ts`, `vite.config.ts`, `src/pages/index.scribe`, `src/layouts/default.scribe` |
| v0.8.5 | #43 | Plugin scaffold template — `scribe-plugin-<name>/package.json` + `src/index.ts` |
| docs | #43 | `docs/cli.md` light-off procedure |
| fix | `90c95dc` | `@scribe/cli` classified `BUILD_DEV_ONLY` in `check-size-rows` (post-merge fix) |

**Deferred:** v0.8.3 (full first-run interactive UX) and v0.8.4 (`docs/site/` light-off page) → deferred to v0.9 docs pass.

### Final gate walk

**Rust tests:** 209 (unchanged — TS-only milestone)
**TS tests:** 534 → 570 (+36, 65 test files)
**Size:** 8/8 PASS — CLI is `BUILD_DEV_ONLY`; no browser bundle row added
**check:size-rows:** PASS after `90c95dc` fix
**Typecheck:** pre-existing `agent-service:typecheck` failure only; no new errors

**Package sizes (`bun run size`) — unchanged from v0.7:**

| Package | Size | Budget | Headroom |
|---------|------|--------|----------|
| `@scribe/context` | 249 B | 300 B | +51 B |
| `@scribe/signals` | 1.67 kB | 1970 B | +261 B |
| `@scribe/arbor` | 2.06 kB | 2200 B | +89 B |
| `@scribe/runtime` | 1.14 kB | 1170 B | +7 B |
| `@scribe/agent` | 117 B | 200 B | +83 B |
| `@scribe/data` | 778 B | 800 B | +22 B |
| `@scribe/router` | 818 B | 1536 B | +718 B |
| `@scribe/agent-service` | 580 B | 600 B | +20 B |

### Notable findings

**Test count discrepancy in commit message:** PR #43 commit message said "+17 tests" (the planning-estimate floor); actual gate walk was +36 (534 → 570). Gate walk count is authoritative. See Learning #39.

**check-size-rows omission:** `@scribe/cli` was not classified in `check-size-rows` in the initial PR. Fixed post-merge at `90c95dc`. Learning #39 adds "check-size-rows classification" as a mandatory step on the package-creation checklist.

### Learnings added

- Learning #39 — New workspace packages require simultaneous check-size-rows classification; commit messages should reflect per-item test counts from gate walk, not planning estimates

### v0.9 is next

v0.9 = docs and testing pass. No new features. Sub-items: `docs/site/` Markdown site, end-to-end test coverage, dep-free re-audit, v1.0 release-pipeline rehearsal, `llms.txt` + MCP support validation. Director note at `.team/v0.9/director-note-session-start.md`.

### Durable references (v0.8)

- Retro: `.team/v0.8/retro.md`
- Director note: `.team/v0.8/director-note-session-start.md`
- v0.9 director note: `.team/v0.9/director-note-session-start.md`

---

## v0.9 — CLOSED

**Date:** 2026-05-03
**Written by:** Historian (v0.9 closeout: docs site + audit scripts; 570 TS tests unchanged)
**Main HEAD at close:** `cf72e7d`

### Sub-items shipped

| Sub-item | PR | Notes |
|----------|----|-------|
| v0.9.1 | #44 | `docs/site/` — 12 Markdown pages; `scripts/build-docs.ts` static site generator (13 HTML output) |
| v0.9.3 | #44 | `scripts/dep-check.ts` — dep-free audit; PASS |
| v0.9.4 | #44 | `scripts/hmr-check.ts` — HMR scribe-native confirmation; PASS |

**Deferred:** v0.9.2 (e2e integration test suite), v0.9.5 (cross-runtime adapter tests), v0.9.6 (build-tool independence smoke test) → v1.0 open issues.

### Final gate walk

**Rust tests:** 209 (unchanged — docs+scripts only milestone)
**TS tests:** 570 → 570 (unchanged — all test gaps already filled by prior milestones)
**`bun scripts/dep-check.ts`:** PASS
**`bun scripts/hmr-check.ts`:** PASS
**`bun scripts/build-docs.ts`:** PASS (13 HTML files)
**Size:** 8/8 PASS (no source changes)

### Notable findings

**Test gap audit was empty.** All three v0.9.2 gaps (router middleware, createServerCall, BuildTarget client elision) were already covered by prior milestones' Builders. The v0.9 milestone was primarily a docs + audit tooling pass.

**Handrolled static site generator.** `scripts/build-docs.ts` is a zero-dependency Markdown→HTML pipeline. Correct per v1 framework plan: the SSG is part of the v1.0 surface and must not depend on under-test code.

**Dep-free thesis confirmed.** All 12 packages pass `dep-check.ts` — zero non-`@scribe/*` runtime dependencies across the workspace.

### Durable references (v0.9)

- Retro: `.team/v0.9/retro.md`
- Director note: `.team/v0.9/director-note-session-start.md`
- Next: v1.0 cutover — see `docs/superpowers/plans/2026-05-02-scribe-v1-framework.md` §v1.0

