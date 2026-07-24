/**
 * `@aihu/reactive/helpers` — design docs/plans/2026-07-24-deep-reactivity.md
 * §4.2, §4.3; acceptance criterion (§12) #5: `effectScope().stop()` disposes
 * a `reactiveComputed` and leaves no edges.
 */
import { effect, effectScope } from '@aihu/signals'
import { describe, expect, it } from 'vitest'
import { __hostOf } from '../../signals/src/signal.ts'
import {
  reactiveComputed,
  reactiveOmit,
  reactivePick,
  toReactive,
  toSignal,
  toSignals,
} from '../src/helpers/index.ts'
import { reactive, unwrap } from '../src/index.ts'
import { __nodeOf } from '../src/internal.ts'

describe('toSignal / toSignals', () => {
  it('toSignal reads/writes through the SAME node the proxy get/set trap uses', () => {
    const user = reactive({ name: 'Ada' })
    const [name, setName] = toSignal(user, 'name')
    let runs = 0
    effect(() => {
      runs++
      void name()
    })
    expect(runs).toBe(1)
    setName('Grace')
    expect(runs).toBe(2)
    expect(user.name).toBe('Grace')

    // Writing through the plain proxy is also visible via the signal lens.
    user.name = 'Alan'
    expect(name()).toBe('Alan')

    // Updater form.
    setName((prev) => `${prev}!`)
    expect(user.name).toBe('Alan!')
  })

  it('toSignals produces one destructure-safe tuple per own key', () => {
    const point = reactive({ x: 1, y: 2 })
    const { x, y } = toSignals(point)
    expect(x[0]()).toBe(1)
    expect(y[0]()).toBe(2)
    x[1](10)
    expect(point.x).toBe(10)
  })
})

describe('toReactive', () => {
  it('bridges a Signal<object> to a reactive-looking view', () => {
    const source: [() => { a: number }, (fn: (prev: { a: number }) => { a: number }) => void] =
      (() => {
        let value = { a: 1 }
        const read = () => value
        const write = (fn: (prev: { a: number }) => { a: number }) => {
          value = fn(value)
        }
        return [read, write]
      })()

    const view = toReactive(source as unknown as Parameters<typeof toReactive>[0])
    expect(view.a).toBe(1)
    view.a = 2
    expect(source[0]().a).toBe(2)
    expect(Object.keys(view)).toEqual(['a'])
  })
})

describe('reactivePick / reactiveOmit', () => {
  it('reactivePick is a read-through view over a subset of keys, tracking preserved', () => {
    const user = reactive({ name: 'Ada', age: 30, secret: 'x' })
    const pub = reactivePick(user, 'name', 'age')
    expect(pub.name).toBe('Ada')
    expect((pub as Record<string, unknown>).secret).toBeUndefined()
    expect(Object.keys(pub).sort()).toEqual(['age', 'name'])

    let runs = 0
    effect(() => {
      runs++
      void pub.name
    })
    expect(runs).toBe(1)
    user.name = 'Grace'
    expect(runs).toBe(2)
    expect(pub.name).toBe('Grace')
  })

  it('reactiveOmit excludes the given keys, tracking preserved', () => {
    const user = reactive({ name: 'Ada', age: 30, secret: 'x' })
    const safe = reactiveOmit(user, 'secret')
    expect(safe.name).toBe('Ada')
    expect((safe as Record<string, unknown>).secret).toBeUndefined()
    expect(Object.keys(safe).sort()).toEqual(['age', 'name'])

    let runs = 0
    effect(() => {
      runs++
      void safe.age
    })
    expect(runs).toBe(1)
    user.age = 31
    expect(runs).toBe(2)
  })
})

describe('reactiveComputed', () => {
  it('stays in sync with fn(), at per-key granularity', () => {
    const values = reactive<{ email: string; name: string }>({ email: '', name: '' })
    const errors = reactiveComputed(() => {
      const out: Record<string, string> = {}
      if (!values.email.includes('@')) out.email = 'invalid'
      if (values.name.length === 0) out.name = 'required'
      return out
    })

    let emailErrorRuns = 0
    let nameErrorRuns = 0
    effect(() => {
      emailErrorRuns++
      void errors.email
    })
    effect(() => {
      nameErrorRuns++
      void errors.name
    })
    expect(emailErrorRuns).toBe(1)
    expect(nameErrorRuns).toBe(1)
    expect(unwrap(errors)).toEqual({ email: 'invalid', name: 'required' })

    values.name = 'Ada' // only the name error should clear
    expect(nameErrorRuns).toBe(2)
    expect(emailErrorRuns).toBe(1) // email error subscriber must NOT re-run

    values.email = 'ada@example.com'
    expect(emailErrorRuns).toBe(2)
    expect(unwrap(errors)).toEqual({})
  })

  it('acceptance #5: effectScope().stop() disposes it and leaves no edges', () => {
    const raw: { n: number } = { n: 1 }
    const values = reactive(raw)
    const scope = effectScope()
    let computedObj!: { double: number }
    scope.run(() => {
      computedObj = reactiveComputed(() => ({ double: values.n * 2 }))
    })
    expect(unwrap(computedObj)).toEqual({ double: 2 })

    // The reactiveComputed's internal effect subscribed to `n`'s node.
    const nNode = __nodeOf(raw, 'n')
    const nHost = __hostOf(nNode as () => number)
    expect(nHost?.subsHead).not.toBeNull()

    values.n = 2
    expect(unwrap(computedObj)).toEqual({ double: 4 })

    scope.stop()

    // The disposed effect must be spliced out of `n`'s subscriber list —
    // zero edges left, exactly acceptance criterion #5.
    expect(nHost?.subsHead).toBeNull()
    expect(nHost?.subsTail).toBeNull()

    // After stop(), further writes must not update the (now-disposed)
    // reactiveComputed's output.
    values.n = 3
    expect(unwrap(computedObj)).toEqual({ double: 4 })
  })
})
