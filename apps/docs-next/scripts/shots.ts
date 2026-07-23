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

const ROOT = new URL('..', import.meta.url).pathname
const DIST = join(ROOT, 'dist')
const OUT = join(ROOT, '.design-review')
const PORT = 5199

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.png': 'image/png',
}

function resolveFile(urlPath: string): string | null {
  let p = decodeURIComponent(urlPath.split('?')[0] ?? '')
  if (p.endsWith('/')) p = p.slice(0, -1)
  const candidates = [join(DIST, p), join(DIST, p, 'index.html'), join(DIST, `${p}.html`)]
  for (const c of candidates) {
    if (existsSync(c) && extname(c)) return c
  }
  if (p === '' || p === '/') return join(DIST, 'index.html')
  return null
}

const server = createServer(async (req, res) => {
  const file = resolveFile(req.url ?? '/')
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
  await mkdir(OUT, { recursive: true })
  await new Promise<void>((r) => server.listen(PORT, r))
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
        await page.goto(`http://localhost:${PORT}${pg.path}`, {
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
