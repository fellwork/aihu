# Packed-mode bench result — post-mortem

**Status:** CUT. Packed-mode CSR machinery is removed from `main`-track development. Lattice signals survive on a separate branch (`feat/lattice-signals-promote`).

**Date closed:** 2026-05-01
**Branch base for this cut:** `origin/main` @ `e005a47`

---

## 1. Bench result summary

### Builder R1 reported numbers

Branch: `feat/packed-bench-harness` @ `13b014b`. Single run, p50.

| Workload                       | Baseline p50 | Packed p50 | Delta            |
|--------------------------------|-------------:|-----------:|------------------|
| `deep-propagation-100`         |      3.21 µs |    3.82 µs | **+19.0%** slower |
| `wide-fanout-100`              |      4.18 µs |    3.82 µs | **−8.6%**  faster |

### Verifier independent re-runs (3 fresh runs)

| Workload                                | Run 1   | Run 2   | Run 3   | Variance       |
|-----------------------------------------|--------:|--------:|--------:|----------------|
| `deep-propagation-100` (baseline)       | 3.29 µs | 3.30 µs | 3.30 µs | stable         |
| `deep-propagation-100-packed`           | 3.80 µs | 4.12 µs | 5.35 µs | **41% swing**  |
| `wide-fanout-100` (baseline)            | 4.16 µs | 4.10 µs | 4.62 µs | stable         |
| `wide-fanout-100-packed`                | 3.69 µs | 7.20 µs | 3.75 µs | **95% swing**  |

The baseline arms are stable across runs. The packed arms are not. The single-run R1 numbers fall inside the variance envelope and are not reproducibly distinguishable from noise on the slower workloads.

---

## 2. The dist-vs-src module-instance caveat

The bench harness as run is **structurally invalid as an apples-to-apples comparison**:

- The **baseline** workload imports through the published entrypoint `@aihu/signals` (i.e. mangled `dist/index.js`, post-build).
- The **packed** workload imports raw TypeScript source from `packages/signals/src/*.ts`.

This asymmetry is not incidental. The packed path needs to share a `signal.ts` module instance with `packed-mode.ts` because the write-interceptor slot is **module-level mutable state** (`let _writeInterceptor: WriteInterceptorFn | null`). If the packed workload imported through `dist/index.js`, it would get a different module instance than `packed-mode.ts` and the interceptor wiring would silently no-op.

Consequence: the bench is comparing two different builds (mangled production bundle vs. raw TS through bun's loader), not two different dispatch strategies. Any delta — favorable or unfavorable — is contaminated by the build-system difference. There is no way to fix this within the current packed-mode design without either:
- exporting `setWriteInterceptor` from the public API surface (rejected — leaks internal state into the consumer contract), or
- statically linking packed-mode into `signal.ts` itself (rejected — defeats the opt-in dispatch model that was packed-mode's whole selling point).

---

## 3. Architectural rationale for cutting

From the adjudication director-note:

1. **Even on the most charitable single run, the result is split direction.** Wide-fanout improved (−8.6%); deep-chain regressed (+19.0%). There is no run, charitable or otherwise, where packed-mode is a clean win.

2. **Split direction is structural, not a measurement artifact.** Bitmap-based dirty propagation amortizes cost over wide fanout. Topo-walking 102 nodes to deliver one useful update penalizes deep chains. This is the design, working as specified.

3. **A meta-framework outputting vanilla custom elements cannot ship a primitive whose perf depends on consumer-graph topology it never sees.** The compiler emits stand-alone custom elements; the consumer assembles them into graphs of arbitrary shape. Choosing a dispatch strategy that wins on one shape and loses on another is framework lock-in to graph shape — exactly the form of lock-in aihu's positioning forbids.

4. **Re-benching costs 1–2 rounds and cannot change the architectural conclusion.** Even if a clean re-bench produced tighter numbers, the split-direction structural finding stands and we'd cut on architectural grounds anyway. Re-benching is sunk cost on a foregone outcome.

---

## 4. What survives the cut

The following ship separately on `feat/lattice-signals-promote` (R2 branch) and are **independent of the CSR machinery**:

- `latticeSignal` factory
- `boolLatticeSignal` factory
- `LatticeSignal` interface
- `boolLatticeSignal`-based `_staleSignal` invalidation in `packages/data/src/resource.ts`

These primitives use the standard signal write path (no write-interceptor, no packed graph, no topo walk). They depend only on monotone-merge semantics, which remain useful regardless of dispatch strategy.

---

## 5. What was deleted

Branches removed (local + remote):

- `feat/packed-signals-proto` — packed-mode signal-side prototype
- `feat/packed-arbor-proto` — packed-mode arbor-side prototype
- `feat/packed-bench-harness` — bench harness with the structurally-invalid comparison
- `feat/packed-data-proto` — packed-mode data-side prototype (lattice content moved to `feat/lattice-signals-promote`)
- `feat/signals-n2-scratch` — N2 scratch / exploration
- `feat/signals-n2-depth-mark` — N2 depth-marking variant
- `feat/signals-n2-packed-proto` — N2 packed prototype

Code removed from this branch: none (the write-interceptor slot was on `feat/packed-signals-proto` and `feat/packed-bench-harness`, never on `main`).
