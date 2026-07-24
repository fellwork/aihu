#!/usr/bin/env bun
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { gzipSync } from 'node:zlib'
/**
 * Bundle size checker — uses rolldown instead of size-limit + esbuild.
 *
 * Reads .size-limit.json, bundles each entry via rolldown's in-memory
 * generate() API (no disk write), gzip-compresses the output, and
 * compares against the declared limit. Exits 1 if any entry exceeds its
 * limit.
 *
 * Peer deps from each package's package.json are automatically treated
 * as external; the "ignore" field in .size-limit.json adds extra externals
 * (e.g. workspace deps that are dependencies rather than peerDependencies).
 */
import { rolldown } from 'rolldown'

interface Entry {
  name: string
  path: string
  limit: string
  gzip?: boolean
  ignore?: string[]
}

function parseBytes(limit: string): number {
  const m = limit.trim().match(/^(\d+(?:\.\d+)?)\s*(B|kB|KB)$/)
  if (!m) throw new Error(`Cannot parse limit "${limit}"`)
  return m[2] === 'B' ? parseFloat(m[1]) : parseFloat(m[1]) * 1024
}

function fmtBytes(n: number): string {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(2)} kB`
}

/**
 * Walk UP from `entryPath`'s directory to find the nearest `package.json`
 * (stopping at `dist/`'s parent, i.e. the package root) — NOT a fixed
 * `dirname(entryPath)/../package.json` hop. A single-level-up join resolves
 * correctly for a flat entry (`packages/use/dist/useMouse.js` ->
 * `packages/use/dist/../package.json` = `packages/use/package.json`, right)
 * but silently breaks for a NESTED family entry
 * (`packages/use/dist/math/useClamp.js` -> `packages/use/dist/package.json`,
 * which does not exist) — peers then fail to externalize and a devDependency
 * peer (e.g. `jwt-decode`) gets INLINED into the measurement instead of
 * excluded, which can blow the row's limit for the wrong reason. This same
 * bug silently affects the existing `@aihu/css-engine/runtime/*` rows today.
 */
async function peerDepsOf(entryPath: string): Promise<string[]> {
  let dir = dirname(entryPath)
  for (let i = 0; i < 6; i++) {
    const pkgPath = join(dir, 'package.json')
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(await Bun.file(pkgPath).text())
        return Object.keys(pkg.peerDependencies ?? {})
      } catch {
        return []
      }
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return []
}

const entries: Entry[] = JSON.parse(await Bun.file('.size-limit.json').text())
let allPass = true
const PAD = Math.max(...entries.map((e) => e.name.length))

console.log('\n  Package size report\n')

for (const entry of entries) {
  const peerDeps = await peerDepsOf(entry.path)
  const external = [...new Set([...(entry.ignore ?? []), ...peerDeps])]

  const bundle = await rolldown({
    input: entry.path,
    external,
    platform: 'browser',
  })

  const { output } = await bundle.generate({ format: 'esm', minify: true })
  await bundle.close()

  const chunk = output.find((c) => c.type === 'chunk')
  const code = chunk && 'code' in chunk ? chunk.code : ''
  const raw = Buffer.from(code)
  const bytes = entry.gzip !== false ? gzipSync(raw).length : raw.length

  const limitBytes = parseBytes(entry.limit)
  const headroom = limitBytes - bytes
  const pass = headroom >= 0
  if (!pass) allPass = false

  const flag = pass ? '✓' : '✗'
  const bar = pass
    ? `${fmtBytes(bytes).padStart(8)} / ${entry.limit.padStart(7)}  (+${headroom} B headroom)`
    : `${fmtBytes(bytes).padStart(8)} / ${entry.limit.padStart(7)}  (${Math.abs(headroom)} B OVER LIMIT)`

  console.log(`  ${flag} ${entry.name.padEnd(PAD)}  ${bar}`)
}

console.log('')

if (!allPass) {
  console.error('  One or more packages exceed their size limit.\n')
  process.exit(1)
}
