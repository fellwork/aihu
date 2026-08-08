/**
 * The TypeScript-strip stage of the Vite plugin: which transform is chosen,
 * what a failure does, and what the chosen transform actually emits.
 *
 * ── Why this file exists ────────────────────────────────────────────────────
 *
 * The strip used to prefer `transformWithEsbuild` on the CLIENT build and only
 * reach for `transformWithOxc` in a server environment. Vite 8 made esbuild an
 * OPTIONAL PEER while still *exporting* `transformWithEsbuild`, so the old
 * `typeof … === 'function'` guard stayed true and the call threw
 *
 *     Failed to load `transformWithEsbuild`. It is deprecated and it now
 *     requires esbuild to be installed separately. … migrate to
 *     `transformWithOxc` instead.
 *
 * A single swallowing `catch` around the whole chain turned that into
 * un-stripped TypeScript, which the bundler then rejected two hundred lines of
 * build output later as an unrelated `PARSE_ERROR` on the user's `.aihu` file.
 * Every output mode (`spa`, `static`, `ssr`) runs a client build, so a fresh
 * consumer install at `vite: ^8` could not build at all.
 *
 * Three things are locked down here, and they are three separate risks:
 *
 *  1. BRANCH SELECTION — oxc is preferred wherever it exists, in EVERY
 *     environment; esbuild is the vite-6/5 fallback; `moduleType: 'ts'` is the
 *     last resort. Driven through fake Vite modules so the whole matrix runs
 *     without installing four Vite versions.
 *  2. LOUDNESS — a strip failure with Vite present throws, naming the branch
 *     and the underlying error. Only "there is no Vite here at all" is allowed
 *     to hand the TypeScript back untouched.
 *  3. EMITTED OUTPUT — preferring oxc on vite 8 is an APPROVED behaviour
 *     change, not a refactor. oxc and esbuild disagree on class-field and enum
 *     lowering, so both forms are pinned side by side. If either moves, this
 *     test goes red and the diff shows exactly what a consumer's build output
 *     will do differently.
 */

import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  _errMessage,
  _isViteMissing,
  _stripTypes,
  aihuCompilerPlugin,
  type ViteStripApi,
} from '../js/index.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ext = process.platform === 'win32' ? '.exe' : ''
const HAVE_COMPILER =
  existsSync(resolve(__dirname, `../bin/aihu-compile${ext}`)) ||
  existsSync(resolve(__dirname, `../../../target/release/aihu-compile${ext}`)) ||
  existsSync(resolve(__dirname, `../../../target/debug/aihu-compile${ext}`))

/** Collapse indentation so the pins survive a change in nesting depth. */
function normalize(code: string): string {
  return code
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '')
    .join('\n')
}

const oxcOnly = (calls: string[]): ViteStripApi => ({
  version: '8.0.0-fake',
  transformWithOxc: async (code: string) => {
    calls.push('oxc')
    return { code: `/*oxc*/${code}` }
  },
})

const esbuildOnly = (calls: string[]): ViteStripApi => ({
  version: '6.0.0-fake',
  transformWithEsbuild: async (code: string) => {
    calls.push('esbuild')
    return { code: `/*esbuild*/${code}` }
  },
})

const both = (calls: string[]): ViteStripApi => ({
  ...oxcOnly(calls),
  ...esbuildOnly(calls),
  version: '8.0.0-fake',
})

// ── 1. Branch selection ─────────────────────────────────────────────────────

describe('_stripTypes — branch selection', () => {
  it('prefers transformWithOxc when BOTH transforms exist (the vite 8 fix)', async () => {
    const calls: string[] = []
    const res = await _stripTypes(both(calls), 'let a: number = 1', '/x/a.aihu', false)
    expect(calls).toEqual(['oxc'])
    expect(res.code).toBe('/*oxc*/let a: number = 1')
    expect(res.moduleType).toBeUndefined()
  })

  it('prefers transformWithOxc on the CLIENT environment, not only the server one', async () => {
    // The whole bug: this used to be gated on `isServerEnv`, so the client
    // build — which every output mode runs — took the esbuild branch and threw
    // on a vite 8 install that has no esbuild.
    const clientCalls: string[] = []
    await _stripTypes(both(clientCalls), 'let a: number = 1', '/x/a.aihu', false)
    const serverCalls: string[] = []
    await _stripTypes(both(serverCalls), 'let a: number = 1', '/x/a.aihu', true)
    expect(clientCalls).toEqual(serverCalls)
    expect(clientCalls).toEqual(['oxc'])
  })

  it('falls back to transformWithEsbuild when oxc is absent (vite 6 and 5)', async () => {
    const calls: string[] = []
    const res = await _stripTypes(esbuildOnly(calls), 'let a: number = 1', '/x/a.aihu', false)
    expect(calls).toEqual(['esbuild'])
    expect(res.code).toBe('/*esbuild*/let a: number = 1')
  })

  it('ignores a transformWithOxc that is exported but not callable', async () => {
    // vite 6.4.3 does not export the key at all, but a Vite that exported it as
    // `undefined` must not be mistaken for one that implements it.
    const calls: string[] = []
    const api = { ...esbuildOnly(calls), transformWithOxc: undefined } as ViteStripApi
    await _stripTypes(api, 'let a: number = 1', '/x/a.aihu', false)
    expect(calls).toEqual(['esbuild'])
  })

  it("hands TS to Rolldown with moduleType 'ts' when neither transform exists", async () => {
    const res = await _stripTypes({ version: '99.0.0' }, 'let a: number = 1', '/x/a.aihu', false)
    expect(res.code).toBe('let a: number = 1')
    expect(res.moduleType).toBe('ts')
  })
})

// ── 2. Loudness ─────────────────────────────────────────────────────────────

describe('_stripTypes — a strip failure is LOUD, never silently un-stripped', () => {
  const VITE_8_ESBUILD_ERROR =
    'Failed to load `transformWithEsbuild`. It is deprecated and it now requires ' +
    'esbuild to be installed separately. If you are a package author, please ' +
    'migrate to `transformWithOxc` instead.'

  it('throws — naming branch, version, environment, file and cause — when oxc throws', async () => {
    const api: ViteStripApi = {
      version: '8.2.1',
      transformWithOxc: async () => {
        throw new Error('oxc exploded')
      },
    }
    await expect(_stripTypes(api, 'let a: number = 1', '/x/a.aihu', true)).rejects.toThrow(
      /transformWithOxc/,
    )
    const err = await _stripTypes(api, 'let a: number = 1', '/x/a.aihu', true).catch((e) => e)
    expect(err.message).toContain('/x/a.aihu')
    expect(err.message).toContain('8.2.1')
    expect(err.message).toContain('server environment')
    expect(err.message).toContain('oxc exploded')
    expect((err as Error).cause).toBeInstanceOf(Error)
  })

  it('throws when esbuild throws — the exact vite 8 "install esbuild separately" case', async () => {
    // Pre-fix this returned `{ code: <un-stripped TS> }` and the build died
    // later with `[PARSE_ERROR] Expected a semicolon` on the .aihu file.
    const api: ViteStripApi = {
      version: '8.2.1',
      transformWithEsbuild: async () => {
        throw new Error(VITE_8_ESBUILD_ERROR)
      },
    }
    const err = await _stripTypes(api, 'let a: number = 1', '/x/a.aihu', false).catch((e) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toContain('transformWithEsbuild')
    expect(err.message).toContain('client environment')
    expect(err.message).toContain('requires esbuild to be installed separately')
    // The point of the change: it does NOT come back as un-stripped source.
    expect(err.message).not.toBe('let a: number = 1')
  })

  it('the thrown message explains why it is fatal rather than swallowed', async () => {
    const api: ViteStripApi = {
      version: '8.2.1',
      transformWithOxc: async () => {
        throw new Error('boom')
      },
    }
    const err = await _stripTypes(api, 'x', '/x/a.aihu', false).catch((e) => e)
    expect(err.message).toContain('PARSE_ERROR')
  })
})

// ── "no vite at all" vs "vite present, strip failed" ────────────────────────

describe('_isViteMissing — the ONE case allowed to return code un-stripped', () => {
  it('accepts the Node shape for an absent vite', () => {
    const err = Object.assign(
      new Error("Cannot find package 'vite' imported from /app/node_modules/@aihu/compiler/dist/"),
      { code: 'ERR_MODULE_NOT_FOUND' },
    )
    expect(_isViteMissing(err)).toBe(true)
  })

  it('accepts the Bun shape for an absent vite', () => {
    const err = Object.assign(new Error("Cannot find package 'vite' from '/app/index.js'"), {
      code: 'ERR_MODULE_NOT_FOUND',
    })
    expect(_isViteMissing(err)).toBe(true)
  })

  it('accepts the CJS shape', () => {
    const err = Object.assign(new Error("Cannot find module 'vite'"), { code: 'MODULE_NOT_FOUND' })
    expect(_isViteMissing(err)).toBe(true)
  })

  it('REJECTS a resolution failure for something other than vite', () => {
    // Vite is installed but one of its own dependencies is not. Vite IS here,
    // a strip IS expected, and swallowing this would be the same silent
    // corruption the loud path exists to prevent.
    const err = Object.assign(
      new Error("Cannot find package 'esbuild' from '/app/vite/index.js'"),
      {
        code: 'ERR_MODULE_NOT_FOUND',
      },
    )
    expect(_isViteMissing(err)).toBe(false)
  })

  it('REJECTS a non-resolution error, however it is worded', () => {
    expect(_isViteMissing(new Error('vite blew up during config load'))).toBe(false)
    expect(_isViteMissing(new TypeError('vite is not a function'))).toBe(false)
    expect(_isViteMissing(undefined)).toBe(false)
    expect(_isViteMissing('vite')).toBe(false)
  })

  it('does not mistake a PATH containing "vite" for the vite specifier', () => {
    const err = Object.assign(
      new Error("Cannot find package 'left-pad' imported from /home/dev/vite-app/index.js"),
      { code: 'ERR_MODULE_NOT_FOUND' },
    )
    expect(_isViteMissing(err)).toBe(false)
  })
})

describe('_errMessage', () => {
  it('reads Error, string and unknown throw values', () => {
    expect(_errMessage(new Error('a'))).toBe('a')
    expect(_errMessage('b')).toBe('b')
    expect(_errMessage({ message: 'c' })).toBe('c')
    expect(_errMessage(42)).toBe('42')
  })
})

// ── 3. Pinned emitted output ────────────────────────────────────────────────

/**
 * The three constructs the plan named, in one `@state` block: a class with a
 * class field, an enum, and an `import type` (plus the `as` cast that depends
 * on it).
 */
const PINNED_SFC = `@state {
  import type { Reading } from './reading.ts'

  enum Level { Low, High }

  class Meter {
    private reading: number = 1
    label = 'm'
    scale(by: number): number { return this.reading * by }
  }

  const [n, setN] = signal(0)
  const meter = new Meter()
  const level: Level = Level.High
  const value = meter.scale(2)
  const r = { n: 1 } as Reading
}

@template {
  <p>{value} {level} {n}</p>
}
`

async function emit(sfc: string, id: string): Promise<string> {
  const plugin = aihuCompilerPlugin() as unknown as {
    transform: (this: unknown, code: string, id: string) => Promise<{ code: string }>
  }
  const res = await plugin.transform.call({}, sfc, id)
  return res.code
}

describe.skipIf(!HAVE_COMPILER)(
  'emitted output — pinned TS lowering (approved oxc semantics)',
  () => {
    it('lowers a class field with DEFINE semantics, not a constructor assignment', async () => {
      const code = normalize(await emit(PINNED_SFC, '/pin/aihu-meter.aihu'))
      // oxc == `useDefineForClassFields: true` (the modern-TS default).
      expect(code).toContain(
        normalize(`
      class Meter {
        reading = 1;
        label = "m";
        scale(by) {
          return this.reading * by;
        }
      }`),
      )
      // esbuild == `useDefineForClassFields: false`, which is what shipped
      // before. Recorded here so the approved change is visible, and asserted
      // ABSENT so a silent revert to the esbuild branch fails this test.
      expect(code).not.toContain(normalize('constructor() {\nthis.reading = 1;'))
    })

    it('lowers an enum to the oxc IIFE shape and does NOT constant-inline member reads', async () => {
      const code = normalize(await emit(PINNED_SFC, '/pin/aihu-meter.aihu'))
      expect(code).toContain(
        normalize(`
      let Level = /* @__PURE__ */ function(Level) {
        Level[Level["Low"] = 0] = "Low";
        Level[Level["High"] = 1] = "High";
        return Level;
      }({});`),
      )
      // oxc keeps the member read; esbuild folded it to `1 /* High */`.
      expect(code).toContain('const level = Level.High;')
      expect(code).not.toContain('/* High */')
    })

    it('erases `import type` and the `as` cast that depends on it', async () => {
      const code = await emit(PINNED_SFC, '/pin/aihu-meter.aihu')
      expect(code).not.toContain('import type')
      expect(code).not.toContain('Reading')
      expect(normalize(code)).toContain('const r = { n: 1 };')
    })

    it('strips the injected HMR declaration that used to reach the bundler as TS', async () => {
      const code = normalize(await emit(PINNED_SFC, '/pin/aihu-meter.aihu'))
      // `let __aihu_setup__: ((ctx: any) => any) | undefined` is the literal line
      // the fresh-`^8` `[PARSE_ERROR]` pointed at.
      expect(code).toContain('let __aihu_setup__;')
      expect(code).not.toContain('__aihu_setup__:')
    })
  },
)

// ── The oxc/esbuild difference, measured live and side by side ──────────────

const DIFFERENTIAL_SOURCE = `enum Level { Low, High }
class Meter {
  private reading: number = 1
  label = 'm'
  scale(by: number): number { return this.reading * by }
}
const level: Level = Level.High
const r = { n: 1 } as { n: number }
`

const vite = await import('vite')
/**
 * vite 8 exports `transformWithEsbuild` but it only WORKS if esbuild happens to
 * be resolvable — which is exactly the asymmetry this whole change is about. So
 * probe it rather than assume it.
 *
 * Measured, and worth knowing: inside vitest in THIS repo the probe is false.
 * Vite 8.0.16 is hoisted at the root with no `node_modules/esbuild`; a plain
 * `node`/`bun` process still resolves esbuild through vite's own realpath in
 * bun's store, but vitest's module runner does not, so the deprecated wrapper
 * throws here. Which means every plugin `transform()` run under vitest was, pre
 * -fix, silently returning UN-STRIPPED TypeScript through the swallowing catch
 * — the same corruption a fresh `vite: ^8` consumer install hit at build time.
 * The esbuild half of this differential is therefore expected to skip in-repo;
 * its counterpart contract is enforced by the `not.toContain` assertions in the
 * oxc pins above, which fail if the esbuild branch is ever taken again.
 */
const ESBUILD_CALLABLE = await (async () => {
  if (typeof vite.transformWithEsbuild !== 'function') return false
  try {
    await vite.transformWithEsbuild('let a: number = 1', 'p.ts', { target: 'esnext' })
    return true
  } catch {
    return false
  }
})()

describe('oxc vs esbuild — the approved semantics change, measured', () => {
  it.skipIf(typeof vite.transformWithOxc !== 'function')(
    'oxc output is pinned exactly',
    async () => {
      const res = await _stripTypes(
        { version: vite.version, transformWithOxc: vite.transformWithOxc },
        DIFFERENTIAL_SOURCE,
        '/pin/differential.aihu',
        false,
      )
      expect(normalize(res.code)).toBe(
        normalize(`
        var Level = /* @__PURE__ */ function(Level) {
          Level[Level["Low"] = 0] = "Low";
          Level[Level["High"] = 1] = "High";
          return Level;
        }(Level || {});
        class Meter {
          reading = 1;
          label = "m";
          scale(by) {
            return this.reading * by;
          }
        }
        const level = Level.High;
        const r = { n: 1 };`),
      )
    },
  )

  it.skipIf(!ESBUILD_CALLABLE)(
    'esbuild output is pinned exactly — this is what vite 6 still emits, and what vite 8 used to',
    async () => {
      const res = await _stripTypes(
        { version: vite.version, transformWithEsbuild: vite.transformWithEsbuild },
        DIFFERENTIAL_SOURCE,
        '/pin/differential.aihu',
        false,
      )
      expect(normalize(res.code)).toBe(
        normalize(`
        var Level = /* @__PURE__ */ ((Level2) => {
          Level2[Level2["Low"] = 0] = "Low";
          Level2[Level2["High"] = 1] = "High";
          return Level2;
        })(Level || {});
        class Meter {
          constructor() {
            this.reading = 1;
            this.label = "m";
          }
          scale(by) {
            return this.reading * by;
          }
        }
        const level = 1 /* High */;
        const r = { n: 1 };`),
      )
    },
  )
})
