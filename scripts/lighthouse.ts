/**
 * Lighthouse quality gate runner.
 * Usage: bun scripts/lighthouse.ts
 *
 * Starts the demo server, runs Lighthouse against / and /about,
 * asserts score thresholds and Core Web Vitals, writes results to
 * scripts/lighthouse-results.json, then exits non-zero on failure.
 */

import lighthouse from 'lighthouse'
import * as chromeLauncher from 'chrome-launcher'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const DEMO_PORT = 3456
const BASE_URL = `http://localhost:${DEMO_PORT}`
const URLS = [`${BASE_URL}/`, `${BASE_URL}/about`]
const RESULTS_PATH = join(process.cwd(), 'scripts', 'lighthouse-results.json')

const THRESHOLDS = {
  performance: 90,
  accessibility: 90,
  'best-practices': 90,
  seo: 90,
} as const

const CWV = {
  lcp: 2500, // ms
  cls: 0,    // unitless
} as const

// ── 1. Start demo server ────────────────────────────────────────────────────

const server = Bun.spawn(['bun', 'tests/manual-demo/server.ts'], {
  cwd: process.cwd(),
  stdout: 'pipe',
  stderr: 'pipe',
})

// ── 2. Poll until server is ready (up to 10 s) ──────────────────────────────

async function waitForServer(url: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.status < 500) return
    } catch {
      // not ready yet
    }
    await Bun.sleep(200)
  }
  throw new Error(`Server at ${url} did not become ready within ${timeoutMs}ms`)
}

console.log('Waiting for demo server…')
await waitForServer(`${BASE_URL}/`)
console.log('Server ready.')

// ── 3. Run Lighthouse against each URL ──────────────────────────────────────

const allResults: Record<string, unknown>[] = []
const failures: string[] = []

for (const url of URLS) {
  console.log(`\nRunning Lighthouse: ${url}`)

  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless', '--no-sandbox', '--disable-gpu'],
  })

  let result: Awaited<ReturnType<typeof lighthouse>>
  try {
    result = await lighthouse(url, {
      port: chrome.port,
      output: 'json',
      logLevel: 'error',
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
    })
  } finally {
    try {
      await chrome.kill()
    } catch {
      // Windows may throw EBUSY on temp-dir cleanup — non-fatal, continue
    }
  }

  if (!result?.lhr) {
    failures.push(`${url}: Lighthouse returned no LHR`)
    continue
  }

  const { lhr } = result

  // ── 4. Extract scores ──────────────────────────────────────────────────

  const scores = {
    performance: (lhr.categories['performance']?.score ?? 0) * 100,
    accessibility: (lhr.categories['accessibility']?.score ?? 0) * 100,
    'best-practices': (lhr.categories['best-practices']?.score ?? 0) * 100,
    seo: (lhr.categories['seo']?.score ?? 0) * 100,
  } as Record<string, number>

  const lcp = lhr.audits['largest-contentful-paint']?.numericValue ?? Infinity
  const cls = lhr.audits['cumulative-layout-shift']?.numericValue ?? Infinity

  console.log(`  Scores: performance=${scores['performance']?.toFixed(0)}, accessibility=${scores['accessibility']?.toFixed(0)}, best-practices=${scores['best-practices']?.toFixed(0)}, seo=${scores['seo']?.toFixed(0)}`)
  console.log(`  CWV:    LCP=${lcp.toFixed(0)}ms, CLS=${cls.toFixed(3)}`)

  allResults.push({ url, scores, cwv: { lcp, cls }, lhr: lhr.finalUrl })

  // ── 5. Assert category thresholds ─────────────────────────────────────

  for (const [cat, threshold] of Object.entries(THRESHOLDS)) {
    const score = scores[cat] ?? 0
    if (score < threshold) {
      failures.push(`${url}: ${cat} score ${score.toFixed(0)} < threshold ${threshold}`)
    }
  }

  // ── 6. Assert Core Web Vitals ─────────────────────────────────────────

  if (lcp > CWV.lcp) {
    failures.push(`${url}: LCP ${lcp.toFixed(0)}ms > threshold ${CWV.lcp}ms`)
  }
  if (cls > CWV.cls) {
    failures.push(`${url}: CLS ${cls.toFixed(3)} > threshold ${CWV.cls}`)
  }
}

// ── 7. Write full report ──────────────────────────────────────────────────────

writeFileSync(RESULTS_PATH, JSON.stringify(allResults, null, 2))
console.log(`\nResults written to ${RESULTS_PATH}`)

// ── 8. Kill demo server ───────────────────────────────────────────────────────

server.kill()

// ── 9. Exit with failure if any threshold missed ──────────────────────────────

if (failures.length > 0) {
  console.error('\nLighthouse quality gate FAILED:')
  for (const msg of failures) {
    console.error(`  ✗ ${msg}`)
  }
  process.exit(1)
}

console.log('\nAll Lighthouse quality gates passed.')
