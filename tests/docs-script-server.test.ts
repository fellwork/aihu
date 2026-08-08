// @vitest-environment node
/**
 * CodeQL alerts 63/64 — `js/path-injection` (severity: error) on
 * `apps/docs/scripts/shots.ts`.
 *
 * `shots.ts` opens a real HTTP server over the built `dist/` so Playwright can
 * screenshot it, and the original handler built a filesystem path out of
 * `req.url`. It did carry a `join()` + `startsWith(DIST)` guard, and that guard
 * held against every traversal probe below — but it filtered a tainted path
 * rather than removing the flow, and the same file bound `::` (every
 * interface), so the filter was the only thing between the network and the
 * disk. `apps/docs/scripts/dist-index.ts` replaced it with an allowlist: a
 * request supplies a map key, never a path.
 *
 * These assertions pin that property. A regression that reintroduces
 * `join(root, <request-derived>)` fails here before CodeQL ever sees it.
 */
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { indexDir, resolveFromIndex } from '../apps/docs/scripts/dist-index.ts'

const ROOT = join(tmpdir(), `aihu-dist-index-${process.pid}-${Date.now()}`)
const DIST = join(ROOT, 'dist')
const OUTSIDE = join(ROOT, 'outside.html')
let files: Map<string, string>

beforeAll(async () => {
  mkdirSync(join(DIST, 'guides'), { recursive: true })
  mkdirSync(join(DIST, 'assets'), { recursive: true })
  writeFileSync(join(DIST, 'index.html'), 'home')
  writeFileSync(join(DIST, 'guides', 'index.html'), 'guides')
  writeFileSync(join(DIST, 'guides', 'getting-started.html'), 'gs')
  writeFileSync(join(DIST, 'assets', 'app.css'), 'css')
  // Two things that must stay unreachable: a sibling of dist/, and a symlink
  // planted INSIDE dist/ that points at it.
  writeFileSync(join(ROOT, '.env'), 'SECRET=hunter2')
  writeFileSync(OUTSIDE, 'PWNED')
  symlinkSync(join(ROOT, '.env'), join(DIST, 'escape.html'))
  files = await indexDir(DIST)
})

afterAll(() => rmSync(ROOT, { recursive: true, force: true }))

describe('indexDir', () => {
  it('indexes every regular file under the root, keyed by posix-relative path', () => {
    expect([...files.keys()].sort()).toEqual([
      'assets/app.css',
      'guides/getting-started.html',
      'guides/index.html',
      'index.html',
    ])
  })

  it('skips symlinks rather than following them out of the root', () => {
    expect(files.has('escape.html')).toBe(false)
  })

  it('can only ever yield paths inside the root', () => {
    for (const abs of files.values()) expect(abs.startsWith(DIST + sep)).toBe(true)
  })
})

describe('resolveFromIndex — static-host resolution', () => {
  it.each([
    ['/', 'index.html'],
    ['/guides', 'guides/index.html'],
    ['/guides/', 'guides/index.html'],
    ['/guides/getting-started', 'guides/getting-started.html'],
    ['/assets/app.css', 'assets/app.css'],
    ['/assets/app.css?v=abc123', 'assets/app.css'],
  ])('serves %s', (url, key) => {
    expect(resolveFromIndex(files, url)).toBe(files.get(key))
  })
})

describe('resolveFromIndex — path traversal (CodeQL js/path-injection)', () => {
  it.each([
    '/../.env',
    '/../outside.html',
    '/../../etc/passwd',
    '/%2e%2e/.env', // encoded ..
    '/..%2f.env', // encoded separator
    '/%2e%2e%2f%2e%2e%2f.env',
    '/....//.env', // strip-once probe
    '/./../.env',
    '//etc/passwd',
    '///etc/passwd',
    '/etc/passwd',
    '/escape.html', // the planted symlink
    '/index.html%00.png', // null byte
    '/guides/../../.env',
  ])('refuses %s', (url) => {
    expect(resolveFromIndex(files, url)).toBeNull()
  })

  it('never returns a path outside the root, for any input', () => {
    const probes = ['/../.env', '/..%2f.env', '/etc/passwd', '/index.html', '/guides']
    for (const url of probes) {
      const hit = resolveFromIndex(files, url)
      if (hit !== null) expect(hit.startsWith(DIST + sep)).toBe(true)
    }
  })
})

describe('resolveFromIndex — malformed input must not throw', () => {
  // `decodeURIComponent('%')` throws URIError. Inline in shots.ts's `async`
  // handler that rejected an un-awaited promise, and node's default
  // unhandled-rejection mode exits the process (verified: exit code 1) — so
  // `GET /%` killed the screenshot run from anywhere on the network.
  it.each(['/%', '/%zz', '/%e0%a4%a', '/a%'])('returns null for %s', (url) => {
    expect(() => resolveFromIndex(files, url)).not.toThrow()
    expect(resolveFromIndex(files, url)).toBeNull()
  })
})
