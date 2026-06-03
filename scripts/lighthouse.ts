/**
 * Lighthouse quality gate runner — aihu docs site.
 * Usage: bun scripts/lighthouse.ts
 *
 * Serves the pre-built apps/docs/dist via a deterministic static server
 * (apps/docs/scripts/serve-dist.ts — not wrangler; see issue #314) and runs
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
  lcp: 2100, // ms — tightened from 2500 after the prerender overhaul (CI ~1700ms)
  cls: 0.1, // unitless
} as const

// ── 0. Sanity-check the build output exists ─────────────────────────────────

if (!existsSync(DIST_DIR)) {
  console.error(`apps/docs/dist not found at ${DIST_DIR}.`)
  console.error("Run 'bun run build' in apps/docs first (CI builds docs before this gate).")
  process.exit(1)
}

// ── 1. Start the docs static server ─────────────────────────────────────────
//
// A deterministic Bun static server (mirrors CF Pages ASSETS: dir-index + SPA
// fallback) replaces `wrangler pages dev`, which would not start reliably on CI
// runners (compat-date drift past workerd's max + bunx cold-download) — see
// apps/docs/scripts/serve-dist.ts + issue #314. Serving the prerendered dist/
// statically is faithful for the perf measurement AND removes workerd startup
// variance from the number.

const server = Bun.spawn(['bun', join('apps', 'docs', 'scripts', 'serve-dist.ts')], {
  cwd: process.cwd(),
  stdout: 'pipe',
  stderr: 'pipe',
  env: { ...process.env, PORT: String(PORT), DIST_DIR },
})

// ── 2. Poll until server is ready ────────────────────────────────────────────

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

// ── 3. Run Lighthouse against each URL (single run) ─────────────────────────
//
// The best-of-3 stopgap (retired here) absorbed the run-to-run LCP jitter of
// the old client-rendered docs SPA (third-party fonts + highlight.js on the
// critical path). After the prerender overhaul + self-hosted fonts + minified
// bundle (docs/plans/2026-05-29-docs-dogfood-overhaul.md), /docs/introduction
// measures perf ~99 / LCP ~1700ms in CI — well clear of the gate — so a single
// run is stable and a tighter LCP threshold (2100ms) catches real regressions.

interface Measurement {
  scores: Record<string, number>
  lcp: number
  cls: number
  finalUrl: string
}

async function measure(url: string): Promise<Measurement | null> {
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
  if (!result?.lhr) return null
  const { lhr } = result
  return {
    scores: {
      performance: (lhr.categories.performance?.score ?? 0) * 100,
      accessibility: (lhr.categories.accessibility?.score ?? 0) * 100,
      'best-practices': (lhr.categories['best-practices']?.score ?? 0) * 100,
      seo: (lhr.categories.seo?.score ?? 0) * 100,
    },
    lcp: lhr.audits['largest-contentful-paint']?.numericValue ?? Infinity,
    cls: lhr.audits['cumulative-layout-shift']?.numericValue ?? Infinity,
    finalUrl: lhr.finalUrl ?? url,
  }
}

function violations(m: Measurement): string[] {
  const out: string[] = []
  for (const [cat, threshold] of Object.entries(THRESHOLDS)) {
    const score = m.scores[cat] ?? 0
    if (score < threshold) out.push(`${cat} score ${score.toFixed(0)} < threshold ${threshold}`)
  }
  if (m.lcp > CWV.lcp) out.push(`LCP ${m.lcp.toFixed(0)}ms > threshold ${CWV.lcp}ms`)
  if (m.cls > CWV.cls) out.push(`CLS ${m.cls.toFixed(3)} > threshold ${CWV.cls}`)
  return out
}

const allResults: Record<string, unknown>[] = []
const failures: string[] = []

for (const url of URLS) {
  console.log(`\nRunning Lighthouse: ${url}`)

  const m = await measure(url)
  if (!m) {
    failures.push(`${url}: Lighthouse returned no LHR`)
    continue
  }

  console.log(
    `  performance=${m.scores.performance?.toFixed(0)}, accessibility=${m.scores.accessibility?.toFixed(0)}, best-practices=${m.scores['best-practices']?.toFixed(0)}, seo=${m.scores.seo?.toFixed(0)}`,
  )
  console.log(`  CWV:  LCP=${m.lcp.toFixed(0)}ms, CLS=${m.cls.toFixed(3)}`)

  allResults.push({ url, scores: m.scores, cwv: { lcp: m.lcp, cls: m.cls }, lhr: m.finalUrl })

  for (const v of violations(m)) failures.push(`${url}: ${v}`)
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
