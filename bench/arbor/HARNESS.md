# `bench/arbor` Harness Guide

**Round N+1 Track A** — @aihu/arbor vs. SOTA DOM-binding libraries

---

## What this harness measures

This harness measures JSDOM-relative DOM-binding throughput under Bun. It is
**not** a browser layout benchmark — JSDOM has no layout engine, so numbers
reflect JavaScript execution cost only (tree construction, effect scheduling,
DOM API calls). Results are order-of-magnitude comparisons; exact numbers will
differ in a real browser environment with a Playwright runner (out of scope v0).

The "op" unit varies by workload:
- **Mount workloads** — one full mount+dispose cycle per op
- **Update workloads** — one signal write (propagated to one DOM node) per op
- **Three-phase workloads** — create+update+clear runs as one op

---

## R0 — the mandatory DOM-liveness assertion

*Ruling: `docs/plans/2026-07-26-arbor-perf-truth.md` §3.2, ratified in #607.*

**Before any cell is timed, the harness runs one op under a MutationObserver
and hard-fails the ENTIRE RUN — non-zero exit, no RESULTS.md — if the op does
not produce the workload's declared minimum of real DOM mutations.** A
benchmark op that does not mutate the DOM is measuring nothing; a harness
that reports a time for it is fabricating a number.

This is not hypothetical. The 2026-05-25 baseline recorded 28.63 ns for
`update-1-of-10k-leaves` with **0 DOM writes/op** (a subscriber-less signal
write — two `@aihu/signals` module instances, effect subscribed on one,
signal written on the other). That row produced the public 122x/152x claims.
The same mechanism was reproduced twice more on 2026-07-26 (~16 ns, INERT)
while attempting to measure `dist`.

Enforcement is structural — deliberately not a convention:

- `WorkloadDefinition.liveness` is a **required** type field. A new workload
  does not compile without declaring what one op does to the DOM.
- The probe runs inside `src/measure-live.ts`, the **single timing choke
  point**. Both timing entry points (`runner.ts`, `repeat.ts`) go through it;
  new entry points MUST too. Nothing else in this harness may call mitata's
  `measure()` for a cell.
- `minRecords < 1` is rejected at runtime, so the requirement cannot be
  declared away.
- A `LivenessError` is **never** demoted to a per-cell ERROR row. A setup
  exception reports honestly as ERROR; a liveness failure would otherwise
  report a *fast number for a no-op*, so it kills the process instead.

Workloads whose raw record count cannot prove the interesting phase ran
declare a `verify(records)` sharpener — see `krausest-1k-cycle` (its update
phase died silently in the 2026-05-25 baseline while mount-phase records
kept the total high) and `attr-thrash-100x100` (requires 10,000
attribute-type records specifically).

---

## R8 — counted-metric gate (`src/counts.ts`)

**Counts, not timings, for anything that gates.** DOM moves per
reconciliation, `nodeValue` writes/op, and `setAttribute` calls/op are exact
integers with zero variance — machine-, load-, and statistic-independent.
They also fail in the right direction: a dead binding sends a count to
**zero**, which screams, where it sends a timing **down**, which flatters.

`bun bench/arbor/src/counts.ts` checks pinned equalities:

| metric | pinned value | twin |
| --- | ---: | --- |
| 2-row swap in a 1000-row keyed list, DOM moves | **4** (was 1994 pre-FEL-408) | `packages/arbor/tests/structural.test.ts` |
| no-op keyed re-render, DOM moves | 0 | same |
| `update-1-of-10k-leaves`, DOM mutations/op | 1 (one `characterData` write) | — |
| `attr-thrash-100x100`, attribute mutations/op | 10,000 | — |

There is **no `[bench-bump]` bypass** for counts: a count change is an
algorithmic change and must be reviewed by editing the pinned constant (here
and in the structural test) in the diff that changes it.

These counted facts are also the only publishable performance claims today
(truth doc §4): they are exact and environment-independent, unlike every
timing this harness produces.

---

## Gate tiering (R5) and the timing gate's status

Per the 2026-07-26 ruling:

| workload | tier | basis |
| --- | --- | --- |
| `update-1-of-10k-leaves` | **GATE** | thousands of samples; 4.7 % p50 spread at low load |
| `mount-deep-100x10` | **GATE** | 1000+ samples at 2 s budget; 2.6 % spread |
| `mount-10k-leaves`, `mount-wide-1000`, `krausest-1k-cycle` | report-only | ~12–16 samples at CI budget; p50 spread 534–1,176 % in the gate's own configuration |
| `attr-thrash-100x100` | **never-gate** | CI-environmental, NOT intrinsic — see `gate.ts` before touching this |

`bench-arbor`'s **timing** step ships red, and as of **D1, resolved
2026-08-08**, that is a closed decision rather than an open item: the
committed `RESULTS.md` baseline is provably invalid (two rows recorded dead
bindings) and must not be regenerated (truth doc §3.4 — the standing STOP).
The gate becomes trustworthy only when R1 (same-job A/B against the merge
base) replaces the checked-in-baseline mechanism — tracked as
`C-FEL-BENCH-R1-AB-HARNESS`. Until then the trustworthy signals are the
counted-metric gate above and the per-package size gates, both of which
still fail the job.

Re-verified 2026-08-08 against a live run: the FAIL is
`update-1-of-10k-leaves 29 → 256 ns (795.8 %)` — the dead-binding fiction row,
not a regression — while the report-only rows swing −52 % to −60 % against the
2026-05-25 baseline.

> **The single canonical statement of the D1 decision — what was accepted, the
> two alternatives that were rejected and on what measured evidence, what a
> contributor should do when they see the red, and the only two things that
> reopen it — lives in `bench/signals/HARNESS.md`, section
> "D1 — RESOLVED 2026-08-08". This note is a pointer to it, not a second
> source of truth.**

---

## Measured artifact (R6)

What this harness times is the **workspace source** — `packages/*/src` via
`bench/arbor/tsconfig.json` `paths` — **not the shipped `dist`**. CI sets
`NODE_ENV=production` for the timing run so signals' `__DEV__` branches fold
away as they do in the shipped artifact; the RESULTS.md header records the
artifact, `NODE_ENV`, and start/end load averages so no number appears
without its conditions.

**The harness cannot measure true `dist` today.** Bun applies
`packages/arbor/tsconfig.json` `paths` to imports made *by arbor's own
`dist/index.js`*, so arbor-dist's `@aihu/signals` import resolves back to
`src` while the workload's resolves to `dist` — two module instances, dead
bindings (both attempts INERT at ~16 ns; caught by the liveness probe).
Measuring what users install requires pack-and-install isolation: `bun pm
pack` signals+arbor, install into a temp dir with the harness copied in, run
there. R0 is what proves whether that attempt succeeded. See truth doc §2.2.

---

## Quick start

```bash
# Counted-metric gate (R8) — exact equalities, fast, trustworthy
bun bench/arbor/src/counts.ts

# Time bench (writes bench/arbor/RESULTS.md)
bun bench/arbor/src/runner.ts

# Single-cell reproduction (does NOT write RESULTS.md; BENCH_OUT=<path> to capture)
BENCH_ONLY_WORKLOAD=update-1-of-10k-leaves BENCH_ONLY_COMPETITOR=@aihu/arbor \
  bun bench/arbor/src/runner.ts

# Memory bench (writes bench/arbor/RESULTS.memory.md)
bun --expose-gc bench/arbor/src/memory.ts

# Bundle sizes (stdout only, informational)
bun bench/arbor/src/size.ts

# Regression gate (CI usage; self-test with prev==cur exits 0)
bun bench/arbor/src/gate.ts bench/arbor/RESULTS.md bench/arbor/RESULTS.md
```

---

## How to add a new workload

1. Create `bench/arbor/src/workloads/my-workload.ts`
2. Export a `WorkloadDefinition` object (see `src/types.ts`):
   ```ts
   export const myWorkload: WorkloadDefinition = {
     name: 'my-workload',
     description: 'One sentence describing what one op does.',
     n: 10,  // Memory runner N override (see table below)
     // R0 — REQUIRED (will not compile without it). Declare the minimum
     // number of real DOM mutation records ONE op must produce; add a
     // verify(records) sharpener if a raw count cannot prove the phase you
     // care about actually ran (see krausest-1k-cycle).
     liveness: { minRecords: 1 },
     build(adapter) {
       // Setup (not timed): build any pre-allocated templates/data
       // Call the relevant adapter setter (e.g. setAihuHook)
       const host = getHost()
       const session = adapter.setup(host)
       return {
         run: () => { /* one op */ },
         cleanup: () => {
           session.dispose()
           releaseHost(host)
         },
       }
     },
   }
   ```
3. Add a branch for every competitor in the `build()` function, keyed on
   `adapter.name`. Throw at the end if the adapter is unknown.
4. Export from `bench/arbor/src/workloads/index.ts`.

---

## How to add a new competitor

1. Create `bench/arbor/src/competitors/my-lib.ts`
2. Implement the `DomAdapter` interface:
   ```ts
   export const myLib: DomAdapter = {
     name: 'my-lib',
     version: '1.2.3',
     setup(host) {
       // Set up the library's root scope / owner
       const ctx: AdapterContext = {
         mount() { /* build tree and attach to host */ },
         update(value) { /* drive reactive update */ },
         dispose() { /* tear down effects + remove DOM */ },
       }
       return {
         value: ctx,
         dispose: () => { /* top-level ambient cleanup */ },
       }
     },
   }
   ```
3. Export from `bench/arbor/src/competitors/index.ts`.
4. Add branches in each workload file for `adapter.name === 'my-lib'`.

---

## The adapter hook pattern

For adapters where the tree shape varies per workload (aihu, solid), the
workload calls a setter to install its template before `adapter.setup(host)`.
This keeps `DomAdapter.setup()` shape uniform while allowing library-specific
tree vocabulary.

| Adapter | Setter |
|---|---|
| @aihu/arbor | `setAihuHook({ buildTree(): Node, attach?(scope): void })` |
| lit-html | `setLitTemplate(() => TemplateResult)`, `setLitUpdater(v => TemplateResult)` |
| solid-js | `setSolidComponent(() => JSX.Element)`, `setSolidSignalSetter(fn)` |
| @vue/runtime-dom | `setVueRenderFn(() => VNode)`, `setVueRefSetter(fn)` |
| preact | `setPreactVNode(() => VNode)`, `setPreactUpdater(v => VNode)` |
| vanilla | `setVanillaMounter((host) => { update?: fn })` |

Each setter writes to a module-level `pending*` slot that `setup()` consumes
and clears. Workloads must call the setter immediately before `setup()`.

---

## N values for the memory runner

| Workload | N | Rationale |
|---|---|---|
| `mount-10k-leaves` | 5 | 10k nodes × 5 = 50k — manageable heap |
| `mount-deep-100x10` | 5 | similar tree size |
| `mount-wide-1000` | 20 | 1k nodes × 20 = 20k — small, safe |
| `update-1-of-10k-leaves` | 1 | live tree stays mounted, N=1 is intentional |
| `attr-thrash-100x100` | 5 | 10k signals × 5 = 50k |
| `krausest-1k-cycle` | 10 | 1k rows × 10 = 10k |

---

## Memory measurement limitations

For **mount workloads** (`mount-10k-leaves`, `mount-deep-100x10`,
`mount-wide-1000`), `build()` sets up the adapter context but does NOT call
`mount()`. The `buildHeapDelta` metric measures adapter setup overhead, not
live-tree heap cost.

For **`update-1-of-10k-leaves`**, `build()` DOES mount the tree (the tree
stays live for the lifetime of the context). The `buildHeapDelta` for this
workload reflects "live 10k-leaf tree heap" including all effects and signal
subscriptions.

The `disposeResidual` metric (heap delta after `cleanup()`) is a leak signal.
Ideally close to zero. GC timing variance under Bun/V8 can cause non-zero
residuals; treat values under 1 MB per context as noise.

---

## Memory measurement caveats

**Negative buildHeapDelta**: Negative values in the `buildHeapDelta` column
(e.g. `-31 MB` for `update-1-of-10k-leaves`) mean GC ran during the build
phase and collected prior-generation objects that happened to be reachable
before the measurement window. This is a timing artifact of V8's incremental
GC, not real memory reduction caused by the workload. Focus on the sign of
`disposeResidual` for leak analysis; ignore negative `buildHeapDelta` values.

**dispose-residual ~97–100% of buildHeapDelta**: When `disposeResidual` is
consistently close to `buildHeapDelta` across all competitors on a workload,
this indicates that V8's young-generation GC did not run within the 3-settle
window after `cleanup()`. The objects are reclaimed on the next GC cycle but
have not been freed yet at measurement time. This is not a aihu-specific
leak — it affects preact, vanilla, and all competitors equally on the same
workload. Treat equal residuals across all competitors as a measurement
artifact rather than a regression signal.

---

## The `[bench-bump]` override (R7 — audited exception, not a silent skip)

If a commit intentionally introduces a timing regression (e.g. a new feature
with temporary overhead), add `[bench-bump] <one-line reason>` to the commit
message body. CI extracts the reason from the same line and passes it to
`gate.ts` as `BENCH_BUMP_REASON`.

Three things changed from the old behavior:

1. **A justification is mandatory.** `BENCH_BUMP=1` with an empty reason does
   NOT bypass the gate.
2. **The bypass is auditable.** The gate always computes and prints every
   delta before honoring the override, so the CI log records exactly what was
   waived and why.
3. **It never applies to the counted-metric gate.** `counts.ts` has no
   bypass; a count change must be reviewed by editing the pinned constant.

Usage:
```
feat(arbor): add new feature X

[bench-bump] feature X adds 5% overhead to mount-10k-leaves; follow-up PR will optimize.
```

Remove the tag in the follow-up commit once perf is restored.

---

## JSDOM fidelity note

Results in this harness are order-of-magnitude comparisons under a headless
JS environment. JSDOM does not run CSS layout, compositing, or painting.
Real browser measurements require a Playwright runner (out of scope v0).

Known JSDOM gaps that affect competitors:
- **solid-js**: DOM APIs called during initial render trigger "Client-only API
  called on the server side" in JSDOM. solid-js cells report ERROR for all
  workloads — this is an environment mismatch, not a performance verdict.
- **@vue/runtime-dom**: Vue's runtime-dom requires `SVGElement` in global
  scope, which JSDOM does not expose as a global. vue cells report ERROR.

These are documented in RESULTS.md per design §5.3 honesty requirements.

---

## Files

| File | Purpose |
|---|---|
| `src/types.ts` | `DomAdapter`, `WorkloadDefinition`, `LivenessSpec` interfaces |
| `src/jsdom-host.ts` | JSDOM singleton + `getHost`/`releaseHost` helpers |
| `src/liveness.ts` | R0 — the DOM-liveness probe + `LivenessError` |
| `src/measure-live.ts` | The single timing choke point (probe → mitata) — ALL timing goes through this |
| `src/runner.ts` | Time bench — runs all 36 cells, writes `RESULTS.md` |
| `src/repeat.ts` | Multi-run @aihu/arbor-only variance reporter |
| `src/counts.ts` | R8 — counted-metric gate (exact equalities, no bypass) |
| `src/memory.ts` | Memory bench — GC protocol, writes `RESULTS.memory.md` |
| `src/gate.ts` | CI timing gate — p50 vs. previous `RESULTS.md`, GATE tier only |
| `src/size.ts` | Bundle size reporter — informational, stdout only |
| `src/competitors/` | One file per competitor implementing `DomAdapter` |
| `src/workloads/` | One file per workload implementing `WorkloadDefinition` |
