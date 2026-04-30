# `bench/arbor` Harness Guide

**Round N+1 Track A** — @scribe/arbor vs. SOTA DOM-binding libraries

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

## Quick start

```bash
# Time bench (writes bench/arbor/RESULTS.md)
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
     build(adapter) {
       // Setup (not timed): build any pre-allocated templates/data
       // Call the relevant adapter setter (e.g. setScribeHook)
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

For adapters where the tree shape varies per workload (scribe, solid), the
workload calls a setter to install its template before `adapter.setup(host)`.
This keeps `DomAdapter.setup()` shape uniform while allowing library-specific
tree vocabulary.

| Adapter | Setter |
|---|---|
| @scribe/arbor | `setScribeHook({ buildTree(): Node, attach?(scope): void })` |
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

## The `[bench-bump]` override

If a commit intentionally introduces a regression (e.g. a new feature with
temporary overhead), add `[bench-bump]` to the commit message body. CI will
detect this and set `BENCH_BUMP=1`, which causes `gate.ts` to exit 0
unconditionally. Remove the tag in the follow-up commit once perf is restored.

Usage:
```
feat(arbor): add new feature X

[bench-bump] — feature X adds 5% overhead to mount-10k-leaves;
follow-up PR will optimize.
```

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
| `src/types.ts` | `DomAdapter`, `WorkloadDefinition` interfaces |
| `src/jsdom-host.ts` | JSDOM singleton + `getHost`/`releaseHost` helpers |
| `src/runner.ts` | Time bench — runs all 36 cells, writes `RESULTS.md` |
| `src/memory.ts` | Memory bench — GC protocol, writes `RESULTS.memory.md` |
| `src/gate.ts` | CI regression gate — compares p50 vs. previous `RESULTS.md` |
| `src/size.ts` | Bundle size reporter — informational, stdout only |
| `src/competitors/` | One file per competitor implementing `DomAdapter` |
| `src/workloads/` | One file per workload implementing `WorkloadDefinition` |
