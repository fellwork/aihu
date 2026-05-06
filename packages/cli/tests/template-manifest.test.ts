import { describe, expect, it } from 'vitest'
import { type TemplateManifest, validateManifest } from '../src/template-manifest.ts'

function validManifestObj(): Record<string, unknown> {
  return {
    name: '@aihu/templates-cf-team',
    displayName: 'Cloudflare · team-ready',
    description: 'CF Workers + monorepo',
    contractVersion: 1,
    cliRange: '^0.2.0',
    fixed: {
      vendor: 'cloudflare',
      persona: 'team',
    },
    overridable: {
      starter: { choices: ['live-counter', 'empty'], default: 'live-counter' },
      initGit: { choices: [true, false], default: true },
    },
    conditionalFiles: [
      { path: 'src/components/live-counter.aihu', when: 'starter === "live-counter"' },
    ],
    placeholders: ['APP_NAME', 'APP_VERSION'],
    postInstall: [
      { kind: 'pm-install' },
      { kind: 'git-init', when: 'initGit' },
      { kind: 'lint-fix', allowFailure: true },
    ],
    appPeerDeps: {
      '@aihu/runtime': '^1.0.0',
    },
    appPeerDepsConditional: {
      'better-auth': { version: '^1.0.0', when: 'auth === "better-auth"' },
    },
  }
}

describe('validateManifest — happy path', () => {
  it('accepts a fully-formed manifest', () => {
    const m: TemplateManifest = validateManifest(validManifestObj())
    expect(m.name).toBe('@aihu/templates-cf-team')
    expect(m.contractVersion).toBe(1)
    expect(m.fixed.vendor).toBe('cloudflare')
    expect(m.overridable.starter?.default).toBe('live-counter')
    expect(m.placeholders).toEqual(['APP_NAME', 'APP_VERSION'])
    expect(m.postInstall).toHaveLength(3)
    expect(m.postInstall[1]?.when).toBe('initGit')
    expect(m.postInstall[2]?.allowFailure).toBe(true)
    expect(m.appPeerDeps['@aihu/runtime']).toBe('^1.0.0')
    expect(m.appPeerDepsConditional?.['better-auth']?.version).toBe('^1.0.0')
  })

  it('omits appPeerDepsConditional when not present', () => {
    const obj = validManifestObj()
    delete obj.appPeerDepsConditional
    const m = validateManifest(obj)
    expect(m.appPeerDepsConditional).toBeUndefined()
  })
})

describe('validateManifest — rejection paths', () => {
  it('throws on non-object input', () => {
    expect(() => validateManifest(null)).toThrow(/must be an object/)
    expect(() => validateManifest('foo')).toThrow(/must be an object/)
    expect(() => validateManifest(42)).toThrow(/must be an object/)
  })

  it('throws on missing name', () => {
    const obj = validManifestObj()
    delete obj.name
    expect(() => validateManifest(obj)).toThrow(/name/)
  })

  it('throws on non-finite contractVersion', () => {
    const obj = validManifestObj()
    obj.contractVersion = Number.NaN
    expect(() => validateManifest(obj)).toThrow(/contractVersion/)
  })

  it('throws when overridable.default is not in choices', () => {
    const obj = validManifestObj()
    ;(obj.overridable as Record<string, unknown>).starter = {
      choices: ['live-counter', 'empty'],
      default: 'unknown',
    }
    expect(() => validateManifest(obj)).toThrow(/default must appear in/)
  })

  it('throws when overridable choices is empty', () => {
    const obj = validManifestObj()
    ;(obj.overridable as Record<string, unknown>).starter = {
      choices: [],
      default: 'live-counter',
    }
    expect(() => validateManifest(obj)).toThrow(/non-empty array/)
  })

  it('throws when conditionalFiles is not an array', () => {
    const obj = validManifestObj()
    obj.conditionalFiles = 'not-array'
    expect(() => validateManifest(obj)).toThrow(/conditionalFiles/)
  })

  it('throws on conditionalFiles entry missing when', () => {
    const obj = validManifestObj()
    obj.conditionalFiles = [{ path: 'x' }]
    expect(() => validateManifest(obj)).toThrow(/when/)
  })

  it('throws on unknown postInstall kind', () => {
    const obj = validManifestObj()
    obj.postInstall = [{ kind: 'rocket-launch' }]
    expect(() => validateManifest(obj)).toThrow(/kind must be one of/)
  })

  it('throws when fixed has a non-scalar value', () => {
    const obj = validManifestObj()
    ;(obj.fixed as Record<string, unknown>).repo = { nested: true }
    expect(() => validateManifest(obj)).toThrow(/fixed\.repo/)
  })

  it('throws when appPeerDeps has a non-string value', () => {
    const obj = validManifestObj()
    ;(obj.appPeerDeps as Record<string, unknown>)['@aihu/runtime'] = 1
    expect(() => validateManifest(obj)).toThrow(/appPeerDeps/)
  })

  it('throws on appPeerDepsConditional missing version', () => {
    const obj = validManifestObj()
    obj.appPeerDepsConditional = { 'better-auth': { when: 'x' } }
    expect(() => validateManifest(obj)).toThrow(/version/)
  })
})
