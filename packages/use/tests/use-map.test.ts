/**
 * Unit tests for `useMap` (effect-scope plan §5): seeded entries, reactive
 * `get`/`has`/`size`/`entries`/`keys`/`values`, `set`/`delete`/`clear`
 * replace-don't-mutate semantics, reactivity via `effect`, and the
 * SSR-static path (simulated `!isClient` via module re-evaluation). jsdom
 * environment (root vitest config).
 */
import { effect } from '@aihu/signals'
import { describe, expect, it } from 'vitest'
import { useMap } from '../src/useMap/index.ts'
import { withSSR } from './_ssr.ts'

describe('@aihu/use/useMap', () => {
  it('starts empty by default', () => {
    const { size, entries } = useMap<string, number>()
    expect(size()).toBe(0)
    expect(entries()).toEqual([])
  })

  it('seeds from an entries iterable', () => {
    const { size, get, has } = useMap<string, number>([
      ['a', 1],
      ['b', 2],
    ])
    expect(size()).toBe(2)
    expect(get('a')).toBe(1)
    expect(has('b')).toBe(true)
    expect(has('c')).toBe(false)
  })

  it('set() adds/updates an entry', () => {
    const { size, get, set } = useMap<string, number>()
    set('a', 1)
    expect(size()).toBe(1)
    expect(get('a')).toBe(1)
    set('a', 2)
    expect(size()).toBe(1)
    expect(get('a')).toBe(2)
  })

  it('delete() removes an entry and reports whether it was present', () => {
    const { size, has, set, delete: del } = useMap<string, number>()
    set('a', 1)
    expect(del('a')).toBe(true)
    expect(has('a')).toBe(false)
    expect(size()).toBe(0)
    expect(del('a')).toBe(false)
  })

  it('clear() removes every entry', () => {
    const { size, set, clear } = useMap<string, number>()
    set('a', 1)
    set('b', 2)
    clear()
    expect(size()).toBe(0)
  })

  it('entries/keys/values return fresh array snapshots', () => {
    const { entries, keys, values, set } = useMap<string, number>()
    set('a', 1)
    set('b', 2)
    expect(entries()).toEqual([
      ['a', 1],
      ['b', 2],
    ])
    expect(keys()).toEqual(['a', 'b'])
    expect(values()).toEqual([1, 2])
  })

  it('is reactive — an effect reading size()/get() re-runs on mutation', () => {
    const { size, get, set } = useMap<string, number>()
    const seen: Array<[number, number | undefined]> = []
    const dispose = effect(() => {
      seen.push([size(), get('a')])
    })
    set('a', 1)
    set('b', 2)
    expect(seen).toEqual([
      [0, undefined],
      [1, 1],
      [2, 1],
    ])
    dispose()
  })

  it('a snapshot Map obtained earlier does not reflect a later mutation (replace-not-mutate)', () => {
    // There is no way to grab the raw Map from the public API, so this
    // documents the contract via the getters instead: entries() returns a
    // NEW array each call, never a live view.
    const { entries, set } = useMap<string, number>()
    set('a', 1)
    const snapshot = entries()
    set('b', 2)
    expect(snapshot).toEqual([['a', 1]]) // the earlier snapshot is frozen
    expect(entries()).toEqual([
      ['a', 1],
      ['b', 2],
    ])
  })
})

describe('@aihu/use/useMap — SSR-static path', () => {
  // The exhaustive zero-side-effect gate lives in ssr-safety.test.ts.

  it('with isClient false, returns a static snapshot and no-op mutators', () =>
    withSSR(
      () => import('../src/useMap/index.ts'),
      (mod) => {
        const { size, get, has, set, delete: del, clear } = mod.useMap<string, number>([['a', 1]])
        expect(size()).toBe(1)
        expect(get('a')).toBe(1)
        expect(has('a')).toBe(true)
        set('b', 2)
        expect(size()).toBe(1)
        expect(del('a')).toBe(false)
        expect(() => clear()).not.toThrow()
        expect(size()).toBe(1)
      },
    ))
})
