/**
 * Lighthouse quality gate runner — aihu docs site.
 * Usage: bun scripts/lighthouse.ts
 *
 * Serves the pre-built apps/docs/dist via `wrangler pages dev` and runs
 * Lighthouse against the docs introduction page, asserting 95+ on
 * performance / accessibility / best-practices / SEO plus Core Web Vitals.
 * Writes results to scripts/lighthouse-results.json, exits non-zero on
 * any threshold miss.
 *
 * Prerequisite: `bun run build` must have been run in apps/docs so that
 * apps/docs/dist exists. The CI deploy workflow builds docs before this gate.
 */

import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as chromeLauncher from 'chrome-launcher'
import lighthouse from 'lighthouse'

const PORT = 8788
const BASE_URL = `http://localhost:${PORT}`

// The docs site is a hash-routed SPA served by the Cloudflare Pages worker;
// any unmatched path falls through to the SPA shell, which renders the
// `introduction` page by default. /docs/introduction is the canonical IA URL
// for the introduction content (arch-1-website.md §1.1).
const URLS = [`${BASE_URL}/docs/introduction`]
const RESULTS_PATH = join(process.cwd(), 'scripts', 'lighthouse-results.json')
const DIST_DIR = join(process.cwd(), 'apps', 'docs', 'dist')

const THRESHOLDS = {
  performance: 95,
  accessibility: 95,
  'best-practices': 95,
  seo: 95,
} as const

const CWV = {
  lcp: 2500, // ms
  cls: 0.1, // unitless
} as const

// ── 0. Sanity-check the build output exists ─────────────────────────────────

if (!existsSync(DIST_DIR)) {
  console.error(`apps/docs/dist not found at ${DIST_DIR}.`)
  console.error("Run 'bun run build' in apps/docs first (CI builds docs before this gate).")
  process.exit(1)
}

// ── 1. Start the docs static server (wrangler pages dev) ────────────────────

const server = Bun.spawn(
  ['bunx', 'wrangler', 'pages', 'dev', DIST_DIR, '--port', String(PORT), '--ip', '127.0.0.1'],
  {
    cwd: process.cwd(),
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, CI: '1' },
  },
)

// ── 2. Poll until server is ready (up to 60 s — wrangler cold start) ─────────

async function waitForServer(url: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.status < 500) return
    } catch {
      // not ready yet
    }
    await Bun.sleep(500)
  }
  throw new Error(`Server at ${url} did not become ready within ${timeoutMs}ms`)
}

console.log('Waiting for docs server…')
try {
  await waitForServer(`${BASE_URL}/`)
} catch (err) {
  server.kill()
  throw err
}
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
    performance: (lhr.categories.performance?.score ?? 0) * 100,
    accessibility: (lhr.categories.accessibility?.score ?? 0) * 100,
    'best-practices': (lhr.categories['best-practices']?.score ?? 0) * 100,
    seo: (lhr.categories.seo?.score ?? 0) * 100,
  } as Record<string, number>

  const lcp = lhr.audits['largest-contentful-paint']?.numericValue ?? Infinity
  const cls = lhr.audits['cumulative-layout-shift']?.numericValue ?? Infinity

  console.log(
    `  Scores: performance=${scores.performance?.toFixed(0)}, accessibility=${scores.accessibility?.toFixed(0)}, best-practices=${scores['best-practices']?.toFixed(0)}, seo=${scores.seo?.toFixed(0)}`,
  )
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

// ── 8. Kill docs server ─────────────────────────────────────────────────────────

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
