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

  it('does not collapse a multi-segment prefix into a shorter one it shares a leading segment with', () => {
    // Regression: groupKey used to key on the FIRST dash only, so
    // `animate-delay-500` truncated to the blanket `animate` group and
    // collided with (silently dropped) `animate-fade-in`. Longest-prefix
    // matching keeps both — they set different CSS properties.
    expect(cn('animate-fade-in', 'animate-delay-500')).toBe('animate-fade-in animate-delay-500')
    expect(cn('animate-delay-100', 'animate-duration-500')).toBe(
      'animate-delay-100 animate-duration-500',
    )
    // Same family still collides, last wins.
    expect(cn('animate-delay-100', 'animate-delay-500')).toBe('animate-delay-500')
    expect(cn('animate-fade-in', 'animate-shake')).toBe('animate-shake')
  })

  it('keeps the animate-dialog base alongside its start-offset presets (Slice 12)', () => {
    // The presets are registered under their EXACT class names, not under the
    // shared `animate-dialog` prefix, precisely so `groupKey`'s full-name-first
    // scan resolves them before it can reach the base's own group. Registering
    // the shared prefix instead would swallow the base and silently drop it.
    expect(cn('animate-dialog', 'animate-dialog-from-left')).toBe(
      'animate-dialog animate-dialog-from-left',
    )
    // All six presets are one mutually-exclusive group — last wins, across the
    // `from-*` / named-preset spelling boundary too.
    expect(cn('animate-dialog-from-top', 'animate-dialog-from-bottom')).toBe(
      'animate-dialog-from-bottom',
    )
    expect(cn('animate-dialog-from-left', 'animate-dialog-zoom')).toBe('animate-dialog-zoom')
    // Timing knobs are independent axes, combinable with any preset.
    expect(cn('animate-dialog-zoom', 'animate-dialog-duration-200')).toBe(
      'animate-dialog-zoom animate-dialog-duration-200',
    )
    // Neither the base nor the backdrop declares `animation`, so neither may
    // fall through to the blanket `animate` → `animation` group.
    expect(cn('animate-fade-in', 'animate-dialog')).toBe('animate-fade-in animate-dialog')
    expect(cn('animate-dialog', 'animate-dialog-backdrop')).toBe(
      'animate-dialog animate-dialog-backdrop',
    )
  })

  it('dedupes other pre-existing multi-segment prefix families (translate-x, grid-cols)', () => {
    // These were silently non-deduping before groupKey did real longest-prefix
    // matching — `translate-x` truncated to `translate`, an unregistered
    // first segment, so it fell through to keying on the whole class string.
    expect(cn('translate-x-2', 'translate-x-4')).toBe('translate-x-4')
    // translate-x/-y both write the single `translate` CSS shorthand, so they
    // share one conflict group by design (last wins across axes too).
    expect(cn('translate-x-2', 'translate-y-4')).toBe('translate-y-4')
    expect(cn('grid-cols-2', 'grid-cols-3')).toBe('grid-cols-3')
    expect(cn('grid-cols-2', 'grid-rows-3')).toBe('grid-cols-2 grid-rows-3')
  })

  it('returns an empty string for no meaningful input', () => {
    expect(cn()).toBe('')
    expect(cn(false, null, undefined, '')).toBe('')
  })
})
