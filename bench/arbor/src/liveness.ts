/**
 * R0 — mandatory DOM-liveness assertion.
 * Ruling: docs/plans/2026-07-26-arbor-perf-truth.md §3.2 (ratified in #607).
 *
 * Before any (workload × competitor) cell is timed, one op is executed under
 * a MutationObserver on the JSDOM document. If the op does not produce the
 * workload's declared minimum of real DOM mutations, the ENTIRE RUN aborts
 * with a non-zero exit — no number is reported for that cell or any other,
 * and no RESULTS.md is written.
 *
 * Why hard-fail rather than an ERROR cell: a setup exception already reports
 * honestly as ERROR. A liveness failure is different in kind — the harness
 * would otherwise report a *fast number for a no-op*. That mechanism produced
 * the fabricated 28.63 ns `update-1-of-10k-leaves` baseline row on 2026-05-25
 * (source of the public 122x/152x claims), and was reproduced twice more on
 * 2026-07-26 while attempting to measure `dist` (~16 ns, INERT — two
 * `@aihu/signals` module instances; effect subscribed on one, signal written
 * on the other). A benchmark that measures nothing must fail, not flatter.
 *
 * Enforcement is structural, not by convention:
 *   - `WorkloadDefinition.liveness` is a REQUIRED type field — a new workload
 *     cannot compile without declaring its expectation.
 *   - The probe runs inside `measure-live.ts`, the single choke point every
 *     timing entry point (runner.ts, repeat.ts) goes through — it cannot be
 *     forgotten per-workload.
 *   - `minRecords < 1` is rejected at runtime — the requirement cannot be
 *     declared away.
 */

import type { WorkloadDefinition } from './types.ts'

/** Thrown on probe failure. runner.ts deliberately does NOT convert this into
 * a per-cell ERROR row — it propagates and kills the process. */
export class LivenessError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LivenessError'
  }
}

function fail(workload: string, competitor: string, detail: string): never {
  throw new LivenessError(
    [
      'R0 LIVENESS FAILURE — refusing to report a number for a dead binding.',
      `  cell: ${workload} × ${competitor}`,
      `  ${detail}`,
      '  A benchmark op that does not mutate the DOM is measuring nothing.',
      '  This exact mechanism produced the fabricated 28.63 ns baseline row',
      '  (the 122x/152x public claims) and both 2026-07 INERT dist attempts.',
      '  Fix the binding or the workload. Do not bypass this check.',
    ].join('\n'),
  )
}

/**
 * Run one op under a MutationObserver and assert the workload's declared
 * liveness. Throws `LivenessError` (→ process abort) on any violation.
 */
export function assertLiveness(
  workload: WorkloadDefinition,
  competitor: string,
  runOp: () => void,
): void {
  const g = globalThis as unknown as {
    document?: Document
    window?: { MutationObserver?: typeof MutationObserver }
  }
  const doc = g.document
  const MO = g.window?.MutationObserver
  if (!doc || !MO) {
    fail(
      workload.name,
      competitor,
      'no document/MutationObserver on globalThis — jsdom-host.ts must load before any cell runs.',
    )
  }

  const spec = workload.liveness
  if (!spec || !Number.isFinite(spec.minRecords) || spec.minRecords < 1) {
    fail(
      workload.name,
      competitor,
      `workload declares no positive liveness expectation (minRecords must be ≥ 1, got ${String(
        spec?.minRecords,
      )}) — a workload that cannot prove it mutates the DOM cannot be timed.`,
    )
  }

  const observer = new MO(() => {
    /* records are drained synchronously via takeRecords() */
  })
  let records: MutationRecord[] = []
  try {
    observer.observe(doc, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    })
    runOp()
    records = observer.takeRecords()
  } finally {
    observer.disconnect()
  }

  if (records.length < spec.minRecords) {
    fail(
      workload.name,
      competitor,
      `expected ≥${spec.minRecords} DOM mutation record(s) per op; observed ${records.length}.`,
    )
  }

  if (spec.verify) {
    const err = spec.verify(records)
    if (err !== null) {
      fail(workload.name, competitor, err)
    }
  }
}
