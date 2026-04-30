/**
 * Memory runner for `bench/arbor` — Round N+1 design §2.
 *
 * Run with: `bun --expose-gc bench/arbor/src/memory.ts`
 * Writes:   `bench/arbor/RESULTS.memory.md`
 *
 * Protocol per workload × competitor:
 *
 *   1. Settle 3× GC, record pre-heap (process.memoryUsage().heapUsed)
 *   2. Build N workload contexts (call workload.build(adapter) N times).
 *      N = workload.n ?? 10
 *   3. Settle 3× GC, record buildHeap
 *   4. cleanup() each context (drops host + adapter state)
 *   5. Settle 3× GC, record afterHeap
 *
 * Metrics:
 *   - buildHeapDelta = (buildHeap - pre) / N  (per-context allocation overhead)
 *   - disposeResidual = afterHeap - pre        (leak signal: ideally ~0)
 *
 * NOTE: For mount workloads (mount-10k-leaves, mount-deep-100x10, mount-wide-1000),
 * build() sets up the adapter context but does NOT run mount(). The measured
 * memory is "adapter setup overhead". For update-1-of-10k-leaves, build() DOES
 * mount (the tree stays live), so buildHeapDelta reflects "live 10k-leaf tree
 * heap cost". This distinction is documented in HARNESS.md.
 *
 * N overrides (from workload.n):
 *   mount-10k-leaves      → 5
 *   mount-deep-100x10     → 5
 *   mount-wide-1000       → 20
 *   update-1-of-10k-leaves → 1
 *   attr-thrash-100x100   → 5
 *   krausest-1k-cycle     → 10
 */

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import './jsdom-host.ts'
import { competitors } from './competitors/index.ts'
import type { WorkloadCell } from './types.ts'
import { workloads } from './workloads/index.ts'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const OUT_PATH = resolve(HERE, '..', 'RESULTS.memory.md')

// biome-ignore lint/suspicious/noExplicitAny: GC is a Bun/V8 low-level API
const gc: () => void = (globalThis as any).gc

function settle(times = 3): void {
  if (typeof gc === 'function') {
    for (let i = 0; i < times; i++) gc()
  }
}

function heapUsed(): number {
  return process.memoryUsage().heapUsed
}

interface MemoryResult {
  buildHeapDelta: number
  disposeResidual: number
  n: number
}

interface MemoryCell {
  workload: string
  competitor: string
  result: MemoryResult | { error: string }
}

const fmtBytes = (n: number): string => {
  if (Math.abs(n) < 1024) return `${n.toFixed(0)} B`
  if (Math.abs(n) < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

async function measureCell(
  workloadName: string,
  competitorName: string,
  n: number,
): Promise<MemoryCell> {
  const workload = workloads.find((w) => w.name === workloadName)!
  const adapter = competitors.find((c) => c.name === competitorName)!

  try {
    settle()
    const pre = heapUsed()

    const contexts: Array<{ run: () => void; cleanup: () => void }> = []
    for (let i = 0; i < n; i++) {
      contexts.push(workload.build(adapter))
    }

    settle()
    const buildHeap = heapUsed()

    for (const ctx of contexts) ctx.cleanup()
    contexts.length = 0

    settle()
    const afterHeap = heapUsed()

    return {
      workload: workloadName,
      competitor: competitorName,
      result: {
        buildHeapDelta: (buildHeap - pre) / n,
        disposeResidual: afterHeap - pre,
        n,
      },
    }
  } catch (err) {
    return {
      workload: workloadName,
      competitor: competitorName,
      result: { error: err instanceof Error ? err.message : String(err) },
    }
  }
}

function renderMemoryMarkdown(cells: MemoryCell[]): string {
  const date = new Date().toISOString().slice(0, 10)
  const lines: string[] = []
  lines.push('# `@scribe/arbor` Memory Results')
  lines.push('')
  lines.push(`**Generated:** ${date}`)
  lines.push(`**Runner:** --expose-gc · Bun ${process.versions.bun ?? 'n/a'}`)
  lines.push(
    '**Note:** buildHeapDelta = heap growth per context build. disposeResidual = residual after cleanup.',
  )
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push(
    '> Memory numbers are indicative only under Bun/V8. GC timing variance can affect',
  )
  lines.push(
    '> residuals significantly. Focus on buildHeapDelta orders of magnitude, not exact bytes.',
  )
  lines.push('')

  for (const wl of workloads) {
    const n = wl.n ?? 10
    lines.push(`## Workload: \`${wl.name}\` (N=${n})`)
    lines.push('')
    lines.push(`*${wl.description}*`)
    lines.push('')
    lines.push('| Competitor | buildHeapDelta/ctx | disposeResidual | n |')
    lines.push('| --- | ---: | ---: | ---: |')

    for (const adapter of competitors) {
      const cell = cells.find(
        (c) => c.workload === wl.name && c.competitor === adapter.name,
      )
      if (!cell) {
        lines.push(`| ${adapter.name} | — | — | — |`)
        continue
      }
      if ('error' in cell.result) {
        lines.push(`| ${adapter.name} | ERROR | \`${cell.result.error.slice(0, 60)}\` | — |`)
        continue
      }
      const r = cell.result
      lines.push(
        `| ${adapter.name} | ${fmtBytes(r.buildHeapDelta)} | ${fmtBytes(r.disposeResidual)} | ${r.n} |`,
      )
    }
    lines.push('')
  }

  return lines.join('\n')
}

async function main(): Promise<void> {
  if (typeof gc !== 'function') {
    console.warn(
      'WARNING: gc() not available. Run with --expose-gc for accurate memory measurements.',
    )
  }

  const cells: MemoryCell[] = []

  for (const wl of workloads) {
    const n = wl.n ?? 10
    for (const adapter of competitors) {
      process.stdout.write(`  memory: ${wl.name} × ${adapter.name} (N=${n}) … `)
      const cell = await measureCell(wl.name, adapter.name, n)
      cells.push(cell)
      if ('error' in cell.result) {
        console.log(`ERROR: ${cell.result.error.slice(0, 80)}`)
      } else {
        const r = cell.result
        console.log(
          `buildDelta=${fmtBytes(r.buildHeapDelta)}/ctx  residual=${fmtBytes(r.disposeResidual)}`,
        )
      }
    }
  }

  const md = renderMemoryMarkdown(cells)
  writeFileSync(OUT_PATH, md, 'utf8')
  console.log(`\nWrote ${OUT_PATH}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
