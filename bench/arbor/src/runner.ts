// [bench-bump] baseline re-measured on current CI runner — see chore/refresh-bench-baseline
/**
 * Time runner for `bench/arbor` per Round N+1 design §3, §5.3, §6.1.
 *
 * Mirrors `bench/signals/src/runner.ts` exactly in shape — same mitata API,
 * same warmup, same per-cell CPU budget, same JSON footer for the regression
 * gate. Differences from the signals runner:
 *
 *   - Imports `jsdom-host.ts` for its side effects (window/document globals)
 *     before any competitor adapter loads. Adapters that resolve `document`
 *     at module-load time (lit, preact) will be safe.
 *   - The "op" is mount+dispose (or update-N, or three-phase krausest) rather
 *     than a single signal write. Per-op costs are correspondingly larger
 *     (microseconds → milliseconds); the per-cell CPU budget is 2 s (R2 —
 *     the old 1 s budget yielded ~10-12 samples on the heavy workloads).
 *   - R0: every cell passes a mandatory DOM-liveness probe before timing
 *     (measure-live.ts / liveness.ts). A cell whose op does not mutate the
 *     DOM aborts the whole run — it is never reported as a number.
 *
 * Run with: `bun bench/arbor/src/runner.ts`
 * Writes:   `bench/arbor/RESULTS.md`
 * Filters:  BENCH_ONLY_WORKLOAD / BENCH_ONLY_COMPETITOR select a single cell
 *           (RESULTS.md is then NOT written; BENCH_OUT=<path> overrides).
 */

import { writeFileSync } from 'node:fs'
import { loadavg } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Side-effect import: installs window/document on globalThis before any
// competitor module loads.
import './jsdom-host.ts'

import { competitors } from './competitors/index.ts'
import { LivenessError } from './liveness.ts'
import { measureLive } from './measure-live.ts'
import type { DomAdapter, WorkloadCell, WorkloadDefinition, WorkloadResult } from './types.ts'
import { workloads } from './workloads/index.ts'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const RESULTS_PATH = resolve(HERE, '..', 'RESULTS.md')

// Single-cell reproduction filters (used throughout the 2026-07 bisect and
// truth investigations — see docs/plans/2026-07-26-arbor-perf-truth.md §6).
// When either filter is set, RESULTS.md is NOT written (a partial matrix must
// never overwrite the full one); set BENCH_OUT=<path> to write elsewhere.
const ONLY_WORKLOAD = process.env.BENCH_ONLY_WORKLOAD
const ONLY_COMPETITOR = process.env.BENCH_ONLY_COMPETITOR
const OUT_OVERRIDE = process.env.BENCH_OUT

/**
 * Run one (workload, competitor) cell through the R0 choke point
 * (`measureLive`): 5 warmup ops, a mandatory DOM-liveness probe, then the
 * timed region. Setup errors (e.g. an adapter throwing during mount) are
 * caught and reported per-cell so one bad library doesn't kill the whole run
 * — but a `LivenessError` is deliberately rethrown and aborts the entire
 * process: an ERROR cell is honest, a fast number for a dead binding is not.
 */
async function runCell(workload: WorkloadDefinition, adapter: DomAdapter): Promise<WorkloadCell> {
  try {
    const ctx = workload.build(adapter)
    const stats = await measureLive(workload, adapter.name, ctx.run)
    ctx.cleanup()

    const result: WorkloadResult = {
      mean: stats.avg,
      min: stats.min,
      p50: stats.p50,
      p99: stats.p99,
      opsPerSec: 1e9 / stats.avg,
    }
    return { workload: workload.name, competitor: adapter.name, result }
  } catch (err) {
    // R0: never demote a liveness failure to an ERROR cell — hard-fail the run.
    if (err instanceof LivenessError) throw err
    return {
      workload: workload.name,
      competitor: adapter.name,
      result: { error: err instanceof Error ? err.message : String(err) },
    }
  }
}

const fmtNs = (ns: number): string => {
  if (ns < 1_000) return `${ns.toFixed(2)} ns`
  if (ns < 1_000_000) return `${(ns / 1_000).toFixed(2)} µs`
  if (ns < 1_000_000_000) return `${(ns / 1_000_000).toFixed(2)} ms`
  return `${(ns / 1_000_000_000).toFixed(2)} s`
}

const fmtOps = (ops: number): string => {
  if (ops >= 1_000_000) return `${(ops / 1_000_000).toFixed(2)}M`
  if (ops >= 1_000) return `${(ops / 1_000).toFixed(2)}K`
  return ops.toFixed(2)
}

function renderResultsMarkdown(
  cells: WorkloadCell[],
  loadStart: number[],
  loadEnd: number[],
): string {
  const date = new Date().toISOString().slice(0, 10)
  const jsdomVersion = (() => {
    try {
      return (require('jsdom/package.json') as any).version as string
    } catch {
      return '25.x'
    }
  })()
  const fmtLoad = (l: number[]): string => l.map((x) => x.toFixed(2)).join(' ')
  const lines: string[] = []
  lines.push('# `@aihu/arbor` Bench Results')
  lines.push('')
  lines.push(`**Generated:** ${date}`)
  lines.push(
    `**Runner:** mitata 1.0.34 · Bun ${process.versions.bun ?? 'n/a'} · JSDOM ${jsdomVersion}`,
  )
  lines.push('**Track:** A — @aihu/arbor vs. SOTA DOM-binding libs (Round N+1)')
  // Conditions block (truth doc rule: no number without its conditions).
  lines.push(
    '**Measured artifact:** workspace *source* via tsconfig paths (`packages/*/src`) — ' +
      'NOT the shipped `dist` (see HARNESS.md "Measured artifact (R6)")',
  )
  lines.push(`**NODE_ENV:** ${process.env.NODE_ENV ?? '(unset — signals run with __DEV__ true)'}`)
  lines.push(`**Load average (start → end):** ${fmtLoad(loadStart)} → ${fmtLoad(loadEnd)}`)
  lines.push(`**R0:** every non-ERROR cell below passed the DOM-liveness probe (see HARNESS.md)`)
  lines.push('**Note:** All runs in JSDOM under Bun. See HARNESS.md for methodology.')
  lines.push('')
  lines.push('---')
  lines.push('')

  for (const wl of workloads) {
    lines.push(`## Workload: \`${wl.name}\``)
    lines.push('')
    lines.push(`*${wl.description}*`)
    lines.push('')
    lines.push('| Competitor | mean | min | p50 | p99 | ops/s |')
    lines.push('| --- | ---: | ---: | ---: | ---: | ---: |')
    for (const adapter of competitors) {
      const cell = cells.find((c) => c.workload === wl.name && c.competitor === adapter.name)
      if (!cell) {
        lines.push(`| ${adapter.name} | — | — | — | — | — |`)
        continue
      }
      if ('error' in cell.result) {
        lines.push(`| ${adapter.name} | ERROR | ERROR | ERROR | ERROR | \`${cell.result.error}\` |`)
        continue
      }
      const r = cell.result
      lines.push(
        `| ${adapter.name} | ${fmtNs(r.mean)} | ${fmtNs(r.min)} | ${fmtNs(r.p50)} | ${fmtNs(r.p99)} | ${fmtOps(r.opsPerSec)} |`,
      )
    }
    lines.push('')
  }

  // Per-competitor-axis honesty section (design §5.3).
  lines.push('---')
  lines.push('')
  lines.push('## Per-competitor-axis honesty')
  lines.push('')
  lines.push(
    'The competitors in this matrix each have a primary bench axis.\n' +
      'This section answers: "how does @aihu/arbor perform on the axis\n' +
      'each competitor holds itself to?"',
  )
  lines.push('')

  const aihuCells = cells.filter((c) => c.competitor === '@aihu/arbor')

  const axisCell = (workloadName: string): string => {
    const c = aihuCells.find((x) => x.workload === workloadName)
    if (!c) return '— (not run)'
    if ('error' in c.result) return `ERROR: ${c.result.error}`
    return `p50 = ${fmtNs(c.result.p50)}, ${fmtOps(c.result.opsPerSec)} ops/s`
  }

  lines.push('### vs. lit-html')
  lines.push('*lit-html benchmarks focus on render-update-clear on row tables (krausest).*')
  lines.push(`- \`krausest-1k-cycle\`: ${axisCell('krausest-1k-cycle')}`)
  lines.push('')
  lines.push('### vs. solid-js')
  lines.push("*Solid's headline claim is granular reactive updates without diffing.*")
  lines.push(`- \`update-1-of-10k-leaves\`: ${axisCell('update-1-of-10k-leaves')}`)
  lines.push('')
  lines.push('### vs. @vue/runtime-dom')
  lines.push("*Vue's perf claim is patch flags reducing reactive diffs.*")
  lines.push(`- \`attr-thrash-100x100\`: ${axisCell('attr-thrash-100x100')}`)
  lines.push(`- \`update-1-of-10k-leaves\`: ${axisCell('update-1-of-10k-leaves')}`)
  lines.push('')
  lines.push('### vs. preact')
  lines.push("*Preact's claim is minimal VDOM runtime cost.*")
  lines.push(`- \`krausest-1k-cycle\`: ${axisCell('krausest-1k-cycle')}`)
  lines.push('')
  lines.push('### vs. vanilla DOM')
  lines.push(
    '*Vanilla is the floor. If we are more than 2-3x slower than vanilla on update, investigate.*',
  )
  lines.push(`- \`update-1-of-10k-leaves\`: ${axisCell('update-1-of-10k-leaves')}`)
  lines.push('')
  lines.push('---')
  lines.push('')

  // Machine-readable JSON footer for the regression gate (gate.ts reads this
  // block). `min` is emitted alongside p50 (R2: min is the right statistic
  // under one-sided noise); the gate keeps comparing p50-vs-p50 until R1
  // replaces the checked-in-baseline mechanism, because the committed
  // baseline has no `min` and switching statistics now would void every row
  // ("NEW — no previous baseline") and silently green the gate.
  const jsonCells = cells.map((c) => ({
    workload: c.workload,
    competitor: c.competitor,
    ...('error' in c.result
      ? { error: true, p50: null }
      : {
          p50: c.result.p50,
          min: c.result.min,
          opsPerSec: c.result.opsPerSec,
        }),
  }))

  lines.push('<!-- bench-data:start')
  lines.push(JSON.stringify({ date, cells: jsonCells }, null, 2))
  lines.push('bench-data:end -->')
  lines.push('')

  return lines.join('\n')
}

async function main(): Promise<void> {
  const selectedWorkloads = workloads.filter((w) => !ONLY_WORKLOAD || w.name === ONLY_WORKLOAD)
  const selectedCompetitors = competitors.filter(
    (c) => !ONLY_COMPETITOR || c.name === ONLY_COMPETITOR,
  )
  if (selectedWorkloads.length === 0 || selectedCompetitors.length === 0) {
    throw new Error(
      `No cells match filters (BENCH_ONLY_WORKLOAD=${ONLY_WORKLOAD ?? ''}, ` +
        `BENCH_ONLY_COMPETITOR=${ONLY_COMPETITOR ?? ''})`,
    )
  }

  const loadStart = loadavg()
  console.log(
    `Running ${selectedWorkloads.length} workloads × ${selectedCompetitors.length} competitors` +
      ` · NODE_ENV=${process.env.NODE_ENV ?? '(unset)'}` +
      ` · load ${loadStart.map((x) => x.toFixed(2)).join(' ')}\n`,
  )
  const cells: WorkloadCell[] = []
  for (const wl of selectedWorkloads) {
    for (const adapter of selectedCompetitors) {
      process.stdout.write(`  ${wl.name} × ${adapter.name} … `)
      const cell = await runCell(wl, adapter)
      cells.push(cell)
      if ('error' in cell.result) {
        console.log(`ERROR: ${cell.result.error}`)
      } else {
        console.log(
          `${fmtNs(cell.result.p50)} p50 · ${fmtNs(cell.result.min)} min · ${fmtOps(cell.result.opsPerSec)} ops/s`,
        )
      }
    }
  }
  const loadEnd = loadavg()
  console.log(`\nLoad average end: ${loadEnd.map((x) => x.toFixed(2)).join(' ')}`)

  const filtered = Boolean(ONLY_WORKLOAD || ONLY_COMPETITOR)
  const md = renderResultsMarkdown(cells, loadStart, loadEnd)
  if (filtered && !OUT_OVERRIDE) {
    // A partial matrix must never overwrite the full RESULTS.md — and per the
    // standing STOP (truth doc §3.4), the committed baseline must not be
    // regenerated at all until R1 lands. Use BENCH_OUT=<path> to capture.
    console.log('\nFiltered run — RESULTS.md NOT written. Set BENCH_OUT=<path> to capture output.')
    return
  }
  const outPath = OUT_OVERRIDE ? resolve(OUT_OVERRIDE) : RESULTS_PATH
  writeFileSync(outPath, md, 'utf8')
  console.log(`\nWrote ${outPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
