import { describe, expect, it } from 'vitest'
import { KNOWN_TEMPLATES, resolveTemplateName } from '../src/templates-registry.ts'

describe('KNOWN_TEMPLATES', () => {
  it('lists the 5 v0.2.0 templates per arch-6 §3.5', () => {
    expect(KNOWN_TEMPLATES).toEqual([
      '@aihu/templates-cf-team',
      '@aihu/templates-vercel-team',
      '@aihu/templates-fly-team',
      '@aihu/templates-cf-solo',
      '@aihu/templates-cf-full-agent',
    ])
  })

  it('is readonly (frozen at the type level via `as const`)', () => {
    // type-level: assigning would be a TS error. Runtime: the array is a
    // module-scoped constant, not protected; this is a smoke check that the
    // `as const` tuple has all 5 entries.
    expect(KNOWN_TEMPLATES).toHaveLength(5)
  })
})

describe('resolveTemplateName', () => {
  it('maps short cf-team to the full package name', () => {
    expect(resolveTemplateName('cf-team')).toBe('@aihu/templates-cf-team')
  })

  it('maps each short name', () => {
    expect(resolveTemplateName('vercel-team')).toBe('@aihu/templates-vercel-team')
    expect(resolveTemplateName('fly-team')).toBe('@aihu/templates-fly-team')
    expect(resolveTemplateName('cf-solo')).toBe('@aihu/templates-cf-solo')
    expect(resolveTemplateName('cf-full-agent')).toBe('@aihu/templates-cf-full-agent')
  })

  it('accepts the full package name unchanged', () => {
    expect(resolveTemplateName('@aihu/templates-cf-team')).toBe('@aihu/templates-cf-team')
  })

  it('returns undefined for an unknown short name', () => {
    expect(resolveTemplateName('cf-tailwind')).toBeUndefined()
    expect(resolveTemplateName('vercel-solo')).toBeUndefined()
    expect(resolveTemplateName('legacy-minimal')).toBeUndefined()
  })

  it('returns undefined for an unknown full name', () => {
    expect(resolveTemplateName('@aihu/templates-something-else')).toBeUndefined()
  })

  it('returns undefined for an unrelated namespace', () => {
    expect(resolveTemplateName('@other/templates-cf-team')).toBeUndefined()
  })

  it('is case-sensitive', () => {
    expect(resolveTemplateName('CF-TEAM')).toBeUndefined()
  })
})
