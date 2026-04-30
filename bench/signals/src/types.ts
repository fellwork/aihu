/**
 * Uniform competitor adapter shape.
 *
 * Each library exposes signals/effects/computeds in a slightly different way
 * (tuple vs. `.value`, eager vs. lazy memo, optional batching). The adapter
 * normalizes them onto one tiny vocabulary the workloads can call generically.
 *
 * - `signal(init)` returns a `[get, set]` tuple.
 * - `computed(fn)` returns a getter function. (Vue/Preact `.value` is wrapped.)
 * - `effect(fn)` runs `fn` once and re-runs on dep change. Returns dispose.
 * - `batch(fn)` defers effect runs until the outermost call returns. If a lib
 *   has no batch primitive, the adapter sets `batch = undefined` and the
 *   workload measures its synchronous-flush behavior instead.
 * - `flush(fn)` is an optional hook for libs that need to flush the scheduler
 *   manually (Solid uses it via `runWithOwner` — most don't need it). Defaults
 *   to running `fn()` directly.
 * - `setup(fn)` wraps the workload body in any owner/root context the lib
 *   requires. Solid's `createRoot` and S.js's `S.root` need this; others use
 *   identity. Returning `() => void` lets the caller dispose the owner.
 */
export interface SignalAdapter {
  readonly name: string
  readonly version: string
  signal<T>(init: T): readonly [() => T, (v: T) => void]
  computed<T>(fn: () => T): () => T
  effect(fn: () => void): () => void
  batch?: (fn: () => void) => void
  setup<T>(fn: () => T): { value: T; dispose: () => void }
}

export interface WorkloadResult {
  /** mean wall-clock time per op in nanoseconds */
  mean: number
  /** median time per op in nanoseconds */
  p50: number
  /** 99th percentile time per op in nanoseconds */
  p99: number
  /** ops/sec (1 / mean_seconds) */
  opsPerSec: number
  /** raw mitata stats payload, kept for debugging */
  raw?: unknown
}

export interface WorkloadCell {
  workload: string
  competitor: string
  result: WorkloadResult | { error: string }
  /**
   * Optional memory sample paired with this cell. The time runner leaves
   * this `undefined`; the memory runner (`bun --expose-gc src/memory.ts`)
   * fills it in when the runner is composed (see `runner.ts` Round N+1
   * fold). Per design §2.4, memory is reported alongside time per workload.
   */
  memory?: MemorySample | { error: string }
}

/**
 * Memory delta recorded for one (workload × competitor) cell using the
 * `--expose-gc` protocol from design §2.2 / §2.6 (Round N+1).
 *
 * - `buildHeapDelta` — average per-graph cost in bytes. Computed as
 *   `(post-build heapUsed - pre-build heapUsed) / N`. Measures the
 *   steady-state cost of holding the graph live.
 * - `peakMalloc` — V8 `peak_malloced_memory` bytes captured during the
 *   build phase. Captures transient allocations the gc reclaims.
 * - `disposeResidual` — `(post-dispose heapUsed - pre-build heapUsed)`,
 *   total bytes (NOT per-graph). Should be ≤ a small constant; growth
 *   with N indicates the competitor leaks. Informational, not gated.
 */
export interface MemorySample {
  /** average per-graph build heap cost in bytes */
  buildHeapDelta: number
  /** peak_malloced_memory delta during build phase, in bytes */
  peakMalloc: number
  /** total residual heap after dispose+gc, in bytes (leak signal) */
  disposeResidual: number
}

export interface WorkloadDefinition {
  /** Slug used in RESULTS.md filenames + tables. */
  readonly name: string
  /** One-sentence description of what the workload measures. */
  readonly description: string
  /**
   * Build a "single op" function bound to the given adapter. The returned
   * function is what mitata times; it should perform exactly one logical
   * iteration of the workload (e.g. one source write + propagation).
   *
   * The setup phase (graph construction) happens here; mitata does not time
   * it. Returning a `cleanup` lets the workload tear down the owner/root.
   */
  build(adapter: SignalAdapter): { run: () => void; cleanup: () => void }
}
