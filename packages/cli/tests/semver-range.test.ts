/**
 * `semver-range.ts` — the hand-rolled range check behind `cliRange` enforcement.
 *
 * This module exists because `@aihu/cli` carries one runtime dependency and a
 * version-string comparison is not a good reason for a second. That trade is
 * only defensible if the implementation is actually correct, so the cases below
 * are the ones npm's own semver documents — the 0.x caret rules, partial and
 * wildcard forms, AND/OR composition, and the prerelease rule that keeps
 * `^1.0.0` from matching `2.0.0-beta.1`.
 */

import { describe, expect, it } from 'vitest'
import { compareVersions, parseVersion, satisfiesRange } from '../src/semver-range.ts'

function v(s: string) {
  const p = parseVersion(s)
  if (p === undefined) throw new Error(`bad fixture version ${s}`)
  return p
}

describe('parseVersion', () => {
  it('parses core, prerelease and build metadata', () => {
    expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, pre: [] })
    expect(parseVersion('v1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, pre: [] })
    expect(parseVersion('1.2.3-beta.1')).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      pre: ['beta', '1'],
    })
    expect(parseVersion('1.2.3+build.5')?.pre).toEqual([])
  })

  it('rejects non-versions rather than coercing them', () => {
    for (const bad of ['', '1', '1.2', 'latest', '^1.2.3', '1.2.x']) {
      expect(parseVersion(bad), bad).toBeUndefined()
    }
  })
})

describe('compareVersions', () => {
  it('orders by major, then minor, then patch', () => {
    expect(compareVersions(v('1.0.0'), v('2.0.0'))).toBe(-1)
    expect(compareVersions(v('1.2.0'), v('1.1.9'))).toBe(1)
    expect(compareVersions(v('1.2.3'), v('1.2.3'))).toBe(0)
  })

  it('ranks a release above its own prereleases', () => {
    expect(compareVersions(v('1.0.0'), v('1.0.0-beta'))).toBe(1)
    expect(compareVersions(v('1.0.0-beta'), v('1.0.0'))).toBe(-1)
  })

  it('applies the prerelease identifier rules', () => {
    // Numeric identifiers compare numerically, not as strings.
    expect(compareVersions(v('1.0.0-alpha.2'), v('1.0.0-alpha.10'))).toBe(-1)
    // Numeric identifiers sort below alphanumeric ones.
    expect(compareVersions(v('1.0.0-1'), v('1.0.0-alpha'))).toBe(-1)
    // A prefix set sorts below the longer set it prefixes.
    expect(compareVersions(v('1.0.0-alpha'), v('1.0.0-alpha.1'))).toBe(-1)
  })
})

describe('satisfiesRange — caret', () => {
  it('pins the major for 1.x and above', () => {
    expect(satisfiesRange('1.2.0', '^1.0.0')).toBe(true)
    expect(satisfiesRange('1.0.0', '^1.0.0')).toBe(true)
    expect(satisfiesRange('1.99.99', '^1.0.0')).toBe(true)
    expect(satisfiesRange('2.0.0', '^1.0.0')).toBe(false)
    expect(satisfiesRange('0.9.9', '^1.0.0')).toBe(false)
  })

  it('pins the minor for 0.x — the rule the stale cf-team range depended on', () => {
    expect(satisfiesRange('0.2.9', '^0.2.0')).toBe(true)
    expect(satisfiesRange('0.3.0', '^0.2.0')).toBe(false)
    // The exact staleness this whole enforcement path was built to catch.
    expect(satisfiesRange('1.2.0', '^0.2.0')).toBe(false)
  })

  it('pins the patch for 0.0.x', () => {
    expect(satisfiesRange('0.0.3', '^0.0.3')).toBe(true)
    expect(satisfiesRange('0.0.4', '^0.0.3')).toBe(false)
  })

  it('handles partial carets', () => {
    expect(satisfiesRange('1.9.0', '^1')).toBe(true)
    expect(satisfiesRange('2.0.0', '^1')).toBe(false)
    expect(satisfiesRange('0.2.5', '^0.2')).toBe(true)
    expect(satisfiesRange('0.3.0', '^0.2')).toBe(false)
    expect(satisfiesRange('0.9.0', '^0')).toBe(true)
    expect(satisfiesRange('1.0.0', '^0')).toBe(false)
  })
})

describe('satisfiesRange — tilde, comparators, exact', () => {
  it('tilde pins the minor', () => {
    expect(satisfiesRange('1.2.9', '~1.2.3')).toBe(true)
    expect(satisfiesRange('1.3.0', '~1.2.3')).toBe(false)
    expect(satisfiesRange('1.2.0', '~1.2')).toBe(true)
    expect(satisfiesRange('1.9.0', '~1')).toBe(true)
    expect(satisfiesRange('2.0.0', '~1')).toBe(false)
  })

  it('honours >= > <= < =', () => {
    expect(satisfiesRange('1.2.0', '>=1.2.0')).toBe(true)
    expect(satisfiesRange('1.1.9', '>=1.2.0')).toBe(false)
    expect(satisfiesRange('1.2.1', '>1.2.0')).toBe(true)
    expect(satisfiesRange('1.2.0', '>1.2.0')).toBe(false)
    expect(satisfiesRange('1.2.0', '<=1.2.0')).toBe(true)
    expect(satisfiesRange('1.2.0', '<1.2.0')).toBe(false)
    expect(satisfiesRange('1.2.0', '=1.2.0')).toBe(true)
    expect(satisfiesRange('1.2.1', '1.2.0')).toBe(false)
    // A partial bound resolves its missing parts to zero.
    expect(satisfiesRange('1.2.0', '>=1.2')).toBe(true)
  })

  it('treats a partial bare version as its implicit range', () => {
    expect(satisfiesRange('1.2.9', '1.2')).toBe(true)
    expect(satisfiesRange('1.3.0', '1.2')).toBe(false)
    expect(satisfiesRange('1.9.0', '1.x')).toBe(true)
    expect(satisfiesRange('2.0.0', '1.x')).toBe(false)
  })

  it('matches anything for the wildcard forms', () => {
    for (const range of ['*', 'x', '']) {
      expect(satisfiesRange('7.3.1', range), range).toBe(true)
    }
  })
})

describe('satisfiesRange — composition', () => {
  it('ANDs space-separated comparators', () => {
    expect(satisfiesRange('1.5.0', '>=1.0.0 <2.0.0')).toBe(true)
    expect(satisfiesRange('2.0.0', '>=1.0.0 <2.0.0')).toBe(false)
    expect(satisfiesRange('0.9.0', '>=1.0.0 <2.0.0')).toBe(false)
  })

  it('ORs `||`-separated sets', () => {
    expect(satisfiesRange('1.4.0', '^1.0.0 || ^2.0.0')).toBe(true)
    expect(satisfiesRange('2.4.0', '^1.0.0 || ^2.0.0')).toBe(true)
    expect(satisfiesRange('3.0.0', '^1.0.0 || ^2.0.0')).toBe(false)
  })
})

describe('satisfiesRange — prereleases', () => {
  it('does not let a prerelease sneak past a ceiling it sorts below', () => {
    // The whole reason the npm rule exists: 2.0.0-beta.1 < 2.0.0, so naive
    // ordering would accept it for a range that means "1.x only".
    expect(satisfiesRange('2.0.0-beta.1', '^1.0.0')).toBe(false)
  })

  it('accepts a prerelease only when the range opted in at the same X.Y.Z', () => {
    expect(satisfiesRange('1.3.0-beta.1', '>=1.3.0-alpha')).toBe(true)
    expect(satisfiesRange('1.3.0-beta.1', '>=1.2.0')).toBe(false)
  })
})

describe('satisfiesRange — failure modes', () => {
  it('throws on an unparseable version rather than reporting "no match"', () => {
    expect(() => satisfiesRange('not-a-version', '^1.0.0')).toThrow(/invalid semver version/)
  })

  it('throws on range syntax it does not implement', () => {
    // Silence here would mean an unenforceable `cliRange` passes the gate,
    // which is the exact defect this module was added to close.
    expect(() => satisfiesRange('1.2.0', '1.2.3 - 2.3.4')).toThrow(/invalid semver range/)
    expect(() => satisfiesRange('1.2.0', '^1.2.3.4')).toThrow(/invalid semver range/)
    expect(() => satisfiesRange('1.2.0', '^nope')).toThrow(/invalid semver range/)
  })
})
