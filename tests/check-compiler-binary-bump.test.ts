/**
 * Test fixture for `scripts/check-compiler-binary-bump.ts`.
 *
 * The guard exists because a change to the compiler's Rust source that does not
 * bump the platform binary packages builds fine but never ships — release.yml
 * skips versions already on npm, so consumers keep loading the stale binary.
 * These cases lock the rule that would have caught it.
 */
import { describe, expect, it } from 'vitest'
import {
  checkBump,
  isCompilerRustSource,
  isPlatformManifest,
} from '../scripts/check-compiler-binary-bump.ts'

describe('compiler binary bump guard', () => {
  it('recognizes compiler Rust source', () => {
    expect(isCompilerRustSource('packages/compiler/src/codegen/emit.rs')).toBe(true)
    expect(isCompilerRustSource('packages/compiler/Cargo.toml')).toBe(true)
    // Not the binary: JS glue, tests, and other crates.
    expect(isCompilerRustSource('packages/compiler/js/index.ts')).toBe(false)
    expect(isCompilerRustSource('packages/compiler/tests/codegen.rs')).toBe(false)
    expect(isCompilerRustSource('packages/css-engine/src/lib.rs')).toBe(false)
  })

  it('recognizes platform manifests', () => {
    expect(isPlatformManifest('packages/compiler/npm/darwin-arm64/package.json')).toBe(true)
    expect(isPlatformManifest('packages/compiler/package.json')).toBe(false)
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
    expect(result.message).toContain('platform binary package')
  })

  it('passes when the Rust change is accompanied by a platform bump', () => {
    const result = checkBump([
      'packages/compiler/src/codegen/emit.rs',
      'packages/compiler/npm/darwin-arm64/package.json',
      'packages/compiler/npm/darwin-x64/package.json',
      'packages/compiler/package.json',
    ])
    expect(result.ok).toBe(true)
  })

  it('passes on a pure platform bump with no Rust change (the ship-only PR)', () => {
    const result = checkBump([
      'packages/compiler/npm/darwin-arm64/package.json',
      'packages/compiler/package.json',
    ])
    expect(result.ok).toBe(true)
  })

  it('passes when nothing compiler-related changed', () => {
    expect(checkBump(['packages/signals/src/index.ts', 'README.md']).ok).toBe(true)
  })

  it('does not fire on compiler JS-glue or test changes alone', () => {
    // JS glue and Rust *tests* do not go into the shipped binary.
    expect(checkBump(['packages/compiler/js/index.ts']).ok).toBe(true)
    expect(checkBump(['packages/compiler/tests/codegen.rs']).ok).toBe(true)
  })
})
