/**
 * Transform memo cache — spawn-dedup tests.
 *
 * Every `.aihu` compile spawns the `aihu-compile` binary (~6ms, ~63% pure
 * spawn overhead), and the SSG prerender re-runs every transform a SECOND
 * time with identical inputs (packages/app/src/prerender.ts boots a second
 * Vite server that reuses the resolved plugin instances). The memo cache
 * (js/transform-memo.ts) keys on hash(source) + id + options fingerprint +
 * binary identity, so pass-two lookups skip the spawn entirely.
 *
 * Coverage:
 *   1. Identical source + id + options compiled twice → ONE spawn, second
 *      call is a cache hit with byte-identical output.
 *   2. Changed source → recompiles (content-addressed key).
 *   3. Different options (target / tag) → distinct cache entries.
 *   4. `sidecarOut` bypasses the memo (the spawn has a file-write side
 *      effect a hit would silently skip).
 *   5. `compileToAst` / `compileRouteMeta` memoise the same way; parsed
 *      results are fresh objects per call (no shared-mutable AST).
 *   6. FIFO size bound — the cache never exceeds `_MEMO_MAX_ENTRIES`.
 *   7. Plugin-level: two identical `aihuCompilerPlugin().transform` runs
 *      spawn the main compile exactly once.
 *
 * The binary is FAKED via a `node:child_process` module mock (deterministic
 * stdout derived from args + stdin), so these tests are hermetic — no native
 * `aihu-compile` build required — and spawn counts are exact.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  const execFileSync = vi.fn(
    (_file: string, args: readonly string[], opts: { input: string }): string => {
      if (args.includes('--ast-json')) {
        return JSON.stringify({
          tag: 'fake-tag',
          astVersion: 1,
          style: null,
          template: [{ kind: 'text', value: opts.input }],
          meta: { name: 'fake-tag' },
        })
      }
      if (args.includes('--route-json')) {
        return JSON.stringify({ pattern: '/', name: 'fake-route' })
      }
      const tag = args[args.indexOf('--tag') + 1]
      const target = args.includes('--target') ? args[args.indexOf('--target') + 1] : 'universal'
      return `// compiled tag=${tag} target=${target}\n// src=${JSON.stringify(opts.input)}\n`
    },
  )
  // Builtin-module interop: vite-node routes `import { execFileSync }` in the
  // module under test through the DEFAULT export, so the fake must live on
  // both the namespace and `default`.
  return { ...actual, execFileSync, default: { ...actual, execFileSync } }
})

import { execFileSync } from 'node:child_process'
import {
  _clearTransformMemo,
  _MEMO_MAX_ENTRIES,
  _transformMemoStats,
  aihuCompilerPlugin,
  compileRouteMeta,
  compileToAst,
  transform,
} from '../js/index.ts'

const spawnSpy = vi.mocked(execFileSync)

/** Spawn-count for the MAIN compile (excludes --ast-json / --route-json passes). */
function mainCompileSpawns(): number {
  return spawnSpy.mock.calls.filter((c) => {
    const args = c[1] as readonly string[]
    return !args.includes('--ast-json') && !args.includes('--route-json')
  }).length
}

const PREV_BIN = process.env.AIHU_COMPILE_BIN

beforeEach(() => {
  _clearTransformMemo()
  spawnSpy.mockClear()
  // Point resolution at a fake path — the mocked execFileSync never touches
  // disk, and the memo's binary stamp degrades gracefully to path-only.
  process.env.AIHU_COMPILE_BIN = '/fake/bin/aihu-compile'
})

afterAll(() => {
  if (PREV_BIN === undefined) delete process.env.AIHU_COMPILE_BIN
  else process.env.AIHU_COMPILE_BIN = PREV_BIN
})

const SRC_A = '@template {\n  <div>alpha</div>\n}\n'
const SRC_B = '@template {\n  <div>beta</div>\n}\n'

describe('transform() memo', () => {
  it('identical source + id + options → one spawn, identical output (#1)', () => {
    const first = transform(SRC_A, '/app/src/Widget.aihu')
    const second = transform(SRC_A, '/app/src/Widget.aihu')
    expect(second.code).toBe(first.code)
    expect(spawnSpy).toHaveBeenCalledTimes(1)
    expect(_transformMemoStats()).toMatchObject({ hits: 1, misses: 1 })
  })

  it('changed source → recompiles (#2)', () => {
    const first = transform(SRC_A, '/app/src/Widget.aihu')
    const second = transform(SRC_B, '/app/src/Widget.aihu')
    expect(second.code).not.toBe(first.code)
    expect(spawnSpy).toHaveBeenCalledTimes(2)
    expect(_transformMemoStats()).toMatchObject({ hits: 0, misses: 2 })
  })

  it('different options → distinct entries; each re-hit individually (#3)', () => {
    transform(SRC_A, '/app/src/Widget.aihu', { target: 'client' })
    transform(SRC_A, '/app/src/Widget.aihu', { target: 'server' })
    transform(SRC_A, '/app/src/Widget.aihu', { tag: 'custom-tag' })
    expect(spawnSpy).toHaveBeenCalledTimes(3)
    // Re-running every variant hits its own entry — no new spawns.
    const c1 = transform(SRC_A, '/app/src/Widget.aihu', { target: 'client' })
    const c2 = transform(SRC_A, '/app/src/Widget.aihu', { target: 'server' })
    transform(SRC_A, '/app/src/Widget.aihu', { tag: 'custom-tag' })
    expect(spawnSpy).toHaveBeenCalledTimes(3)
    expect(c1.code).toContain('target=client')
    expect(c2.code).toContain('target=server')
    expect(_transformMemoStats()).toMatchObject({ hits: 3, misses: 3 })
  })

  it('different id → distinct entries', () => {
    transform(SRC_A, '/app/src/Widget.aihu')
    transform(SRC_A, '/app/src/Other.aihu')
    expect(spawnSpy).toHaveBeenCalledTimes(2)
  })

  it('sidecarOut bypasses the memo — the spawn writes a file (#4)', () => {
    transform(SRC_A, '/app/src/Widget.aihu', { sidecarOut: '/tmp/w.aihu.ts' })
    transform(SRC_A, '/app/src/Widget.aihu', { sidecarOut: '/tmp/w.aihu.ts' })
    expect(spawnSpy).toHaveBeenCalledTimes(2)
    expect(_transformMemoStats()).toMatchObject({ size: 0 })
  })
})

describe('compileToAst() / compileRouteMeta() memo (#5)', () => {
  it('compileToAst — one spawn, fresh object per call', () => {
    const first = compileToAst(SRC_A, '/app/src/Widget.aihu')
    const second = compileToAst(SRC_A, '/app/src/Widget.aihu')
    expect(spawnSpy).toHaveBeenCalledTimes(1)
    expect(second).toEqual(first)
    // Re-parsed per call — a caller mutating one AST cannot poison the cache.
    expect(second).not.toBe(first)
  })

  it('compileToAst — changed source respawns', () => {
    compileToAst(SRC_A, '/app/src/Widget.aihu')
    compileToAst(SRC_B, '/app/src/Widget.aihu')
    expect(spawnSpy).toHaveBeenCalledTimes(2)
  })

  it('compileRouteMeta — one spawn, equal result', () => {
    const first = compileRouteMeta(SRC_A, '/app/src/pages/index.aihu')
    const second = compileRouteMeta(SRC_A, '/app/src/pages/index.aihu')
    expect(spawnSpy).toHaveBeenCalledTimes(1)
    expect(second).toEqual(first)
    expect(first).toMatchObject({ name: 'fake-route' })
  })

  it('kind is part of the key — transform vs ast vs route never alias', () => {
    transform(SRC_A, '/app/src/Widget.aihu')
    compileToAst(SRC_A, '/app/src/Widget.aihu')
    compileRouteMeta(SRC_A, '/app/src/Widget.aihu')
    expect(spawnSpy).toHaveBeenCalledTimes(3)
  })
})

describe('size bound (#6)', () => {
  it(`FIFO eviction keeps the cache at most ${_MEMO_MAX_ENTRIES} entries`, () => {
    for (let i = 0; i < _MEMO_MAX_ENTRIES + 8; i++) {
      transform(`@template { <div>${i}</div> }`, '/app/src/Widget.aihu')
    }
    expect(_transformMemoStats().size).toBe(_MEMO_MAX_ENTRIES)
    // The OLDEST entry was evicted → recompiles; the NEWEST still hits.
    transform(`@template { <div>${_MEMO_MAX_ENTRIES + 7}</div> }`, '/app/src/Widget.aihu')
    expect(_transformMemoStats().hits).toBe(1)
  })
})

describe('plugin-level dedup (#7 — the SSG pass-two shape)', () => {
  it('two identical plugin.transform runs spawn the main compile once', async () => {
    const plugin = aihuCompilerPlugin()
    type TransformFn = (
      this: unknown,
      code: string,
      id: string,
    ) => Promise<{ code: string; map: null } | null | undefined>
    const t = plugin.transform as unknown as TransformFn
    const first = await t.call({}, SRC_A, '/app/src/Widget.aihu')
    const second = await t.call({}, SRC_A, '/app/src/Widget.aihu')
    expect(first).not.toBeNull()
    expect(second?.code).toBe(first?.code)
    expect(mainCompileSpawns()).toBe(1)
  })
})
