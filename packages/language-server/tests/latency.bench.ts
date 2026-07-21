/**
 * packages/language-server/tests/latency.bench.ts
 *
 * Observational latency benchmark for the LSP hover code path. Runs as a
 * plain `bun` script (not a vitest test) — see package.json `bench` script.
 *
 * Per director-note §3.5: observational only, NOT a CI gate. No assertions,
 * no `expect()`. Iterates `getMacroAtPosition` + `getBlockContext` +
 * `getHoverContent` at the same call-site shape `server.ts:onHover` uses.
 *
 * Reports p50/p95/p99 in ms via plain `console.log`. The file is excluded
 * from normal vitest runs because its name ends `.bench.ts`, not `.test.ts`
 * (the workspace vitest include pattern only matches `*.test.ts`).
 */
import { getBlockContext, getHoverContent, getMacroAtPosition } from '../src/core/hover.ts'

// Synthetic fixture covering 6 hover-eligible positions across blocks.
const FIXTURE = [
  '@state {',
  '  $prop: {',
  '    label: { default: undefined },',
  '  }',
  '  $watch(count, (n, p) => console.log(n, p))',
  '  $effect.on(count) { /* ... */ }',
  '  $lifecycle: { mount: () => {}, dispose: () => {} }',
  '}',
  '@template {',
  '  <div if={count > 0}>',
  '    <li each={item of items} key={item.id}>{item.label}</li>',
  '    <slot name="header" />',
  '  </div>',
  '}',
  '@style {',
  '  h1 { color: $reactive(error ? "red" : "black") }',
  '}',
  '@agent {',
  '  $scope authenticated',
  '  $rate-limit "100/min"',
  '}',
].join('\n')

const LINES = FIXTURE.split('\n')

// (line, character) tuples chosen to land on macro tokens.
const PROBES: Array<{ line: number; ch: number; label: string }> = [
  { line: 1, ch: 4, label: '$prop' }, // "  $prop: {"
  { line: 4, ch: 4, label: '$watch' }, // "  $watch(...)"
  { line: 5, ch: 4, label: '$effect.on' }, // "  $effect.on(...)"
  { line: 10, ch: 11, label: '$if' }, // "  <div if={..."
  { line: 11, ch: 9, label: '$each' }, // "    <li each=..."
  { line: 12, ch: 5, label: '<slot>' }, // "    <slot ..."
]

const ITERATIONS = 100

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[idx]!
}

function runProbe(probe: { line: number; ch: number; label: string }): number[] {
  const lineText = LINES[probe.line]!
  const samples: number[] = []
  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now()
    // Same call shape as server.ts:onHover (getMacroAtPosition + getBlockContext + getHoverContent).
    const macro = getMacroAtPosition(lineText, probe.ch)
    getBlockContext(LINES, probe.line) // intentionally ignored — matches server.ts:200 `_ctx`
    if (macro) getHoverContent(macro)
    samples.push(performance.now() - start)
  }
  return samples
}

console.log('aihu language-server hover-path latency benchmark (observational)')
console.log(`  iterations: ${ITERATIONS} per probe; fixture: ${LINES.length} lines`)
console.log('')
console.log('  probe                  p50(ms)   p95(ms)   p99(ms)')
console.log('  -------------------    -------   -------   -------')

const allSamples: number[] = []
for (const probe of PROBES) {
  const samples = runProbe(probe).sort((a, b) => a - b)
  allSamples.push(...samples)
  const p50 = percentile(samples, 50).toFixed(4)
  const p95 = percentile(samples, 95).toFixed(4)
  const p99 = percentile(samples, 99).toFixed(4)
  console.log(
    `  ${probe.label.padEnd(20)}   ${p50.padStart(7)}   ${p95.padStart(7)}   ${p99.padStart(7)}`,
  )
}

const allSorted = allSamples.sort((a, b) => a - b)
const totalP50 = percentile(allSorted, 50).toFixed(4)
const totalP95 = percentile(allSorted, 95).toFixed(4)
const totalP99 = percentile(allSorted, 99).toFixed(4)
console.log('  -------------------    -------   -------   -------')
console.log(
  `  ${'(all probes)'.padEnd(20)}   ${totalP50.padStart(7)}   ${totalP95.padStart(7)}   ${totalP99.padStart(7)}`,
)
console.log('')
// ---------------------------------------------------------------------------
// CI gate
// ---------------------------------------------------------------------------
const GATE_P95_MS = 100
if (percentile(allSorted, 95) > GATE_P95_MS) {
  console.error(
    `\n  FAIL: overall p95 ${percentile(allSorted, 95).toFixed(4)}ms exceeds gate of ${GATE_P95_MS}ms`,
  )
  process.exit(1)
}
console.log(`  Gate: overall p95 < ${GATE_P95_MS}ms — OK`)
