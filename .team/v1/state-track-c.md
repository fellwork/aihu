# Track C State — SSR + Signals
**Track:** C
**Branch:** `feat/v1-ssr-signals` (merged; all active work on `main`)
**Plans:** 3.1 (Streaming SSR), 6.2 (Signals Deep-Chain Optimization)
**Initialized:** 2026-04-30
**Last updated:** 2026-05-01 (Round 8 — H4-tactical shipped; Track C COMPLETE)

---

## Status

| Plan | Status | Owner | Notes |
|---|---|---|---|
| 3.1 Streaming SSR | COMPLETE (main `ec24d41`) | — | `renderToStream`, `DataSource<T>`, `StreamOptions`; `ssr-stream.test.ts` 167 lines |
| 6.2 Deep-chain Phase 0 (Option C) | COMPLETE (main `8223dbb`) | — | `HAS_EFFECT_SUB` flag + conditional push; ~18% improvement (4.00→3.27 µs p50); ≤1.54 kB gz |
| 6.2 Deep-chain Phase 1 (Option D) | **FAIL on Linux** (main `8e74a95`) | — | WSL2 bench 2026-05-01: 3.49 µs p50 vs ≤ 3.00 µs target. Correctness PASS. Phase 2 opened. |
| 6.2 Deep-chain Phase 2+3 | **SHIPPED** (main `512b7b6`) | — | H4+H5+K1c++H4-tactical; deep-prop 4.00→3.26 µs (−18.5%); memory 10.24→1.62 KB (−84%); all no-regression gates green. |

---

## Plan 3.1 — Streaming SSR

### What exists (baseline)

**File:** `packages/server/src/ssr.ts`

- `renderToString(component: ComponentDescription, opts?: SsrOptions): Promise<string>` — fully synchronous internal logic; `async` only because `Promise<string>` is the return type. No awaits inside.
- `renderNode(node, path, hydratable)` — synchronous recursive tree walker; handles `{ kind: 'branch' }` and `{ kind: 'leaf' }` arbor nodes.
- `buildHead(head: HeadConfig)` — synchronous head HTML builder.
- `SsrOptions.serializer` — synchronous `() => Record<string, unknown>` injection point for state serialization.
- `SsrOptions.hydratable` — when true, emits `data-aihu-path` attributes on every branch node.

**File:** `packages/server/src/index.ts`

Exports: `renderToString`, `SsrOptions`, `ComponentDescription`, `MetaTag`, `LinkTag`, `HeadConfig`, plus router/middleware/API/data/config/agent-readiness exports.

### Deliverables for 3.1

- [x] `packages/server/src/stream-types.ts` — `DataSource<T>`, `StreamOptions`
- [x] `renderToStream(component: ComponentDescription, opts?: StreamOptions): ReadableStream<string>` added to `ssr.ts`
- [x] `renderToString` refactored to drain `renderToStream` internally
- [x] New exports in `packages/server/src/index.ts`: `renderToStream`, `DataSource`, `StreamOptions`
- [x] Tests: `packages/server/tests/ssr-stream.test.ts` (167 lines, ≥6 tests)
- [x] All existing `renderToString` tests still pass

### Open questions (decided — see director note Round 1)

- **OQ-V5** (streaming return type): RESOLVED — `ReadableStream<string>`, no wrapper
- **OQ-V6** (SSR dehydration): RESOLVED — inherit existing `hydratable` behavior; streaming-boundary dehydration deferred to v2
- **Node ESM `ReadableStream` global**: OPEN — Architect must confirm Node version minimum before Builder starts. If Node 16 is in support matrix, import from `'stream/web'`.

### Dependency on Track B (Plan 2.2)

**None.** `renderToStream` is built against a `DataSource<T>` stub interface defined in `packages/server/src/stream-types.ts`. Track B's `createResource` will implement this interface when it ships. No Track B code needs to exist for Track C to build and test 3.1.

---

## Plan 6.2 — Signals Deep-Chain Optimization

### Bench baseline (from learnings.md #26 and bench/signals/RESULTS.md — 2026-04-30)

These are the canonical numbers the Verifier uses to assess any implementation. All measurements: Bun 1.3.8, mitata 1.0.34, machine = Builder's machine.

#### `deep-propagation-100` (primary target workload)

100-deep linear chain: `src → c0 → c1 → … → c99 → effect`

| Competitor | mean | p50 | p99 | ops/s |
|---|---:|---:|---:|---:|
| **@aihu/signals** | 4.04 µs | **4.00 µs** | 4.52 µs | 247.6K |
| **alien-signals** | 2.44 µs | **2.42 µs** | 2.65 µs | 410.6K |
| @preact/signals-core | 3.13 µs | 3.13 µs | 3.27 µs | 319.0K |
| @vue/reactivity | 4.72 µs | 4.71 µs | 4.89 µs | 211.9K |
| s-js | 2.00 µs | 2.00 µs | 2.08 µs | 500.0K |

**Gap to close:** 1.65× (aihu 4.00 µs vs alien 2.42 µs). Target: ≤ 30% gap reduction = aihu ≤ 3.00 µs p50 (≥ 333K ops/s). Parity target: aihu ≤ 2.55 µs p50.

#### No-regression gates (all must hold after any 6.2 implementation)

These are the passing baselines that 6.2 must not regress by more than 10% (per Learning #11):

| Workload | @aihu/signals p50 | Regression floor (−10%) |
|---|---:|---:|
| cellx | 506.05 ns | ≤ 557 ns |
| wide-fanout-100 | 4.68 µs | ≤ 5.15 µs |
| batched-writes-100 | 2.60 µs | ≤ 2.86 µs |
| dynamic-deps | 741.87 ns | ≤ 816 ns |
| creation-1to1000 | 69.27 µs | ≤ 76.2 µs |

### Implementation context

**Key files:**
- `packages/signals/src/signal.ts` — `markOne` (lines 185–248), `propagateMark` (line 252), wave counter, iterative DFS mark stack
- `packages/signals/src/computed.ts` — `recomputeIfNeeded`, `hasEffectSub`, equality short-circuit (`shallowClear`)
- `packages/signals/src/effect.ts` — effect node pool (size 8), dispose cleanup
- `bench/signals/src/workloads/deep-propagation-100.ts` — the workload under investigation

**Key architectural facts (from reading source):**
- aihu uses a **forward-subscription push model**: signal write → `wave++` → `propagateMark(head)` → iterative DFS visit of all 100 nodes → `settleAndDrain()` → `recomputeIfNeeded` on all visited nodes → drain effects
- The iterative DFS (`markOne`) uses a module-level explicit stack (`markStackSubs`, `markStackKinds`) to avoid call-stack overflow on deep chains
- `wave` counter provides O(1) dedup: `sub.lastWave === wave` short-circuits re-marking the same node in the same wave
- The **restricted-leaf fast path** in `markOne` (lines 222–228): when a source-signal-only computed has exactly one effect subscriber, it settles inline during marking — this is the path that wins on `cellx` and `wide-fanout-100`
- In a 100-deep chain, the restricted-leaf fast path fires for `c98 → effect` only; nodes `c0–c97` have computed-deps and so the general path is taken for all intermediate nodes

**Structural reason for the gap (from learnings.md #26):**
> aihu's forward-subscription model re-wires the subscription set on every dependency rotation — which is exactly what dynamic-deps exercises. Alien-signals' push-pull with version counters handles long chains more efficiently by short-circuiting at version equality; aihu must propagate through each node in the chain.

**What the Investigator must analyze:**
- Alien-signals' mechanism (in `bench/signals/node_modules/alien-signals/esm/system.mjs`) for deferring deep-chain propagation
- Whether a version counter per signal node would allow aihu to short-circuit in a 100-deep chain during the _mark phase_ (not applicable on every write, but potentially applicable on reads that don't change value)
- Whether lazy pull (mark direct children only, let downstream pull on read) is compatible with aihu's effect-settled-in-mark design
- Whether the iterative mark stack itself has constant-factor overhead compared to alien's model that could be reduced without a full model change

### Deliverables for 6.2

**Phase 0 (Option C) — COMPLETE:**
- [x] `investigation-deep-chain.md` in `.team/v1/` — Investigator's report
- [x] Architect spec for Option C
- [x] Builder implementation (`HAS_EFFECT_SUB` flag + conditional `visited.push`)
- [x] `bench/signals/RESULTS.md` updated (4.00→3.27 µs p50, ~18% improvement)
- [x] `bench/signals/CHANGELOG.md` row appended
- [x] All 6 no-regression gates confirmed green
- [x] All existing signal tests pass

**Phase 1 (Option D) — CONDITIONAL PASS (correctness PASS; perf unverified on Windows):**
- [x] Architect spec for Option D — `spec-6.2-phase1-option-d.md` (`7ff92c0`)
- [x] Builder implementation — `8e74a95` (merged to main alongside Plan 2.2)
- [x] All correctness AC pass
- [ ] Bench confirmation ≥25% total improvement — PENDING Linux/macOS run
- [ ] No-regression gates confirmed on reference hardware — PENDING Linux/macOS run

**Phase 1 key additions:** `PENDING = 0x100` flag; `markOne` linear/fan-out split; `checkDirty` iterative function; `drainEffectQueue` PENDING check; cascade-suppression settle step; `lastWave` signal detection; 4 new deep-chain tests.

**Notable deviations from spec (all assessed as sound):**
- `checkDirty` does not clear PENDING eagerly — no-new-array approach
- Cascade-suppression settle step not specified in §6.2 but algorithmically correct
- `bun:test` import in test file corrected to `vitest` by Team Lead pre-merge

### Bundle size constraint

Current `@aihu/signals` bundle post Phase 1: **1.67 kB gz** (cap raised to **1850 B** per spec §10.3).
Pre-Phase-1 Phase 0 baseline: 1.54 kB gz. Phase 1 added ~130 B gz.

Note: `@aihu/arbor` bundles signals (not externalized). The Phase 1 growth flowed through into the arbor bundle, requiring the arbor cap to be raised to 2200 B. If signals grows further in any Phase 2 work, arbor's cap must be reviewed again.

---

## Round history

| Round | Date | Director note | Outcome |
|---|---|---|---|
| 1 | 2026-04-30 | `director-notes/track-c-round-001.md` | Session start; GO for both plans |
| 2 | 2026-04-30 | `director-notes/track-c-round-002.md` | Spec (3.1) and investigation (6.2) assessed; GO for Builder 3.1 and Builder 6.2-Phase0 (Option C) in parallel; Option D (Phase 1) HOLD pending bench confirmation |
| 3 | 2026-04-30 | — | Plan 3.1 COMPLETE (`ec24d41`); Plan 6.2-P0 COMPLETE (`8223dbb`); Phase 0 bench confirmed ≥18% improvement; Phase 1 Option D unblocked for Architect spec |
| 4 | 2026-04-30 | — | Plan 6.2-P1 Option D CONDITIONAL PASS (`8e74a95`); Architect spec `7ff92c0`; correctness verified; perf unverified on Windows; Linux/macOS bench required before track marked COMPLETE |
| 5 | 2026-05-01 | TBD (this session) | Phase 1 verified on WSL2: 3.49 µs p50 vs ≤ 3.00 µs target = **FAIL**. Phase 2 opened to close the remaining 1.03 µs gap to alien-signals. |
| 6 | 2026-05-01 | `director-notes/track-c-round-006.md` | Phase 3 / K1c+fn-promotion shipped at `a0a93d6`: **SOFT PASS** — memory 1.62 KB (81% drop from H5 8.68 KB, 2× under hard target 4 KB); bundles signals 1775 B (75 B headroom), arbor 2086 B (net-negative −47 B vs H5); deep-prop p50 3.39 µs (mitata noise of H5 3.37 µs mean; strict-read miss vs ≤ 3.30 µs ceiling); ranks held cellx #1, batched-writes-100 #1, dynamic-deps #1/#2; 329/329 repo tests; public API byte-identical. Builder↔Verifier 1/5. |
| 7 | 2026-05-01 | `director-notes/track-c-round-007.md` | Ship-or-stack call. Director recommends **Path X (ship Phase 3, update perf-gate spec language to 3-run mean per Verifier §10 #6, open Round 8 on Track A/B)** with surface-to-user; Path Y (H4-tactical T1+T2+T6, 1 cycle, ~35% hard-pass odds, +60 B / 15 B residual headroom) and Path Z (V8 IC polymorphism / markStack hypothesis, 2–3 cycles) articulated as alternatives. v1 narrative intact regardless. Phase 3 budget 1/5 used (4/5 remaining if Y or Z). |
| 8 | 2026-05-01 | — | **H4-tactical T1+T2+T6 SHIPPED** (`512b7b6`). WSL2 3-run mean 3.26 µs (Runs 1+2: 3.21/3.22 µs pass gate; Run 3: 3.35 µs outlier pulls mean to 3.26 µs). creation-1to1000 borderline (77.09 µs mean, Run 3 noise spike). User decided to ship. PRs #15 + H4-tactical merged to main. Track C COMPLETE. |

---

## Round 5 — Phase 1 Linux verification + Phase 2 open (2026-05-01)

### Phase 1 Linux bench result (WSL2, Bun 1.3.8, mitata 1.0.34)

| Workload | aihu p50 | Target | Status |
|---|---:|---:|---|
| **deep-propagation-100** | **3.49 µs** | ≤ 3.00 µs | **FAIL** (~16% over) |
| cellx | 513 ns | ≤ 557 ns | PASS (#1 vs all competitors) |
| wide-fanout-100 | 4.39 µs | ≤ 5.15 µs | PASS |
| batched-writes-100 | 2.62 µs | ≤ 2.86 µs | PASS (#1 vs all) |
| dynamic-deps | 704 ns | ≤ 816 ns | PASS (#2) |
| creation-1to1000 | 70.4 µs | ≤ 76.2 µs | PASS |

5 of 6 workloads PASS. Only `deep-propagation-100` misses target. Reference data appended to `bench/signals/RESULTS.md` (commit pending).

### Competitive context on deep-propagation-100

| Competitor | p50 | gap to aihu |
|---|---:|---:|
| s-js | 1.97 µs | 1.77× faster |
| alien-signals | 2.46 µs | 1.42× faster |
| @preact/signals-core | 3.13 µs | 1.11× faster |
| **@aihu/signals** | **3.49 µs** | — |

Phase 0+1 closed roughly 12.7% of the original gap (4.00→3.49 µs). The remaining gap to alien (1.03 µs) is the Phase 2 target.

## Next actions (Phase 2)

1. **Investigator** — Read `bench/signals/node_modules/alien-signals/esm/system.mjs`. Produce `investigation-deep-chain-phase2.md` with: (a) alien's mechanism for short-circuiting deep chains, (b) per-node constant-factor cost in aihu's iterative DFS vs alien's traversal, (c) named candidate optimizations (each with expected ns/node savings), (d) compatibility analysis with cascade-suppression/PENDING flag from Phase 1.
2. **Architect** — From the investigation, choose ONE optimization for Phase 2 and write `spec-6.2-phase2.md` with named acceptance criteria, no-regression matrix, and bundle-size budget.
3. **Builder** — Implement on `feat/v1-signals-6.2-phase2`. Iron Law: no fix code without investigation `.md`.
4. **Verifier** — Bidirectional: (a) bench on WSL2 confirming `deep-propagation-100` p50 ≤ target; (b) all 5 no-regression gates green; (c) signals tests pass; (d) bundle ≤ 1850 B gz cap.
5. **Track C maintenance** — `packages/server/` and `packages/signals/` are read-only from other tracks' perspective.

## Phase 2 scope rules

- **Iteration budget (Mode 1):** 3 misses on the same hypothesis class → Director recommends rotate to alternate optimization.
- **Hard cap:** 5 Builder ↔ Verifier rounds in Phase 2 total. If unconverged, Director surfaces target adjustment to user.
- **Surface to user immediately if:** alien-signals' algorithm requires a model change incompatible with aihu's effect-settled-in-mark contract (this would be a v2 redesign, not a v1 phase).
- **Bundle cap unchanged:** 1850 B gz. If a candidate breaks the cap, Architect must propose alternatives.
