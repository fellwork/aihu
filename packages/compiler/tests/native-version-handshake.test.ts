/**
 * §19 — the native-addon version handshake.
 *
 * `_resolveCompileBackend()` prefers an in-process napi addon over the
 * workspace `aihu-compile` binary. The addon is PUBLISHED; the binary is built
 * from source. So on any branch that changes Rust, the installed addon is stale
 * by construction (its required version isn't on npm yet, `bun install` cannot
 * fetch it) and the compiler silently emits pre-change output. The handshake
 * compares the addon's release version against the pin in
 * `packages/compiler/package.json` and refuses a mismatched addon.
 *
 * ## What these tests assert, and why it is not the obvious thing
 *
 * Asserting on the WARNING alone would pass against a stub that always warns.
 * These tests assert on WHICH BACKEND ACTUALLY RAN: the injected fake addon's
 * `compileEnvelope` returns an envelope carrying a SENTINEL string as its JS.
 * If the fake ran, the sentinel comes back out of `_compileViaBackend`. If the
 * handshake rejected it, the real CLI binary ran and the output is real
 * compiled JS with no sentinel in it.
 *
 * Counterfactual (verified by deleting the `if (!verdict.ok)` block in
 * envelope.ts and re-running): the mismatch arms FAIL, because the fake addon's
 * sentinel appears in the output.
 */
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _checkNativeAddonVersion,
  _compileViaBackend,
  _requiredNativeAddonVersion,
  _resetCompileBackend,
  _resolveCompileBackend,
} from '../js/envelope.ts'
import {
  _resetCompilerNative,
  _setCompilerNativeForTest,
  type CompilerNativeAddon,
  type CompilerNativeOrigin,
  nativePlatformDescriptor,
} from '../js/native.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '../../..')
const BIN = resolve(REPO_ROOT, 'target/release/aihu-compile')
const hasBin = existsSync(BIN)

/** Marker the fake addon stamps into its output; never present in real JS. */
const SENTINEL = '__FAKE_ADDON_SENTINEL_9f3c__'

const SOURCE = `
@template {
  <p>handshake</p>
}
`
const ID = '/app/src/components/handshake-probe.aihu'
const LEGACY_ARGS = ['--stdin', '--tag', 'handshake-probe', '--path', ID]
const OPTIONS = { path: ID, targets: ['universal'], emits: ['js' as const] }

/** A stand-in addon whose output is identifiable. */
function makeFakeAddon(compilerVersion: string | null): CompilerNativeAddon {
  const addon: CompilerNativeAddon = {
    compileEnvelope: () =>
      JSON.stringify({
        envelope: 1,
        targets: { universal: { js: `/* ${SENTINEL} */` } },
        diagnostics: [],
      }),
  }
  if (compilerVersion !== null) {
    addon.compilerVersion = () => compilerVersion
  }
  return addon
}

function injectAddon(opts: {
  compilerVersion: string | null
  packageVersion: string | null
  origin?: CompilerNativeOrigin
}): void {
  _resetCompileBackend()
  _setCompilerNativeForTest({
    kind: 'loaded',
    addon: makeFakeAddon(opts.compilerVersion),
    addonPath: '/fake/@aihu/compiler-native-test/addon.node',
    origin: opts.origin ?? 'package',
    packageVersion: opts.packageVersion,
  })
}

/** Compile through whatever backend is active and return the emitted JS. */
function compileThroughActiveBackend(): string {
  const reply = _compileViaBackend(SOURCE, LEGACY_ARGS, OPTIONS)
  if (reply.kind === 'legacy') return reply.output
  return reply.envelope.targets.universal?.js ?? ''
}

const ENV_KEYS = ['AIHU_COMPILE_BIN', 'AIHU_COMPILER_NATIVE', 'AIHU_COMPILER_NATIVE_ADDON'] as const
const savedEnv: Record<string, string | undefined> = {}
for (const k of ENV_KEYS) savedEnv[k] = process.env[k]

let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  // The handshake only runs when nothing has already forced the spawn path.
  for (const k of ENV_KEYS) delete process.env[k]
  _resetCompilerNative()
  _resetCompileBackend()
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  warnSpy.mockRestore()
})

afterAll(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
  _resetCompilerNative()
  _resetCompileBackend()
})

function warnings(): string {
  return warnSpy.mock.calls.map((c) => c.join(' ')).join('\n')
}

describe('§19 the pin the handshake compares against', () => {
  it('reads the addon version pinned for this platform from package.json', () => {
    const descriptor = nativePlatformDescriptor()
    const pin = _requiredNativeAddonVersion()
    if (descriptor === null) {
      // Unsupported platform: there is no pin, and the handshake must no-op
      // rather than block a (nonexistent) addon.
      expect(pin).toBeNull()
      return
    }
    expect(descriptor.packageName).toMatch(/^@aihu\/compiler-native-/)
    expect(pin).toMatch(/^\d+\.\d+\.\d+/)
  })
})

describe('§19 verdict — the pure check', () => {
  const expected = _requiredNativeAddonVersion()

  it.skipIf(expected === null)('a matching release version passes', () => {
    expect(
      _checkNativeAddonVersion({
        kind: 'loaded',
        addon: makeFakeAddon('aihu-compiler-native 0.1.0 (aihu-compiler crate)'),
        addonPath: '/fake/addon.node',
        origin: 'package',
        packageVersion: expected,
      }),
    ).toEqual({ ok: true })
  })

  it.skipIf(expected === null)('a wrong release version is a version-mismatch', () => {
    const verdict = _checkNativeAddonVersion({
      kind: 'loaded',
      addon: makeFakeAddon('aihu-compiler-native 0.1.0 (aihu-compiler crate)'),
      addonPath: '/fake/addon.node',
      origin: 'package',
      packageVersion: '0.0.1-not-the-pin',
    })
    expect(verdict.ok).toBe(false)
    if (verdict.ok) return
    expect(verdict.reason).toBe('version-mismatch')
    expect(verdict.expected).toBe(expected)
  })

  it.skipIf(expected === null)('a MISSING compilerVersion() is a mismatch', () => {
    const verdict = _checkNativeAddonVersion({
      kind: 'loaded',
      addon: makeFakeAddon(null),
      addonPath: '/fake/addon.node',
      // Even with the RIGHT package version — the absent method alone decides.
      origin: 'package',
      packageVersion: expected,
    })
    expect(verdict.ok).toBe(false)
    if (verdict.ok) return
    expect(verdict.reason).toBe('missing-method')
  })

  it('a locally built addon (no package manifest) is not gated', () => {
    expect(
      _checkNativeAddonVersion({
        kind: 'loaded',
        addon: makeFakeAddon('aihu-compiler-native 0.1.0 (aihu-compiler crate)'),
        addonPath: resolve(REPO_ROOT, 'packages/compiler/src-native/aihu-compiler-native.node'),
        origin: 'dev-build',
        packageVersion: null,
      }),
    ).toEqual({ ok: true })
  })
})

// The backend-identity arms need a real binary to fall back TO.
describe.skipIf(!hasBin || _requiredNativeAddonVersion() === null)(
  '§19 which backend actually ran',
  () => {
    it('(a) wrong version → the SPAWN path runs and the warning names both versions', () => {
      injectAddon({
        compilerVersion: 'aihu-compiler-native 0.1.0 (crate)',
        packageVersion: '0.1.12',
      })

      // THE load-bearing assertion, asserted FIRST so it is the one that fires:
      // the fake's sentinel must NOT appear, i.e. the real binary served this
      // compile. Deleting the handshake makes this exact line fail.
      const js = compileThroughActiveBackend()
      expect(js).not.toContain(SENTINEL)
      expect(js).toContain('handshake')
      expect(_resolveCompileBackend().kind).toBe('spawn')

      const text = warnings()
      expect(text).toContain('native addon version mismatch')
      expect(text).toContain('0.1.12')
      expect(text).toContain(_requiredNativeAddonVersion() as string)
      expect(text).toContain('spawn path')
    })

    it('(b) missing compilerVersion() → the SPAWN path runs and warns', () => {
      injectAddon({
        compilerVersion: null,
        // Right version, wrong shape: the absent method alone must reject it.
        packageVersion: _requiredNativeAddonVersion(),
      })

      const js = compileThroughActiveBackend()
      expect(js).not.toContain(SENTINEL)
      expect(js).toContain('handshake')
      expect(_resolveCompileBackend().kind).toBe('spawn')

      const text = warnings()
      expect(text).toContain('native addon version mismatch')
      expect(text).toContain('compilerVersion()')
    })

    it('(c) matching version → the NATIVE addon runs, and nothing warns', () => {
      injectAddon({
        compilerVersion: 'aihu-compiler-native 0.1.0 (aihu-compiler crate)',
        packageVersion: _requiredNativeAddonVersion(),
      })

      expect(_resolveCompileBackend().kind).toBe('native')

      // The fake's sentinel PROVES the addon served this compile — this arm is
      // what makes the suite observe the check instead of a stub that always
      // rejects.
      expect(compileThroughActiveBackend()).toContain(SENTINEL)
      expect(warnSpy).not.toHaveBeenCalled()
    })

    it('warns exactly ONCE — the verdict is cached with the backend', () => {
      injectAddon({
        compilerVersion: 'aihu-compiler-native 0.1.0 (crate)',
        packageVersion: '0.1.12',
      })
      _resolveCompileBackend()
      _resolveCompileBackend()
      compileThroughActiveBackend()
      expect(warnSpy).toHaveBeenCalledTimes(1)
    })
  },
)

describe.skipIf(_requiredNativeAddonVersion() === null)('§19 explicit addon pin fails loud', () => {
  it('AIHU_COMPILER_NATIVE_ADDON + mismatch throws instead of falling back', () => {
    process.env.AIHU_COMPILER_NATIVE_ADDON = '/fake/pinned/addon.node'
    injectAddon({
      compilerVersion: 'aihu-compiler-native 0.1.0 (crate)',
      packageVersion: '0.1.12',
      origin: 'override',
    })
    expect(() => _resolveCompileBackend()).toThrow(/native addon version mismatch/)
    expect(() => _resolveCompileBackend()).toThrow(/AIHU_COMPILER_NATIVE_ADDON/)
  })

  it('a matching explicitly-pinned addon is used, not thrown on', () => {
    process.env.AIHU_COMPILER_NATIVE_ADDON = '/fake/pinned/addon.node'
    injectAddon({
      compilerVersion: 'aihu-compiler-native 0.1.0 (crate)',
      packageVersion: _requiredNativeAddonVersion(),
      origin: 'override',
    })
    expect(_resolveCompileBackend().kind).toBe('native')
    expect(warnSpy).not.toHaveBeenCalled()
  })
})

describe('§19 the handshake does not disturb the existing escape hatches', () => {
  it('AIHU_COMPILER_NATIVE=0 short-circuits before any addon is consulted', () => {
    process.env.AIHU_COMPILER_NATIVE = '0'
    injectAddon({ compilerVersion: null, packageVersion: '0.0.0-wrong' })
    expect(_resolveCompileBackend().kind).toBe('spawn')
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it.skipIf(!hasBin)('an AIHU_COMPILE_BIN pin still wins over a MATCHING addon', () => {
    process.env.AIHU_COMPILE_BIN = BIN
    injectAddon({
      compilerVersion: 'aihu-compiler-native 0.1.0 (crate)',
      packageVersion: _requiredNativeAddonVersion(),
    })
    expect(_resolveCompileBackend().kind).toBe('spawn')
    expect(warnSpy).not.toHaveBeenCalled()
  })
})
