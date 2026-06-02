/**
 * Docs test/lighthouse harness — runs the REAL `src/worker.ts` fetch handler
 * over a static `dist/` ASSETS shim, replacing `wrangler pages dev`.
 *
 * Why: `wrangler pages dev` spins up `workerd`, which (a) defaults its
 * compatibility-date to "today" and fails once the calendar passes the binary's
 * max supported date, and (b) cold-downloads via `bunx` each run — both made the
 * CI Smoke-tests / Lighthouse gate flaky-fail (issue #314). This serves the same
 * content with zero workerd/compat-date/bunx dependency, and keeps full fidelity:
 * the actual worker routing (prerendered `<path>/index.html`, root fallback,
 * route handlers) is exercised, not a re-implementation.
 *
 * Config via env: DOCS_PORT (default 8788), DOCS_DIST (default ../dist).
 */
import { existsSync, statSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import worker from '../src/worker.ts'

const PORT = Number(process.env.DOCS_PORT ?? 8788)
const DIST = resolve(process.env.DOCS_DIST ?? join(import.meta.dir, '..', 'dist'))

const CONTENT_TYPE: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.map': 'application/json',
}

// Cloudflare Pages `env.ASSETS` binding shim: serve the exact file at the URL
// pathname from DIST (root → index.html), 404 when absent. worker.ts asks for
// `<path>/index.html` explicitly, so directory-index logic stays in the worker.
const ASSETS = {
  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url)
    let rel = decodeURIComponent(pathname).replace(/^\/+/, '')
    if (rel === '') rel = 'index.html'
    const file = join(DIST, rel)
    if (!file.startsWith(DIST) || !existsSync(file) || !statSync(file).isFile()) {
      return new Response('Not found', { status: 404 })
    }
    return new Response(Bun.file(file), {
      status: 200,
      headers: { 'Content-Type': CONTENT_TYPE[extname(file)] ?? 'application/octet-stream' },
    })
  },
}

Bun.serve({ port: PORT, idleTimeout: 60, fetch: (req) => worker.fetch(req, { ASSETS }) })
console.log(`[serve-docs] real worker.ts serving ${DIST} on http://localhost:${PORT}`)
