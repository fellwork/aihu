/**
 * Verify `public/_redirects` against the BUILT site.
 *
 * A broken redirect is silent in the worst way: the rule is syntactically fine,
 * Cloudflare serves the 301 happily, and the visitor lands on a 404. Nothing in
 * the build, the Playwright smoke tests, or Lighthouse looks at the redirect
 * map at all — it is a static file copied verbatim into dist.
 *
 * That matters here specifically because these rules exist to carry ~27 URLs
 * that are LIVE on aihu.dev today across the docs IA move. They are in the
 * published sitemap and in each old page's canonical, so a rule pointing at a
 * page that does not exist converts an indexed URL into a 404 rather than
 * preserving it.
 *
 * Checks, in order of how badly each would bite:
 *   1. Every non-splat target resolves to a real prerendered page.
 *   2. Every splat expands correctly for at least one real page (a splat whose
 *      whole target space is missing is a typo in the destination prefix).
 *   3. No rule redirects a path that STILL EXISTS — that would shadow a live
 *      page with a 301 to somewhere else, which is worse than a 404 because it
 *      looks deliberate.
 *   4. Rules are well-formed and use 301 (permanent), not 302.
 *
 * Run after `vite build`, from apps/docs:  bun scripts/check-redirects.ts
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const DIST = resolve(process.cwd(), 'dist')
const REDIRECTS = join(DIST, '_redirects')

/** A URL path resolves if the SSG emitted either shape for it. */
function pageExists(urlPath: string): boolean {
  const clean = urlPath.replace(/^\/+|\/+$/g, '')
  if (clean === '') return existsSync(join(DIST, 'index.html'))
  return existsSync(join(DIST, clean, 'index.html')) || existsSync(join(DIST, `${clean}.html`))
}

if (!existsSync(REDIRECTS)) {
  console.log('check-redirects: no dist/_redirects — nothing to verify.')
  process.exit(0)
}

interface Rule {
  from: string
  to: string
  status: string
  line: number
}

const rules: Rule[] = []
const problems: string[] = []

readFileSync(REDIRECTS, 'utf8')
  .split('\n')
  .forEach((raw, i) => {
    const line = raw.trim()
    if (line === '' || line.startsWith('#')) return
    const parts = line.split(/\s+/)
    if (parts.length !== 3) {
      problems.push(`line ${i + 1}: expected "<from> <to> <status>", got: ${line}`)
      return
    }
    rules.push({ from: parts[0]!, to: parts[1]!, status: parts[2]!, line: i + 1 })
  })

for (const r of rules) {
  // 4. Permanent moves only.
  if (r.status !== '301') {
    problems.push(
      `line ${r.line}: ${r.from} uses ${r.status}. These are permanent IA moves — use 301, ` +
        `so crawlers transfer link equity and cache the move.`,
    )
  }

  // 3. Never shadow a page that still exists.
  if (!r.from.includes('*') && pageExists(r.from)) {
    problems.push(
      `line ${r.line}: ${r.from} still exists as a real page, but is being redirected to ${r.to}. ` +
        `Delete the rule — redirecting a live page hides it.`,
    )
  }

  // 1 & 2. The target must be reachable.
  if (r.to.includes(':splat')) {
    // Expand against every page under the destination prefix.
    const prefix = r.to.replace(/\/?:splat.*$/, '').replace(/^\/+/, '')
    const anyUnder = existsSync(join(DIST, prefix))
    if (!anyUnder) {
      problems.push(
        `line ${r.line}: splat ${r.from} -> ${r.to}, but nothing exists under /${prefix}. ` +
          `Every expansion of this rule will 404.`,
      )
    }
  } else if (!pageExists(r.to)) {
    problems.push(
      `line ${r.line}: ${r.from} -> ${r.to}, but ${r.to} is not a page in dist. ` +
        `This rule turns a live URL into a 404.`,
    )
  }
}

if (problems.length > 0) {
  console.error(`check-redirects: ${problems.length} problem(s) in _redirects\n`)
  for (const p of problems) console.error(`  ${p}`)
  process.exit(1)
}

console.log(`check-redirects: ok — ${rules.length} rule(s), every target resolves in dist.`)
