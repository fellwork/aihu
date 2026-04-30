/**
 * Memory runner — Round N+1 / bench-design §2.
 *
 * Run with `bun --expose-gc src/memory.ts`. Without `--expose-gc` Bun does
 * not bind `globalThis.gc`, and we hard-fail at startup so the operator
 * doesn't waste a 30-second run on bogus numbers.
 *
 * Protocol (Phase A..E in design §2.2, diagram in Appendix A):
 *
 *   1. settle 3× gc, record `pre = process.memoryUsage().heapUsed`.
 *   2. record `peakBefore = v8.getHeapStatistics().peak_malloced_memory`.
 *   3. build N graphs (each is one `workload.build(adapter)` ctx).
 *   4. settle 3× gc, record `buildHeap = heapUsed`,
 *      `peakDuring = peak_malloced_memory`.
 *   5. cleanup() each graph, drop refs, settle 3× gc.
 *   6. record `after = heapUsed`.
 *
 * Output per (workload × competitor):
 *   - buildHeapDelta = (buildHeap - pre) / N        bytes per graph
 *   - peakMalloc     = peakDuring - peakBefore      bytes
 *   - disposeResidual = after - pre                  bytes (leak signal)
 *
 * Per-workload N override: most workloads run at N=1000. Workloads that
 * allocate many internal nodes per graph (e.g. a future `mount-10k-leaves`
 * for arbor) override via `workload.memoryN`. The protocol respects that.
 *
 * Output: writes `RESULTS.memory.json` next to RESULTS.md so `runner.ts`
 * can fold it into the markdown in a single write. Standalone runs also
 * print a human-readable per-cell summary to stdout.
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as v8 from 'node:v8'

import { competitors } from './competitors/index.ts'
import type { MemorySample, SignalAdapter, WorkloadDefinition } from './types.ts'
import { workloads } from './workloads/index.ts'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const OUT_PATH = resolve(HERE, '..', 'RESULTS.memory.json')

const N_DEFAULT = 1000

if (typeof globalThis.gc !== 'function') {
  console.error('memory bench requires `bun --expose-gc src/memory.ts`')
  console.error('without --expose-gc, globalThis.gc is undefined and the protocol is unsound.')
  process.exit(2)
}

const settle = (): void => {
  // Three passes is the convention used by lit/solid/v8 benchmarks. V8's
  // first call is sometimes incremental; the third guarantees full sweep
  // on the structures we allocate (small, mostly-old-gen tuple closures
  // and Subscriber graphs). bench-design §2.2 cites the same number.
  for (let i = 0; i < 3; i++) (globalThis.gc as () => void)()
}

interface CellRecord {
  workload: string
  competitor: string
  N: number
  memory: MemorySample | { error: string }
}

async function measureCell(
  workload: WorkloadDefinition,
  adapter: SignalAdapter,
  N: number,
): Promise<MemorySample | { error: string }> {
  try {
    settle()
    const before = process.memoryUsage().heapUsed
    const peakBefore = v8.getHeapStatistics().peak_malloced_memory

    const ctxs: Array<{ run: () => void; cleanup: () => void }> = []
    for (let i = 0; i < N; i++) ctxs.push(workload.build(adapter))

    settle()
    const buildHeap = process.memoryUsage().heapUsed
    const peakDuring = v8.getHeapStatistics().peak_malloced_memory

    for (const c of ctxs) c.cleanup()
    ctxs.length = 0

    settle()
    const after = process.memoryUsage().heapUsed

    return {
      buildHeapDelta: (buildHeap - before) / N,
      peakMalloc: peakDuring - peakBefore,
      disposeResidual: after - before,
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

const fmtBytes = (n: number): string => {
  if (!Number.isFinite(n)) return `${n}`
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  if (abs < 1024) return `${sign}${abs.toFixed(0)} B`
  if (abs < 1024 * 1024) return `${sign}${(abs / 1024).toFixed(2)} KB`
  return `${sign}${(abs / 1024 / 1024).toFixed(2)} MB`
}

async function main(): Promise<void> {
  console.log(
    `Memory: ${workloads.length} workloads × ${competitors.length} competitors (--expose-gc)\n`,
  )

  const cells: CellRecord[] = []
  for (const wl of workloads) {
    // Per-workload override per design §2.2; fall back to N_DEFAULT.
    const wlN = (wl as WorkloadDefinition & { memoryN?: number }).memoryN ?? N_DEFAULT
    for (const adapter of competitors) {
      process.stdout.write(`  ${wl.name} × ${adapter.name} (N=${wlN}) … `)
      const memory = await measureCell(wl, adapter, wlN)
      cells.push({ workload: wl.name, competitor: adapter.name, N: wlN, memory })
      if ('error' in memory) {
        console.log(`ERROR: ${memory.error}`)
      } else {
        console.log(
          `build/graph=${fmtBytes(memory.buildHeapDelta)} · peak=${fmtBytes(memory.peakMalloc)} · residual=${fmtBytes(memory.disposeResidual)}`,
        )
      }
    }
  }

  writeFileSync(
    OUT_PATH,
    JSON.stringify(
      {
        date: new Date().toISOString().slice(0, 10),
        protocol: 'expose-gc-v1',
        cells,
      },
      null,
      2,
    ),
    'utf8',
  )
  console.log(`\nWrote ${OUT_PATH}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
