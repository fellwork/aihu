/**
 * Bench harness types for `bench/arbor` per Round N+1 design §3.3.
 *
 * The signals harness uses `SignalAdapter` (signal/computed/effect/batch/setup).
 * Arbor's domain is tree construction and mount/dispose, which is a different
 * vocabulary; we intentionally keep `DomAdapter` separate (per design §3.3).
 *
 * The shape is deliberately minimal — a workload tells the adapter "build the
 * graph, mount, drive updates, dispose". Each adapter owns its own template
 * shape (lit literals, solid h-trees, aihu Branch/Leaf, etc.) and its own
 * notion of reactivity (lit re-renders, solid signals, aihu signals…).
 *
 * **Spawn 1 note.** This file lands the *minimal* interface the spawn-1
 * aihu adapter + mount-10k-leaves workload need. Spawn 2's adapters and
 * workloads may extend this — design §3.3 sketches a richer shape with
 * `prepare(kind, params)` separation and `update(event)` event semantics.
 * Carry that forward in spawn 2 if the additional workloads need it; for
 * spawn 1 the aihu adapter alone doesn't.
 */

/**
 * A live mount instance. Returned by `DomAdapter.setup(host)`. The workload
 * holds onto the `value` between samples and calls `dispose()` exactly once
 * during teardown.
 */
export interface AdapterContext {
  /**
   * Build the tree and attach to `host`. Synchronous: by the time `mount()`
   * returns, the DOM is fully attached. Idempotent only in the sense that the
   * caller must not invoke twice without an intervening `dispose()`; adapters
   * are not required to defend against double-mount.
   */
  mount(): void

  /**
   * Apply a workload-defined update. Runs after `mount()`. The adapter
   * decides what `value` means (signal write, re-render trigger, etc.).
   * Workloads that don't drive updates may leave this as a no-op.
   */
  update(value: unknown): void

  /**
   * Tear down. Releases effects, removes DOM, drops references. Idempotent.
   */
  dispose(): void
}

/**
 * A `DomAdapter` is a thin wrapper over a single competitor's render layer.
 * Every workload calls it generically so workload code stays library-agnostic.
 *
 * `setup(host)` returns *both* the live `AdapterContext` and a top-level
 * `dispose()` for the adapter-owned ambient state (root scope, owner, etc.).
 * The split mirrors the signals adapter's `setup()` shape: `value` is what
 * the workload calls each op; `dispose` is what the workload calls once.
 */
export interface DomAdapter {
  readonly name: string
  readonly version: string
  setup(host: Element): { value: AdapterContext; dispose: () => void }
}

/**
 * R0 — DOM-liveness declaration (docs/plans/2026-07-26-arbor-perf-truth.md §3.2).
 *
 * Every workload MUST declare what one op provably does to the live DOM.
 * Before any timing is reported, the harness runs one op under a
 * MutationObserver and hard-fails the entire run if the declaration is not
 * met. A benchmark op that does not mutate the DOM is measuring nothing —
 * this is the mechanism that produced the fabricated 28.63 ns baseline row
 * (and the public 122x/152x claims), and it was reproduced twice more in
 * 2026-07 while attempting to measure `dist`.
 *
 * Design note — why this lives here: `liveness` is a *required* field, so a
 * new workload cannot compile without declaring it, and enforcement happens
 * at the single timing choke point (`measure-live.ts`), so it cannot be
 * skipped. A rule that depends on someone remembering to add a probe is the
 * failure mode this repo already had.
 */
export interface LivenessSpec {
  /**
   * Minimum total MutationObserver records (childList + characterData +
   * attributes, subtree of document) one op must produce. Must be ≥ 1 —
   * the runner rejects 0 at runtime so the requirement cannot be declared
   * away.
   */
  readonly minRecords: number
  /**
   * Optional sharper assertion over the observed records of one op. Return
   * an error string to fail the run, `null` to pass. Use this when a raw
   * count cannot distinguish a partially-dead op — e.g. krausest's update
   * phase dying while its mount phase still floods the record stream (the
   * exact partial death the 2026-05-25 baseline shipped).
   */
  readonly verify?: (records: readonly MutationRecord[]) => string | null
}

export interface WorkloadResult {
  /** mean wall-clock time per op in nanoseconds */
  mean: number
  /** minimum time per op in nanoseconds (R2: best estimator under one-sided noise) */
  min: number
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
}

export interface WorkloadDefinition {
  /** Slug used in RESULTS.md tables + CI gate keys. */
  readonly name: string
  /** One-sentence description of what the workload measures. */
  readonly description: string
  /**
   * Per-workload N override for the (forthcoming) memory runner. mount-10k-leaves
   * uses N=10 to avoid OOM (10k leaves × 1000 graphs would be 10M nodes); other
   * workloads default to N=1000 (see design §2.2 / §8.8). Spawn 3 wires this.
   */
  readonly n?: number
  /**
   * R0 — REQUIRED. What one op provably does to the live DOM. See
   * `LivenessSpec`. The runner refuses to time a workload whose declaration
   * is not met; there is deliberately no way to opt out.
   */
  readonly liveness: LivenessSpec
  /**
   * Build a "single op" function bound to the given adapter. The returned
   * function is what mitata times; it should perform exactly one logical
   * iteration (e.g. one mount+dispose cycle, or one signal write).
   *
   * Setup (any pre-mount template construction the workload needs once) goes
   * inside `build()`; mitata does not time it. Returning `cleanup` lets the
   * workload tear down anything it allocated outside the per-op cycle.
   */
  build(adapter: DomAdapter): { run: () => void; cleanup: () => void }
}
