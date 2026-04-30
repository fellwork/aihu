/**
 * CI regression gate. Reads `current` and `previous` RESULTS.md, parses the
 * embedded JSON block (see runner.ts), compares scribe's metrics per workload,
 * and exits non-zero if any workload regressed by more than the threshold on
 * the time or memory axes.
 *
 * Time:           p50 regression ≥ 10 % fails (existing).
 * buildHeapDelta: per-graph heap regression ≥ 10 % fails (Round N+1).
 * peakMalloc:     transient peak regression ≥ 15 % fails (Round N+1; design §4.4).
 * disposeResidual: leak signal — informational, NOT gated (design §4.4).
 *
 * Failures are reported with separate per-axis messages so the diagnoser
 * knows which axis to investigate. Failing simultaneously is allowed; both
 * messages print.
 *
 * Usage:
 *   bun src/gate.ts <previous-results.md> <current-results.md>
 *
 * Override: if BENCH_BUMP=1 in the env (CI sets this when commit message
 * contains `[bench-bump]`), the gate skips ALL checks (time + memory).
 *
 * Test hooks (manual gate validation only — do NOT use in CI):
 *   BENCH_TEST_INJECT_TIME_REGRESSION=<pct>    — multiplies scribe's current p50 by 1+pct/100
 *   BENCH_TEST_INJECT_MEMORY_REGRESSION=<pct>  — multiplies scribe's current buildHeapDelta by 1+pct/100
 *
 * The injection points only modify the in-memory `cur` payload AFTER parse;
 * the real runner pipeline is untouched. They exist so HARNESS.md's
 * "did the gate actually fire?" check is reproducible without writing
 * regressions into the codebase.
 */
import { readFileSync } from 'node:fs'

const TIME_THRESHOLD = 0.1 // 10 % p50 regression fails
const BUILD_HEAP_THRESHOLD = 0.1 // 10 % buildHeapDelta regression fails
const PEAK_MALLOC_THRESHOLD = 0.15 // 15 % peak_malloced_memory regression fails (noisier)

interface MemoryCell {
  buildHeapDelta?: number
  peakMalloc?: number
  disposeResidual?: number
}

interface Cell {
  workload: string
  competitor: string
  p50?: number
  error?: string
  memory?: MemoryCell
}

interface Payload {
  date: string
  cells: Cell[]
}

function parseResults(path: string): Payload {
  const md = readFileSync(path, 'utf8')
  const m = md.match(
    /<!-- bench-data:start -->\s*```json\s*([\s\S]*?)\s*```\s*<!-- bench-data:end -->/,
  )
  if (!m) throw new Error(`No bench-data block in ${path}`)
  return JSON.parse(m[1] as string) as Payload
}

const [prevPath, curPath] = process.argv.slice(2)
if (!prevPath || !curPath) {
  console.error('Usage: bun src/gate.ts <previous.md> <current.md>')
  process.exit(2)
}

if (process.env.BENCH_BUMP === '1') {
  console.log('BENCH_BUMP=1 — gate bypassed by commit-message override.')
  process.exit(0)
}

const prev = parseResults(prevPath)
const cur = parseResults(curPath)

// Test-only injection. Applied AFTER parse, BEFORE comparison. Bumps every
// scribe cell uniformly; the first regression the loop hits will fire.
const injectTime = Number(process.env.BENCH_TEST_INJECT_TIME_REGRESSION ?? '0')
const injectMem = Number(process.env.BENCH_TEST_INJECT_MEMORY_REGRESSION ?? '0')
if (injectTime !== 0 || injectMem !== 0) {
  console.log(
    `[test-injection] time +${injectTime}% / memory +${injectMem}% applied to scribe rows`,
  )
  for (const c of cur.cells) {
    if (c.competitor !== '@scribe/signals') continue
    if (injectTime !== 0 && typeof c.p50 === 'number') {
      c.p50 = c.p50 * (1 + injectTime / 100)
    }
    if (injectMem !== 0 && c.memory && typeof c.memory.buildHeapDelta === 'number') {
      c.memory = { ...c.memory, buildHeapDelta: c.memory.buildHeapDelta * (1 + injectMem / 100) }
    }
  }
}

let timeRegressions = 0
let buildHeapRegressions = 0
let peakMallocRegressions = 0
const timeLines: string[] = []
const memoryLines: string[] = []

for (const cur_cell of cur.cells) {
  if (cur_cell.competitor !== '@scribe/signals') continue
  const prev_cell = prev.cells.find(
    (c) => c.workload === cur_cell.workload && c.competitor === '@scribe/signals',
  )

  // ---- Time axis ----
  if (cur_cell.error || cur_cell.p50 === undefined) {
    // skip
  } else if (!prev_cell || prev_cell.p50 === undefined) {
    timeLines.push(
      `  ${cur_cell.workload}: NEW (no previous baseline) — ${cur_cell.p50.toFixed(0)} ns`,
    )
  } else {
    const delta = cur_cell.p50 / prev_cell.p50 - 1
    const tag = delta > TIME_THRESHOLD ? 'FAIL' : delta < -0.05 ? 'WIN ' : 'OK  '
    timeLines.push(
      `  ${tag} ${cur_cell.workload}: ${prev_cell.p50.toFixed(0)} → ${cur_cell.p50.toFixed(0)} ns (${(delta * 100).toFixed(1)} %)`,
    )
    if (delta > TIME_THRESHOLD) timeRegressions++
  }

  // ---- Memory axis ----
  const curMem = cur_cell.memory
  const prevMem = prev_cell?.memory
  if (!curMem) continue

  // buildHeapDelta — gated at 10 %.
  if (typeof curMem.buildHeapDelta === 'number') {
    if (!prevMem || typeof prevMem.buildHeapDelta !== 'number') {
      memoryLines.push(
        `  ${cur_cell.workload} build/graph: NEW — ${curMem.buildHeapDelta.toFixed(0)} B`,
      )
    } else if (Math.abs(prevMem.buildHeapDelta) < 64) {
      // Below 64 B per-graph the noise floor swamps the ratio (one
      // pointer is 8 B; rounding to GC pages dominates). Compare in
      // absolute B instead and only fail above a 256 B absolute jump.
      const absDelta = curMem.buildHeapDelta - prevMem.buildHeapDelta
      const tag = absDelta > 256 ? 'FAIL' : 'OK  '
      memoryLines.push(
        `  ${tag} ${cur_cell.workload} build/graph: ${prevMem.buildHeapDelta.toFixed(0)} → ${curMem.buildHeapDelta.toFixed(0)} B (Δ${absDelta.toFixed(0)} B, low-baseline)`,
      )
      if (absDelta > 256) buildHeapRegressions++
    } else {
      const delta = curMem.buildHeapDelta / prevMem.buildHeapDelta - 1
      const tag = delta > BUILD_HEAP_THRESHOLD ? 'FAIL' : delta < -0.05 ? 'WIN ' : 'OK  '
      memoryLines.push(
        `  ${tag} ${cur_cell.workload} build/graph: ${prevMem.buildHeapDelta.toFixed(0)} → ${curMem.buildHeapDelta.toFixed(0)} B (${(delta * 100).toFixed(1)} %)`,
      )
      if (delta > BUILD_HEAP_THRESHOLD) buildHeapRegressions++
    }
  }

  // peakMalloc — gated at 15 % (noisier per design §4.4).
  if (typeof curMem.peakMalloc === 'number') {
    if (!prevMem || typeof prevMem.peakMalloc !== 'number') {
      memoryLines.push(
        `  ${cur_cell.workload} peak-malloc: NEW — ${curMem.peakMalloc.toFixed(0)} B`,
      )
    } else if (Math.abs(prevMem.peakMalloc) < 1024) {
      // Below 1 KB peak the V8 internal-cache noise dominates; skip ratio.
      memoryLines.push(
        `  ${cur_cell.workload} peak-malloc: ${prevMem.peakMalloc.toFixed(0)} → ${curMem.peakMalloc.toFixed(0)} B (low-baseline, skip)`,
      )
    } else {
      const delta = curMem.peakMalloc / prevMem.peakMalloc - 1
      const tag = delta > PEAK_MALLOC_THRESHOLD ? 'FAIL' : delta < -0.05 ? 'WIN ' : 'OK  '
      memoryLines.push(
        `  ${tag} ${cur_cell.workload} peak-malloc: ${prevMem.peakMalloc.toFixed(0)} → ${curMem.peakMalloc.toFixed(0)} B (${(delta * 100).toFixed(1)} %)`,
      )
      if (delta > PEAK_MALLOC_THRESHOLD) peakMallocRegressions++
    }
  }

  // disposeResidual — informational only; leaked memory shows as a positive
  // residual that grows with N. We log but do NOT gate. Per design §4.4.
  if (typeof curMem.disposeResidual === 'number' && curMem.disposeResidual > 0) {
    memoryLines.push(
      `  INFO ${cur_cell.workload} dispose-residual: ${curMem.disposeResidual.toFixed(0)} B (leak signal — informational)`,
    )
  }
}

console.log(`Bench gate · @scribe/signals · prev=${prev.date} cur=${cur.date}`)
console.log('\n[time / p50]')
for (const line of timeLines) console.log(line)
if (memoryLines.length > 0) {
  console.log('\n[memory]')
  for (const line of memoryLines) console.log(line)
}

const totalRegressions = timeRegressions + buildHeapRegressions + peakMallocRegressions
if (totalRegressions > 0) {
  console.error('')
  if (timeRegressions > 0) {
    console.error(
      `${timeRegressions} workload(s) regressed >${(TIME_THRESHOLD * 100).toFixed(0)} % on TIME (p50). ` +
        'Either fix the code, justify with [bench-bump] in the commit message, or ' +
        'discuss with the team if the threshold is wrong.',
    )
  }
  if (buildHeapRegressions > 0) {
    console.error(
      `${buildHeapRegressions} workload(s) regressed >${(BUILD_HEAP_THRESHOLD * 100).toFixed(0)} % on MEMORY (build/graph). ` +
        'Either fix the code, justify with [bench-bump], or discuss the threshold.',
    )
  }
  if (peakMallocRegressions > 0) {
    console.error(
      `${peakMallocRegressions} workload(s) regressed >${(PEAK_MALLOC_THRESHOLD * 100).toFixed(0)} % on MEMORY (peak-malloc). ` +
        'Either fix the code, justify with [bench-bump], or discuss the threshold.',
    )
  }
  process.exit(1)
}

console.log('\nAll within threshold (time + memory).')
