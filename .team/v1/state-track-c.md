# Track C State — SSR + Signals
**Track:** C
**Branch:** `feat/v1-ssr-signals` (merged; all active work on `main`)
**Plans:** 3.1 (Streaming SSR), 6.2 (Signals Deep-Chain Optimization)
**Initialized:** 2026-04-30
**Last updated:** 2026-04-30 (Round 4 — Session 003 complete)

---

## Status

| Plan | Status | Owner | Notes |
|---|---|---|---|
| 3.1 Streaming SSR | COMPLETE (main `ec24d41`) | — | `renderToStream`, `DataSource<T>`, `StreamOptions`; `ssr-stream.test.ts` 167 lines |
| 6.2 Deep-chain Phase 0 (Option C) | COMPLETE (main `8223dbb`) | — | `HAS_EFFECT_SUB` flag + conditional push; ~18% improvement (4.00→3.27 µs p50); ≤1.54 kB gz |
| 6.2 Deep-chain Phase 1 (Option D) | CONDITIONAL PASS (main `8e74a95`) | — | Hybrid fanout/lazy; correctness PASS; perf unverified on Windows — Linux bench required |

---

## Plan 3.1 — Streaming SSR

### What exists (baseline)

**File:** `packages/server/src/ssr.ts`

- `renderToString(component: ComponentDescription, opts?: SsrOptions): Promise<string>` — fully synchronous internal logic; `async` only because `Promise<string>` is the return type. No awaits inside.
- `renderNode(node, path, hydratable)` — synchronous recursive tree walker; handles `{ kind: 'branch' }` and `{ kind: 'leaf' }` arbor nodes.
- `buildHead(head: HeadConfig)` — synchronous head HTML builder.
- `SsrOptions.serializer` — synchronous `() => Record<string, unknown>` injection point for state serialization.
- `SsrOptions.hydratable` — when true, emits `data-scribe-path` attributes on every branch node.

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
| **@scribe/signals** | 4.04 µs | **4.00 µs** | 4.52 µs | 247.6K |
| **alien-signals** | 2.44 µs | **2.42 µs** | 2.65 µs | 410.6K |
| @preact/signals-core | 3.13 µs | 3.13 µs | 3.27 µs | 319.0K |
| @vue/reactivity | 4.72 µs | 4.71 µs | 4.89 µs | 211.9K |
| s-js | 2.00 µs | 2.00 µs | 2.08 µs | 500.0K |

**Gap to close:** 1.65× (scribe 4.00 µs vs alien 2.42 µs). Target: ≤ 30% gap reduction = scribe ≤ 3.00 µs p50 (≥ 333K ops/s). Parity target: scribe ≤ 2.55 µs p50.

#### No-regression gates (all must hold after any 6.2 implementation)

These are the passing baselines that 6.2 must not regress by more than 10% (per Learning #11):

| Workload | @scribe/signals p50 | Regression floor (−10%) |
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
- scribe uses a **forward-subscription push model**: signal write → `wave++` → `propagateMark(head)` → iterative DFS visit of all 100 nodes → `settleAndDrain()` → `recomputeIfNeeded` on all visited nodes → drain effects
- The iterative DFS (`markOne`) uses a module-level explicit stack (`markStackSubs`, `markStackKinds`) to avoid call-stack overflow on deep chains
- `wave` counter provides O(1) dedup: `sub.lastWave === wave` short-circuits re-marking the same node in the same wave
- The **restricted-leaf fast path** in `markOne` (lines 222–228): when a source-signal-only computed has exactly one effect subscriber, it settles inline during marking — this is the path that wins on `cellx` and `wide-fanout-100`
- In a 100-deep chain, the restricted-leaf fast path fires for `c98 → effect` only; nodes `c0–c97` have computed-deps and so the general path is taken for all intermediate nodes

**Structural reason for the gap (from learnings.md #26):**
> scribe's forward-subscription model re-wires the subscription set on every dependency rotation — which is exactly what dynamic-deps exercises. Alien-signals' push-pull with version counters handles long chains more efficiently by short-circuiting at version equality; scribe must propagate through each node in the chain.

**What the Investigator must analyze:**
- Alien-signals' mechanism (in `bench/signals/node_modules/alien-signals/esm/system.mjs`) for deferring deep-chain propagation
- Whether a version counter per signal node would allow scribe to short-circuit in a 100-deep chain during the _mark phase_ (not applicable on every write, but potentially applicable on reads that don't change value)
- Whether lazy pull (mark direct children only, let downstream pull on read) is compatible with scribe's effect-settled-in-mark design
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

Current `@scribe/signals` bundle post Phase 1: **1.67 kB gz** (cap raised to **1850 B** per spec §10.3).
Pre-Phase-1 Phase 0 baseline: 1.54 kB gz. Phase 1 added ~130 B gz.

Note: `@scribe/arbor` bundles signals (not externalized). The Phase 1 growth flowed through into the arbor bundle, requiring the arbor cap to be raised to 2200 B. If signals grows further in any Phase 2 work, arbor's cap must be reviewed again.

---

## Round history

| Round | Date | Director note | Outcome |
|---|---|---|---|
| 1 | 2026-04-30 | `director-notes/track-c-round-001.md` | Session start; GO for both plans |
| 2 | 2026-04-30 | `director-notes/track-c-round-002.md` | Spec (3.1) and investigation (6.2) assessed; GO for Builder 3.1 and Builder 6.2-Phase0 (Option C) in parallel; Option D (Phase 1) HOLD pending bench confirmation |
| 3 | 2026-04-30 | — | Plan 3.1 COMPLETE (`ec24d41`); Plan 6.2-P0 COMPLETE (`8223dbb`); Phase 0 bench confirmed ≥18% improvement; Phase 1 Option D unblocked for Architect spec |
| 4 | 2026-04-30 | — | Plan 6.2-P1 Option D CONDITIONAL PASS (`8e74a95`); Architect spec `7ff92c0`; correctness verified; perf unverified on Windows; Linux/macOS bench required before track marked COMPLETE |

---

## Next actions

1. **Linux/macOS bench run** — REQUIRED before signals optimization track closes. Run `bun run bench` on reference hardware. Target: ≤ ~2.45 µs p50 on `deep-propagation-100` (≥25% improvement over Phase 0 baseline of 3.27 µs p50). All no-regression gates must hold.
2. **If perf target met** — Track C signals work is COMPLETE for v1. Mark 6.2-P1 PASS in this file. No Phase 2 needed.
3. **If perf target not met** — Open Phase 2 investigation. Scope: determine whether the PENDING flag cascade-suppression approach needs additional optimization or whether the Windows/Linux delta explains the miss.
4. **Track C maintenance** — `packages/server/` and `packages/signals/` are read-only from other tracks' perspective. Any further server or signals work routes through Track C.
