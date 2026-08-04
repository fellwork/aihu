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
 * Compression: CF Pages serves brotli to any client that sends `br` in
 * Accept-Encoding (every real browser, including the Chrome Lighthouse
 * drives), so this server does too — otherwise the Lighthouse gate measures
 * a payload the production CDN never actually serves. Confirmed this is not
 * cosmetic: a docs-next page that scored 99 on the live CDN preview scored
 * only 90 through this server BEFORE compression was added here, entirely on
 * the "uses-text-compression" + render-blocking-CSS audits — same build,
 * same thresholds, ~130 KiB of avoidable difference. Compressing on the fly
 * (rather than pre-compressing dist/) is fine at this scale: the harness
 * serves a handful of requests per Lighthouse run, not production traffic.
 *
 * Usage: bun scripts/serve-dist.ts [port] [distDir]
 *   PORT / DIST_DIR env vars take precedence over positional args.
 */

import { existsSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { brotliCompressSync, constants as zlibConstants } from 'node:zlib'

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

// Extensions worth compressing — text formats only. Images/fonts/wasm are
// already-compressed binary formats where brotli either does nothing or
// makes things worse, and `.wasm` additionally MUST keep its exact
// Content-Type for WebAssembly.instantiateStreaming (see the MIME table note).
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt', '.xml'])

/** Brotli-compress `body` if the client advertises `br` support and the
 * extension is worth it; otherwise return the original body untouched. */
function maybeCompress(
  body: Buffer | Uint8Array,
  ext: string,
  acceptEncoding: string,
): { body: Buffer | Uint8Array; encoding: string | null } {
  if (!COMPRESSIBLE.has(ext) || !acceptEncoding.includes('br')) return { body, encoding: null }
  const compressed = brotliCompressSync(body, {
    params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5 }, // fast enough for per-request use
  })
  return { body: compressed, encoding: 'br' }
}

function respond(fileBody: Buffer | Uint8Array, contentType: string, ext: string, req: Request) {
  const { body, encoding } = maybeCompress(
    fileBody,
    ext,
    req.headers.get('accept-encoding') ?? '',
  )
  const headers: Record<string, string> = { 'content-type': contentType, vary: 'accept-encoding' }
  if (encoding) headers['content-encoding'] = encoding
  return new Response(body, { headers })
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const { pathname } = new URL(req.url)
    const fp = resolveFile(pathname)
    if (fp) {
      const ext = extname(fp)
      const bytes = await Bun.file(fp).bytes()
      return respond(bytes, MIME[ext] ?? 'application/octet-stream', ext, req)
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
    const shellBytes = await Bun.file(SPA_SHELL).bytes()
    return respond(shellBytes, 'text/html; charset=utf-8', '.html', req)
  },
})

console.log(`docs static server ready: http://localhost:${PORT}  (dist=${DIST})`)
