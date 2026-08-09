/**
 * CI regression gate for `bench/arbor`. Reads `previous` and `current`
 * RESULTS.md files, parses the embedded JSON block, compares p50 for
 * `@aihu/arbor` rows on the GATE-tier workloads, and exits non-zero if any
 * regressed by more than the threshold.
 *
 * Usage:
 *   bun bench/arbor/src/gate.ts <previous-results.md> <current-results.md>
 *
 * ── Status of this mechanism (2026-07-26 ruling, #607) ────────────────────
 * Comparing against a checked-in baseline is condemned: the committed
 * baseline's `update-1-of-10k-leaves` and `attr-thrash-100x100` rows are
 * fiction (0 DOM writes/op — dead bindings), and any cross-machine ratio is
 * not a quantity (measured M5↔CI factor: 3.1x-5.8x, workload-dependent).
 * bench-arbor RED is therefore the *designed* state until R1 (same-job A/B
 * against the merge base) replaces this file's mechanism entirely. Do NOT
 * regenerate RESULTS.md to make this green — that canonises numbers for an
 * artifact nobody ships and destroys the incident record (truth doc §3.4).
 *
 * D1 RESOLVED 2026-08-08: shipping red is now a CLOSED decision, not a
 * pending one. Re-verified against a live run that same day — the FAIL is
 * `update-1-of-10k-leaves 29 -> 256 ns (795.8 %)`, i.e. the dead-binding
 * fiction row doing exactly what it is documented to do, and the report-only
 * rows swing -52 % to -60 % against the 2026-05-25 baseline. The step is
 * `continue-on-error` in plan-a.yml; the sibling counted-metric gate
 * (counts.ts) in the same job keeps its teeth and is the trustworthy signal.
 * Tracked follow-up: `C-FEL-BENCH-R1-AB-HARNESS`. Single canonical statement
 * of the decision + evidence: bench/signals/HARNESS.md, section
 * "D1 — RESOLVED 2026-08-08". Nothing here supersedes it.
 *
 * The gate still compares p50-vs-p50 (not `min`, which R2 prefers) because
 * the committed baseline has no `min` field; switching statistics against
 * this baseline would mark every row "NEW — no previous baseline" and
 * silently green the gate off invalid data. The runner already emits `min`
 * for the day R1 lands.
 *
 * ── Workload tiering (R5, per truth doc §3.3) ─────────────────────────────
 * GATE        update-1-of-10k-leaves, mount-deep-100x10 — the only workloads
 *             whose cross-process spread at a 2 s budget is inside a
 *             10 %-class threshold (4.7 % / 2.6 % measured).
 * report-only mount-10k-leaves, mount-wide-1000, krausest-1k-cycle — ~12-16
 *             samples at CI budget; p50 spread 534-1,176 % in the gate's own
 *             configuration (bisect doc §4). Deltas are printed, never fail.
 * never-gate  attr-thrash-100x100 — see below.
 *
 * ── Counted metrics (R8) ──────────────────────────────────────────────────
 * The metrics that gate *reliably* are counts, not timings: see counts.ts
 * (moves/swap = 4, writes/op = 1, setAttribute/op = 10000 — exact,
 * machine-independent equalities, no bypass). A dead binding sends a count
 * to zero, which screams; it sends a timing down, which flatters.
 */
import { readFileSync } from 'node:fs'

const THRESHOLD = 0.1 // 10% p50 regression fails (GATE tier only)

/**
 * R5 tiering. Only these workloads can FAIL the gate.
 */
const GATE_WORKLOADS: readonly string[] = ['update-1-of-10k-leaves', 'mount-deep-100x10']

/**
 * attr-thrash-100x100 NEVER gates — confirmed by the 2026-07-26 ruling
 * (#607 §3.3), and the reason matters: the instability is CI-ENVIRONMENTAL,
 * not intrinsic. On a quiet machine at a 2 s budget it is the *most* stable
 * heavy workload measured (0.25 % min spread across processes). Do NOT
 * "fix" this exclusion by observing that it looks stable somewhere: the gate
 * runs on CI, where neither budget nor load is controllable, and its cost
 * model (10,000 signal writes + 10,000 JSDOM setAttribute calls per op,
 * GC-dominated) makes it the workload most sensitive to environment — a 16x
 * range across reps was measured under load. Re-enabling requires R1-R3
 * landed AND two weeks of A/B runs showing CI-side spread under the
 * threshold; it must not be grandfathered in.
 */
const NEVER_GATE_WORKLOADS: readonly string[] = ['attr-thrash-100x100']

interface Cell {
  workload: string
  competitor: string
  p50?: number | null
  min?: number
  opsPerSec?: number
  error?: boolean
}

interface Payload {
  date: string
  cells: Cell[]
}

function parseResults(path: string): Payload {
  const md = readFileSync(path, 'utf8')
  // Matches: <!-- bench-data:start\n{json}\nbench-data:end -->
  const m = md.match(/<!-- bench-data:start\s+([\s\S]*?)\s+bench-data:end -->/)
  if (!m) throw new Error(`No bench-data block found in ${path}`)
  return JSON.parse(m[1] as string) as Payload
}

const [prevPath, curPath] = process.argv.slice(2)
if (!prevPath || !curPath) {
  console.error('Usage: bun bench/arbor/src/gate.ts <previous.md> <current.md>')
  process.exit(2)
}

// R7: [bench-bump] is an audited exception, not a silent skip. The gate
// always computes and prints every delta (the bypass is auditable in the CI
// log), and the override only takes effect with a one-line justification
// (BENCH_BUMP_REASON, extracted by CI from the commit message line carrying
// the tag).
const benchBump = process.env.BENCH_BUMP === '1'
const bumpReason = (process.env.BENCH_BUMP_REASON ?? '').trim()

const prev = parseResults(prevPath)
const cur = parseResults(curPath)

let regressionCount = 0
const lines: string[] = []

for (const curCell of cur.cells) {
  if (curCell.competitor !== '@aihu/arbor') continue
  if (curCell.error || curCell.p50 === null || curCell.p50 === undefined) {
    lines.push(`  SKIP ${curCell.workload}: error cell — no p50 to compare`)
    continue
  }

  const prevCell = prev.cells.find(
    (c) => c.workload === curCell.workload && c.competitor === '@aihu/arbor',
  )
  if (!prevCell || prevCell.p50 === null || prevCell.p50 === undefined) {
    lines.push(`  ${curCell.workload}: NEW (no previous baseline) — ${curCell.p50.toFixed(0)} ns`)
    continue
  }

  const delta = curCell.p50 / prevCell.p50 - 1
  const deltaStr =
    `${prevCell.p50.toFixed(0)} → ${curCell.p50.toFixed(0)} ns` + ` (${(delta * 100).toFixed(1)} %)`

  if (NEVER_GATE_WORKLOADS.includes(curCell.workload)) {
    lines.push(`  NVRG ${curCell.workload}: ${deltaStr} — never-gate (CI-environmental noise)`)
    continue
  }
  if (!GATE_WORKLOADS.includes(curCell.workload)) {
    lines.push(`  INFO ${curCell.workload}: ${deltaStr} — report-only tier`)
    continue
  }

  const tag = delta > THRESHOLD ? 'FAIL' : delta < -0.05 ? 'WIN ' : 'OK  '
  lines.push(`  ${tag} ${curCell.workload}: ${deltaStr}`)
  if (delta > THRESHOLD) regressionCount++
}

console.log(`Bench gate · @aihu/arbor · prev=${prev.date} cur=${cur.date}`)
console.log(`  gate tier: ${GATE_WORKLOADS.join(', ')} · threshold ${THRESHOLD * 100} % on p50`)
for (const line of lines) console.log(line)

if (regressionCount > 0) {
  if (benchBump && bumpReason) {
    console.log(
      `\nBENCH_BUMP override in effect — ${regressionCount} gate-tier regression(s) ` +
        `WAIVED.\n  justification: ${bumpReason}\n  The deltas above are the audit trail.`,
    )
    process.exit(0)
  }
  if (benchBump && !bumpReason) {
    console.error(
      '\nBENCH_BUMP=1 but no justification found. [bench-bump] requires a ' +
        'one-line reason on the same line as the tag in the commit message ' +
        '(R7 — the bypass must be auditable). Failing the gate.',
    )
  }
  console.error(
    `\n${regressionCount} workload(s) regressed >${(THRESHOLD * 100).toFixed(0)} %. ` +
      'Either fix the code, justify with `[bench-bump] <reason>` in the commit ' +
      'message, or discuss with the team if the threshold is wrong.',
  )
  process.exit(1)
}

if (benchBump) {
  console.log('\nBENCH_BUMP was set but no gate-tier regression detected — nothing waived.')
}
console.log('\nAll gate-tier workloads within threshold.')
