/**
 * Test fixture for `scripts/check-use-registry-parity.ts`.
 *
 * A `@aihu/use` composable has six touch points (src dir, barrel, package.json
 * exports, rolldown input, .size-limit.json row, USE_COMPOSABLES tuple). These
 * cases lock the bidirectional parity rule: a composable dir missing any
 * manifest entry is an error, and a manifest entry with no backing dir (a
 * ghost row) is also an error — plus the REGISTRY_EXEMPT opt-out.
 */
import { describe, expect, it } from 'vitest'
import {
  checkParity,
  type ParitySources,
  parseBarrelExports,
  parsePackageJsonExports,
  parseRolldownInputs,
  parseSizeLimitRows,
  parseUseRegistryRs,
  REGISTRY_EXEMPT,
} from '../scripts/check-use-registry-parity.ts'

/** A minimal, internally-consistent two-composable universe for fixtures. */
function baseSources(): ParitySources {
  return {
    dirs: new Set(['useCounter', 'useToggle']),
    barrel: new Set(['useCounter', 'useToggle']),
    pkgExports: new Set(['useCounter', 'useToggle']),
    rolldownInputs: new Set(['useCounter', 'useToggle']),
    sizeRows: new Set(['useCounter', 'useToggle']),
    registry: new Set(['useCounter', 'useToggle']),
  }
}

describe('check-use-registry-parity', () => {
  it('passes the all-present green path', () => {
    const result = checkParity(baseSources())
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('flags a name missing from the barrel only', () => {
    const sources = baseSources()
    sources.barrel = new Set(['useCounter'])
    const result = checkParity(sources)
    expect(result.ok).toBe(false)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain("'useToggle'")
    expect(result.errors[0]).toContain('barrel export')
  })

  it('flags a name missing from package.json exports only', () => {
    const sources = baseSources()
    sources.pkgExports = new Set(['useCounter'])
    const result = checkParity(sources)
    expect(result.ok).toBe(false)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain("'useToggle'")
    expect(result.errors[0]).toContain('package.json exports key')
  })

  it('flags a name missing from the rolldown input only', () => {
    const sources = baseSources()
    sources.rolldownInputs = new Set(['useCounter'])
    const result = checkParity(sources)
    expect(result.ok).toBe(false)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain("'useToggle'")
    expect(result.errors[0]).toContain('rolldown input')
  })

  it('flags a name missing from .size-limit.json only', () => {
    const sources = baseSources()
    sources.sizeRows = new Set(['useCounter'])
    const result = checkParity(sources)
    expect(result.ok).toBe(false)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain("'useToggle'")
    expect(result.errors[0]).toContain('.size-limit.json row')
  })

  it('flags a name missing from USE_COMPOSABLES only', () => {
    const sources = baseSources()
    sources.registry = new Set(['useCounter'])
    const result = checkParity(sources)
    expect(result.ok).toBe(false)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain("'useToggle'")
    expect(result.errors[0]).toContain('USE_COMPOSABLES')
  })

  it('flags a registry tuple with no backing src/ directory (a ghost row)', () => {
    const sources = baseSources()
    sources.dirs = new Set(['useCounter', 'useToggle'])
    sources.registry = new Set(['useCounter', 'useToggle', 'ghostComposable'])
    const result = checkParity(sources)
    expect(result.ok).toBe(false)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain("'ghostComposable'")
    expect(result.errors[0]).toContain('directory')
  })

  it('does not flag an EXEMPT-listed name missing from the registry', () => {
    REGISTRY_EXEMPT.add('watch')
    try {
      const sources = baseSources()
      sources.dirs.add('watch')
      sources.barrel.add('watch')
      sources.pkgExports.add('watch')
      sources.rolldownInputs.add('watch')
      sources.sizeRows.add('watch')
      // Deliberately NOT added to sources.registry.
      const result = checkParity(sources)
      expect(result.ok).toBe(true)
      expect(result.errors).toEqual([])
    } finally {
      REGISTRY_EXEMPT.delete('watch')
    }
  })

  it('reports every missing source when a name is dir-only', () => {
    const sources = baseSources()
    sources.dirs.add('useOrphan')
    const result = checkParity(sources)
    expect(result.ok).toBe(false)
    const err = result.errors.find((e) => e.includes('useOrphan'))
    expect(err).toBeDefined()
    expect(err).toContain('barrel export')
    expect(err).toContain('package.json exports key')
    expect(err).toContain('rolldown input')
    expect(err).toContain('.size-limit.json row')
    expect(err).toContain('USE_COMPOSABLES')
  })

  describe('parsers', () => {
    it('parseBarrelExports pulls composable names, excludes shared', () => {
      const src = [
        "export type { MaybeGetter } from './shared/index.ts'",
        "export { isClient } from './shared/index.ts'",
        "export type { UseCounterOptions, UseCounterReturn } from './useCounter/index.ts'",
        "export { useCounter } from './useCounter/index.ts'",
        "export { useToggle } from './useToggle/index.ts'",
      ].join('\n')
      expect(parseBarrelExports(src)).toEqual(new Set(['useCounter', 'useToggle']))
    })

    it('parsePackageJsonExports excludes "." and "./shared"', () => {
      const pkg = {
        exports: {
          '.': { types: 'x', import: 'y' },
          './shared': { types: 'x', import: 'y' },
          './useCounter': { types: 'x', import: 'y' },
          './useToggle': { types: 'x', import: 'y' },
        },
      }
      expect(parsePackageJsonExports(pkg)).toEqual(new Set(['useCounter', 'useToggle']))
    })

    it('parseRolldownInputs excludes index and shared', () => {
      const src = [
        'export default defineConfig({',
        '  input: {',
        "    index: 'src/index.ts',",
        "    shared: 'src/shared/index.ts',",
        "    useCounter: 'src/useCounter/index.ts',",
        "    useToggle: 'src/useToggle/index.ts',",
        '  },',
        '})',
      ].join('\n')
      expect(parseRolldownInputs(src)).toEqual(new Set(['useCounter', 'useToggle']))
    })

    it('parseSizeLimitRows filters to @aihu/use/* rows, excludes shared', () => {
      const rows = [
        { name: '@aihu/signals' },
        { name: '@aihu/use/shared' },
        { name: '@aihu/use/useCounter' },
        { name: '@aihu/use/useToggle' },
        { name: '@aihu/auth' },
      ]
      expect(parseSizeLimitRows(rows)).toEqual(new Set(['useCounter', 'useToggle']))
    })

    it('parseUseRegistryRs pulls the subpath name out of each tuple', () => {
      const src = [
        'pub(crate) const USE_COMPOSABLES: &[(&str, &str)] = &[',
        '    ("useCounter", "@aihu/use/useCounter"),',
        '    ("useToggle", "@aihu/use/useToggle"),',
        '];',
      ].join('\n')
      expect(parseUseRegistryRs(src)).toEqual(new Set(['useCounter', 'useToggle']))
    })

    it('parseUseRegistryRs does NOT count a commented-out tuple as registered', () => {
      const src = [
        'pub(crate) const USE_COMPOSABLES: &[(&str, &str)] = &[',
        '    ("useCounter", "@aihu/use/useCounter"),',
        '    // ("useToggle", "@aihu/use/useToggle"), // temporarily disabled',
        '];',
      ].join('\n')
      expect(parseUseRegistryRs(src)).toEqual(new Set(['useCounter']))
    })

    it('parseUseRegistryRs ignores a tuple inside a block comment', () => {
      const src = [
        'pub(crate) const USE_COMPOSABLES: &[(&str, &str)] = &[',
        '    ("useCounter", "@aihu/use/useCounter"),',
        '    /* ("useToggle", "@aihu/use/useToggle"), */',
        '];',
      ].join('\n')
      expect(parseUseRegistryRs(src)).toEqual(new Set(['useCounter']))
    })
  })
})

// NOTE: deliberately no "against the real tree" test here reading the live
// packages/use/src + manifests (unlike this file's synthetic-fixture tests
// above, which is the established pattern — see check-size-rows.test.ts /
// check-compiler-binary-bump.test.ts, both synthesized-data only). A
// hardcoded composable count pinned against the live filesystem would be
// exactly one landing (or one sibling in-flight branch) away from a stale,
// unrelated CI failure. `bun run check:use-registry-parity` IS the real-tree
// check — run it directly (wired into check:ci and plan-a.yml) rather than
// re-deriving it inside a unit test.
