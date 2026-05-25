import { describe, expect, it } from 'vitest'
import { cn } from '../src/runtime/cn.ts'

describe('@aihu/css-engine/runtime/cn — class merge', () => {
  it('resolves last-wins per property group (the headline case)', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4')
    expect(cn('p-4', 'p-2')).toBe('p-2')
  })

  it('merges conditionals and arrays, dropping falsy values', () => {
    expect(cn('a', false && 'b', ['c'])).toBe('a c')
    expect(cn('a', null, undefined, 0 as unknown as string, '', 'd')).toBe('a d')
    expect(cn(['x', ['y', 'z']])).toBe('x y z')
  })

  it('conflicts within the same group (different prefixes mapping to it)', () => {
    expect(cn('bg-red-500', 'bg-blue-500')).toBe('bg-blue-500')
    expect(cn('text-sm', 'text-lg')).toBe('text-lg')
  })

  it('does NOT merge classes in different groups', () => {
    // padding vs margin-inline — distinct groups, both survive.
    expect(cn('p-2', 'mx-4')).toBe('p-2 mx-4')
    // padding vs padding-inline — distinct properties, both survive.
    expect(cn('p-2', 'px-4')).toBe('p-2 px-4')
  })

  it('keeps unknown / dashless utilities as-is (no group → key to self)', () => {
    expect(cn('flex', 'items-center', 'flex')).toBe('flex items-center')
    expect(cn('custom-thing', 'another')).toBe('custom-thing another')
  })

  it('respects variant scope when merging (md:p-2 and p-4 do not conflict)', () => {
    expect(cn('md:p-2', 'md:p-4')).toBe('md:p-4')
    expect(cn('p-2', 'md:p-4')).toBe('p-2 md:p-4')
    expect(cn('hover:bg-red-500', 'hover:bg-blue-500')).toBe('hover:bg-blue-500')
  })

  it('returns an empty string for no meaningful input', () => {
    expect(cn()).toBe('')
    expect(cn(false, null, undefined, '')).toBe('')
  })
})
