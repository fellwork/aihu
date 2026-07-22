/**
 * Envelope differential-identity test — the JS-side byte-identity gate.
 *
 * For a representative fixture set (each/if/on:click, @state wrappers,
 * server-elided agent macros, @route pages, @style), the envelope backends
 * MUST produce output byte-identical to the legacy per-output spawn:
 *
 *   1. CLI `--envelope` spawn vs legacy single-target spawn — per target.
 *   2. napi addon `compileEnvelope` vs legacy spawn — per target (runs when
 *      the locally-built addon is present; skips otherwise so a fresh clone
 *      without a Rust build stays green).
 *   3. `transform()` / `compileToAst()` / `compileRouteMeta()` routed through
 *      the ACTIVE backend vs direct legacy spawns.
 *   4. Envelope sibling seeding: one `transform()` seeds the memo so the
 *      following `compileToAst()` + `compileRouteMeta()` calls perform ZERO
 *      additional compiles (asserted via memo stats).
 *
 * Requires a real `aihu-compile` binary (workspace `target/release`). The
 * suite runner exports AIHU_COMPILE_BIN; this test manages
 * those vars itself to select backends deliberately.
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import {
  _clearTransformMemo,
  _resetCompileBackend,
  _resetCompilerNative,
  _resolveCompileBackend,
  _transformMemoStats,
  compileRouteMeta,
  compileToAst,
  transform,
} from '../js/index.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '../../..')
const BIN = resolve(REPO_ROOT, 'target/release/aihu-compile')
const ADDON = resolve(REPO_ROOT, 'packages/compiler/src-native/aihu-compiler-native.node')

const hasBin = existsSync(BIN)
const hasAddon = existsSync(ADDON)

const FIXTURES: Array<{ id: string; source: string }> = [
  {
    id: '/app/src/components/counter.aihu',
    source: `
@state {
  let items = state(['alpha', 'beta'])
  let open = state(false)

  const toggle = action(() => { open = !open })
}

@template {
  <div class="wrap">
    <button on:click={toggle}>toggle</button>
    <ul if={open}>
      <li each={item of items} key={item}>{item}</li>
    </ul>
  </div>
}
`,
  },
  {
    id: '/app/src/components/FancyWidget.aihu',
    source: `
@state {
  let count = state(0)

  const doubled = derived(() => count * 2)
  const bump = action(() => { count = count + 1 })
}

@template {
  <div>
    <span>{doubled()}</span>
    <button on:click={bump}>+</button>
  </div>
}
`,
  },
  {
    id: '/app/src/components/agent-card.aihu',
    source: `
@state {
  let count = state(0)

  const increment = action(
    { describe: 'Add 1 to the counter', expose: 'read write' },
    () => { count = count + 1 })
}

@template {
  <div>{count}</div>
}
`,
  },
  {
    id: '/app/src/pages/index.aihu',
    source: `
@route {
  path: "/",
  name: "home-page"
}

@template {
  <main>
    <h1>Home</h1>
  </main>
}
`,
  },
  {
    id: '/app/src/components/styled-box.aihu',
    source: `
@style {
  .box { color: rebeccapurple; }
}

@template {
  <div class="box">styled</div>
}
`,
  },
]

const TARGETS = ['universal', 'client', 'server'] as const

/** The exact legacy per-output spawn (pre-envelope behavior). */
function legacySpawn(source: string, args: string[]): string {
  return execFileSync(BIN, args, { input: source, encoding: 'utf8' })
}

function legacyTransform(source: string, id: string, target?: string): string {
  const stem = basename(id, '.aihu')
  // Mirror transform()'s O1a stem normalization for PascalCase stems.
  const kebab = stem
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
  const tag = /^[A-Z]/.test(stem) && !kebab.includes('-') ? stem : kebab
  const args = ['--stdin', '--tag', tag, '--path', id]
  if (target) args.push('--target', target)
  return legacySpawn(source, args)
}

const ENV_KEYS = ['AIHU_COMPILE_BIN', 'AIHU_COMPILER_NATIVE'] as const
const savedEnv: Record<string, string | undefined> = {}
for (const k of ENV_KEYS) savedEnv[k] = process.env[k]

function resetBackends(): void {
  _clearTransformMemo()
  _resetCompilerNative()
  _resetCompileBackend()
}

afterAll(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
  resetBackends()
})

describe.skipIf(!hasBin)('envelope CLI spawn vs legacy spawn (byte identity)', () => {
  it('--envelope js output is byte-identical per fixture per target', () => {
    for (const { id, source } of FIXTURES) {
      const stem = basename(id, '.aihu')
      for (const target of TARGETS) {
        const legacy = legacyTransform(source, id, target === 'universal' ? undefined : target)
        const optionsJson = JSON.stringify({ path: id, targets: [target], emits: ['js'] })
        const out = legacySpawn(source, [
          '--stdin',
          '--tag',
          stem,
          '--path',
          id,
          '--envelope',
          optionsJson,
        ])
        const envelope = JSON.parse(out) as {
          envelope: number
          targets: Record<string, { js?: string }>
        }
        expect(envelope.envelope).toBe(1)
        expect(envelope.targets[target]?.js, `${id} @ ${target}`).toBe(legacy)
      }
    }
  })

  it('--envelope ast/route match --ast-json/--route-json', () => {
    for (const { id, source } of FIXTURES) {
      const stem = basename(id, '.aihu')
      const legacyAst = legacySpawn(source, ['--stdin', '--tag', stem, '--ast-json', '--path', id])
      const legacyRoute = legacySpawn(source, [
        '--stdin',
        '--tag',
        stem,
        '--route-json',
        '--path',
        id,
      ])
      const out = legacySpawn(source, [
        '--stdin',
        '--tag',
        stem,
        '--path',
        id,
        '--envelope',
        JSON.stringify({ path: id, emits: ['ast', 'route'] }),
      ])
      const envelope = JSON.parse(out) as { astJson?: string; routeJson?: string }
      expect(JSON.parse(envelope.astJson ?? '')).toEqual(JSON.parse(legacyAst))
      const legacyRouteTrim = legacyRoute.trim()
      if (legacyRouteTrim === 'null') {
        expect(envelope.routeJson).toBeUndefined()
      } else {
        expect(envelope.routeJson).toBe(legacyRouteTrim)
      }
    }
  })
})

describe.skipIf(!hasBin || !hasAddon)('napi addon vs legacy spawn (byte identity)', () => {
  beforeEach(() => {
    // Select the native backend explicitly: no binary pins, addon path pinned.
    delete process.env.AIHU_COMPILE_BIN
    delete process.env.AIHU_COMPILER_NATIVE
    process.env.AIHU_COMPILER_NATIVE_ADDON = ADDON
    resetBackends()
  })

  afterAll(() => {
    delete process.env.AIHU_COMPILER_NATIVE_ADDON
    resetBackends()
  })

  it('backend resolves to native', () => {
    expect(_resolveCompileBackend().kind).toBe('native')
  })

  it('transform() through the addon is byte-identical to the legacy spawn', () => {
    for (const { id, source } of FIXTURES) {
      for (const target of TARGETS) {
        _clearTransformMemo()
        const viaAddon = transform(source, id, target === 'universal' ? undefined : { target }).code
        const legacy = legacyTransform(source, id, target === 'universal' ? undefined : target)
        expect(viaAddon, `${id} @ ${target}`).toBe(legacy)
      }
    }
  })

  it('compileToAst()/compileRouteMeta() through the addon match legacy spawns', () => {
    for (const { id, source } of FIXTURES) {
      _clearTransformMemo()
      const stem = basename(id, '.aihu')
      const ast = compileToAst(source, id)
      expect(ast).toEqual(
        JSON.parse(legacySpawn(source, ['--stdin', '--tag', stem, '--ast-json', '--path', id])),
      )
      const route = compileRouteMeta(source, id)
      const legacyRoute = legacySpawn(source, [
        '--stdin',
        '--tag',
        stem,
        '--route-json',
        '--path',
        id,
      ]).trim()
      if (legacyRoute === 'null') expect(route).toBeNull()
      else expect(route).toEqual(JSON.parse(legacyRoute))
    }
  })

  it('one transform() seeds ast+route — sibling calls are pure cache hits', () => {
    const { id, source } = FIXTURES[3]!
    _clearTransformMemo()
    transform(source, id)
    const afterTransform = _transformMemoStats()
    expect(afterTransform.misses).toBe(1)
    expect(afterTransform.seeds).toBe(2)
    const ast = compileToAst(source, id)
    const route = compileRouteMeta(source, id)
    const after = _transformMemoStats()
    expect(after.misses).toBe(1) // no additional compiles
    expect(after.hits).toBe(2)
    expect(ast.tag).toBe('home-page')
    expect(route).toMatchObject({ pattern: '/', name: 'home-page' })
  })
})

describe.skipIf(!hasBin)('spawn backend seeding (envelope CLI as fallback)', () => {
  beforeEach(() => {
    // Pin the fresh CLI binary → spawn backend, envelope-capable.
    process.env.AIHU_COMPILE_BIN = BIN
    delete process.env.AIHU_COMPILER_NATIVE
    delete process.env.AIHU_COMPILER_NATIVE_ADDON
    resetBackends()
  })

  it('backend resolves to spawn under a binary pin', () => {
    expect(_resolveCompileBackend().kind).toBe('spawn')
  })

  it('transform() output matches legacy; siblings seeded from ONE spawn', () => {
    const { id, source } = FIXTURES[0]!
    const viaEnvelope = transform(source, id).code
    expect(viaEnvelope).toBe(legacyTransform(source, id))
    const stats = _transformMemoStats()
    expect(stats.misses).toBe(1)
    expect(stats.seeds).toBe(2)
    compileToAst(source, id)
    compileRouteMeta(source, id)
    expect(_transformMemoStats().misses).toBe(1)
  })
})
