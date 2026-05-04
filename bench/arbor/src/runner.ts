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
 *     (microseconds → milliseconds); the per-cell CPU budget stays at 1 s
 *     so the wall-clock fits the gate timeline.
 *
 * Run with: `bun bench/arbor/src/runner.ts`
 * Writes:   `bench/arbor/RESULTS.md`
 */

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { measure } from 'mitata'

// Side-effect import: installs window/document on globalThis before any
// competitor module loads.
import './jsdom-host.ts'

import { competitors } from './competitors/index.ts'
import type { DomAdapter, WorkloadCell, WorkloadDefinition, WorkloadResult } from './types.ts'
import { workloads } from './workloads/index.ts'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const RESULTS_PATH = resolve(HERE, '..', 'RESULTS.md')

/**
 * Run one (workload, competitor) cell. Mitata's `measure()` returns p50/p99
 * directly; we convert avg/p50/p99 from ns into ops/sec via 1e9 / ns. Errors
 * (e.g. an adapter throwing during setup) are caught and reported per-cell so
 * one bad library doesn't kill the whole run.
 */
async function runCell(workload: WorkloadDefinition, adapter: DomAdapter): Promise<WorkloadCell> {
  try {
    const ctx = workload.build(adapter)
    // Warm-up: the per-op work (10k-leaf mount + dispose) is heavy enough that
    // 5 calls is sufficient to stabilize hidden classes and inline caches.
    // mitata's `warmup_samples: 5` re-confirms during the timed run.
    for (let i = 0; i < 5; i++) ctx.run()

    const stats = await measure(ctx.run, {
      // 1 s CPU budget per cell. mount-10k-leaves runs at ~50-200 ms/op in
      // JSDOM, so we get 5-20 samples per cell — enough for p50 stability.
      // Lighter workloads (spawn 2's update-1-of-10k) get hundreds of samples.
      min_cpu_time: 1_000_000_000,
      warmup_samples: 5,
    })

    ctx.cleanup()

    const result: WorkloadResult = {
      mean: stats.avg,
      p50: stats.p50,
      p99: stats.p99,
      opsPerSec: 1e9 / stats.avg,
    }
    return { workload: workload.name, competitor: adapter.name, result }
  } catch (err) {
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

function renderResultsMarkdown(cells: WorkloadCell[]): string {
  const date = new Date().toISOString().slice(0, 10)
  const jsdomVersion = (() => {
    try {
      // biome-ignore lint/suspicious/noExplicitAny: version introspection
      return (require('jsdom/package.json') as any).version as string
    } catch {
      return '25.x'
    }
  })()
  const lines: string[] = []
  lines.push('# `@scribe/arbor` Bench Results')
  lines.push('')
  lines.push(`**Generated:** ${date}`)
  lines.push(
    `**Runner:** mitata 1.0.34 · Bun ${process.versions.bun ?? 'n/a'} · JSDOM ${jsdomVersion}`,
  )
  lines.push('**Track:** A — @scribe/arbor vs. SOTA DOM-binding libs (Round N+1)')
  lines.push('**Note:** All runs in JSDOM under Bun. See HARNESS.md for methodology.')
  lines.push('')
  lines.push('---')
  lines.push('')

  for (const wl of workloads) {
    lines.push(`## Workload: \`${wl.name}\``)
    lines.push('')
    lines.push(`*${wl.description}*`)
    lines.push('')
    lines.push('| Competitor | mean | p50 | p99 | ops/s |')
    lines.push('| --- | ---: | ---: | ---: | ---: |')
    for (const adapter of competitors) {
      const cell = cells.find((c) => c.workload === wl.name && c.competitor === adapter.name)
      if (!cell) {
        lines.push(`| ${adapter.name} | — | — | — | — |`)
        continue
      }
      if ('error' in cell.result) {
        lines.push(`| ${adapter.name} | ERROR | ERROR | ERROR | \`${cell.result.error}\` |`)
        continue
      }
      const r = cell.result
      lines.push(
        `| ${adapter.name} | ${fmtNs(r.mean)} | ${fmtNs(r.p50)} | ${fmtNs(r.p99)} | ${fmtOps(r.opsPerSec)} |`,
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
      'This section answers: "how does @scribe/arbor perform on the axis\n' +
      'each competitor holds itself to?"',
  )
  lines.push('')

  const scribeCells = cells.filter((c) => c.competitor === '@scribe/arbor')

  const axisCell = (workloadName: string): string => {
    const c = scribeCells.find((x) => x.workload === workloadName)
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

  // Machine-readable JSON footer for the regression gate (gate.ts reads this block).
  // Only p50 and opsPerSec go here — the gate compares p50 only.
  const jsonCells = cells.map((c) => ({
    workload: c.workload,
    competitor: c.competitor,
    ...('error' in c.result
      ? { error: true, p50: null }
      : {
          p50: c.result.p50,
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
  console.log(`Running ${workloads.length} workloads × ${competitors.length} competitors\n`)
  const cells: WorkloadCell[] = []
  for (const wl of workloads) {
    for (const adapter of competitors) {
      process.stdout.write(`  ${wl.name} × ${adapter.name} … `)
      const cell = await runCell(wl, adapter)
      cells.push(cell)
      if ('error' in cell.result) {
        console.log(`ERROR: ${cell.result.error}`)
      } else {
        console.log(`${fmtNs(cell.result.p50)} p50 · ${fmtOps(cell.result.opsPerSec)} ops/s`)
      }
    }
  }

  const md = renderResultsMarkdown(cells)
  writeFileSync(RESULTS_PATH, md, 'utf8')
  console.log(`\nWrote ${RESULTS_PATH}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
