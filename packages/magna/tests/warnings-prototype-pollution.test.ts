// @vitest-environment node
/**
 * CodeQL alert 27 — `js/prototype-pollution-utility` on `setBuildFlag()`
 * (`packages/magna/src/warnings.ts`).
 *
 * `setBuildFlag(outputDir, key, value)` splits `key` on `.` and walks the
 * segments, creating objects as it goes. `key` is a parameter of an exported
 * function on a published package: every caller in this repo passes the
 * literal `'magna.untyped'`, but the contract accepts an arbitrary string, and
 * `'__proto__.x'` walked `cursor.__proto__` straight onto `Object.prototype`
 * and assigned there — poisoning every object for the rest of the build.
 *
 * The second describe block covers the subtler half the original guard missed:
 * `typeof cursor[seg]` reads through the prototype chain, so an
 * already-polluted `Object.prototype.magna` silently absorbed the write and
 * `build-flags.json` came out empty.
 */
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setBuildFlag } from '../src/warnings.ts'

let tmpDir: string

beforeEach(() => {
  tmpDir = join(
    tmpdir(),
    `magna-proto-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  mkdirSync(tmpDir, { recursive: true })
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
  // Never leave a polluted prototype behind for the rest of the suite.
  for (const k of ['polluted', 'magna', 'x']) {
    delete (Object.prototype as Record<string, unknown>)[k]
  }
})

const readFlags = (): Record<string, unknown> =>
  JSON.parse(readFileSync(join(tmpDir, '.aihu', 'build-flags.json'), 'utf8')) as Record<
    string,
    unknown
  >

describe('setBuildFlag — prototype pollution', () => {
  it.each([
    '__proto__.polluted',
    '__proto__',
    'constructor.prototype.polluted',
    'magna.__proto__.polluted',
    'prototype.polluted',
    'a.b.__proto__.polluted',
  ])('rejects the key %s instead of walking it', (key) => {
    expect(() => setBuildFlag(tmpDir, key, 'PWNED')).toThrow(/unsafe key segment/)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(Object.prototype).not.toHaveProperty('polluted')
  })

  it('leaves Object.prototype clean after the crafted key that used to work', () => {
    // Pre-fix this exact call made ({}).polluted === 'PWNED' process-wide.
    expect(() => setBuildFlag(tmpDir, '__proto__.polluted', 'PWNED')).toThrow()
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(JSON.stringify({})).toBe('{}')
  })

  it('does not write build-flags.json when it rejects a key', () => {
    expect(() => setBuildFlag(tmpDir, '__proto__.polluted', 'PWNED')).toThrow()
    expect(() => readFlags()).toThrow() // file never created
  })
})

describe('setBuildFlag — descent stays on own properties', () => {
  it('does not merge into an inherited object when Object.prototype is already polluted', () => {
    // Simulate an unrelated dependency having polluted the prototype first.
    ;(Object.prototype as Record<string, unknown>).magna = { hijacked: true }

    setBuildFlag(tmpDir, 'magna.untyped', true)

    // The flag must land in OUR file, not on the shared prototype object.
    expect(readFlags()).toEqual({ magna: { untyped: true } })
    expect((Object.prototype as Record<string, unknown>).magna).toEqual({ hijacked: true })
  })
})

describe('setBuildFlag — normal behaviour is unchanged', () => {
  it('writes a nested flag', () => {
    setBuildFlag(tmpDir, 'magna.untyped', true)
    expect(readFlags()).toEqual({ magna: { untyped: true } })
  })

  it('preserves sibling keys at every level', () => {
    setBuildFlag(tmpDir, 'magna.untyped', true)
    setBuildFlag(tmpDir, 'magna.other', 'keep')
    setBuildFlag(tmpDir, 'top', 1)
    setBuildFlag(tmpDir, 'magna.untyped', false)
    expect(readFlags()).toEqual({ magna: { untyped: false, other: 'keep' }, top: 1 })
  })

  it('replaces a non-object value standing where a branch is needed', () => {
    setBuildFlag(tmpDir, 'magna', 'scalar')
    setBuildFlag(tmpDir, 'magna.untyped', true)
    expect(readFlags()).toEqual({ magna: { untyped: true } })
  })

  it('handles a single-segment key', () => {
    setBuildFlag(tmpDir, 'untyped', true)
    expect(readFlags()).toEqual({ untyped: true })
  })
})
