/**
 * `reconcile()` — design docs/plans/2026-07-24-deep-reactivity.md §4.1,
 * §7.2, §9; acceptance criterion (§12) #8: preserves proxy identity for
 * unchanged nodes and notifies only changed paths.
 */
import { effect } from '@aihu/signals'
import { describe, expect, it } from 'vitest'
import { reactive, reconcile, unwrap } from '../src/index.ts'

describe('reconcile() — objects', () => {
  it('writes only genuinely-changed keys, preserving identity for the rest', () => {
    const state = reactive({ a: 1, b: { x: 1 }, c: [1, 2] })
    const bBefore = state.b

    let aRuns = 0
    let bRuns = 0
    let cRuns = 0
    effect(() => {
      aRuns++
      void state.a
    })
    effect(() => {
      bRuns++
      void state.b.x
    })
    effect(() => {
      cRuns++
      void state.c.length
    })
    expect([aRuns, bRuns, cRuns]).toEqual([1, 1, 1])

    // Fresh JSON payload: `b` and `c` mint NEW object/array identities even
    // though `b.x` and `c` are unchanged in VALUE — this is exactly the
    // hydration-payload shape (design §7.2 item 2, §9).
    reconcile(state, { a: 1, b: { x: 1 }, c: [1, 2] })

    expect(aRuns).toBe(1) // a unchanged in value -> no write, no re-run
    expect(bRuns).toBe(1) // b.x unchanged in value -> no write, no re-run
    expect(cRuns).toBe(1) // c unchanged in value -> no write, no re-run
    expect(state.b).toBe(bBefore) // nested identity PRESERVED

    // Now change only `a`.
    reconcile(state, { a: 2, b: { x: 1 }, c: [1, 2] })
    expect(aRuns).toBe(2)
    expect(bRuns).toBe(1)
    expect(cRuns).toBe(1)
    expect(state.b).toBe(bBefore)
  })

  it('adds new keys and removes keys absent from the payload', () => {
    const state = reactive<{ a: number; b?: number }>({ a: 1, b: 2 })
    reconcile(state, { a: 1 })
    expect(unwrap(state)).toEqual({ a: 1 })

    reconcile(state, { a: 1, b: 3 } as { a: number; b?: number })
    expect(unwrap(state)).toEqual({ a: 1, b: 3 })
  })

  it('round-trips an explicitly-undefined-valued key rather than dropping it', () => {
    const state = reactive<{ a: number; b?: undefined }>({ a: 1 })
    reconcile(state, { a: 1, b: undefined })
    expect('b' in unwrap(state)).toBe(true)
    expect(Object.keys(unwrap(state))).toEqual(['a', 'b'])
  })

  it('recurses into nested objects, only notifying the leaf that changed', () => {
    const state = reactive({ user: { name: 'Ada', address: { city: 'London' } } })
    const addrBefore = state.user.address
    let cityRuns = 0
    let nameRuns = 0
    effect(() => {
      cityRuns++
      void state.user.address.city
    })
    effect(() => {
      nameRuns++
      void state.user.name
    })
    reconcile(state, { user: { name: 'Ada', address: { city: 'Cambridge' } } })
    expect(cityRuns).toBe(2)
    expect(nameRuns).toBe(1)
    expect(state.user.address).toBe(addrBefore) // identity preserved, only value changed
  })
})

describe('reconcile() — arrays, default (index) matching', () => {
  it('updates in place by position and truncates on shrink', () => {
    const list = reactive([
      { id: 1, done: false },
      { id: 2, done: false },
    ])
    const row0Before = list[0]
    reconcile(list, [{ id: 1, done: true }])
    expect(unwrap(list)).toEqual([{ id: 1, done: true }])
    expect(list[0]).toBe(row0Before) // same slot -> same nested identity
  })

  it('extends on grow', () => {
    const list = reactive<number[]>([1])
    reconcile(list, [1, 2, 3])
    expect(unwrap(list)).toEqual([1, 2, 3])
  })

  it('notifies an effect subscribed to a dropped index on shrink', () => {
    const rows = reactive([10, 20, 30])
    const seen: (number | undefined)[] = []
    effect(() => {
      seen.push(rows[2] as number | undefined)
    })
    expect(seen).toEqual([30])
    reconcile(rows, [10])
    expect(seen).toEqual([30, undefined])
  })
})

describe('reconcile() — arrays, keyed matching', () => {
  it('preserves row identity across a reorder, keyed by a string prop', () => {
    const todos = reactive([
      { id: 1, title: 'a', done: false },
      { id: 2, title: 'b', done: false },
    ])
    const row1Before = todos[1] // id: 2

    reconcile(
      todos,
      [
        { id: 2, title: 'b', done: true }, // moved to front, done flipped
        { id: 1, title: 'a', done: false },
      ],
      { key: 'id' },
    )

    expect(unwrap(todos).map((t) => t.id)).toEqual([2, 1])
    expect(todos[0]).toBe(row1Before) // moved row kept its identity
    expect(todos[0].done).toBe(true)
  })

  it('accepts a key function', () => {
    const rows = reactive([{ key: 'a', v: 1 }])
    const rowBefore = rows[0]
    reconcile(rows, [{ key: 'a', v: 2 }], { key: (item) => (item as { key: string }).key })
    expect(rows[0]).toBe(rowBefore)
    expect(rows[0].v).toBe(2)
  })

  it('drops rows absent from the next payload and adds new ones', () => {
    const rows = reactive([
      { id: 1, v: 'x' },
      { id: 2, v: 'y' },
    ])
    reconcile(
      rows,
      [
        { id: 2, v: 'y' },
        { id: 3, v: 'z' },
      ],
      { key: 'id' },
    )
    expect(unwrap(rows).map((r) => r.id)).toEqual([2, 3])
  })

  it('a duplicate key in the payload does not alias two slots onto one raw row', () => {
    const rows = reactive([{ id: 1, v: 'a' }])
    reconcile(
      rows,
      [
        { id: 1, v: 'x' },
        { id: 1, v: 'y' },
      ],
      { key: 'id' },
    )
    const raw = unwrap(rows)
    expect(raw).toEqual([
      { id: 1, v: 'x' },
      { id: 1, v: 'y' },
    ])
    expect(raw[0]).not.toBe(raw[1]) // no aliasing: writing row 0 must not mutate row 1
    ;(rows[0] as { v: string }).v = 'z'
    expect(raw[1].v).toBe('y')
  })

  it('threads the `key` option into nested arrays, not only the top-level one', () => {
    const state = reactive({
      rows: [
        { id: 1, v: 'a' },
        { id: 2, v: 'b' },
      ],
    })
    const row1Before = state.rows[1] // id: 2

    reconcile(
      state,
      {
        rows: [
          { id: 2, v: 'c' },
          { id: 1, v: 'a' },
        ],
      },
      { key: 'id' },
    )

    expect(unwrap(state).rows.map((r) => r.id)).toEqual([2, 1])
    // Nested row identity preserved across the reorder — proof the `key`
    // option reached the array nested under `rows`, not just a top-level
    // array target.
    expect(state.rows[0]).toBe(row1Before)
  })
})
