/**
 * Test fixture for `scripts/check-alias-parity.ts`.
 *
 * The gate asserts four properties across the two alias systems (tsconfig
 * `paths` for tsc, `resolve.alias` for vitest): (A) a key mapped by both must
 * mean the same file, (B) a key mapped by only one must be explicitly
 * allowlisted, (C) in vitest's ORDERED list a subpath must precede its prefix,
 * and (D) every target must exist. These cases lock each of them, plus the two
 * parsers — the ordering property in particular can only be checked against
 * SOURCE ORDER, so `vitestAliases` parsing the file's real shapes in the real
 * order is load-bearing.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  aliasBlockOf,
  type CheckInput,
  checkAgreement,
  checkAll,
  checkOneSided,
  checkOrdering,
  checkTargetsExist,
  findTsconfigs,
  ONE_SIDED,
  parseJsonc,
  stripComments,
  tsconfigEntries,
  vitestAliases,
} from '../scripts/check-alias-parity.ts'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** A minimal, internally-consistent two-key universe. */
function baseInput(): CheckInput {
  return {
    tsconfig: [
      { file: 'packages/a/tsconfig.json', key: '@x/b', target: 'packages/b/src/index.ts' },
      { file: 'packages/c/tsconfig.json', key: '@x/b', target: 'packages/b/src/index.ts' },
    ],
    vitest: [
      { key: '@x/b/sub', target: 'packages/b/src/sub.ts', index: 0 },
      { key: '@x/b', target: 'packages/b/src/index.ts', index: 1 },
    ],
    oneSided: { '@x/b/sub': { side: 'vitest-only', reason: 'fixture' } },
  }
}

describe('check-alias-parity — A. agreement', () => {
  it('passes the all-agreeing green path', () => {
    expect(checkAll(baseInput())).toEqual([])
  })

  it('flags a tsc/vitest src-vs-dist split', () => {
    const input = baseInput()
    input.vitest[1] = { key: '@x/b', target: 'packages/b/dist/index.d.ts', index: 1 }
    const errors = checkAgreement(input)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain("'@x/b'")
    expect(errors[0]).toContain('different code')
  })

  it('flags two tsconfigs disagreeing with each other about one key', () => {
    const input = baseInput()
    input.tsconfig[1] = {
      file: 'packages/c/tsconfig.json',
      key: '@x/b',
      target: 'packages/b/src/other.ts',
    }
    const errors = checkAgreement(input)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('disagree with each other')
  })
})

describe('check-alias-parity — B. one-sidedness', () => {
  it('flags a NEW vitest-only key that nobody allowlisted', () => {
    const input = baseInput()
    input.oneSided = {}
    const errors = checkOneSided(input)
    expect(errors.some((e) => e.includes('mapped by NO tsconfig'))).toBe(true)
  })

  it('flags a NEW tsconfig-only key that nobody allowlisted', () => {
    const input = baseInput()
    input.tsconfig.push({
      file: 'packages/a/tsconfig.json',
      key: '@x/d',
      target: 'packages/d/src/index.ts',
    })
    const errors = checkOneSided(input)
    expect(errors.some((e) => e.includes('NO vitest.config.ts alias'))).toBe(true)
  })

  it('flags an allowlist entry recorded on the wrong side', () => {
    const input = baseInput()
    input.oneSided = { '@x/b/sub': { side: 'tsconfig-only', reason: 'fixture' } }
    const errors = checkOneSided(input)
    expect(errors.some((e) => e.includes('the allowlist entry is stale'))).toBe(true)
  })

  it('flags an allowlist entry for a key that is now two-sided', () => {
    const input = baseInput()
    input.tsconfig.push({
      file: 'packages/a/tsconfig.json',
      key: '@x/b/sub',
      target: 'packages/b/src/sub.ts',
    })
    const errors = checkOneSided(input)
    expect(errors.some((e) => e.includes('mapped by BOTH systems'))).toBe(true)
  })

  it('flags an allowlist entry for a key that no longer exists at all', () => {
    const input = baseInput()
    input.oneSided['@x/gone'] = { side: 'vitest-only', reason: 'fixture' }
    const errors = checkOneSided(input)
    expect(errors.some((e) => e.includes('NEITHER system'))).toBe(true)
  })
})

describe('check-alias-parity — C. ordering', () => {
  it('flags a subpath listed AFTER its prefix', () => {
    const input = baseInput()
    input.vitest = [
      { key: '@x/b', target: 'packages/b/src/index.ts', index: 0 },
      { key: '@x/b/sub', target: 'packages/b/src/sub.ts', index: 1 },
    ]
    const errors = checkOrdering(input)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('UNREACHABLE')
    // The message must name the bogus path the prefix would produce.
    expect(errors[0]).toContain('packages/b/src/index.ts/sub')
  })

  it('does NOT flag a sibling that shares a textual prefix without a / boundary', () => {
    // '@rollup/plugin-alias' matches `pattern` or `pattern + '/'`, so '@x/b'
    // never captures '@x/bee'. Flagging it would force a bogus reordering.
    const input: CheckInput = {
      tsconfig: [],
      vitest: [
        { key: '@x/b', target: 'packages/b/src/index.ts', index: 0 },
        { key: '@x/bee', target: 'packages/bee/src/index.ts', index: 1 },
      ],
      oneSided: {},
    }
    expect(checkOrdering(input)).toEqual([])
  })

  it('flags a deep subpath listed after an intermediate prefix', () => {
    const input: CheckInput = {
      tsconfig: [],
      vitest: [
        { key: '@x/b', target: 'packages/b/src/index.ts', index: 0 },
        { key: '@x/b/runtime/cn', target: 'packages/b/src/runtime/cn.ts', index: 1 },
      ],
      oneSided: {},
    }
    expect(checkOrdering(input)).toHaveLength(1)
  })
})

describe('check-alias-parity — D. targets exist', () => {
  it('is a no-op without a root (pure-input mode)', () => {
    expect(checkTargetsExist(baseInput())).toEqual([])
  })

  it('flags a target that is not on disk', () => {
    const input = baseInput()
    input.root = REPO_ROOT
    input.tsconfig = [
      { file: 'packages/a/tsconfig.json', key: '@x/b', target: 'packages/b/src/nope.ts' },
    ]
    input.vitest = []
    const errors = checkTargetsExist(input)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('does not exist')
  })
})

describe('check-alias-parity — parsers', () => {
  it('strips line and block comments but not quoted text', () => {
    expect(stripComments("const a = 'http://x' // trailing\n/* block */ const b = 1")).toBe(
      "const a = 'http://x' \n const b = 1",
    )
  })

  it('parses JSONC with comments and a trailing comma', () => {
    expect(parseJsonc('{\n // note\n "a": 1,\n}')).toEqual({ a: 1 })
  })

  it('normalises tsconfig paths against baseUrl and the tsconfig dir', () => {
    const withBaseUrl = tsconfigEntries(
      '/r',
      'packages/a/tsconfig.json',
      '{"compilerOptions":{"baseUrl":".","paths":{"@x/b":["../b/src/index.ts"]}}}',
    )
    expect(withBaseUrl).toEqual([
      { file: 'packages/a/tsconfig.json', key: '@x/b', target: 'packages/b/src/index.ts' },
    ])
    // No baseUrl: TS >= 4.4 resolves paths against the tsconfig's own dir.
    const noBaseUrl = tsconfigEntries(
      '/r',
      'packages/a/tsconfig.json',
      '{"compilerOptions":{"paths":{"@x/b":["../b/src/index.ts"]}}}',
    )
    expect(noBaseUrl[0]?.target).toBe('packages/b/src/index.ts')
  })

  it('returns nothing for a tsconfig with no paths', () => {
    expect(
      tsconfigEntries('/r', 'tsconfig.base.json', '{"compilerOptions":{"strict":true}}'),
    ).toEqual([])
  })

  it('parses all three alias shapes, in source order, ignoring comments', () => {
    const cfg = [
      'export default defineConfig({ resolve: { alias: {',
      "  // '@x/b' is only mentioned here — not an entry",
      "  '@x/b/sub': new URL('./packages/b/src/sub.ts', import.meta.url).pathname,",
      "  '@x/b': new URL(",
      "    './packages/b/src/index.ts',",
      '    import.meta.url,',
      '  ).pathname,',
      "  '@x/c': new URL('./packages/c/src/index.ts', import.meta.url)",
      '    .pathname,',
      '} } })',
    ].join('\n')
    const parsed = vitestAliases('/r', cfg)
    expect(parsed.map((a) => a.key)).toEqual(['@x/b/sub', '@x/b', '@x/c'])
    expect(parsed.map((a) => a.index)).toEqual([0, 1, 2])
    expect(parsed[1]?.target).toBe('packages/b/src/index.ts')
  })

  it('returns an empty block when there is no alias map', () => {
    expect(aliasBlockOf('export default defineConfig({})')).toBe('')
    expect(vitestAliases('/r', 'export default defineConfig({})')).toEqual([])
  })
})

describe('check-alias-parity — the real repo', () => {
  it('scans the real tsconfigs and vitest.config.ts and finds them in parity', () => {
    const files = findTsconfigs(REPO_ROOT)
    expect(files.length).toBeGreaterThan(20)
    // The gate's own fixture trees must never be read as repo state.
    expect(files.some((f) => f.startsWith('scripts/fixtures/'))).toBe(false)

    const tsconfig = files.flatMap((f) =>
      tsconfigEntries(REPO_ROOT, f, readFileSync(join(REPO_ROOT, f), 'utf8')),
    )
    const vitest = vitestAliases(
      REPO_ROOT,
      readFileSync(join(REPO_ROOT, 'vitest.config.ts'), 'utf8'),
    )
    expect(vitest.length).toBeGreaterThan(0)
    expect(checkAll({ tsconfig, vitest, oneSided: ONE_SIDED, root: REPO_ROOT })).toEqual([])
  })

  it('every ONE_SIDED entry carries a written reason', () => {
    for (const [key, entry] of Object.entries(ONE_SIDED)) {
      expect(entry.reason.length, `${key} needs a reason`).toBeGreaterThan(40)
    }
  })
})
