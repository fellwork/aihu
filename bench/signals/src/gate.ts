/**
 * CI regression gate. Reads `current` and `previous` RESULTS.md, parses the
 * embedded JSON block (see runner.ts), compares scribe's p50 per workload,
 * and exits non-zero if any workload regressed by more than the threshold.
 *
 * Usage:
 *   bun src/gate.ts <previous-results.md> <current-results.md>
 *
 * Override: if BENCH_BUMP=1 in the env (CI sets this when commit message
 * contains `[bench-bump]`), the gate skips the check entirely.
 */
import { readFileSync } from 'node:fs'

const THRESHOLD = 0.1 // 10 % p50 regression fails

interface Cell {
  workload: string
  competitor: string
  p50?: number
  error?: string
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

let regressionCount = 0
const lines: string[] = []
for (const cur_cell of cur.cells) {
  if (cur_cell.competitor !== '@scribe/signals') continue
  if (cur_cell.error || cur_cell.p50 === undefined) continue

  const prev_cell = prev.cells.find(
    (c) => c.workload === cur_cell.workload && c.competitor === '@scribe/signals',
  )
  if (!prev_cell || prev_cell.p50 === undefined) {
    lines.push(`  ${cur_cell.workload}: NEW (no previous baseline) — ${cur_cell.p50.toFixed(0)} ns`)
    continue
  }

  const delta = cur_cell.p50 / prev_cell.p50 - 1
  const tag = delta > THRESHOLD ? 'FAIL' : delta < -0.05 ? 'WIN ' : 'OK  '
  lines.push(
    `  ${tag} ${cur_cell.workload}: ${prev_cell.p50.toFixed(0)} → ${cur_cell.p50.toFixed(0)} ns (${(delta * 100).toFixed(1)} %)`,
  )
  if (delta > THRESHOLD) regressionCount++
}

console.log(`Bench gate · @scribe/signals · prev=${prev.date} cur=${cur.date}`)
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
