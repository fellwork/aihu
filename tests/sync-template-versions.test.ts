import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  caretRange,
  discoverAihuPackages,
  rewriteAppPeerDeps,
  rewriteManifestRanges,
} from '../scripts/sync-template-versions.ts'

/**
 * Unit coverage for the generator behind `check:template-versions`.
 *
 * The gate's end-to-end red/green proof lives in check-gate-wiring's
 * NEGATIVE_FIXTURES (it runs `--check` against a stale target and a matching
 * one, and requires the first to exit non-zero). What that proof cannot show is
 * WHICH bytes the rewriters touch, and the two rewriters below are the parts
 * that can silently do nothing: both are regex-driven over hand-authored files
 * a `JSON.parse` round-trip would destroy.
 *
 * The `__APP_CONDITIONAL_DEPS__` case is here because it already happened. The
 * first anchored regex ended at `,?$`, so the LAST dependency line — the one
 * carrying the substitution token — never matched, and the generator reported
 * "wrote" on a file that still said `"latest"`.
 */

describe('caretRange', () => {
  it('carets a release version', () => {
    expect(caretRange('6.0.0')).toBe('^6.0.0')
    expect(caretRange('0.4.4')).toBe('^0.4.4')
  })

  it('pins a prerelease exactly', () => {
    // `^1.0.0-rc.1` excludes `1.0.0-rc.2` but INCLUDES `1.0.0` and later
    // prereleases of higher patches — a range almost nobody predicts right.
    expect(caretRange('0.0.0-canary-20260808')).toBe('0.0.0-canary-20260808')
  })
})

describe('discoverAihuPackages', () => {
  // Absolute, not cwd-relative: a test whose fixture path depends on where
  // vitest was launched from reports "no packages found" as a real finding.
  const found = discoverAihuPackages(
    join(import.meta.dirname, '..', 'scripts/fixtures/template-versions/packages'),
  )

  it('reads name + version from each manifest, sorted', () => {
    expect(found).toEqual([
      { name: '@aihu/app', version: '9.0.0' },
      { name: '@aihu/runtime', version: '6.0.0' },
    ])
  })

  it('skips private packages — they are never published, so no range exists', () => {
    // The fixture tree contains `@aihu/private-thing`; a range pointing at an
    // unpublishable package is a scaffold that cannot install.
    expect(found.map((p) => p.name)).not.toContain('@aihu/private-thing')
  })
})

describe('rewriteManifestRanges', () => {
  const ranges = { '@aihu/server': '^0.5.0', vite: '^6 || ^8' }

  it('rewrites the dependency line that carries a substitution token', () => {
    const src = [
      '{',
      '  "dependencies": {',
      '    "@aihu/server": "latest"__APP_CONDITIONAL_DEPS__',
      '  }',
      '}',
    ].join('\n')
    expect(rewriteManifestRanges(src, ranges)).toContain(
      '"@aihu/server": "^0.5.0"__APP_CONDITIONAL_DEPS__',
    )
  })

  it('leaves names it has no range for completely alone', () => {
    const src = '  "@types/node": "^20.16.5",\n  "vite": "^6.0.0"\n'
    const out = rewriteManifestRanges(src, ranges)
    expect(out).toContain('"@types/node": "^20.16.5",')
    expect(out).toContain('"vite": "^6 || ^8"')
  })

  it('preserves the trailing comma so the result is still parseable', () => {
    expect(rewriteManifestRanges('    "vite": "^6.0.0",', ranges)).toBe('    "vite": "^6 || ^8",')
  })
})

describe('rewriteAppPeerDeps', () => {
  const src = [
    'export const config = {',
    '  appPeerDeps: {',
    "    '@aihu/runtime': '^0.2.0',",
    '  },',
    '  appPeerDepsConditional: {',
    "    'better-auth': { version: '^1.0.0', when: 'auth === \"better-auth\"' },",
    '  },',
    '}',
  ].join('\n')

  it('rewrites inside appPeerDeps and NOT inside appPeerDepsConditional', () => {
    const out = rewriteAppPeerDeps(src, { '@aihu/runtime': '^6.0.0', 'better-auth': '^99.0.0' })
    expect(out).toContain("'@aihu/runtime': '^6.0.0',")
    // Third-party auth SDKs this repo does not publish must be untouched — the
    // generator knows nothing about their versions.
    expect(out).toContain("'better-auth': { version: '^1.0.0'")
  })

  it('throws rather than silently no-opping when the block is gone', () => {
    // A rewriter that cannot find its anchor and returns the input unchanged is
    // indistinguishable from one that had nothing to do.
    expect(() => rewriteAppPeerDeps('export const config = {}', {})).toThrow(/appPeerDeps/)
  })
})
