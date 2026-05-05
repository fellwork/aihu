/**
 * CI regression gate for `bench/arbor`. Reads `previous` and `current`
 * RESULTS.md files, parses the embedded JSON block, compares p50 for
 * `@aihu/arbor` rows, and exits non-zero if any workload regressed by more
 * than the threshold.
 *
 * Usage:
 *   bun bench/arbor/src/gate.ts <previous-results.md> <current-results.md>
 *
 * Override: if BENCH_BUMP=1 in the env (CI sets this when the commit message
 * contains `[bench-bump]`), the gate skips the check entirely.
 *
 * Time gate only (v0). Memory gate is out of scope for this round.
 */
import { readFileSync } from 'node:fs'

const THRESHOLD = 0.1 // 10% p50 regression fails

interface Cell {
  workload: string
  competitor: string
  p50?: number | null
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

if (process.env.BENCH_BUMP === '1') {
  console.log('BENCH_BUMP=1 — gate bypassed by commit-message override.')
  process.exit(0)
}

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
  const tag = delta > THRESHOLD ? 'FAIL' : delta < -0.05 ? 'WIN ' : 'OK  '
  lines.push(
    `  ${tag} ${curCell.workload}: ${prevCell.p50.toFixed(0)} → ${curCell.p50.toFixed(0)} ns` +
      ` (${(delta * 100).toFixed(1)} %)`,
  )
  if (delta > THRESHOLD) regressionCount++
}

console.log(`Bench gate · @aihu/arbor · prev=${prev.date} cur=${cur.date}`)
for (const line of lines) console.log(line)

if (regressionCount > 0) {
  console.error(
    `\n${regressionCount} workload(s) regressed >${(THRESHOLD * 100).toFixed(0)} %. ` +
      'Either fix the code, justify with [bench-bump] in the commit message, or ' +
      'discuss with the team if the threshold is wrong.',
  )
  process.exit(1)
}

console.log('\nAll within threshold.')
