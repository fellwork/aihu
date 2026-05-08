/**
 * Multi-run validation runner for `bench/arbor`.
 *
 * Runs every workload N times for `@aihu/arbor` only, then reports min/median/max
 * across runs. Mitata's per-cell p50 reflects within-run sample variance; the
 * across-run variance captured here reflects JIT warm-up state, GC pressure,
 * and OS scheduling jitter that a single `runner.ts` invocation can't see.
 *
 * Output is plain text to stdout. Pipe to a file for diffing pre vs post.
 *
 * Usage: `bun bench/arbor/src/repeat.ts [N=5]`
 */

import { measure } from 'mitata'

import './jsdom-host.ts'

import { aihu } from './competitors/aihu.ts'
import type { WorkloadDefinition } from './types.ts'
import { workloads } from './workloads/index.ts'

const N = Number(process.argv[2] ?? 5)

interface Sample {
  p50: number
  opsPerSec: number
}

async function runOnce(workload: WorkloadDefinition): Promise<Sample> {
  const ctx = workload.build(aihu)
  for (let i = 0; i < 5; i++) ctx.run()
  const stats = await measure(ctx.run, {
    min_cpu_time: 1_000_000_000,
    warmup_samples: 5,
  })
  ctx.cleanup()
  return { p50: stats.p50, opsPerSec: 1e9 / stats.avg }
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

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

async function main(): Promise<void> {
  const head = process.argv[3] ?? 'unlabeled'
  console.log(`# arbor repeat (N=${N}) — ${head}`)
  console.log(``)
  console.log(`| Workload | min p50 | median p50 | max p50 | spread% | median ops/s |`)
  console.log(`| --- | ---: | ---: | ---: | ---: | ---: |`)
  for (const wl of workloads) {
    process.stderr.write(`  ${wl.name} … `)
    const samples: Sample[] = []
    for (let i = 0; i < N; i++) samples.push(await runOnce(wl))
    const p50s = samples.map((s) => s.p50)
    const ops = samples.map((s) => s.opsPerSec)
    const minP50 = Math.min(...p50s)
    const maxP50 = Math.max(...p50s)
    const medP50 = median(p50s)
    const medOps = median(ops)
    const spread = ((maxP50 - minP50) / medP50) * 100
    process.stderr.write(`done (median ${fmtNs(medP50)}, spread ${spread.toFixed(1)}%)\n`)
    console.log(
      `| ${wl.name} | ${fmtNs(minP50)} | ${fmtNs(medP50)} | ${fmtNs(maxP50)} | ${spread.toFixed(1)}% | ${fmtOps(medOps)} |`,
    )
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
