/**
 * The single timing choke point for `bench/arbor`.
 *
 * ALL timing entry points (runner.ts, repeat.ts, and anything added later)
 * MUST go through `measureLive()`. Nothing else in this harness may import
 * mitata's `measure` for an arbor cell — that is the structural guarantee
 * behind R0 (docs/plans/2026-07-26-arbor-perf-truth.md §3.2): the
 * DOM-liveness probe runs here, immediately before timing, so it cannot be
 * forgotten when a workload or a new runner is added.
 *
 * Protocol (matches the truth doc's measurement protocol):
 *   1. 5 pre-warmup calls (hidden classes / inline caches).
 *   2. R0 liveness probe — one op under a MutationObserver; hard abort on
 *      failure (see liveness.ts).
 *   3. mitata `measure()` with warmup_samples: 5 and a 2 s CPU budget
 *      (R2: the gate-era 1 s budget yielded ~10-12 samples on the heavy
 *      workloads; 2 s yields 100+ and makes `min` meaningful).
 */

import { measure } from 'mitata'

import { assertLiveness } from './liveness.ts'
import type { WorkloadDefinition } from './types.ts'

export interface MeasureLiveStats {
  min: number
  avg: number
  p50: number
  p99: number
  /** number of timed samples mitata collected */
  samples: number
}

export interface MeasureLiveOptions {
  /** per-cell CPU budget in ns; default 2e9 (R2) */
  minCpuTime?: number
}

export async function measureLive(
  workload: WorkloadDefinition,
  competitor: string,
  run: () => void,
  opts?: MeasureLiveOptions,
): Promise<MeasureLiveStats> {
  // 1. Pre-warmup.
  for (let i = 0; i < 5; i++) run()

  // 2. R0 — liveness is a precondition, not a result. Throws (→ process
  //    abort) if one op does not produce the workload's declared minimum of
  //    real DOM mutations. Runs AFTER warmup so the probed op is steady-state.
  assertLiveness(workload, competitor, run)

  // 3. Timed region. The observer is disconnected before this — the probe
  //    adds zero overhead to the measured op.
  const stats = await measure(run, {
    min_cpu_time: opts?.minCpuTime ?? 2_000_000_000,
    warmup_samples: 5,
  })

  return {
    min: stats.min,
    avg: stats.avg,
    p50: stats.p50,
    p99: stats.p99,
    samples: stats.samples.length,
  }
}
