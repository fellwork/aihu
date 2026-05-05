# Phase 2.5 — Bench-Spike Launch Brief

**Status:** Self-contained brief for a future session's Team Lead. Read this cold.
**Author:** Phase 3 spec-session Team Lead (handoff)
**Date:** 2026-04-26
**Branch this brief lives on:** `spec/phases-3-4-5` (rides along with the Phase 3/4/5 specs PR).
**Predecessor PRs:**
- #1 Phase 1 (scaffolding) — merged
- #2 Phase 2 (`@aihu/signals`) — merged
- #3 Phase 3 prep (`chore/phase-3-prep`) — merged
- #4 Phase 3 launch brief — merged
- (this PR) Phase 3/4/5 specs + Phase 2.5 bench-spike brief

---

## Why this session exists

The Phase 3 spec session locked an **aggressive R&D performance posture** (Learning #10): aihu is positioned as runtime-reactivity research, not just an app framework. To honor that posture, **v0 must ship measurable wins on at least one performance axis** — not aspirationally, but as a CI-enforced gate.

This requires a benchmark that:

1. Establishes a baseline for `@aihu/signals` (already shipped — Phase 2's 698 B gz / 36 tests).
2. Compares aihu head-to-head against state-of-the-art competitors on workloads that mirror real arbor usage (not just synthetic micro-bench).
3. Becomes the **gate** for every runtime PR thereafter: if performance regresses ≥10% on any workload, CI fails. If a PR claims to make the runtime faster, it must drop bench receipts in the same PR.

This session ships the bench harness and the baseline numbers. Future sessions consume the harness when they ship optimizations.

---

## Two bench tracks (Team Lead Phase 3 session decision)

**Track A — Vanilla aihu vs. SOTA JavaScript signal/runtime libraries.** Apples-to-apples comparison of `@aihu/signals` (and, when arbor lands, `@aihu/arbor`) against:
- alien-signals (StackBlitz)
- @preact/signals-core
- @vue/reactivity (consumed via `import { ref, effect, computed } from '@vue/reactivity'`)
- solid-js (`createSignal`, `createEffect`, `createMemo`)
- S.js (the original signals library, included as historical baseline)

This track tells us where aihu stands in the JS reactivity ecosystem. It's the track that becomes the regression gate.

**Track B — Aihu + magna end-to-end.** Round-trip latency and throughput for a workload that exercises the full stack: magna receives a GraphQL query → returns rows → aihu binds them to signals → arbor mounts them as DOM. Workloads include initial render, subscription updates, and (eventually) resumable hydration.

This track tells us how the canonical aihu stack performs as a stack. It's the track that justifies the magna integration claim.

**Two tracks, separate `bench/<package>/` directories, separate CI gates.** Track A regressions block any merge to runtime packages. Track B regressions block magna-integration merges (sub-project #4) but do NOT block runtime-only changes.

---

## Source-of-truth docs (every Builder reads these)

1. **v0 spec** — `c:/git/fellwork/aihu/docs/superpowers/specs/2026-04-23-aihu-v0-vertical-slice-design.md`. §11 (Testing) defines the bench gate at a high level. This brief operationalizes it.
2. **Phase 2 spec** — `.team/phase-2/spec-signals.md`. The `@aihu/signals` API is locked.
3. **Phase 3 arbor spec** — `.team/phase-3/spec-arbor.md`. Track A's arbor benchmarks land after arbor ships; design Track A so it can incorporate arbor benchmarks without rework.
4. **Phase 2 retro** — `.team/phase-2/retro.md`. The "wide-fanout concern" is the canonical workload Track A must include.
5. **Project-portable learnings** — `.team/learnings.md`. **Mandatory.** Learning #11 (bench-vs-SOTA gate) is what this session operationalizes.
6. **magna README** — `https://github.com/fellwork/magna/blob/main/README.md` or `c:/git/fellwork/magna/README.md` if a sibling clone exists. For Track B context only.

---

## Sequencing

This is a **one-Builder spike**, ~1 day wall-clock. The scope is gated:

- **Track A first.** Land it as a complete deliverable: harness + 5 competitors + 3 workloads + RESULTS.md + CI gate. No partial commits.
- **Track B second**, in a follow-up commit if time allows. If Track A takes longer than budgeted, ship it alone and defer Track B to a separate session.

**Do not run this session before the Phase 3 specs PR merges.** This session uses the same `spec/phases-3-4-5` branch (or a follow-up branch from the merged main).

---

## Track A — design

### Workloads (must land in v0)

Three workloads, each with a fixed input size. Each runs in `mitata` (zero-dep, current SOTA for JS micro-bench; if installation is slow, fall back to `tinybench`).

**Workload 1 — `cellx`.** S.js's classic. One source signal feeds a 5-deep diamond graph of computeds. One write to the source; how long to propagate to the leaves. Industry standard; easy to reproduce; tests propagation efficiency.

**Workload 2 — `wide-fanout-100`.** One signal feeds 100 cheap computeds; each is subscribed by an effect. One source write; how long until all 100 effects have run. **This is the Phase 2 retro's canonical concern.** It tells us if aihu is fast on the workload that worried us most.

**Workload 3 — `batched-writes-100`.** Inside one `batch()`, write 100 distinct signals each feeding one effect. How long for the batch flush to fire all effects. Tests batch efficiency, which alien doesn't have built-in.

After arbor ships:

**Workload 4 (deferred until arbor) — `mount-10k-leaves`.** Same shape as v0 spec §11's bench gate. Mount 10,000 static text leaves; how long. This is JS-only (no DOM diffing competitors).

**Workload 5 (deferred until arbor) — `update-1-of-10k-leaves`.** Mount the 10k tree, then change one leaf's signal. How long until the DOM reflects the change. Tests granular update efficiency vs. VDOM-style libraries.

### Competitors

Five baselines, all bundled by mitata's per-bench runner:

| Library | Version | Source |
|---|---|---|
| `@aihu/signals` | workspace:* | local |
| `alien-signals` | latest stable from npm | npm |
| `@preact/signals-core` | latest stable | npm |
| `@vue/reactivity` | latest stable | npm |
| `solid-js` | latest stable | npm |
| `s-js` | latest stable | npm |

**Pin versions in `bench/signals/package.json`.** Track A's regression gate is "did *we* slow down" — competitor version bumps are bench updates, not regression triggers.

### Metrics (per workload, per competitor)

mitata produces these by default:

- `min` / `mean` / `p50` / `p95` / `p99` / `max` time per operation
- Operations per second (`ops/s`)
- Heap allocation delta (when `--gc` flag enabled)

Track A reports `mean`, `p50`, `p99`, and `ops/s` in `RESULTS.md`. The regression gate is on `p50` (mean is too noise-sensitive; tail latency is what users feel; p50 is the fairest middle).

### Output artifacts

**`bench/signals/RESULTS.md`** — table per workload, row per competitor, columns `mean / p50 / p99 / ops/s`. Updated by CI on every commit to `main` that touches `packages/signals/`. Includes a date-stamped header.

**`bench/signals/HARNESS.md`** — how to add a new benchmark. ~150 lines max, includes: directory structure, how to add a workload, how to add a competitor, how the CI gate computes regression. **This file is what makes Track A reusable across phases.** Without it, every future PR that claims to optimize signals builds a one-off bench, and numbers don't compose.

**`bench/signals/CHANGELOG.md`** — append-only log of bench results across commits. Future sessions can grep for "when did `cellx` get faster?" and find the commit.

### CI gate

`.github/workflows/plan-a.yml` adds a `bench` job (gated to `packages/signals/**` and `bench/signals/**` path filters). Steps:

1. Build the bench harness.
2. Run `bun run bench:signals` (or equivalent — Builder picks runner).
3. Read previous green commit's `RESULTS.md` from `main`.
4. For each workload, compute `(current.p50 / previous.p50) - 1`. If any value > 0.10 (10% slower), fail with a clear error message naming the regressed workload.
5. If green, write the new `RESULTS.md` to the commit.

**Exception path:** PR commit message containing `[bench-bump]` lets a regressing change land — for cases where a correctness fix necessarily slows a path. Builder must justify in the PR description.

### Stretch — add gz size to the report

Mitata measures runtime. Add a section to `RESULTS.md` reporting each competitor's gzipped bundle size (we already have size-limit for `@aihu/signals`; extract competitor sizes from `node_modules` via a one-shot script). Tells the reader "we're competitive on bytes AND time" or "we lose on bytes by X" — both useful.

---

## Track B — design (if time permits)

### Workloads

**Workload 1 — initial-render-100-rows.** magna serves a GraphQL query returning 100 rows. aihu binds them to a signal-driven list. Time from query dispatch to first paint of all 100 rows.

**Workload 2 — subscription-update-1-row.** With the 100-row list mounted, magna pushes a subscription update for row 50. Time from subscription event to DOM update.

**Workload 3 — initial-render-cold-cache.** Same as Workload 1 but with no warm-up runs (cold magna cache, cold aihu runtime). Tells us the worst-case real-user experience.

### Setup

- Local magna server in Docker (per magna README quickstart).
- Postgres with a fixed seed schema (1000 author rows, 100k post rows). Identical to magna's own bench setup if available; otherwise document the schema.
- Playwright + Chromium for browser-side measurement (Track B exercises real DOM).

### Competitor for Track B

magna+aihu vs. **a hand-rolled equivalent stack**: hasura (GraphQL) → fetch in browser → hand-written reactive list (or Vue/React/Solid). One competitor configuration, not five — Track B is about validating the integration claim, not winning a JS shootout.

### Output artifacts

`bench/integration/RESULTS.md` — table format mirroring Track A. CI gate identical structure but only fires on changes to `packages/dev/`, `packages/runtime/`, or magna integration code in sub-project #4.

---

## Roster — minimal team

| Role | Output | Time budget |
|---|---|---|
| Team Lead | Pre-flight check, monitor Builder, adjudicate scope creep | ~10 min |
| Builder | All bench code, RESULTS.md, HARNESS.md, CI gate | ~6–8 hours wall-clock |

No Scout (the v0 spec, Phase 3 arbor spec, and magna README are sufficient context). No Architect (this brief IS the spec). No Verifier as a separate role — the bench *is* its own verification (it produces numbers; numbers are checkable). The Builder commits to running the suite locally before opening PR and pasting results in the PR description.

---

## Spawn instructions for the next Team Lead

### Step 0 — Read first (10 min)

1. This brief end to end
2. `.team/learnings.md` Learning #10 (in-house thesis-path) and Learning #11 (bench-vs-SOTA gate)
3. v0 spec §11 (Testing pyramid)
4. Phase 2 retro "Phase 3 risks already visible" — wide-fanout is the canonical concern this bench addresses

### Step 1 — Decision: Track A only, or both Tracks?

If wall-clock is tight (<6 hours available), commit to **Track A only.** Don't half-ship Track B. Track A is the gate; Track B is the marketing artifact.

### Step 2 — Spawn one Builder

Brief: "Implement Track A per `.team/phase-2-5-bench-spike.md` §Track A. Five competitors, three workloads, results in `bench/signals/RESULTS.md`, harness doc in `bench/signals/HARNESS.md`, CI gate in `.github/workflows/plan-a.yml`. Decision 2B authority on harness implementation details. Apply Learnings #1, #2, #5, #11."

### Step 3 — Verify

Builder pastes RESULTS.md table in PR description. Team Lead inspects:
- Are all 5 competitors and 3 workloads represented?
- Are aihu's numbers competitive (within 2× of fastest)? If aihu is 5× slower on any workload, halt and investigate.
- Does the CI gate actually run on the PR?

### Step 4 — Open PR

Single PR: `feat(bench): Phase 2.5 bench-spike — signals harness + baseline (Track A)`. Body summarizes the workloads, lists the competitor versions, includes the RESULTS.md table inline. Future-readers should be able to read the PR description without opening any file.

### Step 5 — Hand off

Once Track A merges, the next session is Phase 3 arbor implementation (the Builder team for the spec already on disk). Track B is a separate future session — flag it in `.team/` for the next Team Lead to pick up.

---

## Hard stops

- Builder spends >150% of time budget → halt, write a continuation note, ship Track A in whatever state it's in (with caveats clearly documented).
- Aihu is >5× slower than fastest competitor on any workload → halt, investigate before claiming "we're competitive."
- A workload's numbers are wildly inconsistent run-to-run (>30% variance) → harness bug, not a regression. Fix the harness before reporting numbers.
- CI gate flakes (false-positive regression) more than once in 24h → adjust threshold or add warm-up runs.

---

## What this session does NOT do

- Implement any optimizations to `@aihu/signals` (only measures the current state)
- Add or modify any non-bench tests
- Touch arbor / runtime / agent (those are spec-locked but not yet implemented)
- Run Track B if Track A is unfinished
- Publish the results externally (that's a separate decision; bench data lives in-repo first)

---

## Token and wall-clock ceilings

- Wall-clock: 6–8 hours for Track A, +2–4 hours for Track B if pursued.
- Token: 200k input ceiling for Builder. The spike is implementation-heavy, not research-heavy.

---

## Final checklist before spawning

- [ ] Phase 3 specs PR is merged to `main`
- [ ] Read this brief end to end
- [ ] Read learnings #10, #11
- [ ] Track A vs A+B decision made
- [ ] Builder prompt drafted

When the four are checked, spawn. Good luck.
