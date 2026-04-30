import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

import { measure } from 'mitata'

import { competitors } from './competitors/index.ts'
import type {
  MemorySample,
  SignalAdapter,
  WorkloadCell,
  WorkloadDefinition,
  WorkloadResult,
} from './types.ts'
import { workloads } from './workloads/index.ts'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const RESULTS_PATH = resolve(HERE, '..', 'RESULTS.md')
const MEMORY_PATH = resolve(HERE, '..', 'RESULTS.memory.json')
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

const fmtMemBytes = (n: number): string => {
  if (!Number.isFinite(n)) return `${n}`
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  if (abs < 1024) return `${sign}${abs.toFixed(0)} B`
  if (abs < 1024 * 1024) return `${sign}${(abs / 1024).toFixed(2)} KB`
  return `${sign}${(abs / 1024 / 1024).toFixed(2)} MB`
}

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

interface MemoryCellRecord {
  workload: string
  competitor: string
  N: number
  memory: MemorySample | { error: string }
}

interface MemoryPayload {
  date: string
  protocol: string
  cells: MemoryCellRecord[]
}

function loadMemoryPayload(): MemoryPayload | null {
  if (!existsSync(MEMORY_PATH)) return null
  try {
    return JSON.parse(readFileSync(MEMORY_PATH, 'utf8')) as MemoryPayload
  } catch {
    return null
  }
}

function findMemoryCell(
  payload: MemoryPayload | null,
  workload: string,
  competitor: string,
): MemorySample | { error: string } | null {
  if (!payload) return null
  const c = payload.cells.find((c) => c.workload === workload && c.competitor === competitor)
  return c ? c.memory : null
}

function renderResultsMarkdown(cells: WorkloadCell[], memory: MemoryPayload | null): string {
  const date = new Date().toISOString().slice(0, 10)
  const lines: string[] = []
  lines.push('# `@scribe/signals` Bench Results')
  lines.push('')
  lines.push(`**Generated:** ${date}`)
  lines.push(
    `**Runner:** mitata 1.0.34 + memory.ts (--expose-gc) · Bun ${process.versions.bun ?? 'n/a'} · Node ${process.versions.node}`,
  )
  lines.push('**Track:** A — vanilla scribe vs. SOTA JS reactivity libs')
  lines.push('')
  lines.push(
    'See `HARNESS.md` for how this is measured and how to add new workloads. ' +
      'See `CHANGELOG.md` for the historical record.',
  )
  lines.push('')

  // ---- Per-workload sections: time + memory tables ----
  for (const wl of workloads) {
    lines.push(`## Workload: \`${wl.name}\``)
    lines.push('')
    lines.push(`*${wl.description}*`)
    lines.push('')
    lines.push('### Time')
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

    lines.push('### Memory')
    lines.push('')
    lines.push('| Competitor | build/graph | peak-malloc | dispose-residual |')
    lines.push('| --- | ---: | ---: | ---: |')
    for (const adapter of competitors) {
      const m = findMemoryCell(memory, wl.name, adapter.name)
      if (!m) {
        lines.push(`| ${adapter.name} | — | — | — |`)
        continue
      }
      if ('error' in m) {
        lines.push(`| ${adapter.name} | ERROR | ERROR | \`${m.error}\` |`)
        continue
      }
      lines.push(
        `| ${adapter.name} | ${fmtMemBytes(m.buildHeapDelta)} | ${fmtMemBytes(m.peakMalloc)} | ${fmtMemBytes(m.disposeResidual)} |`,
      )
    }
    lines.push('')
  }

  // ---- Per-competitor-axis honesty section (design §5.2) ----
  lines.push('## Per-competitor-axis honesty')
  lines.push('')
  lines.push(
    'The competitors in this matrix emphasise different axes in their own READMEs. ' +
      'This section answers: do we beat each competitor on the bench they hold *themselves* to?',
  )
  lines.push('')

  lines.push('### vs. alien-signals')
  lines.push('')
  lines.push(
    "*alien-signals' canonical bench is `transitive-bullshit/js-reactivity-benchmark` (cellx, mol, kairo, s-bench).*",
  )
  lines.push('')
  lines.push('- `cellx` (diamond): see Time table above — scribe is the head-to-head measurement.')
  lines.push(
    "- `mol-bench` (deep-propagation-100, NEW): scribe is measured on alien-signals' deep-chain headline axis.",
  )
  lines.push(
    '- `kairo-bench` (dynamic-deps, NEW): subscription-churn axis. Forward-subscription models (alien, scribe) historically lead this; we now have receipts.',
  )
  lines.push(
    "- `s-bench 1to1000` (creation-1to1000, NEW): allocation/wiring throughput. See Time + Memory tables; scribe's per-graph cost is the load-bearing memory number.",
  )
  lines.push('')

  lines.push('### vs. @vue/reactivity')
  lines.push('')
  lines.push(
    "*Vue's `__benchmarks__` emphasise `effect.bench`, `computed.bench`, `reactiveObject.bench`.*",
  )
  lines.push('')
  lines.push('- `effect.bench` ≈ our `wide-fanout-100`: see Time table.')
  lines.push('- `computed.bench` ≈ our `cellx`: see Time table.')
  lines.push(
    "- `reactiveObject.bench`: **NOT MEASURED** — proxy-reactivity is a fundamentally different model from scribe's tuple signals. " +
      'Intentional gap; scribe does not aim to compete on object-property thrash. Documented per design §1.3.',
  )
  lines.push('')

  lines.push('### vs. @preact/signals-core')
  lines.push('')
  lines.push(
    '*Preact ships no dedicated bench dir; the implicit axis is throughput on small graphs + bundle size.*',
  )
  lines.push('')
  lines.push('- All 6 workloads + bundle size table cover the implicit Preact axes head-to-head.')
  lines.push('')

  lines.push('### vs. solid-js')
  lines.push('')
  lines.push(
    "*Solid's `bench.cjs` measures creation/update across `1to1`, `1to4`, `1to1000`, `2to1`, `4to1`, `1000to1` shapes (krausest is the DOM-binding axis, separate.).*",
  )
  lines.push('')
  lines.push('- `1to1` ≈ our `cellx` chain: see Time table.')
  lines.push("- `1to1000` ≈ our `creation-1to1000` (NEW): exact match on Solid's headline shape.")
  lines.push(
    '- `4to1` / `1000to1` (fan-in): **NOT MEASURED** — fan-in shapes deferred to v1+ (design §B mapping).',
  )
  lines.push(
    "- Note: Solid's `bench.cjs` is the *signals-layer* bench; the DOM/krausest axis is `bench/arbor/`'s domain (Track A).",
  )
  lines.push('')

  lines.push('### vs. s-js')
  lines.push('')
  lines.push("*s-js' canonical bench is `cellx`.*")
  lines.push('')
  lines.push("- `cellx`: see Time table — exact match on s-js' published axis.")
  lines.push('')

  // ---- Bundle size ----
  lines.push('## Bundle size (gz)')
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

  // ---- Machine-readable JSON footer (gate consumption) ----
  lines.push('<!-- bench-data:start -->')
  lines.push('```json')
  lines.push(
    JSON.stringify(
      {
        date,
        cells: cells.map((c) => {
          const mem = findMemoryCell(memory, c.workload, c.competitor)
          const memOut =
            mem && !('error' in mem)
              ? {
                  buildHeapDelta: mem.buildHeapDelta,
                  peakMalloc: mem.peakMalloc,
                  disposeResidual: mem.disposeResidual,
                }
              : undefined
          return {
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
            ...(memOut ? { memory: memOut } : {}),
          }
        }),
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

  // Pick up the latest memory results if they exist. They're produced by
  // a separate `bun --expose-gc src/memory.ts` pass — the runner doesn't
  // try to fork a child process here; that adds CI complexity for no
  // benefit when both passes can be wired in moon.yml. If RESULTS.memory.json
  // is absent or stale, the markdown shows "—" in memory cells and the
  // gate falls through (no previous-baseline path).
  const memory = loadMemoryPayload()
  if (!memory) {
    console.warn(
      '\nNo RESULTS.memory.json found — run `bun --expose-gc src/memory.ts` first for memory tables.',
    )
  }

  const md = renderResultsMarkdown(cells, memory)
  writeFileSync(RESULTS_PATH, md, 'utf8')
  console.log(`\nWrote ${RESULTS_PATH}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
