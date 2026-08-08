/**
 * Multi-run validation runner for `bench/signals` — twin of `bench/arbor/src/repeat.ts`.
 *
 * Runs every workload N times for `@aihu/signals` only and reports across-run
 * stats. Lets us tell true regressions from JIT/GC noise.
 *
 * Usage: `bun bench/signals/src/repeat.ts [N=5] [label]`
 *
 * FITNESS ARTIFACT (C-FEL-409). Set `BENCH_FITNESS_OUT=<path>` and this also
 * writes the machine-readable measurement `gate.ts` consumes to decide which
 * workloads are fit to gate. It writes MEASUREMENTS ONLY — never a fit/unfit
 * verdict. The gate derives the class from `spreadPct` against its own
 * threshold, so the classification cannot be hand-edited in the artifact
 * without also editing the number it is derived from.
 *
 * Run it WHERE THE GATE RUNS. Run-to-run spread is a property of the
 * (workload × machine) pair, not of the workload: on a loaded dev box `cellx`
 * measures ~25× its CI p50. A fitness artifact captured locally answers a
 * question about a different instrument.
 *
 * DO NOT COMMIT the artifact this produces to `bench/signals/fitness.json`
 * (D1, RESOLVED 2026-08-08). The mechanism has a known flaw this runner
 * cannot fix: it measures WITHIN-PROCESS spread, and `gate.ts` would use
 * that to license ACROSS-CI-RUN comparisons. Those differ by several times —
 * 2 of 6 workloads drift past the gate's 10 % threshold back-to-back with
 * zero code changes. This runner stays useful as a MEASURING tool (that is
 * how the drift above was quantified); what is forbidden is installing its
 * output as gate policy. See bench/signals/HARNESS.md
 * § "D1 — RESOLVED 2026-08-08".
 */

import { writeFileSync } from 'node:fs'

import { measure } from 'mitata'

import { aihu } from './competitors/aihu.ts'
import type { WorkloadDefinition } from './types.ts'
import { workloads } from './workloads/index.ts'

const N = Number(process.argv[2] ?? 5)
const label = process.argv[3] ?? 'unlabeled'

interface Sample {
  p50: number
  opsPerSec: number
}

async function runOnce(workload: WorkloadDefinition): Promise<Sample> {
  const ctx = workload.build(aihu)
  for (let i = 0; i < 50; i++) ctx.run()
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
  console.log(`# signals repeat (N=${N}) — ${label}`)
  console.log(``)
  console.log(`| Workload | min p50 | median p50 | max p50 | spread% | median ops/s |`)
  console.log(`| --- | ---: | ---: | ---: | ---: | ---: |`)
  const measured: Record<
    string,
    { n: number; minP50: number; medianP50: number; maxP50: number; spreadPct: number }
  > = {}
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
    measured[wl.name] = {
      n: N,
      minP50,
      medianP50: medP50,
      maxP50,
      spreadPct: Number(spread.toFixed(2)),
    }
  }

  const out = process.env.BENCH_FITNESS_OUT
  if (out) {
    // Measurements + provenance only. No `class` field: see the header — the
    // gate derives fit/unfit from `spreadPct`, so there is nothing here to
    // hand-edit that would not also falsify the number it came from.
    const artifact = {
      schemaVersion: 1,
      label,
      n: N,
      measuredAt: new Date().toISOString().slice(0, 10),
      provenance: {
        platform: process.platform,
        arch: process.arch,
        cpus: process.env.BENCH_FITNESS_CPUS ?? 'unknown',
        ci: process.env.GITHUB_ACTIONS === 'true',
        runId: process.env.GITHUB_RUN_ID ?? null,
        runnerImage: process.env.ImageOS ?? null,
      },
      workloads: measured,
    }
    writeFileSync(out, `${JSON.stringify(artifact, null, 2)}\n`)
    process.stderr.write(`\nfitness artifact -> ${out}\n`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
