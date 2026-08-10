/**
 * Counted-metric gate for `bench/signals` — the signals analogue of
 * `bench/arbor/src/counts.ts`.
 *
 * Counts, not timings, for anything that gates. A recomputation count is an
 * exact integer with zero variance: machine-independent, load-independent,
 * statistic-independent. The timing gates in this directory are advisory by
 * decision (HARNESS.md § "D1"), and the revised R1 design
 * (docs/plans/2026-08-09-bench-r1-ab-harness.md § 6.1) says enforcement belongs
 * here instead — no major project blocks a PR on wall-clock microbenchmarks,
 * and our own measured noise floor swallows the effect we would gate on.
 *
 * WHAT IS COUNTED. Every adapter is wrapped so each `computed` body and each
 * `effect` body increments a counter when it actually RUNS. That is the
 * observable form of the property that matters in a reactive graph: given one
 * source write, how much of the graph re-evaluated? A glitch-free,
 * dedup-correct propagation touches each affected node exactly once. Anything
 * that recomputes a node twice is doing redundant work; anything that skips a
 * node is stale.
 *
 * WHY AT THE ADAPTER, NOT INSIDE THE LIBRARY. `@aihu/signals` already
 * increments a suitable counter (`runVer`, bumped once per `beginTrack` —
 * i.e. once per computed recompute or effect run), but exporting it would add
 * public API surface and bytes to a package with 116 B of headroom against a
 * 2350 B budget, for a bench-only need. Wrapping at the adapter costs the
 * shipped package nothing AND works uniformly across every competitor, which
 * makes the numbers comparable — the same thing js-reactivity-benchmark does
 * with its hardcoded count expectations.
 *
 * WHY IT FAILS IN THE RIGHT DIRECTION. A dead binding or a dropped
 * subscription sends a count DOWN, and a pinned equality catches that
 * instantly. The same regression sends a TIMING down too — where it reads as a
 * win. That is not hypothetical here: arbor's fabricated baseline row looked
 * like a 795 % improvement for two months because a dead binding made it fast.
 *
 * NO `[bench-bump]` BYPASS, deliberately, mirroring arbor's gate. A count
 * change is an algorithmic change. The only way past this gate is to edit the
 * pinned constant below in a reviewed diff.
 *
 * ── MEASURED SENSITIVITY — what this gate does and does not catch ───────────
 *
 * Stated because a gate whose reach is assumed rather than measured is how you
 * end up trusting one that never fires. Two mutations were applied to
 * `@aihu/signals`, each rebuilt to `dist` and confirmed live by CHECKSUM (the
 * obvious grep for the mutated source line is useless — `dist` is minified and
 * the identifiers are renamed, so the pattern is absent either way):
 *
 *   CAUGHT — dropping the dirty-flag clear in `Computed.recompute()`
 *     (`this.flags &= ~(STALE | MARKED | PENDING | CONFIRMED)`). Computeds then
 *     re-evaluate on every read. Gate exits 1 with cellx 16 -> 120,
 *     wide-fanout 100 -> 200, deep-propagation 100 -> 200, dynamic-deps 1 -> 2.
 *
 *   NOT CAUGHT — removing the stale-edge unlink from `pruneDeps()`. Every row
 *     is unchanged. These workloads re-read the same branches in steady state,
 *     so no stale edges accumulate and over-subscription never materializes as
 *     extra work.
 *
 * So: this gate covers **redundant recomputation** well, and **dependency
 * pruning not at all**. Closing the second gap needs a workload whose op
 * TOGGLES which branch it reads, so dropped pruning shows up as a rising
 * count. That workload does not exist here yet — it is the obvious next
 * addition, and until it lands nobody should read this gate as protecting
 * `pruneDeps`.
 *
 * Usage:
 *   bun bench/signals/src/counts.ts            # gate: exit 0 = equalities hold
 *   bun bench/signals/src/counts.ts --report   # print every competitor, gate nothing
 */
import { competitors } from './competitors/index.ts'
import type { SignalAdapter } from './types.ts'
import { workloads } from './workloads/index.ts'

const REPORT_ONLY = process.argv.includes('--report')

/** The library under gate. Others are measured for context only. */
const GATED = '@aihu/signals'

interface Counter {
  computedRuns: number
  effectRuns: number
}

/**
 * Decorate an adapter so every `computed` / `effect` body increments a
 * counter when it runs.
 *
 * Deliberately wraps the USER function rather than the library's returned
 * accessor: a lazy `computed` only evaluates its body on demand, and it is the
 * body running that constitutes a recomputation. Counting reads instead would
 * measure the workload's access pattern, not the graph's work.
 */
function counting(adapter: SignalAdapter, c: Counter): SignalAdapter {
  return {
    ...adapter,
    computed<T>(fn: () => T) {
      return adapter.computed(() => {
        c.computedRuns++
        return fn()
      })
    },
    effect(fn: () => void) {
      return adapter.effect(() => {
        c.effectRuns++
        fn()
      })
    },
  }
}

interface Measured {
  workload: string
  competitor: string
  /** computed-body runs attributable to ONE steady-state op */
  computedPerOp: number
  /** effect-body runs attributable to ONE steady-state op */
  effectPerOp: number
}

/**
 * Measure per-op recomputations in steady state.
 *
 * Graph CONSTRUCTION and the first settle also run bodies, and those are not
 * what we are pinning — they would make the number depend on setup rather than
 * on propagation. So: build, run a warmup op to settle, snapshot, then run
 * `OPS` ops and divide. Any residual laziness has been forced by the warmup.
 */
function measure(workloadName: string, adapter: SignalAdapter): Measured | null {
  const workload = workloads.find((w) => w.name === workloadName)
  if (!workload) return null
  const c: Counter = { computedRuns: 0, effectRuns: 0 }
  let instance: { run: () => void; cleanup: () => void }
  try {
    instance = workload.build(counting(adapter, c))
  } catch {
    return null // competitor cannot express this workload; not this gate's business
  }
  try {
    instance.run() // warmup: settle construction-time laziness
    const OPS = 10
    const beforeC = c.computedRuns
    const beforeE = c.effectRuns
    for (let i = 0; i < OPS; i++) instance.run()
    return {
      workload: workloadName,
      competitor: adapter.name,
      computedPerOp: (c.computedRuns - beforeC) / OPS,
      effectPerOp: (c.effectRuns - beforeE) / OPS,
    }
  } finally {
    instance.cleanup()
  }
}

/**
 * Pinned equalities — the gate.
 *
 * MEASURED, then pinned. Every constant here was read off a real run rather
 * than derived from what the graph "should" do; where a measured number
 * disagreed with the obvious arithmetic, the comment says why.
 *
 * Fractional values are legitimate: a workload whose op only sometimes
 * invalidates a node yields a non-integer average over OPS, and that average
 * is still exact and deterministic.
 */
interface Pin {
  workload: string
  computedPerOp: number
  effectPerOp: number
  why: string
}

const PINS: Pin[] = [
  {
    workload: 'cellx',
    computedPerOp: 16,
    effectPerOp: 1,
    why:
      '5-deep diamond. 16 computed evaluations settle one source write, and the terminal ' +
      'effect runs exactly once — one run per write is the glitch-freedom property: an ' +
      'observer must never see an intermediate state of the graph. All six libraries agree ' +
      'on 16/1, which is what makes this a property of the graph rather than of aihu.',
  },
  {
    workload: 'wide-fanout-100',
    computedPerOp: 100,
    effectPerOp: 100,
    why:
      '100 independent computeds over one source, each with its own effect. One write ' +
      'invalidates all 100, so 100/100 is the floor — there is no dedup to be had here, and ' +
      'anything BELOW it means a subscription was dropped.',
  },
  {
    workload: 'batched-writes-100',
    computedPerOp: 0,
    effectPerOp: 100,
    why:
      'No computeds in this shape by construction, hence 0. 100 writes land on 100 distinct ' +
      'effects, each running once — this pins that batching COALESCES rather than DROPS. A ' +
      'batch implementation that swallowed a write would show < 100 and would look like a ' +
      'speedup on the timing gate.',
  },
  {
    workload: 'deep-propagation-100',
    computedPerOp: 100,
    effectPerOp: 1,
    why:
      'A 100-link chain settles in exactly one pass: each link recomputes once, the terminal ' +
      'effect runs once. This is the anti-cascade pin. A propagation bug that re-walks the ' +
      'chain shows 200+, and depth-100 makes that unmissable.',
  },
  {
    workload: 'dynamic-deps',
    computedPerOp: 1,
    effectPerOp: 1,
    why:
      'The one row where the libraries genuinely disagree: aihu, preact, solid and s-js ' +
      'settle at 1/1 while alien-signals and @vue/reactivity recompute 6/6. Whatever ' +
      'produces that 6× gap is worth pinning. ' +
      'NOT, however, a pruneDeps regression detector — see "measured sensitivity" below. ' +
      'Removing the stale-edge unlink from pruneDeps leaves this row at 1/1, because this ' +
      "workload's steady state re-reads the same branch and never accumulates stale edges.",
  },
  {
    workload: 'creation-1to1000',
    computedPerOp: 1000,
    effectPerOp: 0,
    why:
      'Construction-shaped: 1000 computeds built and read once per op, no effects. Pins that ' +
      'creation stays lazy-once — a computed evaluated twice at construction would read 2000.',
  },
]

// ---------------------------------------------------------------------------

const measurements: Measured[] = []
for (const workload of workloads) {
  for (const adapter of competitors) {
    const m = measure(workload.name, adapter)
    if (m) measurements.push(m)
  }
}

const width = Math.max(...measurements.map((m) => m.workload.length), 12)
let lastWorkload = ''
console.log('\nRecomputations per op (computed-body runs / effect-body runs)\n')
for (const m of measurements) {
  if (m.workload !== lastWorkload) {
    console.log(`  ${m.workload}`)
    lastWorkload = m.workload
  }
  const gated = m.competitor === GATED ? ' <- gated' : ''
  console.log(
    `    ${m.competitor.padEnd(width + 8)} ${String(m.computedPerOp).padStart(8)} c  ${String(m.effectPerOp).padStart(6)} e${gated}`,
  )
}

if (REPORT_ONLY || PINS.length === 0) {
  if (PINS.length === 0) {
    console.log('\n(no pins configured yet — report only)\n')
  }
  process.exit(0)
}

console.log('\nGate\n')
let failed = false
for (const pin of PINS) {
  const m = measurements.find((x) => x.workload === pin.workload && x.competitor === GATED)
  if (!m) {
    console.error(`  FAIL ${pin.workload}: no measurement for ${GATED}`)
    failed = true
    continue
  }
  for (const [label, actual, expected] of [
    ['computed/op', m.computedPerOp, pin.computedPerOp],
    ['effect/op', m.effectPerOp, pin.effectPerOp],
  ] as const) {
    const ok = actual === expected
    if (!ok) failed = true
    console.log(
      `  ${ok ? 'OK  ' : 'FAIL'} ${pin.workload} ${label}: expected ${expected}, got ${actual}`,
    )
  }
}

if (failed) {
  console.error(
    '\n✗ A pinned recomputation count changed. This is an ALGORITHMIC change, not noise —\n' +
      '  these are exact integers with zero variance. A count that went DOWN is the dangerous\n' +
      '  direction: it usually means a binding died or a subscription was dropped, which a\n' +
      '  timing gate would have reported as a speedup.\n\n' +
      '  If the change is intended, edit the pin in bench/signals/src/counts.ts and say why.\n' +
      '  There is deliberately no [bench-bump] bypass.\n',
  )
  process.exit(1)
}
console.log('\n✔ all pinned recomputation counts hold\n')
