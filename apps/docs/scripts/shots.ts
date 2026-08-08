#!/usr/bin/env bun
import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
/**
 * Design-review screenshots. Serves the built `dist/` (static output, directory
 * -index resolution) and captures every representative page at desktop + mobile
 * widths in both light and dark themes. Output → `.design-review/`.
 */
import { createServer } from 'node:http'
import { extname, join } from 'node:path'
import { chromium } from '@playwright/test'
import { indexDir, resolveFromIndex } from './dist-index.ts'

const ROOT = new URL('..', import.meta.url).pathname
const DIST = join(ROOT, 'dist')
const OUT = join(ROOT, '.design-review')
const PORT = 5199
const HOST = '127.0.0.1'

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.png': 'image/png',
}

/** Everything this server will ever serve — see `./dist-index.ts`. Populated
 * once from `dist/` before the port is opened; a request only ever supplies a
 * key into it, never a path. */
const files = new Map<string, string>()

const server = createServer(async (req, res) => {
  const file = resolveFromIndex(files, req.url ?? '/')
  if (!file) {
    res.statusCode = 404
    res.end('not found')
    return
  }
  try {
    const buf = await readFile(file)
    res.setHeader('content-type', MIME[extname(file)] ?? 'application/octet-stream')
    res.end(buf)
  } catch {
    res.statusCode = 404
    res.end('not found')
  }
})

const PAGES = [
  { name: 'landing', path: '/' },
  { name: 'guide', path: '/guides/getting-started' },
  { name: 'api', path: '/api/signals' },
  { name: 'examples', path: '/examples' },
]
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 960 },
  { name: 'mobile', width: 390, height: 844 },
]
const THEMES = ['light', 'dark'] as const

async function main() {
  if (!existsSync(DIST)) {
    throw new Error(`no build output at ${DIST} — run \`bun run build\` in apps/docs first.`)
  }
  await indexDir(DIST, DIST, files)
  await mkdir(OUT, { recursive: true })
  // Loopback only. This serves an unauthenticated view of the build output and
  // has no business being reachable from the rest of the network.
  await new Promise<void>((r) => server.listen(PORT, HOST, r))
  const browser = await chromium.launch()
  const shots: string[] = []

  for (const theme of THEMES) {
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 2,
      })
      await ctx.addInitScript((t) => {
        try {
          localStorage.setItem('dn-theme', t)
        } catch {}
      }, theme)
      const page = await ctx.newPage()
      for (const pg of PAGES) {
        // `HOST`, not `localhost` — the server is bound to 127.0.0.1 and
        // `localhost` resolves to ::1 first on macOS.
        await page.goto(`http://${HOST}:${PORT}${pg.path}`, {
          waitUntil: 'networkidle',
        })
        await page.waitForTimeout(450) // let islands hydrate + fonts settle
        await page.evaluate(() => window.scrollTo(0, 0))
        const out = join(OUT, `${pg.name}-${vp.name}-${theme}.png`)
        await page.screenshot({ path: out, fullPage: true })
        shots.push(out)
        console.log('shot', out)
      }
      await ctx.close()
    }
  }

  await browser.close()
  server.close()
  console.log(`\n${shots.length} screenshots written to ${OUT}`)
}

main().catch((e) => {
  console.error(e)
  server.close()
  process.exit(1)
})
