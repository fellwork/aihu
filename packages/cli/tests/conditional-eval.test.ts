import { describe, expect, it } from 'vitest'
import { evalWhen } from '../src/conditional-eval.ts'

describe('evalWhen — primitives', () => {
  it('returns true for literal true', () => {
    expect(evalWhen('true', {})).toBe(true)
  })

  it('returns false for literal false', () => {
    expect(evalWhen('false', {})).toBe(false)
  })

  it('resolves identifier from context (truthy string)', () => {
    expect(evalWhen('starter', { starter: 'live-counter' })).toBe(true)
  })

  it('resolves identifier from context (false)', () => {
    expect(evalWhen('initGit', { initGit: false })).toBe(false)
  })

  it('treats missing identifier as undefined (falsy)', () => {
    expect(evalWhen('initGit', {})).toBe(false)
  })
})

describe('evalWhen — equality', () => {
  it('=== matches string', () => {
    expect(evalWhen('starter === "live-counter"', { starter: 'live-counter' })).toBe(true)
  })

  it('=== rejects different string', () => {
    expect(evalWhen('starter === "live-counter"', { starter: 'empty' })).toBe(false)
  })

  it('!== returns true for unequal strings', () => {
    expect(evalWhen('agentSurface !== "none"', { agentSurface: 'minimal' })).toBe(true)
  })

  it('!== returns false for equal strings', () => {
    expect(evalWhen('agentSurface !== "none"', { agentSurface: 'none' })).toBe(false)
  })

  it('handles single-quoted string literals', () => {
    expect(evalWhen("auth === 'kinde'", { auth: 'kinde' })).toBe(true)
  })

  it('handles boolean comparison', () => {
    expect(evalWhen('initGit === true', { initGit: true })).toBe(true)
    expect(evalWhen('initGit === false', { initGit: true })).toBe(false)
  })
})

describe('evalWhen — logical operators', () => {
  it('&& short-circuits to false', () => {
    expect(evalWhen('a && b', { a: false, b: 'never-checked' })).toBe(false)
  })

  it('|| short-circuits to true', () => {
    expect(evalWhen('a || b', { a: true, b: false })).toBe(true)
  })

  it('combines conditions', () => {
    const ctx = { auth: 'better-auth', persona: 'team' }
    expect(evalWhen('auth === "better-auth" && persona === "team"', ctx)).toBe(true)
    expect(evalWhen('auth === "better-auth" && persona === "solo"', ctx)).toBe(false)
  })

  it('handles parentheses for precedence', () => {
    expect(evalWhen('(a || b) && c', { a: false, b: true, c: true })).toBe(true)
    expect(evalWhen('(a || b) && c', { a: false, b: true, c: false })).toBe(false)
  })

  it('handles ! (unary not)', () => {
    expect(evalWhen('!a', { a: false })).toBe(true)
    expect(evalWhen('!a', { a: true })).toBe(false)
    expect(evalWhen('!(a === "x")', { a: 'y' })).toBe(true)
  })

  it('handles double negation', () => {
    expect(evalWhen('!!a', { a: 'truthy' })).toBe(true)
  })
})

describe('evalWhen — error paths (no eval-style escape hatches)', () => {
  it('rejects function call syntax', () => {
    expect(() => evalWhen('foo()', { foo: () => true })).toThrow()
  })

  it('rejects assignment', () => {
    expect(() => evalWhen('a = 1', { a: 0 })).toThrow()
  })

  it('rejects member access', () => {
    expect(() => evalWhen('a.b', { a: { b: 1 } })).toThrow()
  })

  it('rejects + arithmetic', () => {
    expect(() => evalWhen('1 + 1', {})).toThrow()
  })

  it('rejects single = as comparison', () => {
    expect(() => evalWhen('a = "x"', { a: 'x' })).toThrow()
  })

  it('rejects double-quoted escape sequences', () => {
    expect(() => evalWhen('a === "x\\"y"', { a: 'foo' })).toThrow(/escape/)
  })

  it('rejects unterminated string', () => {
    expect(() => evalWhen('a === "abc', { a: 'abc' })).toThrow(/unterminated/)
  })

  it('rejects unmatched parenthesis', () => {
    expect(() => evalWhen('(a || b', { a: true })).toThrow()
  })

  it('rejects empty input', () => {
    expect(() => evalWhen('', {})).toThrow()
  })

  it('rejects trailing tokens', () => {
    expect(() => evalWhen('true false', {})).toThrow(/trailing/)
  })

  it('rejects single & or |', () => {
    expect(() => evalWhen('a & b', { a: true, b: true })).toThrow()
    expect(() => evalWhen('a | b', { a: true, b: true })).toThrow()
  })
})
