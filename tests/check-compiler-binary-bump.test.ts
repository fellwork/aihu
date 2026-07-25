/**
 * Test fixture for `scripts/check-compiler-binary-bump.ts`.
 *
 * The guard exists because a change to the compiler's Rust source that does not
 * bump the platform binary packages builds fine but never ships — release.yml
 * skips versions already on npm, so consumers keep loading the stale binary.
 *
 * FEL-414: the guard used to accept a bump of EITHER family
 * (`changedFiles.some(isPlatformManifest)`), so a PR that bumped only
 * `npm/<platform>` satisfied it while the napi addon packages under
 * `npm-native/` went unbumped and unpublished. That is how @aihu/compiler-native-*
 * stayed on npm at 0.1.0 through nine CLI bumps. The cases below lock the
 * corrected rule: both families, every platform, plus the host pin repoint.
 */
import { describe, expect, it } from 'vitest'
import {
  checkBump,
  discoverPlatforms,
  FAMILIES,
  HOST_MANIFEST,
  isCompilerRustSource,
  isNapiAddonSource,
  isPlatformManifest,
  type PlatformMap,
  platformManifestFamily,
} from '../scripts/check-compiler-binary-bump.ts'

const PLATFORMS: PlatformMap = discoverPlatforms()

const manifests = (family: keyof PlatformMap): string[] =>
  PLATFORMS[family].map((p) => `${FAMILIES[family].dir}/${p}/package.json`)

/** A complete, correct bump of both families plus the host pins. */
const fullBump = (): string[] => [...manifests('cli'), ...manifests('napi'), HOST_MANIFEST]

describe('compiler binary bump guard', () => {
  it('sees both platform families on disk, with matching platform sets', () => {
    // Guards the guard: if a platform dir is added to one family only, the
    // families disagree and one artifact ships for fewer platforms than the other.
    expect(PLATFORMS.cli.length).toBeGreaterThan(0)
    expect(PLATFORMS.napi).toEqual(PLATFORMS.cli)
  })

  it('recognizes compiler Rust source', () => {
    expect(isCompilerRustSource('packages/compiler/src/codegen/emit.rs')).toBe(true)
    expect(isCompilerRustSource('packages/compiler/Cargo.toml')).toBe(true)
    // Not the binary: JS glue, tests, and other crates.
    expect(isCompilerRustSource('packages/compiler/js/index.ts')).toBe(false)
    expect(isCompilerRustSource('packages/compiler/tests/codegen.rs')).toBe(false)
    expect(isCompilerRustSource('packages/css-engine/src/lib.rs')).toBe(false)
    // src-native is the addon wrapper, not the shared lib crate.
    expect(isCompilerRustSource('packages/compiler/src-native/src/lib.rs')).toBe(false)
    expect(isNapiAddonSource('packages/compiler/src-native/src/lib.rs')).toBe(true)
  })

  it('recognizes platform manifests and attributes them to a family', () => {
    expect(isPlatformManifest('packages/compiler/npm/darwin-arm64/package.json')).toBe(true)
    expect(isPlatformManifest('packages/compiler/npm-native/darwin-arm64/package.json')).toBe(true)
    expect(platformManifestFamily('packages/compiler/npm/darwin-arm64/package.json')).toBe('cli')
    expect(platformManifestFamily('packages/compiler/npm-native/darwin-arm64/package.json')).toBe(
      'napi',
    )
    expect(isPlatformManifest(HOST_MANIFEST)).toBe(false)
    // Nothing nested deeper than <dir>/<platform>/package.json.
    expect(isPlatformManifest('packages/compiler/npm/darwin-arm64/sub/package.json')).toBe(false)
  })

  it('FAILS when Rust source changed but no platform package bumped', () => {
    // The exact shape of the #401 whitespace fix — emit.rs changed, no bump.
    const result = checkBump([
      'packages/compiler/src/codegen/emit.rs',
      'packages/compiler/tests/codegen.rs',
      '.changeset/whitespace.md',
    ])
    expect(result.ok).toBe(false)
    expect(result.rustChanged).toContain('packages/compiler/src/codegen/emit.rs')
    expect(result.requiredFamilies).toEqual(['cli', 'napi'])
    // Every manifest of both families, plus the host pins.
    expect(result.missing).toEqual(fullBump())
  })

  // ---------------------------------------------------------------------------
  // FEL-414 regression cases. Each of the next three PASSED under the old
  // `changedFiles.some(isPlatformManifest)` predicate and must now FAIL.
  // ---------------------------------------------------------------------------

  it('FAILS when a Rust change bumps only the npm/ CLI family (FEL-414)', () => {
    // This is the shape of every PR that stranded the napi addon at 0.1.0.
    const result = checkBump([
      'packages/compiler/src/codegen/emit.rs',
      ...manifests('cli'),
      HOST_MANIFEST,
    ])
    expect(result.ok).toBe(false)
    expect(result.requiredFamilies).toContain('napi')
    expect(result.missing).toEqual(manifests('napi'))
    // The message names the missing manifests, not just "a bump is required".
    for (const m of manifests('napi')) expect(result.message).toContain(m)
  })

  it('FAILS when a Rust change bumps only the npm-native/ napi family', () => {
    const result = checkBump([
      'packages/compiler/src/parser/mod.rs',
      ...manifests('napi'),
      HOST_MANIFEST,
    ])
    expect(result.ok).toBe(false)
    expect(result.requiredFamilies).toContain('cli')
    expect(result.missing).toEqual(manifests('cli'))
    for (const m of manifests('cli')) expect(result.message).toContain(m)
  })

  it('FAILS on a partial napi bump that misses one platform', () => {
    const napi = manifests('napi')
    const dropped = napi[napi.length - 1]
    const result = checkBump(fullBump().filter((f) => f !== dropped))
    expect(result.ok).toBe(false)
    expect(result.missing).toEqual([dropped])
    expect(result.message).toContain(dropped)
    // …and does not slander the four platforms that DID bump.
    for (const m of napi.filter((n) => n !== dropped)) {
      expect(result.missing).not.toContain(m)
    }
  })

  it('FAILS when both families bump but the host optionalDependencies are not repointed', () => {
    const result = checkBump([
      'packages/compiler/src/codegen/emit.rs',
      ...manifests('cli'),
      ...manifests('napi'),
    ])
    expect(result.ok).toBe(false)
    expect(result.missing).toEqual([HOST_MANIFEST])
  })

  it('FAILS on a lone platform manifest touch even with no Rust change', () => {
    // Lockstep: @aihu/compiler pins ONE version across all platforms of a family,
    // so a one-off manifest edit is a version skew waiting to ship.
    const result = checkBump([manifests('cli')[0], HOST_MANIFEST])
    expect(result.ok).toBe(false)
    expect(result.missing).toEqual(manifests('cli').slice(1))
  })

  it('passes on a complete bump of both families plus the host pins', () => {
    const result = checkBump(['packages/compiler/src/codegen/emit.rs', ...fullBump()])
    expect(result.ok).toBe(true)
    expect(result.missing).toEqual([])
    expect(result.message).toBe('ok')
  })

  it('passes on a pure, complete platform bump with no Rust change (the ship-only PR)', () => {
    expect(checkBump(fullBump()).ok).toBe(true)
  })

  it('requires only the napi family when addon-only source changed', () => {
    const result = checkBump([
      'packages/compiler/src-native/src/lib.rs',
      ...manifests('napi'),
      HOST_MANIFEST,
    ])
    expect(result.ok).toBe(true)
    expect(result.requiredFamilies).toEqual(['napi'])
    // The same change without the addon bump is a non-shipping fix.
    const unbumped = checkBump(['packages/compiler/src-native/src/lib.rs'])
    expect(unbumped.ok).toBe(false)
    expect(unbumped.missing).toEqual([...manifests('napi'), HOST_MANIFEST])
  })

  it('passes when nothing compiler-related changed', () => {
    expect(checkBump(['packages/signals/src/index.ts', 'README.md']).ok).toBe(true)
  })

  it('does not fire on compiler JS-glue or test changes alone', () => {
    // JS glue and Rust *tests* do not go into the shipped binary.
    expect(checkBump(['packages/compiler/js/index.ts']).ok).toBe(true)
    expect(checkBump(['packages/compiler/tests/codegen.rs']).ok).toBe(true)
  })

  it('scales to a sixth platform without a code change', () => {
    // Completeness is measured against what exists on disk, so a new platform
    // dir is required by the guard the moment it is added.
    const expected: PlatformMap = {
      cli: [...PLATFORMS.cli, 'freebsd-x64'],
      napi: [...PLATFORMS.napi, 'freebsd-x64'],
    }
    const result = checkBump(['packages/compiler/src/codegen/emit.rs', ...fullBump()], expected)
    expect(result.ok).toBe(false)
    expect(result.missing).toEqual([
      `${FAMILIES.cli.dir}/freebsd-x64/package.json`,
      `${FAMILIES.napi.dir}/freebsd-x64/package.json`,
    ])
  })
})
