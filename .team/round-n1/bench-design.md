# Round N+1 — Bench Design

**Role:** Bench Architect (Scout + Architect hybrid, read-only).
**Author:** Round N+1 design session (single agent, no Builders).
**Date:** 2026-04-30
**Branch:** `research/round-n1-bench-design` (off team-branch `bb96f1b`).
**Predecessor work:** Phase 2.5 bench-spike (PR #6, #8 — signals time benches), Phase 3 (`@scribe/arbor` shipped, no bench), Round N close (state-plan-a.md `135c53c`).

> **Status when this doc lands:** scribe v0 is feature-complete on size, tests, and API surface (`signals 1.53 kB / arbor 1.28 kB / runtime 438 B / agent 72 B`, 131 tests green). Round N+1 closes the **two Learning #11 receipt gaps** that block first-eyes:
>
> 1. `@scribe/arbor` has zero SOTA receipts. The only existing arbor bench is `tests/bench.test.ts` — a 400 ms JSDOM smoke gate. No comparator. No competitor parity.
> 2. `@scribe/signals` has only **time** receipts (cellx, wide-fanout, batched-writes vs. 5 competitors). No memory. No competitor-parity workloads.
>
> This doc designs the bench-spike work that Builders (one or two parallel tracks) will implement next session. **No code is shipped here** — only specifications, sketches, file lists, acceptance criteria, and risks.

---

## TL;DR

Round N+1 lifts scribe from "looks fast on three workloads" to "has SOTA receipts on the same axes the competitors themselves emphasize, on both time and memory, for both signals and arbor."

**Recommended scope:**
- **Track A (new) — `bench/arbor/` SOTA bench.** Mirror Phase 2.5's `bench/signals/` layout. **6 workloads × 5 comparators × 2 metrics (time + memory).** Comparators: lit-html (3.x), solid-js DOM (`solid-js/web` via `solid-js/h`), @vue/runtime-dom, Preact + `htm`, vanilla DOM baseline. Workloads: 10k-leaf mount, deep-tree mount (depth 100, fanout 10), wide-tree mount (1k siblings), reactive attr thrash, update-1-of-10k, krausest-style 1k-row create+partial-update+clear cycle. Run in **JSDOM under Bun** with `--expose-gc`. Ship a separate `bench-arbor:run` Moon task with the same 10% p50 regression gate as signals.
- **Track B (extend) — `bench/signals/` memory + parity.** Add `src/memory.ts` runner using `process.memoryUsage()` + `v8.getHeapStatistics().peak_malloced_memory` deltas around forced GC cycles. Lift **3 parity workloads** from `transitive-bullshit/js-reactivity-benchmark` (the harness alien-signals' README points at): `kairo-bench` (dynamic-deps), `mol-bench` (deep propagation), `s-bench` (creation-time sweep — `1to1`/`1to4`/`1to1000` shapes). Restructure `RESULTS.md` into time + memory tables with a "per-competitor-axis" honesty section.
- **CI:** new `bench-arbor:run` Moon task; `bench-signals:run` adds memory dimension; both gate at >=10% p50 regression on either axis. `[bench-bump]` override stays.
- **Acceptance gate:** `bench/arbor/RESULTS.md` shows >=6 workloads × >=5 competitors × >=2 metrics; `bench/signals/RESULTS.md` shows time + memory + 3 parity workloads + per-axis section; both runners green locally; CI gate fires on synthetic regression.

**Two Builder tracks, disjoint files, ~1 day each.** Track A and Track B can run in parallel — they touch zero shared paths beyond a one-line entry in `.github/workflows/plan-a.yml`.

**Hard stops considered.** None hit. Bun supports `--expose-gc` (verified: `bun --expose-gc -e ...` makes `globalThis.gc` a function). `process.memoryUsage()` and `v8.getHeapStatistics()` (with `peak_malloced_memory`) work in Bun. JSDOM is feasible for the krausest subset we need (no layout-pixel measurements). `solid-js/web` exists as a separate DOM-binding entry. `lit-html` ships independently of `lit`.

---

## 1. Competitor-parity workload survey

The user's instruction — *"add more comparison to what the competitors test each other on comparably"* — means: scribe should be measurable on the workloads the named competitors hold themselves to. This section maps each competitor's published bench shape and recommends which to lift.

### 1.1 Signals competitors

| Competitor | Where their benches live | Axes they emphasize | Named workloads |
|---|---|---|---|
| **alien-signals** | `bench/` in repo + `transitive-bullshit/js-reactivity-benchmark` (their README's reference harness) | Propagation efficiency, dynamic-dependency rebuild, GC pressure | `cellx`, `kairo` (dynamic deps), `mol` (deep propagation), `s-bench` (creation-time sweep). README claim: "noticeably faster than Vue 3.4." |
| **@vue/reactivity** | `packages/reactivity/__benchmarks__/*.bench.ts` (Vitest bench) | Effect-scope teardown, reactive object property thrash, computed cascade, ref vs reactive distinction | `computed.bench`, `effect.bench`, `reactiveArray.bench`, `reactiveMap.bench`, `reactiveObject.bench`, `ref.bench` |
| **@preact/signals-core** | No dedicated `bench/` dir. Performance signal is via `mangle.test.ts` (size + simple throughput) and the cross-lib js-reactivity-benchmark | Bundle size, simple read/write throughput, batch correctness | None named. Implicit "small graph throughput" + "tiny bundle." |
| **solid-js** | `packages/solid/bench/bench.cjs` | Creation cost vs. fanin/fanout density, update cost vs. graph density | `createDataSignals`, `createComputations0to1`, `createComputations1to1`, `1to2`, `1to4`, `1to1000`, `2to1`, `4to1`, `1000to1`; matching `updateComputationsX` versions |
| **s-js** | Original `test/perf/` (older). Largely superseded by being a baseline in js-reactivity-benchmark | Sync fine-grained reactivity floor | `s-bench` shape (per js-reactivity-benchmark) |

**The canonical cross-lib harness is `transitive-bullshit/js-reactivity-benchmark`.** alien-signals' README points directly at it; it's the closest thing to a "framework benchmark" for signals. Its named scenarios are:

- **`cellxBench`** — the diamond we already run.
- **`kairoBench`** — dynamic dependencies. Each iteration, the set of dependencies a computed reads changes. Tests "incremental rebuild" not "static propagate."
- **`sBench`** — the S.js creation+propagation sweep over `(N sources × M sinks)` shapes.
- **`molBench`** — deep-chain propagation (depth 100+). Stresses linear cascade.
- **`dynamicBench`** — like kairo but parameterized over graph density/read rate.

### 1.2 Arbor competitors (DOM rendering / template binding)

| Competitor | Bench shape | Axes emphasized |
|---|---|---|
| **lit-html** (1.x or 3.x) | Internal `packages/labs/perf-tests/`; also in `js-framework-benchmark` (krausest) | Render-update-clear cycle on row tables; template caching; directive cost |
| **solid-js DOM** (`solid-js/web` + `solid-js/h`) | `packages/dom-expressions/bench/`; krausest leaderboard topper | Granular reactive update without diffing; create/update large lists |
| **@vue/runtime-dom** | `packages/runtime-dom/__benchmarks__` (small set); krausest as canonical receipt | Patch flag overhead, list reconciliation, attribute update |
| **Preact + `htm`** | `js-framework-benchmark` | Diff cost on small/medium trees; minimal-runtime claim |
| **vanilla DOM** | krausest's `vanillajs` row | Floor-of-the-stack reference. Ceiling bench. |

**The canonical cross-lib harness is `krausest/js-framework-benchmark`.** Its scenarios (verified): create rows (1k, 10k), replace, partial update (every 10th row of 10k), select row, swap 2 rows in 1k, remove row, append 1k to 10k, clear 10k.

### 1.3 What we recommend lifting (selective, not exhaustive)

**For signals (Track B — 3 NEW workloads beyond our current 3):**

1. **`deep-propagation-100`** — port of `molBench`. Linear chain of 100 computeds, source->c1->c2->...->c100->effect. Write source; measure time-to-effect. *Why:* alien-signals' `bench/` brags about deep-chain wins; we beat alien on cellx but never tested deep. (Phase 3 retro hinted scribe was tuned for shallow diamond; deep is the dual.)
2. **`dynamic-deps`** — port of `kairoBench`. 50 sources, 1 computed that reads a randomly-selected 5 sources per evaluation (deps change every read). Write all sources every iteration; measure flush. *Why:* this is the workload where forward-subscription models (alien, scribe) historically beat owner-tree models (Solid) — but we've never measured it.
3. **`creation-1to1000`** — port of solid's `createComputations1to1000` shape. 1 signal, 1000 computeds each reading the signal. Measure **creation time only** (no writes). *Why:* setup-cost matters for large lists; Solid optimizes creation aggressively; we have no creation benchmark today.

We **do not** lift Vue's `reactiveObject.bench` — proxy-based reactivity is a different model than scribe's tuple signals; the comparison would be apples-to-oranges and reward Vue for things scribe can't do.

We **do not** lift the full krausest suite into `bench/signals/` — that's arbor's domain.

**For arbor (Track A — 6 workloads):**

1. **`mount-10k-leaves`** — already exists as smoke in `tests/bench.test.ts` (JSDOM, 400 ms gate). Promote to a proper bench cell with comparator runs.
2. **`mount-deep-100x10`** — depth 100, fanout 10 at each level (~10k nodes total but distributed deep). Pairs with `mount-10k-leaves` (wide vs. deep).
3. **`mount-wide-1000`** — single root, 1000 sibling branches each with 1 leaf. Stresses sibling-iteration paths.
4. **`update-1-of-10k-leaves`** — mount the 10k-leaf tree, then thrash one signal-bound leaf 1000 times. Measure per-update cost (excluding mount).
5. **`attr-thrash-100x100`** — 100 elements each with 100 reactive attrs; cycle each attr's signal once. Measures attr-binding throughput.
6. **`krausest-1k-cycle`** — krausest's create-1k-rows + partial-update-every-10th + clear cycle, run as one workload. Each row is `<tr><td>{id}</td><td>{label}</td></tr>` with the label signal-bound. Three-phase op timed as a unit. *Why:* this is the single workload the broader JS framework community recognizes; even an approximation in JSDOM gives us a relative-position artifact.

We **do not** include krausest's full 9-scenario suite — most need browser pixel measurements (`select row` highlights via :hover-style; `swap rows` correctness depends on layout). The 1k-cycle is the load-bearing subset.

We **do not** include `each()` / `when()` workloads — they throw `ArborNotImplementedError` in v0 (see `packages/arbor/src/structural.ts`). Defer to v1.

---

## 2. Memory measurement protocol

### 2.1 What Bun gives us (verified in this worktree)

```
process.memoryUsage()       -> { rss, heapTotal, heapUsed, external, arrayBuffers }
v8.getHeapStatistics()      -> includes peak_malloced_memory, total_heap_size, used_heap_size
v8.getHeapSpaceStatistics() -> per-space (new/old/code) breakdown
globalThis.gc               -> function ONLY when bun started with --expose-gc
                               (without flag: undefined; with flag: function)
```

Bun's `--expose-gc` is the same flag Node accepts; the underlying call is V8's `gc()`. **This is sufficient for the protocol below.**

### 2.2 Recommended protocol (apples-to-apples across competitors)

**Phase A — Build N graphs.** For workload W and competitor C, construct N copies of W's reactive graph. (For arbor: N tree-mounts into N hosts. For signals: N times the workload's `setup()`.)

**Phase B — Force-quiesce.** Call `globalThis.gc()` three times in a tight loop (V8 is sometimes lazy on the first pass; three is the convention used by lit and solid). Record `process.memoryUsage().heapUsed` and `v8.getHeapStatistics().peak_malloced_memory`.

**Phase C — Steady-state delta.** The "build memory" metric is `(Phase B heapUsed) - (pre-build heapUsed)`. Divided by N gives "per-graph cost."

**Phase D — Dispose.** Call each scope's `dispose()` (arbor) or each adapter's `setup().dispose()` (signals). Drop all references. `gc()` x 3.

**Phase E — Leak check.** `(Phase D heapUsed) - (pre-build heapUsed)`. If this is positive and grows with N, the competitor leaks. Report as a separate column.

**N value:** start at **1000 graphs**. For 10k-leaf arbor mounts that's 10M nodes — too much. Per-workload override allowed: arbor's `mount-10k-leaves` uses N=10; signals workloads use N=1000.

### 2.3 Why not mitata's `gc: true`?

mitata's `gc: true` reports **per-iteration GC pauses** (timing artifact), not **per-graph heap delta** (what we actually want). It's complementary, not a substitute. Recommendation: keep mitata for time, add the explicit Phase A/B/C/D/E protocol for memory.

### 2.4 Metrics we report

Per (workload x competitor):

- `build-heap-delta` (bytes per graph) — the steady-state cost of holding the graph live.
- `peak-malloc` (bytes) — `peak_malloced_memory` during build phase, captures transient allocations.
- `dispose-residual` (bytes total, all N graphs) — should be <= a small constant; growth = leak.

Plus the existing time metrics (`mean / p50 / p99 / ops/s`).

### 2.5 Output: separate or merged?

**Recommendation: separate tables, same RESULTS.md file.** A merged 8-column table per workload is unreadable. Two tables per workload (one time, one memory) sharing a section header is the right shape.

```markdown
## Workload: `cellx`

*5-deep diamond graph propagation (S.js classic)*

### Time

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @scribe/signals | ... | ... | ... | ... |
...

### Memory

| Competitor | build/graph | peak-malloc | dispose-residual |
| --- | ---: | ---: | ---: |
| @scribe/signals | 1.2 KB | 4.8 KB | 0 B |
...
```

### 2.6 Sketch — the memory runner

```ts
// bench/signals/src/memory.ts (Builder writes; this is the SHAPE, not the impl)
import * as v8 from 'node:v8'

// REQUIRES: bun --expose-gc src/memory.ts
if (typeof globalThis.gc !== 'function') {
  throw new Error('memory bench requires `bun --expose-gc src/memory.ts`')
}

const N_DEFAULT = 1000

interface MemorySample {
  buildHeapDelta: number   // per-graph average
  peakMalloc: number       // total during build
  disposeResidual: number  // after dispose+gc
}

function settle(): void {
  for (let i = 0; i < 3; i++) globalThis.gc!()
}

async function measureCell(
  workload: WorkloadDefinition,
  adapter: SignalAdapter,
  N: number,
): Promise<MemorySample> {
  settle()
  const before = process.memoryUsage().heapUsed

  const ctxs: Array<{ run: () => void; cleanup: () => void }> = []
  const peakBefore = v8.getHeapStatistics().peak_malloced_memory

  for (let i = 0; i < N; i++) ctxs.push(workload.build(adapter))

  settle()
  const buildHeap = process.memoryUsage().heapUsed
  const peakDuring = v8.getHeapStatistics().peak_malloced_memory

  for (const c of ctxs) c.cleanup()
  ctxs.length = 0
  settle()
  const after = process.memoryUsage().heapUsed

  return {
    buildHeapDelta: (buildHeap - before) / N,
    peakMalloc: peakDuring - peakBefore,
    disposeResidual: after - before,
  }
}
```

**Note for arbor:** the workload sets up DOM nodes attached to a JSDOM `host`. `cleanup()` must call `scope.dispose()` AND drop the host (`host = null` then settle). Otherwise the JSDOM document retains references and every "disposed" tree leaks.

---

## 3. Arbor SOTA bench shape (Track A)

### 3.1 Layout

```
bench/arbor/
|-- package.json             # pinned competitor versions (see §3.4)
|-- tsconfig.json            # extends repo base; jsdom types
|-- moon.yml                 # tasks: run, memory, size, typecheck (mirrors bench/signals)
|-- HARNESS.md               # workload-add + competitor-add guide (~150 lines)
|-- RESULTS.md               # generated; time + memory + per-axis breakdown
|-- CHANGELOG.md             # append-only history
+-- src/
    |-- runner.ts            # entry — runs every workload x competitor, writes RESULTS.md
    |-- memory.ts            # entry — `bun --expose-gc src/memory.ts`; appends memory tables
    |-- gate.ts              # CI regression gate (mirrors bench/signals/src/gate.ts)
    |-- size.ts              # gz size table (raw esm entry per competitor)
    |-- jsdom-host.ts        # tiny helper: `getHost(): Element` returns a fresh JSDOM <div>
    |-- types.ts             # DomAdapter + WorkloadDefinition interfaces (see §3.3)
    |-- competitors/
    |   |-- index.ts         # ordered list
    |   |-- scribe.ts        # @scribe/arbor + @scribe/signals
    |   |-- lit.ts           # lit-html
    |   |-- solid.ts         # solid-js/web + solid-js/h (NOT solid-js main)
    |   |-- vue.ts           # @vue/runtime-dom + @vue/reactivity
    |   |-- preact.ts        # preact + htm
    |   +-- vanilla.ts       # bare DOM API baseline
    +-- workloads/
        |-- index.ts         # ordered list
        |-- mount-10k-leaves.ts
        |-- mount-deep-100x10.ts
        |-- mount-wide-1000.ts
        |-- update-1-of-10k-leaves.ts
        |-- attr-thrash-100x100.ts
        +-- krausest-1k-cycle.ts
```

This is **disjoint** from `bench/signals/`. No file is shared. The two harnesses converge only on the `.github/workflows/plan-a.yml` CI gate (one new job, mirrors `bench-signals`).

### 3.2 Workload set (final recommendation — 6 workloads)

| # | Workload | Op | What it stresses | Why we picked it |
|---|---|---|---|---|
| 1 | `mount-10k-leaves` | Construct 10k static text leaves under a fragment, mount to host, dispose. **One full cycle = one op.** | Allocation throughput, attach throughput, fragment handling | Baseline; matches the existing JSDOM smoke test; matches v0 spec §11 |
| 2 | `mount-deep-100x10` | Construct depth-100 tree, fanout 10 per level (~10k nodes deep instead of wide), mount, dispose. One cycle = one op. | Recursive descent, stack pressure | Pairs with #1 — wide vs. deep is the classic split |
| 3 | `mount-wide-1000` | 1000 sibling branches, each with 1 reactive leaf. Mount + initial-effect-fire. | Sibling iteration; per-branch overhead | Krausest's "create 1k rows" shape, single-host |
| 4 | `update-1-of-10k-leaves` | After mounting #1's tree (warmup phase), write the signal backing one specific leaf 1000 times in a row. **One write = one op.** | Granular update path (effect -> DOM); no diffing | Solid's headline claim is "granular updates beat VDOM"; we should measure same axis |
| 5 | `attr-thrash-100x100` | 100 elements x 100 reactive attrs each. Cycle every signal once. | Attr-binding throughput; element vs property dispatch | Vue's `runtime-dom` patch flags target this; krausest doesn't cover it |
| 6 | `krausest-1k-cycle` | Three-phase: create-1k-rows + partial-update-every-10th + clear. One full cycle = one op. | The cross-lib canonical workload, in JSDOM | The artifact users will recognize. JSDOM fidelity is imperfect but order-of-magnitude is real. |

**Sized so each cell runs <= 1 s CPU.** N (graphs in memory phase) overrides per workload — `mount-10k-leaves` uses N=10, `update-1-of-10k-leaves` uses N=100, others N=1000.

### 3.3 `DomAdapter` interface (sketch)

The signals harness uses `SignalAdapter` (signal/computed/effect/batch/setup). Arbor's domain is tree construction and mount/dispose, which is a different vocabulary. **Recommend a separate interface, not a shared one.** Sharing would either (a) bloat `SignalAdapter` with unused methods or (b) force every arbor workload through a signals-flavored API that doesn't fit lit-html's template literals or vanilla DOM.

```ts
// bench/arbor/src/types.ts (sketch)

/**
 * A `DomAdapter` is a thin wrapper over a single competitor's render layer.
 * Every workload calls it generically so the workload code is library-agnostic.
 *
 * The shape is deliberately minimal — render templates, mount, update via a
 * runtime-known signal, dispose. Each adapter owns its own signal flavour
 * (lit ships none — uses fresh renders; solid uses createSignal; etc).
 */
export interface DomAdapter {
  readonly name: string
  readonly version: string

  /**
   * Build whatever render plan the library needs for the workload `kind`.
   * Returns an opaque `Plan` that `mount()` consumes. The plan can include
   * pre-allocated signal handles the workload will later use to drive updates.
   */
  prepare(kind: WorkloadKind, params: WorkloadParams): Plan

  /**
   * Render `plan` into `host`. Returns a `Mount` handle used for `update()`
   * and `dispose()`. Synchronous: by the time mount() returns, the DOM is
   * fully attached (mirrors arbor's contract — mismatches with libraries
   * that schedule micro-task work are documented per-adapter).
   */
  mount(plan: Plan, host: Element): Mount

  /**
   * Apply an update event. Implementation depends on the workload — for
   * `update-1-of-10k`, this writes a signal. For lit (no signals), this
   * re-renders the template with new values. The adapter hides the
   * difference; the workload says "update with these values."
   */
  update(mount: Mount, event: UpdateEvent): void

  /** Tear down. Idempotent. */
  dispose(mount: Mount): void
}

export type WorkloadKind =
  | 'mount-10k-leaves'
  | 'mount-deep-100x10'
  | 'mount-wide-1000'
  | 'update-1-of-10k-leaves'
  | 'attr-thrash-100x100'
  | 'krausest-1k-cycle'

export interface WorkloadParams {
  /** Workload-specific knobs; e.g. `{ depth: 100, fanout: 10 }` */
  readonly [key: string]: unknown
}

export type Plan = unknown   // opaque to the runner
export type Mount = unknown  // opaque to the runner

export interface UpdateEvent {
  readonly kind: 'set-leaf' | 'set-attr' | 'phase'  // workload-determined
  readonly index?: number
  readonly value?: unknown
  readonly phase?: 'create' | 'update' | 'clear'
}
```

**Why this shape:**
- `prepare`/`mount` separation lets the runner exclude template-construction cost from the timed op (lit-html caches templates aggressively; solid hoists; arbor builds `Branch`/`Leaf` objects). Without separation, "mount time" conflates two costs that the libraries optimize differently.
- `update(event)` lets the workload speak in terms of "set leaf 5 to value 'X'" without knowing how the library implements it (signal write vs. re-render vs. setProperty).
- `dispose(mount)` is where lit's `nothing` directive, solid's `dispose()` from `render()`, and arbor's `scope.dispose()` all converge.

### 3.4 Comparator set + version pins

| Library | Pin | Source / entry |
|---|---|---|
| `@scribe/arbor` | workspace | `packages/arbor/dist/index.js` |
| `@scribe/signals` | workspace | (transitive via arbor) |
| `lit-html` | `3.2.x` | `lit-html/lit-html.js` (ESM, prod) |
| `solid-js` | `1.9.12` (already pinned) | `solid-js/dist/solid.js` + `solid-js/web/dist/web.js` + `solid-js/h/dist/h.js` |
| `@vue/runtime-dom` | `3.5.33` (matches @vue/reactivity already pinned) | `@vue/runtime-dom/dist/runtime-dom.esm-browser.prod.js` |
| `preact` | `10.x latest` | `preact/dist/preact.module.js` |
| `htm` | `3.x latest` | `htm/dist/htm.module.js` |
| (vanilla) | n/a | uses native `document.*` |

**Pin rationale.** Track A's regression gate is "did *we* slow down" — competitor version bumps are bench updates with `[bench-bump]`, not regression triggers (Learning #11 + existing HARNESS.md rule).

### 3.5 krausest subset feasible in JSDOM

JSDOM is fine for everything that doesn't depend on **layout** or **paint**:

| krausest scenario | JSDOM-feasible? | Notes |
|---|---|---|
| Create 1k rows | Yes | DOM construction only |
| Replace all rows | Yes | Replace nodes; no layout |
| Partial update (every 10th of 10k) | Yes | textContent updates |
| Select row | **No** | Relies on `:hover` / class-driven highlight; perf measured by paint, not by class-set |
| Swap 2 rows | Marginal | Correctness is fine; perf is dominated by browser layout that JSDOM skips |
| Remove row | Yes | DOM removal |
| Create many rows (10k) | Yes | Construction throughput |
| Append to large table | Yes | DOM append |
| Clear rows | Yes | host emptied via per-node remove (avoid the parser-set HTML path; see notes) |

**Recommendation:** ship the 1k-create + partial-update + clear cycle as a single workload (`krausest-1k-cycle`). This captures three axes the krausest leaderboard people actually look at, in one timed op. Document explicitly in `HARNESS.md` that this is **JSDOM-relative**, not a direct comparison to the krausest leaderboard.

If a future Round wants browser-fidelity numbers, those go in a separate `bench/arbor-browser/` directory with a Playwright runner. **Out of scope for Round N+1.**

### 3.6 Risks specific to arbor adapters

- **`scope.dispose()` is LIFO with DOM removal last.** Adapters for lit/preact/vue may remove DOM first then run effect-cleanup; the workload should not rely on order being identical. Document.
- **Solid's `render()` returns a `dispose: () => void`.** Map directly to `dispose(mount)`.
- **lit-html has no per-mount dispose.** Use `render(nothing, host)` to clear; for memory phase drop the host reference and settle GC.
- **Preact + `htm` re-renders the whole tree on update by default.** This is the apples-to-oranges hazard. Document that Preact's "update" is an unavoidable full re-render under htm — that's the comparison the user gets when they pick Preact + htm. Don't try to "make it fair"; report the truth.
- **Vanilla DOM has no signal binding.** The `update` adapter for vanilla manually finds the target node and sets `textContent`. This is the floor — by definition the cheapest possible update; if scribe is slower than vanilla on `update-1-of-10k-leaves`, we have a problem. (Expected: scribe is within 2-3x of vanilla; lit/solid similar; preact/vue 5-10x slower due to diff.)
- **`_setMount(mount)` injection.** Round N's `defineComponent` hooks `_setMount` so components see their `MountScope`. The bench bypasses `defineComponent` entirely (it builds `Branch`/`Leaf` trees directly). No interference expected. Document the bypass in the scribe adapter's JSDoc so a future reader doesn't assume the bench exercises the runtime layer.

---

## 4. CI gate design

### 4.1 Existing gate (signals)

`bench/signals/src/gate.ts`: parses the `<!-- bench-data:start -->` JSON block from current vs previous `RESULTS.md`, computes `(current.p50 / previous.p50) - 1` for the `@scribe/signals` row of every workload, fails if any > 0.10. `BENCH_BUMP=1` (set by CI when commit message contains `[bench-bump]`) bypasses.

### 4.2 What Round N+1 adds

**(a) Memory dimension on existing signals gate.** Same shape: parse memory cells from the JSON block, compute `(current.buildHeapDelta / previous.buildHeapDelta) - 1`, fail if > 0.10. Same threshold as time. Same `[bench-bump]` override.

**Two separate fail messages** — "time regressed on workload X" vs "memory regressed on workload Y" — so the diagnoser knows which axis to investigate. Failing simultaneously is allowed; both messages print.

**(b) New `bench-arbor:run` Moon task.** Mirrors `bench-signals:run` exactly. Same gate shape (`bench/arbor/src/gate.ts`, threshold 0.10, `[bench-bump]` override).

**(c) `.github/workflows/plan-a.yml` updates.** Two new path-filtered jobs:

```yaml
# Triggers when packages/arbor/** or bench/arbor/** changes
bench-arbor:
  needs: typecheck
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: oven-sh/setup-bun@v2
    - run: bun install
    - run: moon run signals:build arbor:build  # arbor depends on signals
    - run: moon run bench-arbor:run
    - run: moon run bench-arbor:memory
    # gate compares current RESULTS.md against the merge-base's
    - run: bun bench/arbor/src/gate.ts <(git show origin/main:bench/arbor/RESULTS.md) bench/arbor/RESULTS.md
      env:
        BENCH_BUMP: ${{ contains(github.event.head_commit.message, '[bench-bump]') && '1' || '0' }}
```

The signals gate gets a parallel structure for memory.

### 4.3 Override matrix

| Change shape | Override needed? | Why |
|---|---|---|
| Bug fix slows runtime <10% | No | Below threshold |
| Bug fix slows runtime 10-25% | `[bench-bump]` + PR justification | Correctness wins |
| Bug fix slows runtime >25% | `[bench-bump]` + Director sign-off in PR description | Major impact, audit trail |
| Memory grew because we now hold a reference for telemetry | `[bench-bump]` | Same as time |
| Competitor pinned to faster version | `[bench-bump]` (Learning #11 / HARNESS.md) | Not our regression |
| Bun major-version bump shifts numbers globally | `[bench-bump]` + CHANGELOG entry | Whole baseline moved |

### 4.4 Threshold review

Phase 2.5 chose `0.10` for time. Memory has a different noise floor — `peak_malloced_memory` can swing 5-8% across runs because of V8 internal cache layouts. **Recommendation: set memory threshold to `0.15`** initially. If three regressions in 24 hours all cluster around 12-14%, we'll know the threshold is too tight. Document in `HARNESS.md` and `CHANGELOG.md`.

`buildHeapDelta` (per-graph average across N=1000) is much more stable than `peak_malloced_memory`. Apply 0.10 to `buildHeapDelta`; apply 0.15 to `peak_malloced_memory`.

`disposeResidual` is **leak detection, not regression detection.** Threshold: any value > N x 32 bytes (i.e. >32 B leak per graph) fails outright, regardless of previous value. Document.

---

## 5. RESULTS.md restructure

### 5.1 Current shape (signals)

Single time table per workload. One stretch table at bottom for gz size. JSON footer for the gate.

### 5.2 Proposed shape (signals, post-Round N+1)

```markdown
# `@scribe/signals` Bench Results

**Generated:** 2026-...
**Runner:** mitata 1.0.34 + memory.ts (--expose-gc) · Bun X · Node X
**Track:** A — vanilla scribe vs. SOTA JS reactivity libs

## Workloads

### `cellx` — 5-deep diamond graph propagation

#### Time
| Competitor | mean | p50 | p99 | ops/s | scribe vs. |
| --- | ---: | ---: | ---: | ---: | ---: |
| @scribe/signals | ... | ... | ... | ... | --- |
| alien-signals | ... | ... | ... | ... | +X% |
...

#### Memory
| Competitor | build/graph | peak-malloc | dispose-residual |
...

### `wide-fanout-100` — ...
... (same shape)

### `batched-writes-100` — ...
### `deep-propagation-100` (NEW) — ...
### `dynamic-deps` (NEW) — ...
### `creation-1to1000` (NEW) — ...

## Per-competitor-axis honesty section

The competitors in this matrix emphasize different axes in their own READMEs.
This section answers "do we beat each competitor on the bench they hold
themselves to?"

### vs. alien-signals
*alien-signals' canonical bench is `transitive-bullshit/js-reactivity-benchmark`.*
- `cellx`: scribe **wins** by Xx (PASS)
- `mol-bench` (deep-propagation-100): scribe ...
- `kairo-bench` (dynamic-deps): scribe ...
- `s-bench` (creation-1to1000): scribe ...

### vs. @vue/reactivity
*Vue's __benchmarks__ emphasize `effect.bench`, `computed.bench`, `reactiveObject.bench`.*
- `effect.bench` ~= our `wide-fanout-100`: scribe **wins** by Xx
- `computed.bench` ~= our `cellx`: scribe **wins** by Xx
- `reactiveObject.bench`: NOT MEASURED — proxy-reactivity is a different model
  (intentional gap; scribe does not aim to compete on object-property thrash)

### vs. @preact/signals-core
*No published canonical bench; throughput is the implicit axis.*
- All five overlapping workloads: scribe wins

### vs. solid-js
*Solid's `bench.cjs` measures creation/update across `1to1`, `1to4`, `1to1000`, `2to1`, `4to1`, `1000to1` shapes.*
- `1to1` ~= our `cellx` chain: scribe ...
- `1to1000` ~= our `creation-1to1000`: scribe ...
- `4to1` / `1000to1` (fan-in): NOT MEASURED — lift in v1+ if relevant

### vs. s-js
*s-js' canonical bench is `cellx`.*
- `cellx`: scribe **wins** by Xx

## Bundle size (gz)

| Competitor | Raw | Gzipped |
...

<!-- bench-data:start -->
...JSON (cells: time-cells + memory-cells + per-axis cells)
<!-- bench-data:end -->
```

The "per-competitor-axis section" is the **honesty piece** — it answers the user's exact instruction. It is hand-authored prose with auto-filled numbers; the runner generates the numbers, the maintainer writes the prose. New entries go in via a follow-up commit when scribe takes a new axis.

### 5.3 Same shape applies to `bench/arbor/RESULTS.md`

Per-axis section maps:
- vs lit-html: `krausest-1k-cycle` is their axis
- vs solid: `update-1-of-10k-leaves` is their headline (granular updates)
- vs vue: `attr-thrash-100x100` is their patch-flag axis
- vs preact: `mount-10k-leaves` (smallest-runtime claim) — preact will likely **win** here because htm pre-compiles templates; document honestly
- vs vanilla: floor reference, scribe should be within 2-3x

---

## 6. File-level change list

### 6.1 Track A — `bench/arbor/` (new directory)

| File | Action | Est. lines | Notes |
|---|---|---|---|
| `bench/arbor/package.json` | CREATE | ~30 | Pinned competitor versions per §3.4 |
| `bench/arbor/tsconfig.json` | CREATE | ~10 | Extends repo base; includes jsdom types |
| `bench/arbor/moon.yml` | CREATE | ~50 | Mirrors `bench/signals/moon.yml`; tasks: run, memory, size, typecheck |
| `bench/arbor/HARNESS.md` | CREATE | ~150 | Add-workload + add-competitor + CI-gate guide |
| `bench/arbor/RESULTS.md` | CREATE | ~250 (generated) | Time + memory tables x 6 workloads + per-axis section + size + JSON footer |
| `bench/arbor/CHANGELOG.md` | CREATE | ~30 | Date-stamped baseline entry |
| `bench/arbor/src/types.ts` | CREATE | ~80 | `DomAdapter` interface (§3.3) |
| `bench/arbor/src/jsdom-host.ts` | CREATE | ~30 | `getHost()`, `releaseHost()` |
| `bench/arbor/src/runner.ts` | CREATE | ~150 | Time runner; mirrors `bench/signals/src/runner.ts` |
| `bench/arbor/src/memory.ts` | CREATE | ~120 | Memory runner; protocol per §2.6 |
| `bench/arbor/src/gate.ts` | CREATE | ~100 | Time + memory regression gate |
| `bench/arbor/src/size.ts` | CREATE | ~50 | gz size table for competitor entries |
| `bench/arbor/src/competitors/index.ts` | CREATE | ~10 | Ordered list |
| `bench/arbor/src/competitors/scribe.ts` | CREATE | ~80 | arbor + signals adapter |
| `bench/arbor/src/competitors/lit.ts` | CREATE | ~80 | lit-html adapter |
| `bench/arbor/src/competitors/solid.ts` | CREATE | ~100 | solid-js/web + h adapter |
| `bench/arbor/src/competitors/vue.ts` | CREATE | ~100 | @vue/runtime-dom adapter |
| `bench/arbor/src/competitors/preact.ts` | CREATE | ~80 | preact + htm adapter |
| `bench/arbor/src/competitors/vanilla.ts` | CREATE | ~70 | bare DOM baseline |
| `bench/arbor/src/workloads/index.ts` | CREATE | ~10 | Ordered list |
| `bench/arbor/src/workloads/mount-10k-leaves.ts` | CREATE | ~70 | |
| `bench/arbor/src/workloads/mount-deep-100x10.ts` | CREATE | ~70 | |
| `bench/arbor/src/workloads/mount-wide-1000.ts` | CREATE | ~70 | |
| `bench/arbor/src/workloads/update-1-of-10k-leaves.ts` | CREATE | ~80 | |
| `bench/arbor/src/workloads/attr-thrash-100x100.ts` | CREATE | ~80 | |
| `bench/arbor/src/workloads/krausest-1k-cycle.ts` | CREATE | ~120 | Three-phase op |
| `.github/workflows/plan-a.yml` | EDIT | +30 lines | New `bench-arbor` job |

**Track A total:** ~25 files, ~1900 LoC including generated. Pure-create, no existing-file conflict beyond the workflow.

### 6.2 Track B — extend `bench/signals/`

| File | Action | Est. lines | Notes |
|---|---|---|---|
| `bench/signals/src/memory.ts` | CREATE | ~120 | Memory runner; protocol per §2.6 |
| `bench/signals/src/runner.ts` | EDIT | +30 lines | Run memory after time, fold into single RESULTS.md write |
| `bench/signals/src/gate.ts` | EDIT | +60 lines | Add memory dimension comparison; separate fail messages |
| `bench/signals/src/types.ts` | EDIT | +15 lines | `MemorySample` + `WorkloadCell.memory?` extension |
| `bench/signals/src/workloads/deep-propagation-100.ts` | CREATE | ~80 | Lifted from molBench |
| `bench/signals/src/workloads/dynamic-deps.ts` | CREATE | ~100 | Lifted from kairoBench |
| `bench/signals/src/workloads/creation-1to1000.ts` | CREATE | ~80 | Lifted from solid bench |
| `bench/signals/src/workloads/index.ts` | EDIT | +3 lines | Register new workloads |
| `bench/signals/HARNESS.md` | EDIT | +60 lines | Memory section; new-workload pattern |
| `bench/signals/RESULTS.md` | REGEN | ~+150 lines | Per §5.2 layout |
| `bench/signals/CHANGELOG.md` | EDIT | +15 lines | Round N+1 entry |
| `bench/signals/moon.yml` | EDIT | +10 lines | New `memory` task |
| `bench/signals/package.json` | EDIT | +3 lines | New `memory` script |
| `.github/workflows/plan-a.yml` | EDIT | +5 lines | Wire memory step into existing bench-signals job |

**Track B total:** ~14 files, ~700 LoC delta. Mostly extend, some create.

### 6.3 Inter-track dependencies

**None hard.** The two tracks share zero source files. They share `.github/workflows/plan-a.yml` — that's the only merge-conflict surface, and it's append-only (new job in Track A vs. new step in Track B).

**Recommend Track A and Track B run as separate parallel Builder spawns**, joined at PR review. Different review surfaces (one is "we have receipts for arbor"; the other is "signals receipts now include memory + parity"). Single PR per track.

### 6.4 Per Learning #19 (Pattern B with batching)

Track A has 25 files but they're tightly coupled: spec + adapter + workload + runner. **Recommend three Builder spawns within Track A**, atomic per spawn:

1. **Spawn A1: scaffold + types + jsdom-host + scribe adapter + first workload (`mount-10k-leaves`)** — proves the pipeline end-to-end. ~6 files. One commit.
2. **Spawn A2: remaining 5 competitors + remaining 5 workloads** — bulk fill. ~14 files. One commit per competitor or per workload pair. ~8 commits.
3. **Spawn A3: memory.ts + gate.ts + RESULTS.md + HARNESS.md + CI** — wraps it up. ~5 files. One commit per file or per concern. ~5 commits.

Track B is smaller (~14 files); a single Builder spawn with batched commits per Learning #19 (1-3 tasks each) suffices.

---

## 7. Acceptance criteria

A Round N+1 PR meets the gate when **all** the below are true:

### 7.1 Track A (arbor SOTA bench)

- [ ] `bench/arbor/RESULTS.md` exists, is generated, and contains:
  - [ ] **6 workloads** x **5 comparators (excluding scribe)** x **2 metrics (time, memory)** = 60 cells minimum
  - [ ] Per-axis honesty section with at least 4 sub-sections (vs. lit, solid, vue, vanilla)
  - [ ] Bundle-size stretch table
  - [ ] Machine-readable JSON footer for the gate
- [ ] `bench/arbor/HARNESS.md` exists, <= 200 lines, covers: layout, run-locally, add-workload, add-competitor, CI gate, performance gotchas
- [ ] `bench-arbor:run` Moon task exists and produces RESULTS.md <= 90 s wall-clock on a modern laptop
- [ ] `bench-arbor:memory` Moon task exists, runs with `--expose-gc`, produces memory section
- [ ] `bench/arbor/src/gate.ts` runs locally with synthetic 11% regression injected -> exit 1 with clear message
- [ ] `bench/arbor/src/gate.ts` runs locally with `BENCH_BUMP=1` and a 50% regression -> exit 0
- [ ] `.github/workflows/plan-a.yml` has a `bench-arbor` job that runs on `packages/arbor/**` and `bench/arbor/**` paths

### 7.2 Track B (signals memory + parity)

- [ ] `bench/signals/RESULTS.md` updated with:
  - [ ] **Memory column** present for all 6 workloads (3 existing + 3 new)
  - [ ] **3 new parity workloads** present and named: `deep-propagation-100`, `dynamic-deps`, `creation-1to1000`
  - [ ] Per-competitor-axis honesty section answering "do we beat alien on alien's axes?" "Do we beat Vue on Vue's axes?" with explicit YES/NO/N-A per row
  - [ ] Restructured per §5.2 layout (time table + memory table per workload)
- [ ] `bench-signals:memory` Moon task exists; runs with `--expose-gc`
- [ ] Existing `bench-signals:run` Moon task continues to work (no break)
- [ ] `bench/signals/src/gate.ts` covers both time and memory; fails with separate messages
- [ ] `bench/signals/HARNESS.md` documents the memory protocol and threshold rationale

### 7.3 Cross-track

- [ ] No regression in any time bench >10% on any workload, any competitor scribe loses to that we already beat
- [ ] All packages still tree-shakeable to their existing budget (signals 1.7 kB, arbor 2.05 kB) — bench code lives in `bench/`, never in `packages/`
- [ ] Both `bench-signals:run` and `bench-arbor:run` are runnable without network access (all competitors are bundled via `bun install` + Moon caches)
- [ ] `state-plan-a.md` "Open items" updated: Round N+1 row moved to CLOSED, with PR link

### 7.4 Sample-based validation (Verifier-equivalent without a Verifier)

The Builder is also the verifier (per Phase 2.5 brief — bench produces numbers, numbers are checkable). The PR must include in its description:

1. The full RESULTS.md tables, inline.
2. A note for each competitor: "scribe wins on N of M workloads."
3. **A specific honesty statement.** Where scribe loses, the PR description names the workload, the competitor, and the gap; if the gap is >2x, opens a follow-up issue.
4. Local run output (the bench runner's stdout, copy-pasted into a `<details>` block).

---

## 8. Risks & open questions

### 8.1 Bun + JSDOM compatibility for memory APIs (LOW risk — verified)

`process.memoryUsage()` and `v8.getHeapStatistics()` work in Bun. `--expose-gc` makes `globalThis.gc` callable. Verified in this worktree:
```
$ bun --expose-gc -e "console.log(typeof globalThis.gc)"
function
```
**No blocker.**

### 8.2 JSDOM memory accounting fidelity (MEDIUM risk)

JSDOM nodes are JS objects backed by ad-hoc internals (no native memory). The `heapUsed` delta will reflect the JS-side cost only; the "DOM memory" cost in a real browser also includes platform allocations not visible to V8. **Mitigation:** label JSDOM-measured memory as such in `RESULTS.md`. Order-of-magnitude trends are real; absolute numbers are not directly comparable to browser DevTools heap snapshots. Document in `HARNESS.md`.

### 8.3 krausest browser-only scenarios (LOW — already mitigated)

We deliberately exclude the layout-dependent scenarios (§3.5). The 1k-cycle subset gives a defensible artifact in JSDOM. If users want krausest-leaderboard parity later, that's `bench/arbor-browser/` in a separate Round.

### 8.4 Some competitors are browser-only for DOM (LOW)

solid-js/web works under JSDOM (verified by Solid's own test suite). lit-html under JSDOM is well-traveled (Lit's `@web/test-runner` config uses JSDOM-equivalent). Vue and Preact have no special-case browser dependencies for the operations we test. **No competitor is browser-only for our 6 workloads.**

### 8.5 Comparator pinning friction (LOW)

Per HARNESS.md rule, competitor version bumps require `[bench-bump]` and a baseline reset. New Round N+1 pins go into `bench/arbor/package.json`. Existing signals pins stay where they are.

### 8.6 `_setMount(mount)` injection in arbor (LOW — clarified)

The bench builds `Branch`/`Leaf` trees directly; `defineComponent` (which calls `_setMount`) is a runtime-package concern, bypassed entirely. The arbor adapter `mount()` calls `arbor.mount(tree, host)` directly. Document in the scribe adapter JSDoc.

### 8.7 First-time variance on new workloads (MEDIUM)

The 3 new signals workloads have no prior baseline. First merge will set the baseline; the gate is a no-op for first run (the existing gate handles this with `NEW (no previous baseline)`). **No code change needed; gate already handles it.**

### 8.8 N=1000 for memory may OOM on `mount-10k-leaves` (MEDIUM — already mitigated)

10k leaves x 1000 graphs = 10M nodes ~= several GB. Per-workload N override (§2.2): `mount-10k-leaves` runs at N=10. Same for `update-1-of-10k-leaves` (N=100 to amortize the 10k mount). Document the N override in each workload file's JSDoc.

### 8.9 Fairness vs. preact + htm (DOCUMENTED)

Preact under htm always re-renders the whole tree on update. We will lose `update-1-of-10k-leaves` against scribe/solid/lit. **Don't try to be fair.** Report the truth; let the reader conclude.

### 8.10 Open questions

- **Q1 — Track A vs Track B order.** If a single Builder spawn is preferred (rather than two parallel Builders), Team Lead should pick. **Recommend parallel spawns.**
- **Q2 — Should `bench-arbor` block merges to `packages/signals/` and vice versa?** Path filters say no. But arbor depends on signals; a signals change could regress arbor. **Recommend yes**: `bench-arbor:run` should fire when `packages/signals/**` OR `packages/arbor/**` changes. Update the path filter accordingly.
- **Q3 — magna integration (Track B from Phase 2.5)?** Out of Round N+1 scope. Defer.
- **Q4 — Browser-fidelity bench in a Round N+2?** Discuss after Round N+1 lands; Playwright + Chromium is significant additional infra.

### 8.11 Hard stops considered (none triggered)

The brief lists three escalation conditions:

1. **A competitor's bench shape is fundamentally incompatible with the signals adapter interface.** Verified: all five existing signals competitors fit the current `SignalAdapter` interface; the 3 new lifted workloads only need `signal`/`computed`/`effect`/`setup` — already in the interface. **Not triggered.**
2. **Memory measurement not feasible in Bun headlessly without a wrapper process.** Verified: Bun supports `--expose-gc`; `v8.getHeapStatistics()` and `process.memoryUsage()` work natively. **Not triggered.**
3. **A target DOM-binding package doesn't exist.** Verified: `lit-html` (separate package), `solid-js/web` (subpath export), `@vue/runtime-dom`, `preact`, `htm` — all published, all have ESM browser/dist entries that work under JSDOM. **Not triggered.**

---

## 9. Builder briefs (for the next Team Lead to lift)

Following Learning #18 (self-contained briefs), here are draft prompts for the two Builders. Not sent — this is a sketch the Team Lead can finalize.

### 9.1 Track A Builder brief (sketch)

```
Implement Track A per .team/round-n1/bench-design.md §3 + §6.1. Six workloads,
five comparators (lit-html, solid-js/web, @vue/runtime-dom, preact+htm,
vanilla), under JSDOM with Bun. Pin versions per §3.4. Ship time + memory
runners; CI gate at 10% p50 regression on either axis. RESULTS.md per §5.3.

Decision authority: 2B (you may choose adapter implementation details that
fit each library's idiom; document any deviation from the DomAdapter sketch
in §3.3 with rationale).

Atomic per-task commits per Learning #19. SHA-backfill per Learning #20 if
needed. Apply Learnings #1, #5, #11, #13, #18.

Hard stops: any competitor's adapter would force a redesign of types.ts ->
escalate. Any workload >10x slower than vanilla -> halt and investigate. Any
JSDOM behavior gap that invalidates the comparison -> document in
HARNESS.md and ship; don't try to fix JSDOM.
```

### 9.2 Track B Builder brief (sketch)

```
Extend bench/signals/ per .team/round-n1/bench-design.md §2 + §5.2 + §6.2.
Add memory runner (--expose-gc, protocol per §2.2/§2.6). Add 3 parity
workloads (deep-propagation-100, dynamic-deps, creation-1to1000) lifted
from transitive-bullshit/js-reactivity-benchmark and solid-js/bench. Restructure
RESULTS.md per §5.2, including per-competitor-axis honesty section. Extend
gate.ts to cover memory with separate fail messages.

Decision authority: 2B. Apply Learnings #1, #5, #11, #18.

Hard stops: any competitor breaks under --expose-gc -> escalate. Memory
deltas that don't stabilize across runs (>30% variance N=1000) -> harness
bug, fix before reporting. Any new workload that scribe loses by >5x ->
halt and investigate.
```

---

## 10. Out-of-scope (explicitly deferred)

The following are tempting to add but should NOT land in Round N+1:

- **Browser-fidelity arbor bench** (Playwright + Chromium). Round N+2 candidate; significant infra. JSDOM-relative is sufficient for first-eyes.
- **magna integration bench (Phase 2.5 Track B).** Separate session per its own brief; not in Round N+1 scope.
- **Hydration / serialize() benches.** `MountScope.serialize()` throws `ArborNotImplementedError` in v0; benching it is meaningless until sub-project #6 ships.
- **`when()` / `each()` benches.** Same — v0 stubs throw.
- **Compiler-emitted-code benches.** v0 ships hand-authored arbor primitives only; the compiler is sub-project #2 and not yet in this repo.
- **CPU-pinned / nice-priority bench environment.** Deferred to v1; Bun's default scheduling on CI runners is good enough for 10% threshold.
- **Cross-Bun / cross-Node parity report.** All numbers are Bun. If Node-vs-Bun divergence becomes a topic, that's a separate Round.

---

## Appendix A — Data flow diagram for the new memory runner

```
                      pre-build heapUsed (settle 3x gc)
                                  |
                                  v
              +-----------------------------------+
              | for i in 0..N: ctxs.push(build()) |  <- build phase
              |   peak_malloced_memory tracked     |
              +-----------------+-----------------+
                                |
                       settle 3x gc -> buildHeap
                                |
                       buildHeapDelta = (buildHeap - pre) / N
                                |
                                v
              +-----------------------------------+
              | for c in ctxs: c.cleanup()        |  <- dispose phase
              | ctxs.length = 0                    |
              +-----------------+-----------------+
                                |
                       settle 3x gc -> afterHeap
                                |
                       disposeResidual = afterHeap - pre   <- leak signal
```

## Appendix B — Mapping between competitor axes and our workloads

| Competitor axis | Their workload name | Scribe workload (our naming) | Match quality |
|---|---|---|---|
| alien-signals: cellx | `cellx` | `cellx` | exact |
| alien-signals: kairo (dynamic deps) | `kairoBench` | `dynamic-deps` (NEW) | close |
| alien-signals: mol (deep) | `molBench` | `deep-propagation-100` (NEW) | close |
| alien-signals: s-bench | `sBench` | `creation-1to1000` (NEW) + `cellx` | partial |
| @vue: effect | `effect.bench` | `wide-fanout-100` | close |
| @vue: computed | `computed.bench` | `cellx` | close |
| @vue: reactiveObject | `reactiveObject.bench` | (NOT MEASURED — different model) | n/a |
| @vue: ref | `ref.bench` | (covered by all workloads) | implicit |
| @preact: throughput | (no named bench) | all workloads | implicit |
| solid: 1to1 | `updateComputations1to1` | `cellx` chain | close |
| solid: 1to1000 | `createComputations1to1000` | `creation-1to1000` (NEW) | exact |
| solid: 1000to1 | `updateComputations1000to1` | (NOT MEASURED — fan-in v1+) | gap |
| s-js: cellx | `cellx` | `cellx` | exact |
| lit-html: krausest | krausest 1k | `krausest-1k-cycle` (arbor) | close |
| solid-js DOM: granular update | krausest partial-update | `update-1-of-10k-leaves` (arbor) | close |
| @vue/runtime-dom: patch flag | `runtime-dom` benches | `attr-thrash-100x100` (arbor) | close |
| preact+htm: minimal-runtime mount | krausest create | `mount-10k-leaves` (arbor) | close |

**12 of 17 axes covered, 2 deliberate gaps (proxy-reactivity, fan-in), 3 covered implicitly.** This is the apples-to-apples surface area.

---

## End

When Round N+1 lands, scribe has SOTA receipts on time + memory for both signals and arbor, on the workloads each competitor itself emphasizes, with CI-enforced regression thresholds on both axes. v0 is then defensible against Learning #11 — every claim is backed by a number, every number is gated, every gate cites a competitor.
