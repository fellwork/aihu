/**
 * criticalPath — unit tests over a synthetic rolldown bundle.
 *
 * The cases here are the two real regressions the plugin exists to catch,
 * reduced to their graph shape:
 *   - an island module sitting directly in the entry chunk (side-effect import)
 *   - a heavy module in its OWN chunk that the entry nonetheless *statically*
 *     imports (the `typescript`/CJS-interop shape) — the case a naive
 *     "look at the entry chunk's modules" check misses entirely
 * plus the negative case that keeps the plugin honest: the same heavy module
 * reached only through a DYNAMIC import must not be reported.
 */
import { describe, expect, it, vi } from 'vitest'
import { criticalPath } from '../src/critical-path.ts'

type Ctx = {
  error: (msg: string) => never
  warn: (msg: string) => void
  getModuleInfo: (id: string) => { importers: string[] } | null
  environment?: { name: string }
}

interface FakeChunk {
  type: 'chunk'
  isEntry: boolean
  fileName: string
  code: string
  imports: string[]
  dynamicImports: string[]
  modules: Record<string, unknown>
}

function chunk(p: Partial<FakeChunk> & { fileName: string }): FakeChunk {
  return {
    type: 'chunk',
    isEntry: false,
    code: '',
    imports: [],
    dynamicImports: [],
    modules: {},
    ...p,
  }
}

/** Run the plugin's generateBundle over a synthetic bundle; capture its report. */
function run(
  bundle: Record<string, FakeChunk>,
  opts: Parameters<typeof criticalPath>[0],
  importers: Record<string, string[]> = {},
): { failed: string | null; warned: string | null } {
  const plugin = criticalPath(opts)
  let failed: string | null = null
  let warned: string | null = null
  const ctx: Ctx = {
    error: ((msg: string) => {
      failed = msg
      throw new Error('halt')
    }) as Ctx['error'],
    warn: (msg: string) => {
      warned = msg
    },
    getModuleInfo: (id) => (importers[id] ? { importers: importers[id] as string[] } : null),
  }
  const hook = plugin.generateBundle as unknown as (this: Ctx, o: unknown, b: unknown) => void
  try {
    hook.call(ctx, {}, bundle)
  } catch (e) {
    if ((e as Error).message !== 'halt') throw e
  }
  return { failed, warned }
}

const ISLAND = '/app/src/components/counter-demo.aihu'
const TS = '/app/node_modules/typescript/lib/typescript.js'
const DENY = [
  { pattern: /\/src\/components\/.*\.aihu$/, reason: 'islands must load per-route' },
  { pattern: /node_modules\/typescript\//, reason: 'the TS compiler must stay lazy' },
]

describe('criticalPath', () => {
  it('flags a denied module sitting in the entry chunk, naming its importer', () => {
    const { failed } = run(
      { 'entry.js': chunk({ fileName: 'entry.js', isEntry: true, modules: { [ISLAND]: {} } }) },
      { deny: DENY },
      { [ISLAND]: ['/app/src/main.ts'] },
    )
    expect(failed).toContain(ISLAND)
    expect(failed).toContain('islands must load per-route')
    // The importer is the part that makes the failure actionable.
    expect(failed).toContain('/app/src/main.ts')
  })

  // The `typescript` regression: the module was NOT in the entry chunk. It was
  // in its own chunk that the entry statically imported (for CJS interop
  // helpers). Checking only `entryChunk.modules` would report a clean build.
  it('follows STATIC imports into other chunks (the case a naive check misses)', () => {
    const { failed } = run(
      {
        'entry.js': chunk({ fileName: 'entry.js', isEntry: true, imports: ['ts.js'] }),
        'ts.js': chunk({ fileName: 'ts.js', modules: { [TS]: {} } }),
      },
      { deny: DENY },
    )
    expect(failed).toContain(TS)
    expect(failed).toContain('in chunk: ts.js')
  })

  it('does NOT follow dynamic imports — a lazy chunk is the desired outcome', () => {
    const { failed, warned } = run(
      {
        'entry.js': chunk({ fileName: 'entry.js', isEntry: true, dynamicImports: ['ts.js'] }),
        'ts.js': chunk({ fileName: 'ts.js', modules: { [TS]: {} } }),
      },
      { deny: DENY },
    )
    expect(failed).toBeNull()
    expect(warned).toBeNull()
  })

  it('enforces a gzipped byte budget over the whole critical path', () => {
    // Highly compressible, but still far over a 10-byte budget.
    const big = chunk({ fileName: 'entry.js', isEntry: true, code: 'x'.repeat(100_000) })
    const { failed } = run({ 'entry.js': big }, { maxBytes: 10 })
    expect(failed).toContain('over budget')
  })

  it('warnOnly reports without failing the build', () => {
    const { failed, warned } = run(
      { 'entry.js': chunk({ fileName: 'entry.js', isEntry: true, modules: { [ISLAND]: {} } }) },
      { deny: DENY, warnOnly: true },
    )
    expect(failed).toBeNull()
    expect(warned).toContain(ISLAND)
  })

  it('is silent on a clean build', () => {
    const { failed, warned } = run(
      { 'entry.js': chunk({ fileName: 'entry.js', isEntry: true, modules: { '/app/ok.ts': {} } }) },
      { deny: DENY, maxBytes: 1_000_000 },
    )
    expect(failed).toBeNull()
    expect(warned).toBeNull()
  })

  it('skips the SSR/prerender pass, which has no browser critical path', () => {
    const plugin = criticalPath({ deny: DENY })
    const error = vi.fn()
    const hook = plugin.generateBundle as unknown as (this: Ctx, o: unknown, b: unknown) => void
    hook.call(
      {
        error: error as unknown as Ctx['error'],
        warn: () => {},
        getModuleInfo: () => null,
        environment: { name: 'ssr' },
      },
      {},
      { 'entry.js': chunk({ fileName: 'entry.js', isEntry: true, modules: { [ISLAND]: {} } }) },
    )
    expect(error).not.toHaveBeenCalled()
  })
})
