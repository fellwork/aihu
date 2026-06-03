/**
 * Deterministic static file server for the docs e2e + Lighthouse harness (#314).
 *
 * Replaces `wrangler pages dev` in the CI test path. `wrangler` would not start
 * reliably on CI runners: its compatibility-date drifts past the bundled
 * workerd's max supported date, and `bunx wrangler` cold-downloads ~246 packages
 * per run — both blow Playwright's `webServer` readiness timeout, leaving the
 * docs e2e + the Lighthouse perf gate dark.
 *
 * Fidelity: the page-navigation e2e (homepage/layout/mobile/navigation/playground)
 * and Lighthouse only need the prerendered pages + SPA fallback — exactly what
 * Cloudflare Pages ASSETS serves. `prerender.spec.ts` drives the built
 * `dist/_worker.js` in-process (it imports it + stubs ASSETS), so it needs no
 * running server. No e2e hits a live worker endpoint, so serving dist/ statically
 * is byte-for-byte faithful for the harness while being fast + deterministic
 * (which also removes workerd startup variance from the perf measurement).
 *
 * Routing mirrors CF Pages ASSETS:
 *   1. exact file            (/style.css            → dist/style.css)
 *   2. directory index       (/introduction         → dist/introduction/index.html)
 *   3. .html sibling         (/foo                  → dist/foo.html)
 *   4. SPA fallback          (unmatched, e.g. /docs/introduction → dist/index.html)
 *
 * Usage: bun scripts/serve-dist.ts [port] [distDir]
 *   PORT / DIST_DIR env vars take precedence over positional args.
 */

import { existsSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'

const PORT = Number(process.env.PORT ?? process.argv[2] ?? 8788)
const DIST = process.env.DIST_DIR ?? process.argv[3] ?? join(import.meta.dir, '..', 'dist')

if (!existsSync(DIST)) {
  console.error(`serve-dist: dist not found at ${DIST}. Run 'bun run build' in apps/docs first.`)
  process.exit(1)
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  // MUST be application/wasm — the playground loads the compiler via
  // WebAssembly.instantiateStreaming (wasm-bindgen init), which rejects any
  // other Content-Type. Omitting this silently breaks the playground e2e.
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
}

/** Resolve a request path to a real file under DIST, or null (→ SPA fallback). */
function resolveFile(pathname: string): string | null {
  const decoded = decodeURIComponent(pathname)
  for (const candidate of [decoded, `${decoded}/index.html`, `${decoded}.html`]) {
    const fp = join(DIST, normalize(`/${candidate}`))
    if (!fp.startsWith(DIST)) continue // path-traversal guard
    if (existsSync(fp) && statSync(fp).isFile()) return fp
  }
  return null
}

const SPA_SHELL = join(DIST, 'index.html')

Bun.serve({
  port: PORT,
  async fetch(req) {
    const { pathname } = new URL(req.url)
    const fp = resolveFile(pathname)
    if (fp) {
      return new Response(Bun.file(fp), {
        headers: { 'content-type': MIME[extname(fp)] ?? 'application/octet-stream' },
      })
    }
    // CF Pages ASSETS only SPA-falls-back EXTENSIONLESS navigation routes. A
    // missing path WITH a file extension (e.g. /robots.txt, /x.js) is a 404, NOT
    // the SPA shell — returning HTML for /robots.txt fails Lighthouse's SEO
    // "robots.txt is valid" audit (docks the SEO score below the 95 gate).
    if (extname(pathname)) {
      return new Response('Not Found', {
        status: 404,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      })
    }
    return new Response(Bun.file(SPA_SHELL), {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  },
})

console.log(`docs static server ready: http://localhost:${PORT}  (dist=${DIST})`)
