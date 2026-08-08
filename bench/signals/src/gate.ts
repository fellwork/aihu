/**
 * CI regression gate. Reads `current` and `previous` RESULTS.md, parses the
 * embedded JSON block (see runner.ts), compares aihu's metrics per workload,
 * and exits non-zero if any workload regressed by more than the threshold on
 * the time or memory axes.
 *
 * FITNESS (C-FEL-409). The time axis gates ONLY workloads whose measured
 * run-to-run p50 spread is below the threshold it is judged against. A
 * workload whose no-change spread exceeds 10 % cannot distinguish a 10 %
 * regression from doing nothing; gating on it is a coin flip wearing a
 * receipt. Unfit workloads are REPORTED (tagged `NOGATE`) and never counted.
 *
 * The classification is DERIVED here from `fitness.json`'s measured
 * `spreadPct`, never read from it. The artifact stores measurements and
 * provenance only, so there is no `class` string anyone can flip without
 * falsifying the number under it. Regenerate with:
 *   BENCH_FITNESS_OUT=fitness.json bun src/repeat.ts 7 <label>
 * on the machine the gate runs on — spread is a property of the
 * (workload × machine) pair, not of the workload.
 *
 * FAIL-CLOSED, all four directions (a gate that cannot read its own policy
 * must not pass): a missing or unparseable artifact, a schema it does not
 * recognise, a benched workload with no measurement, or a fitness set that
 * leaves ZERO workloads gating — each exits non-zero. `0 regressions` out of
 * `0 workloads examined` is an absence report, not a pass.
 *
 * Time:           p50 regression ≥ 10 % fails, FIT workloads only.
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
 *   BENCH_TEST_INJECT_TIME_REGRESSION=<pct>    — multiplies aihu's current p50 by 1+pct/100
 *   BENCH_TEST_INJECT_MEMORY_REGRESSION=<pct>  — multiplies aihu's current buildHeapDelta by 1+pct/100
 *
 * The injection points only modify the in-memory `cur` payload AFTER parse;
 * the real runner pipeline is untouched. They exist so HARNESS.md's
 * "did the gate actually fire?" check is reproducible without writing
 * regressions into the codebase.
 *
 * DESIGNED-RED (2026-08-08). `bench/signals/fitness.json` has never existed
 * — PR #698 built the measurement + generation pipeline
 * (bench-fitness.yml, this file's fitness-derivation logic) but deliberately
 * left the last step, a human committing a measured artifact, undone (see
 * that workflow's own header comment: "the commit stays a human act with a
 * diff to read"). `loadFitness` below is FAIL-CLOSED on a missing artifact
 * by design, so this gate has failed on every run since. It is NOT in
 * `ci-ok`'s needs and `continue-on-error: true` in plan-a.yml keeps it from
 * blocking anything — but it is genuinely red, not silently skipped, and
 * that state is deliberate until R1 (same-job A/B vs merge base, replacing
 * the checked-in-baseline mechanism this file drives) lands. Committing a
 * `fitness.json` today would NOT fix it: `repeat.ts` measures within-process
 * variance and this gate uses it to license across-CI-run comparisons —
 * measured "fit" workloads drift 19–31 % run-to-run with zero code changes,
 * several times their measured within-run spread. Do not regenerate
 * `fitness.json` to green this gate; see bench/signals/HARNESS.md.
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

const FITNESS_SCHEMA_VERSION = 1

interface FitnessMeasurement {
  n: number
  minP50: number
  medianP50: number
  maxP50: number
  spreadPct: number
}

interface FitnessArtifact {
  schemaVersion: number
  label: string
  n: number
  measuredAt: string
  provenance: Record<string, unknown>
  workloads: Record<string, FitnessMeasurement>
}

/**
 * Read the fitness artifact, or die. Every failure path here exits 1: the
 * gate's whole job is to refuse to certify what it could not examine, and an
 * unreadable policy is the case where it knows least.
 */
function loadFitness(): FitnessArtifact {
  const path = new URL('../fitness.json', import.meta.url)
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch (err) {
    console.error(
      `Bench gate: cannot read fitness.json (${String(err)}).\n` +
        'The gate does not know which workloads are fit to gate, so it cannot pass.\n' +
        'Regenerate on the gate machine: BENCH_FITNESS_OUT=fitness.json bun src/repeat.ts 7 <label>',
    )
    process.exit(1)
  }
  let parsed: FitnessArtifact
  try {
    parsed = JSON.parse(raw) as FitnessArtifact
  } catch (err) {
    console.error(`Bench gate: fitness.json is not valid JSON (${String(err)}).`)
    process.exit(1)
  }
  if (parsed.schemaVersion !== FITNESS_SCHEMA_VERSION) {
    console.error(
      `Bench gate: fitness.json schemaVersion ${String(parsed.schemaVersion)} — this gate understands ${FITNESS_SCHEMA_VERSION}. ` +
        'Refusing to interpret an artifact written for a different reader.',
    )
    process.exit(1)
  }
  if (!parsed.workloads || typeof parsed.workloads !== 'object') {
    console.error('Bench gate: fitness.json has no `workloads` map.')
    process.exit(1)
  }
  return parsed
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
// aihu cell uniformly; the first regression the loop hits will fire.
const injectTime = Number(process.env.BENCH_TEST_INJECT_TIME_REGRESSION ?? '0')
const injectMem = Number(process.env.BENCH_TEST_INJECT_MEMORY_REGRESSION ?? '0')
if (injectTime !== 0 || injectMem !== 0) {
  console.log(`[test-injection] time +${injectTime}% / memory +${injectMem}% applied to aihu rows`)
  for (const c of cur.cells) {
    if (c.competitor !== '@aihu/signals') continue
    if (injectTime !== 0 && typeof c.p50 === 'number') {
      c.p50 = c.p50 * (1 + injectTime / 100)
    }
    if (injectMem !== 0 && c.memory && typeof c.memory.buildHeapDelta === 'number') {
      c.memory = { ...c.memory, buildHeapDelta: c.memory.buildHeapDelta * (1 + injectMem / 100) }
    }
  }
}

const fitness = loadFitness()
const fitThresholdPct = TIME_THRESHOLD * 100

/**
 * A workload gates iff its own no-change spread is smaller than the movement
 * the gate calls a regression. Derived here, from the measurement — the
 * artifact carries no verdict to disagree with.
 */
function isFit(workload: string): boolean {
  const m = fitness.workloads[workload]
  return m !== undefined && m.spreadPct < fitThresholdPct
}

// Every benched aihu workload must carry a measurement. A NEW workload with no
// fitness entry is UNCLASSIFIED, not unfit: letting it default either way is
// how a workload silently arrives ungated (default fit -> it gates on noise;
// default unfit -> it never gates and nobody is told). Refuse instead.
const benched = [
  ...new Set(cur.cells.filter((c) => c.competitor === '@aihu/signals').map((c) => c.workload)),
]
const unclassified = benched.filter((w) => fitness.workloads[w] === undefined)
if (unclassified.length > 0) {
  console.error(
    `Bench gate: ${unclassified.length} benched workload(s) have no fitness measurement: ${unclassified.join(', ')}.\n` +
      'A workload with no measured spread cannot be judged fit or unfit, so the gate refuses to guess.\n' +
      'Regenerate on the gate machine: BENCH_FITNESS_OUT=fitness.json bun src/repeat.ts 7 <label>',
  )
  process.exit(1)
}

const fitWorkloads = benched.filter(isFit)
if (fitWorkloads.length === 0) {
  console.error(
    'Bench gate: ZERO workloads are fit to gate — every measured spread is at or above ' +
      `${fitThresholdPct.toFixed(0)} %.\n` +
      'A gate with nothing to gate reports "no regressions" having examined nothing, which is an ' +
      'absence report, not a pass. Refusing.',
  )
  process.exit(1)
}

let timeRegressions = 0
let buildHeapRegressions = 0
let peakMallocRegressions = 0
const timeLines: string[] = []
const memoryLines: string[] = []

for (const cur_cell of cur.cells) {
  if (cur_cell.competitor !== '@aihu/signals') continue
  const prev_cell = prev.cells.find(
    (c) => c.workload === cur_cell.workload && c.competitor === '@aihu/signals',
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
    const fit = isFit(cur_cell.workload)
    const spread = fitness.workloads[cur_cell.workload]?.spreadPct ?? Number.NaN
    // Unfit workloads keep printing their delta — the number is still the
    // best evidence anyone has that something moved. What they lose is the
    // vote, not the voice.
    const tag = !fit ? 'NOGATE' : delta > TIME_THRESHOLD ? 'FAIL' : delta < -0.05 ? 'WIN ' : 'OK  '
    const suffix = fit ? '' : ` [reported, not gating — no-change spread ${spread.toFixed(1)} %]`
    timeLines.push(
      `  ${tag} ${cur_cell.workload}: ${prev_cell.p50.toFixed(0)} → ${cur_cell.p50.toFixed(0)} ns (${(delta * 100).toFixed(1)} %)${suffix}`,
    )
    if (fit && delta > TIME_THRESHOLD) timeRegressions++
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

console.log(`Bench gate · @aihu/signals · prev=${prev.date} cur=${cur.date}`)
console.log(
  `Time axis gates ${fitWorkloads.length}/${benched.length} workload(s) — fit = measured no-change ` +
    `spread < ${fitThresholdPct.toFixed(0)} % (fitness.json: N=${fitness.n}, ${fitness.measuredAt}, ${fitness.label}).`,
)
console.log(`  gating: ${fitWorkloads.join(', ')}`)
const unfit = benched.filter((w) => !isFit(w))
if (unfit.length > 0) console.log(`  reported, not gating: ${unfit.join(', ')}`)
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
