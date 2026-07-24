/**
 * Unit tests for `useSet` (effect-scope plan §5): seeded values, reactive
 * `has`/`size`/`values`, `add`/`delete`/`clear` replace-don't-mutate
 * semantics, reactivity via `effect`, and the SSR-static path (simulated
 * `!isClient` via module re-evaluation). jsdom environment (root vitest
 * config).
 */
import { effect } from '@aihu/signals'
import { describe, expect, it } from 'vitest'
import { useSet } from '../src/useSet/index.ts'
import { withSSR } from './_ssr.ts'

describe('@aihu/use/useSet', () => {
  it('starts empty by default', () => {
    const { size, values } = useSet<string>()
    expect(size()).toBe(0)
    expect(values()).toEqual([])
  })

  it('seeds from a values iterable', () => {
    const { size, has } = useSet<string>(['a', 'b'])
    expect(size()).toBe(2)
    expect(has('a')).toBe(true)
    expect(has('c')).toBe(false)
  })

  it('add() inserts a value; re-adding an existing value is a no-op', () => {
    const { size, has, add, values } = useSet<string>()
    add('a')
    expect(size()).toBe(1)
    expect(has('a')).toBe(true)
    add('a')
    expect(size()).toBe(1)
    expect(values()).toEqual(['a'])
  })

  it('delete() removes a value and reports whether it was present', () => {
    const { size, has, add, delete: del } = useSet<string>()
    add('a')
    expect(del('a')).toBe(true)
    expect(has('a')).toBe(false)
    expect(size()).toBe(0)
    expect(del('a')).toBe(false)
  })

  it('clear() removes every value', () => {
    const { size, add, clear } = useSet<string>()
    add('a')
    add('b')
    clear()
    expect(size()).toBe(0)
  })

  it('is reactive — an effect reading size()/has() re-runs on mutation', () => {
    const { size, has, add } = useSet<string>()
    const seen: Array<[number, boolean]> = []
    const dispose = effect(() => {
      seen.push([size(), has('a')])
    })
    add('a')
    add('b')
    expect(seen).toEqual([
      [0, false],
      [1, true],
      [2, true],
    ])
    dispose()
  })

  it('an earlier values() snapshot does not reflect a later mutation (replace-not-mutate)', () => {
    const { values, add } = useSet<string>()
    add('a')
    const snapshot = values()
    add('b')
    expect(snapshot).toEqual(['a'])
    expect(values()).toEqual(['a', 'b'])
  })
})

describe('@aihu/use/useSet — SSR-static path', () => {
  // The exhaustive zero-side-effect gate lives in ssr-safety.test.ts.

  it('with isClient false, returns a static snapshot and no-op mutators', () =>
    withSSR(
      () => import('../src/useSet/index.ts'),
      (mod) => {
        const { size, has, add, delete: del, clear } = mod.useSet<string>(['a'])
        expect(size()).toBe(1)
        expect(has('a')).toBe(true)
        add('b')
        expect(size()).toBe(1)
        expect(del('a')).toBe(false)
        expect(() => clear()).not.toThrow()
        expect(size()).toBe(1)
      },
    ))
})
