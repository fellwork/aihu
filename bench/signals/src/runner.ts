import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

import { measure } from 'mitata'

import { competitors } from './competitors/index.ts'
import type { SignalAdapter, WorkloadCell, WorkloadDefinition, WorkloadResult } from './types.ts'
import { workloads } from './workloads/index.ts'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const RESULTS_PATH = resolve(HERE, '..', 'RESULTS.md')
const ROOT = resolve(HERE, '..', '..', '..')
const BENCH_NM = resolve(HERE, '..', 'node_modules')

interface SizeRow {
  name: string
  raw: number
  gz: number
}

const sizeTargets: Array<{ name: string; path: string }> = [
  { name: '@scribe/signals', path: resolve(ROOT, 'packages/signals/dist/index.js') },
  { name: 'alien-signals', path: resolve(BENCH_NM, 'alien-signals/esm/index.mjs') },
  {
    name: '@preact/signals-core',
    path: resolve(BENCH_NM, '@preact/signals-core/dist/signals-core.mjs'),
  },
  {
    name: '@vue/reactivity',
    path: resolve(BENCH_NM, '@vue/reactivity/dist/reactivity.esm-browser.prod.js'),
  },
  { name: 'solid-js (reactive only)', path: resolve(BENCH_NM, 'solid-js/dist/solid.js') },
  { name: 's-js', path: resolve(BENCH_NM, 's-js/dist/es/S.js') },
]

function collectSizes(): SizeRow[] {
  const rows: SizeRow[] = []
  for (const t of sizeTargets) {
    try {
      statSync(t.path)
    } catch {
      continue
    }
    const buf = readFileSync(t.path)
    const gz = gzipSync(buf, { level: 9 })
    rows.push({ name: t.name, raw: buf.byteLength, gz: gz.byteLength })
  }
  return rows
}

const fmtBytes = (n: number): string => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(2)} KB`)

/**
 * Run one (workload, competitor) cell. Mitata's `measure()` returns p50/p99
 * directly; we convert avg/p50/p99 from ns into ops/sec via 1e9 / ns. Errors
 * (e.g. an adapter throwing during setup) are caught and reported per-cell so
 * one bad library doesn't kill the whole run.
 */
async function runCell(
  workload: WorkloadDefinition,
  adapter: SignalAdapter,
): Promise<WorkloadCell> {
  try {
    const ctx = workload.build(adapter)
    // Warm-up: 50 calls so V8 has time to inline-cache the hot paths.
    // Without this, the first samples are dominated by deopt churn.
    for (let i = 0; i < 50; i++) ctx.run()

    const stats = await measure(ctx.run, {
      // Bound CPU time so the whole run stays under ~2 minutes.
      // mitata's defaults adapt sample count to CPU time; we cap it.
      min_cpu_time: 1_000_000_000, // 1s per cell
      warmup_samples: 50,
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
  return ops.toFixed(0)
}

function renderResultsMarkdown(cells: WorkloadCell[]): string {
  const date = new Date().toISOString().slice(0, 10)
  const lines: string[] = []
  lines.push('# `@scribe/signals` Bench Results')
  lines.push('')
  lines.push(`**Generated:** ${date}`)
  lines.push(
    `**Runner:** mitata 1.0.34 · Bun ${process.versions.bun ?? 'n/a'} · Node ${process.versions.node}`,
  )
  lines.push('**Track:** A — vanilla scribe vs. SOTA JS reactivity libs')
  lines.push('')
  lines.push(
    'See `HARNESS.md` for how this is measured and how to add new workloads. ' +
      'See `CHANGELOG.md` for the historical record.',
  )
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

  // Stretch — gz size of each competitor's main shipped entry. NOT minified
  // (different libs ship different minification strategies); the relative
  // ordering is the user-facing signal.
  lines.push('## Bundle size (stretch)')
  lines.push('')
  lines.push(
    "Each competitor's main entry as shipped, gzipped at level 9. " +
      'Note: not minified — Vue and Solid ship dev/prod variants; we use ' +
      'the production ESM build where one exists. `@scribe/signals` is ' +
      'measured against `dist/index.js` (the same file size-limit gates).',
  )
  lines.push('')
  const sizes = collectSizes()
  if (sizes.length > 0) {
    lines.push('| Competitor | Raw | Gzipped |')
    lines.push('| --- | ---: | ---: |')
    for (const s of sizes) {
      lines.push(`| ${s.name} | ${fmtBytes(s.raw)} | ${fmtBytes(s.gz)} |`)
    }
  } else {
    lines.push('_size data unavailable — run `bun run --filter @scribe/signals build` first._')
  }
  lines.push('')

  // p50 machine-readable footer for the CI gate.
  lines.push('<!-- bench-data:start -->')
  lines.push('```json')
  lines.push(
    JSON.stringify(
      {
        date,
        cells: cells.map((c) => ({
          workload: c.workload,
          competitor: c.competitor,
          ...('error' in c.result
            ? { error: c.result.error }
            : {
                mean: c.result.mean,
                p50: c.result.p50,
                p99: c.result.p99,
                opsPerSec: c.result.opsPerSec,
              }),
        })),
      },
      null,
      2,
    ),
  )
  lines.push('```')
  lines.push('<!-- bench-data:end -->')
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
