/**
 * Core `reactive()`/`isReactive()`/`unwrap()`/`mutate()` behavior — design
 * docs/plans/2026-07-24-deep-reactivity.md §2.6/§2.7, acceptance criteria
 * (§12) #4, #9, #10.
 */
import { batch, effect, untrack } from '@aihu/signals'
import { describe, expect, it, vi } from 'vitest'
// Test-only graph inspectors — NOT re-exported from @aihu/signals' public
// index.ts (public surface stays byte-identical); imported directly from
// source, same as packages/signals' own property tests do.
import { __hostOf } from '../../signals/src/signal.ts'
import { isReactive, mutate, reactive, unwrap } from '../src/index.ts'
import { __nodeOf } from '../src/internal.ts'

describe('reactive() identity + passthrough', () => {
  it('is idempotent and identity-stable', () => {
    const o = { a: 1 }
    const p1 = reactive(o)
    const p2 = reactive(o)
    expect(p1).toBe(p2)
    expect(reactive(p1)).toBe(p1)
  })

  it('wraps plain objects and arrays', () => {
    expect(isReactive(reactive({ a: 1 }))).toBe(true)
    expect(isReactive(reactive([1, 2, 3]))).toBe(true)
  })

  it('returns non-wrappable values unchanged (Date, Map, Set, class, frozen, primitive)', () => {
    const date = new Date()
    expect(reactive(date as unknown as object)).toBe(date)
    const map = new Map()
    expect(reactive(map as unknown as object)).toBe(map)
    const set = new Set()
    expect(reactive(set as unknown as object)).toBe(set)
    class Foo {
      x = 1
    }
    const foo = new Foo()
    expect(reactive(foo)).toBe(foo)
    const frozen = Object.freeze({ a: 1 })
    expect(reactive(frozen)).toBe(frozen)
    expect(reactive(5 as unknown as object)).toBe(5)
    expect(reactive(null as unknown as object)).toBe(null)
  })

  it('isReactive() is false for a raw object and for non-objects', () => {
    expect(isReactive({ a: 1 })).toBe(false)
    expect(isReactive(5)).toBe(false)
    expect(isReactive(null)).toBe(false)
  })
})

describe('unwrap()', () => {
  it('returns the raw object behind a proxy, O(1)', () => {
    const raw = { a: 1 }
    const p = reactive(raw)
    expect(unwrap(p)).toBe(raw)
  })

  it('passes non-proxies through unchanged', () => {
    const raw = { a: 1 }
    expect(unwrap(raw)).toBe(raw)
    expect(unwrap(5)).toBe(5)
  })

  it('the raw tree never contains proxies (unwrap-on-write)', () => {
    const child = { city: 'London' }
    const user = reactive({ address: child })
    user.address = reactive({ city: 'Cambridge' }) as typeof child
    expect(isReactive(unwrap(user).address)).toBe(false)
  })

  it('unwraps proxies nested INSIDE a freshly assigned plain container, not just direct assignments', () => {
    // `outer.box = { inner: someProxy }` — `box` itself is a fresh plain
    // object, never a proxy, so a shallow `unwrap(value)` on write would
    // leave `someProxy` smuggled in under `box.inner`.
    const leaf = reactive({ city: 'London' })
    const outer = reactive<{ box?: { inner: unknown } }>({})
    outer.box = { inner: leaf }
    const rawBox = unwrap(outer).box as { inner: unknown }
    expect(isReactive(rawBox.inner)).toBe(false)
    expect(rawBox.inner).toBe(unwrap(leaf))
  })

  it('unwraps proxies nested inside a fresh array assignment', () => {
    const leaf = reactive({ id: 1 })
    const outer = reactive<{ list?: unknown[] }>({})
    outer.list = [leaf, { nested: leaf }]
    const rawList = unwrap(outer).list as unknown[]
    expect(isReactive(rawList[0])).toBe(false)
    expect(isReactive((rawList[1] as { nested: unknown }).nested)).toBe(false)
  })

  it('tolerates cyclic plain data on the write path (no infinite recursion)', () => {
    const cyclic: Record<string, unknown> = { a: 1 }
    cyclic.self = cyclic
    const o = reactive<{ box?: unknown }>({})
    expect(() => {
      o.box = cyclic
    }).not.toThrow()
  })
})

describe('nested wrapping', () => {
  it('wraps nested plain objects lazily on read', () => {
    const user = reactive({ address: { city: 'London' } })
    const addr = user.address
    expect(isReactive(addr)).toBe(true)
    expect(unwrap(addr)).toBe(unwrap(user).address)
  })
})

describe('deep tracking (acceptance #4)', () => {
  it('an effect reading a.b.c re-runs on a write to c, on replacement of b, and not on a sibling write', () => {
    const user = reactive({ address: { city: 'London', zip: '1' }, other: 1 })
    const seen: string[] = []
    effect(() => {
      seen.push(user.address.city)
    })
    expect(seen).toEqual(['London'])

    user.address.city = 'Cambridge'
    expect(seen).toEqual(['London', 'Cambridge'])

    user.address = { city: 'Oxford', zip: '2' }
    expect(seen).toEqual(['London', 'Cambridge', 'Oxford'])

    // Sibling write (zip) — must NOT re-run the city-only effect.
    user.address.zip = '3'
    expect(seen).toEqual(['London', 'Cambridge', 'Oxford'])

    // Unrelated top-level sibling — must NOT re-run either.
    user.other = 2
    expect(seen).toEqual(['London', 'Cambridge', 'Oxford'])
  })
})

describe('node allocation (acceptance #9)', () => {
  it('an untracked read allocates the key node but adds no graph edge', () => {
    const raw: { x: number } = { x: 1 }
    const o = reactive(raw)

    expect(__nodeOf(raw, 'x')).toBeUndefined()
    untrack(() => o.x)
    const read = __nodeOf(raw, 'x')
    expect(read).toBeDefined()
    const host = __hostOf(read as () => number)
    expect(host).not.toBeNull()
    expect(host?.subsHead).toBeNull()
    expect(host?.subsTail).toBeNull()

    // A subsequent write to that key must not enqueue or run any effect
    // (nothing ever subscribed — a correct no-op by construction, not a
    // gap): an unrelated effect (subscribed to nothing) proves the write
    // doesn't spuriously wake anything, and the node stays edge-free.
    const spy = vi.fn()
    effect(spy)
    expect(spy).toHaveBeenCalledTimes(1)
    o.x = 2
    expect(spy).toHaveBeenCalledTimes(1)
    expect(host?.subsHead).toBeNull()
  })

  it('a plain (untracked) read outside untrack() also allocates but does not link', () => {
    const raw: { y: number } = { y: 1 }
    const o = reactive(raw)
    expect(__nodeOf(raw, 'y')).toBeUndefined()
    void o.y // plain read, no ambient observer
    const host = __hostOf(__nodeOf(raw, 'y') as () => number)
    expect(host).not.toBeNull()
    expect(host?.subsHead).toBeNull()
  })

  it('a tracked read DOES link an edge', () => {
    const raw: { z: number } = { z: 1 }
    const o = reactive(raw)
    effect(() => void o.z)
    const host = __hostOf(__nodeOf(raw, 'z') as () => number)
    expect(host?.subsHead).not.toBeNull()
  })
})

describe('equality short-circuit (acceptance #10)', () => {
  it('obj.x = obj.x does not trigger an effect drain', () => {
    const o = reactive({ x: 1 })
    const spy = vi.fn()
    effect(() => {
      spy()
      void o.x
    })
    expect(spy).toHaveBeenCalledTimes(1)
    // biome-ignore lint/correctness/noSelfAssign: the point of the test IS the self-assignment no-op.
    o.x = o.x
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('a property add and an out-of-bounds array index write each produce exactly one flush', () => {
    const obj = reactive<{ a: number; b?: number }>({ a: 1 })
    let objRuns = 0
    effect(() => {
      objRuns++
      // Read BOTH the key and the shape so a real add touches both nodes.
      void obj.b
      void Object.keys(obj)
    })
    expect(objRuns).toBe(1)
    obj.b = 2 // add: touches `b` node + KEYS node — must be ONE flush
    expect(objRuns).toBe(2)

    const arr = reactive<number[]>([1, 2])
    let arrRuns = 0
    effect(() => {
      arrRuns++
      void arr[5]
      void arr.length
    })
    expect(arrRuns).toBe(1)
    arr[5] = 99 // out-of-bounds: touches index node + length node — ONE flush
    expect(arrRuns).toBe(2)
  })

  it('delete produces exactly one flush', () => {
    const obj = reactive<{ a: number; b?: number }>({ a: 1, b: 2 })
    let runs = 0
    effect(() => {
      runs++
      void obj.b
      void Object.keys(obj)
    })
    expect(runs).toBe(1)
    delete obj.b
    expect(runs).toBe(2)
  })
})

describe('shape reactivity (KEYS node)', () => {
  it('Object.keys/for-in/spread react to add + delete', () => {
    const o = reactive<Record<string, number>>({ a: 1 })
    const seen: string[][] = []
    effect(() => {
      seen.push(Object.keys(o))
    })
    expect(seen).toEqual([['a']])
    o.b = 2
    expect(seen).toEqual([['a'], ['a', 'b']])
    delete o.b
    expect(seen).toEqual([['a'], ['a', 'b'], ['a']])
  })

  it('`in` tracks the KEYS node', () => {
    const o = reactive<Record<string, number>>({ a: 1 })
    const seen: boolean[] = []
    effect(() => {
      seen.push('b' in o)
    })
    expect(seen).toEqual([false])
    o.b = 2
    expect(seen).toEqual([false, true])
  })
})

describe('arrays', () => {
  it('index write only re-runs an effect reading that index', () => {
    const arr = reactive([1, 2, 3])
    const seenA: number[] = []
    const seenB: number[] = []
    effect(() => seenA.push(arr[0] as number))
    effect(() => seenB.push(arr[1] as number))
    arr[0] = 10
    expect(seenA).toEqual([1, 10])
    expect(seenB).toEqual([2]) // untouched sibling index — no re-run
  })

  it('push() with multiple args is exactly one flush', () => {
    const arr = reactive<number[]>([1])
    let runs = 0
    effect(() => {
      runs++
      void arr.length
    })
    expect(runs).toBe(1)
    arr.push(2, 3, 4)
    expect(runs).toBe(2)
    expect(unwrap(arr)).toEqual([1, 2, 3, 4])
  })

  it('splice() runs inside one batch', () => {
    const arr = reactive<number[]>([1, 2, 3, 4])
    let runs = 0
    effect(() => {
      runs++
      void arr.length
    })
    expect(runs).toBe(1)
    arr.splice(1, 2, 9)
    expect(runs).toBe(2)
    expect(unwrap(arr)).toEqual([1, 9, 4])
  })
})

describe('mutate()', () => {
  it('applies several writes as ONE flush', () => {
    const user = reactive({
      name: 'Ada',
      address: { city: 'London' },
      tags: ['math'] as string[],
    })
    let runs = 0
    effect(() => {
      runs++
      void user.name
      void user.address.city
      void user.tags.length
    })
    expect(runs).toBe(1)
    mutate(user, (u) => {
      u.name = 'Ada L.'
      u.address.city = 'Bletchley'
      u.tags.push('crypto')
    })
    expect(runs).toBe(2)
    expect(user.name).toBe('Ada L.')
    expect(user.address.city).toBe('Bletchley')
    expect(unwrap(user).tags).toEqual(['math', 'crypto'])
  })

  it('is equivalent to batch(() => recipe(target))', () => {
    const o = reactive({ a: 1, b: 1 })
    let runs = 0
    effect(() => {
      runs++
      void o.a
      void o.b
    })
    batch(() => {
      o.a = 2
      o.b = 2
    })
    expect(runs).toBe(2)
  })
})

describe('assigning `undefined` to a missing key (add-detection vs. equality short-circuit)', () => {
  it('creates the key rather than silently dropping the write', () => {
    const o = reactive<{ a: number; b?: undefined }>({ a: 1 })
    o.b = undefined
    expect('b' in unwrap(o)).toBe(true)
    expect(Object.keys(unwrap(o))).toEqual(['a', 'b'])
  })

  it('notifies the KEYS node (Object.keys effect re-runs)', () => {
    const o = reactive<{ a: number; b?: undefined }>({ a: 1 })
    const seen: string[][] = []
    effect(() => {
      seen.push(Object.keys(o))
    })
    expect(seen).toEqual([['a']])
    o.b = undefined
    expect(seen).toEqual([['a'], ['a', 'b']])
  })
})

describe('array truncation notifies dropped indices', () => {
  it('an effect reading a dropped index re-runs (to undefined) after `arr.length = n`', () => {
    const arr = reactive([1, 2, 3])
    const seen: (number | undefined)[] = []
    effect(() => {
      seen.push(arr[2] as number | undefined)
    })
    expect(seen).toEqual([3])
    arr.length = 1
    expect(seen).toEqual([3, undefined])
  })

  it('growing via `length =` does not spuriously notify existing indices', () => {
    const arr = reactive([1, 2])
    let runs = 0
    effect(() => {
      runs++
      void arr[0]
    })
    expect(runs).toBe(1)
    arr.length = 5
    expect(runs).toBe(1)
  })

  it('a same-length assignment is a correct no-op', () => {
    const arr = reactive([1, 2, 3])
    let runs = 0
    effect(() => {
      runs++
      void arr[2]
    })
    expect(runs).toBe(1)
    arr.length = 3
    expect(runs).toBe(1)
  })
})

describe('array shape reactivity (KEYS/length parity)', () => {
  it('Object.keys(arr) re-runs on push()', () => {
    const arr = reactive<number[]>([1, 2])
    const seen: string[][] = []
    effect(() => {
      seen.push(Object.keys(arr))
    })
    expect(seen).toEqual([['0', '1']])
    arr.push(3)
    expect(seen).toEqual([
      ['0', '1'],
      ['0', '1', '2'],
    ])
  })

  it("'k' in arr re-runs on an out-of-bounds index write", () => {
    const arr = reactive<number[]>([1, 2])
    const seen: boolean[] = []
    effect(() => {
      seen.push(2 in arr)
    })
    expect(seen).toEqual([false])
    arr[2] = 3
    expect(seen).toEqual([false, true])
  })
})

describe('SSR-shaped isolation (acceptance #7 analog)', () => {
  it('two independent reactive trees never observe each other (no module-level mutable state)', () => {
    const requestA = reactive({ count: 0 })
    const requestB = reactive({ count: 0 })
    requestA.count = 5
    expect(requestB.count).toBe(0)
    expect(unwrap(requestA)).not.toBe(unwrap(requestB))
  })
})
