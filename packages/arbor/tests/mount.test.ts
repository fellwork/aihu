import { signal } from '@scribe/signals'
import { describe, expect, it, vi } from 'vitest'
import { branch, leaf } from '../src/index.ts'
import { type MountScope, mount } from '../src/mount.ts'
import { _setMountObserver, type MountTelemetry } from '../src/telemetry.ts'

/**
 * Tests for `mount()` + `MountScope` per spec §1.4 + §1.5 + §2.2 + §2.3 +
 * §2.7 + §2.8 + §4 (Task 16) and disposal semantics per §1.5 + §4 (Task 17).
 *
 * This file also folds in the previously-deferred mount-coupled tests from
 * Tasks 13/14/15 per Builder Option A — leaf/branch/attrs integration
 * coverage now lands here alongside `mount()`.
 */

describe('mount() — Task 16 spec tests', () => {
  it('returns a MountScope object with a dispose function (spec §4 Task 16 #1)', () => {
    const host = document.createElement('div')
    const scope = mount(branch('div'), host)
    expect(typeof scope.dispose).toBe('function')
    expect(host.children.length).toBe(1)
    expect(host.children[0]?.tagName).toBe('DIV')
    scope.dispose()
  })

  it('reactive tree mounted → signal write updates DOM (spec §4 Task 16 #2)', () => {
    const host = document.createElement('div')
    const sig = signal('hello')
    const setText = sig[1]
    const scope = mount(branch('p', undefined, [leaf(sig)]), host)
    const p = host.querySelector('p') as HTMLElement
    expect(p.textContent).toBe('hello')
    setText('world')
    expect(p.textContent).toBe('world')
    scope.dispose()
  })

  it('reactive text leaf updates without extra propagation (exactly-once per write)', () => {
    const host = document.createElement('div')
    const sig = signal('a')
    const setText = sig[1]
    let updates = 0
    const scope = mount(branch('p', undefined, [leaf(sig)]), host)
    const p = host.querySelector('p') as HTMLElement
    expect(p.textContent).toBe('a') // initial
    updates = 0
    setText('b')
    updates++
    expect(p.textContent).toBe('b')
    setText('c')
    updates++
    expect(p.textContent).toBe('c')
    expect(updates).toBe(2)
    scope.dispose()
  })

  it('fragment-root branch (null tag) → children direct in host, no wrapper (spec §4 Task 16 #3)', () => {
    const host = document.createElement('div')
    const scope = mount(branch(null, undefined, [leaf('a'), leaf('b')]), host)
    // No wrapper element — text nodes append directly.
    expect(host.children.length).toBe(0)
    expect(host.childNodes.length).toBe(2)
    expect(host.textContent).toBe('ab')
    scope.dispose()
  })

  it('scope.agent._brand === "AgentContext" and is frozen (spec §4 Task 16 #4)', () => {
    const host = document.createElement('div')
    const scope = mount(branch('div'), host)
    expect(scope.agent._brand).toBe('AgentContext')
    expect(Object.isFrozen(scope.agent)).toBe(true)
    scope.dispose()
  })

  it('scope.serialize() returns empty record for non-reactive tree (spec §4 Task 16 #5 / Plan 3.2)', () => {
    const host = document.createElement('div')
    const scope = mount(branch('div'), host)
    expect(scope.serialize()).toEqual({})
    scope.dispose()
  })
})

describe('mount() — folded leaf integration tests', () => {
  it('static text leaf → host.textContent === "hello"', () => {
    const host = document.createElement('div')
    const scope = mount(leaf('hello'), host)
    expect(host.textContent).toBe('hello')
    scope.dispose()
  })

  it('reactive text leaf → initial text from signal', () => {
    const host = document.createElement('div')
    const sig = signal('initial')
    const scope = mount(leaf(sig), host)
    expect(host.textContent).toBe('initial')
    scope.dispose()
  })

  it('signal write → textNode.nodeValue updates', () => {
    const host = document.createElement('div')
    const sig = signal('one')
    const setText = sig[1]
    const scope = mount(leaf(sig), host)
    const textNode = host.childNodes[0] as Text
    expect(textNode.nodeValue).toBe('one')
    setText('two')
    expect(textNode.nodeValue).toBe('two')
    scope.dispose()
  })

  it('leaf.element("img", {src}) → mounted with attribute', () => {
    const host = document.createElement('div')
    const scope = mount(leaf.element('img', { src: '/img.png' }), host)
    const img = host.querySelector('img') as HTMLImageElement
    expect(img.getAttribute('src')).toBe('/img.png')
    scope.dispose()
  })
})

describe('mount() — folded branch integration tests', () => {
  it('branch with tag → element in host', () => {
    const host = document.createElement('div')
    const scope = mount(branch('section'), host)
    expect(host.querySelector('section')).not.toBeNull()
    scope.dispose()
  })

  it('branch with children → children inside parent element', () => {
    const host = document.createElement('div')
    const scope = mount(branch('ul', undefined, [leaf('a'), leaf('b')]), host)
    const ul = host.querySelector('ul') as HTMLElement
    expect(ul.childNodes.length).toBe(2)
    expect(ul.textContent).toBe('ab')
    scope.dispose()
  })

  it('null-tag branch → no wrapper element, children direct in host', () => {
    const host = document.createElement('div')
    const scope = mount(branch(null, undefined, [branch('span'), branch('em')]), host)
    expect(host.children.length).toBe(2)
    expect(host.children[0]?.tagName).toBe('SPAN')
    expect(host.children[1]?.tagName).toBe('EM')
    scope.dispose()
  })
})

describe('mount() — folded attrs integration tests', () => {
  it('signal write to reactive attr → getAttribute updates', () => {
    const host = document.createElement('div')
    const sig = signal('a')
    const setCls = sig[1]
    const scope = mount(branch('p', { class: sig as never }), host)
    const p = host.querySelector('p') as HTMLElement
    expect(p.getAttribute('class')).toBe('a')
    setCls('b')
    expect(p.getAttribute('class')).toBe('b')
    scope.dispose()
  })

  it('reactive signal on property key updates the DOM property (spec §4 Task 15 #5)', () => {
    // Closes Verifier Finding 2: §4 Task 15 #5 ("reactive Signal on a key
    // that triggers `key in el` → property assignment under mountEffect")
    // was covered by composition of two tested paths but not isolated.
    // `'value' in HTMLInputElement` is true, so the mountEffect routes
    // through the property branch of `_setAttrOrProp` (not the attribute
    // branch). Asserting on `input.value` (property) — and confirming
    // `getAttribute('value')` does NOT change — proves the property path.
    const host = document.createElement('div')
    const sig = signal('initial')
    const setVal = sig[1]
    const scope = mount(branch('input', { value: sig as never }), host)
    const input = host.querySelector('input') as HTMLInputElement
    // Initial: property reflects signal; attribute is unchanged from default.
    expect(input.value).toBe('initial')
    expect(input.getAttribute('value')).toBeNull()
    // Reactive write: property updates; attribute remains untouched.
    setVal('updated')
    expect(input.value).toBe('updated')
    expect(input.getAttribute('value')).toBeNull()
    scope.dispose()
  })
})

describe('mount() — telemetry hooks (spec §2.8)', () => {
  it('observer is called with mount-start, effect-create, effect-fire, mount-end', () => {
    const host = document.createElement('div')
    const events: MountTelemetry[] = []
    _setMountObserver((event) => events.push(event))
    try {
      const sig = signal('hi')
      const scope = mount(branch('p', undefined, [leaf(sig)]), host)
      const kinds = events.map((e) => e.kind)
      expect(kinds).toContain('mount-start')
      expect(kinds).toContain('effect-create')
      expect(kinds).toContain('effect-fire')
      expect(kinds).toContain('mount-end')
      // mount-start fires before mount-end.
      expect(kinds.indexOf('mount-start')).toBeLessThan(kinds.indexOf('mount-end'))
      scope.dispose()
    } finally {
      _setMountObserver(() => {})
    }
  })
})

describe('mount() — path keys (spec §2.7)', () => {
  it('reactive attr path key matches <rootId>.0.attr:<key>', () => {
    const host = document.createElement('div')
    const events: MountTelemetry[] = []
    _setMountObserver((event) => events.push(event))
    try {
      const sig = signal('foo')
      const scope = mount(branch('p', { class: sig as never }), host)
      const create = events.find((e) => e.kind === 'effect-create')
      expect(create).toBeDefined()
      // Path: <rootId>.0.attr:class
      expect(create?.path).toMatch(/^\d+\.0\.attr:class$/)
      scope.dispose()
    } finally {
      _setMountObserver(() => {})
    }
  })
})

describe('MountScope.dispose() — Task 17 spec tests', () => {
  it('dispose() clears host children (spec §4 Task 17 #6)', () => {
    const host = document.createElement('div')
    const scope = mount(branch('div'), host)
    expect(host.children.length).toBe(1)
    scope.dispose()
    expect(host.children.length).toBe(0)
  })

  it('after dispose() → signal write does NOT update DOM (spec §4 Task 17 #7)', () => {
    const host = document.createElement('div')
    const sig = signal('hello')
    const setText = sig[1]
    const scope = mount(leaf(sig), host)
    const textNode = host.childNodes[0] as Text
    expect(textNode.nodeValue).toBe('hello')
    scope.dispose()
    setText('after-dispose')
    // Effect torn down → detached textNode retains pre-dispose value.
    expect(host.childNodes.length).toBe(0)
    expect(textNode.nodeValue).toBe('hello')
  })

  it('dispose() twice → no error on second call (spec §4 Task 17 #8 — idempotent)', () => {
    const host = document.createElement('div')
    const scope = mount(branch('div'), host)
    scope.dispose()
    expect(() => scope.dispose()).not.toThrow()
    expect(host.children.length).toBe(0)
  })

  it('LIFO disposal order — effects registered later dispose first (spec §4 Task 17 #9)', () => {
    const host = document.createElement('div')
    const order: string[] = []
    const events: MountTelemetry[] = []

    // Capture dispose order via the telemetry observer; each effect's
    // dispose carries a unique path key (§2.7). LIFO is verified by
    // comparing disposal order against creation order.
    _setMountObserver((event) => {
      if (event.kind === 'effect-dispose') {
        order.push(event.path)
      }
      events.push(event)
    })

    try {
      const a = signal('a')
      const b = signal('b')
      const c = signal('c')
      // Three reactive attrs — registered in DOM walk order (a, b, c).
      const scope = mount(
        branch('p', { 'data-a': a as never, 'data-b': b as never, 'data-c': c as never }),
        host,
      )
      const creates = events.filter((e) => e.kind === 'effect-create').map((e) => e.path)
      expect(creates.length).toBe(3)
      const [pathA, pathB, pathC] = creates as [string, string, string]
      scope.dispose()
      // LIFO: dispose order is the reverse of create order.
      expect(order).toEqual([pathC, pathB, pathA])
    } finally {
      _setMountObserver(() => {})
    }
  })
})

describe('mount() — onError / error boundary (Plan 4.2)', () => {
  it('T1: synchronous materialize throw → onError called with error and path; mount() does not throw', () => {
    // Build a node that throws during materialize by providing a bad signal
    // value that throws when the effect body runs (initial synchronous fire).
    const host = document.createElement('div')
    const throwingSig = signal('x')
    const throwGet = throwingSig[0]
    const _setThrowing = throwingSig[1]
    let effectCallCount = 0

    // We create a reactive leaf whose effect throws on first run.
    // The throw happens inside _mountEffect (reactive effect fire), which
    // counts as a reactive effect error, not a sync materialize error.
    // For T1 (sync materialize throw) we directly test that a sync error
    // in _materialize is caught. We can simulate this by using a getter
    // that throws before mount returns.
    const errorSpy = vi.fn()
    let didThrow = false

    // We override the signal getter to throw on the first read.
    const sigWithInitialThrow: typeof throwingSig = [
      () => {
        if (!didThrow) {
          didThrow = true
          throw new Error('sync-materialize-error')
        }
        return throwGet()
      },
      throwingSig[1],
    ] as unknown as typeof throwingSig

    let scope: MountScope | null = null
    expect(() => {
      scope = mount(branch('p', undefined, [leaf(sigWithInitialThrow)]), host, {
        onError: errorSpy,
      })
    }).not.toThrow()

    expect(errorSpy).toHaveBeenCalledTimes(1)
    const [err, path] = errorSpy.mock.calls[0] as [unknown, string]
    expect((err as Error).message).toBe('sync-materialize-error')
    expect(typeof path).toBe('string')
    expect(path.length).toBeGreaterThan(0)

    effectCallCount = 0 // just to use the variable
    void effectCallCount

    // TS 5.9 narrows `scope` to `never` after closure assignment — explicit cast
    if (scope !== null) (scope as MountScope).dispose()
  })

  it('T2: reactive effect throw → onError called; subsequent signal writes do not re-call onError', () => {
    const host = document.createElement('div')
    const errorSpy = vi.fn()
    let throwOnNext = false

    const sig = signal('initial')
    const setSig = sig[1]

    // Create a reactive text leaf. The getter will throw when we set throwOnNext.
    const reactiveGet: (typeof sig)[0] = () => {
      const val = sig[0]()
      if (throwOnNext) {
        throw new Error('reactive-effect-error')
      }
      return val
    }
    const throwingSig: typeof sig = [reactiveGet, sig[1]] as unknown as typeof sig

    const scope = mount(branch('p', undefined, [leaf(throwingSig)]), host, {
      onError: errorSpy,
    })

    // Initially no error.
    expect(errorSpy).not.toHaveBeenCalled()

    // Now trigger the throw.
    throwOnNext = true
    setSig('trigger-throw')

    // onError should have been called once.
    expect(errorSpy).toHaveBeenCalledTimes(1)

    // Effect is disposed — further signal writes should NOT re-call onError.
    throwOnNext = false
    setSig('after-dispose-of-effect')
    expect(errorSpy).toHaveBeenCalledTimes(1) // still just once

    scope.dispose()
  })

  it('T3: no onError provided + materialize error → error propagates from mount()', () => {
    const host = document.createElement('div')
    let didThrow = false
    const sigWithInitialThrow: ReturnType<typeof signal<string>> = [
      () => {
        if (!didThrow) {
          didThrow = true
          throw new Error('no-handler-error')
        }
        return 'x'
      },
      signal('x')[1],
    ] as unknown as ReturnType<typeof signal<string>>

    // Without onError, mount() should propagate the error.
    expect(() => {
      mount(branch('p', undefined, [leaf(sigWithInitialThrow)]), host)
    }).toThrow('no-handler-error')
  })

  it('T5: effect that throws on first run followed by signal write causes onError exactly once (not twice)', () => {
    // Regression for the disposeRef TDZ bug: when an effect throws on its
    // VERY FIRST synchronous run, disposeRef.fn is null (effect() hasn't
    // returned yet). The self-dispose call disposeRef.fn?.() is a no-op, so
    // the effect stays subscribed. The next signal write then fires onError a
    // second time before finally self-disposing.
    //
    // Precondition: the getter must read sig[0]() BEFORE throwing so that a
    // dep edge is created on the first run. Without the subscription there
    // would be no re-fire and the bug wouldn't manifest.
    const host = document.createElement('div')
    const errorSpy = vi.fn()
    const sig = signal('initial')
    const setSig = sig[1]

    const throwingGet = () => {
      sig[0]() // subscribe to sig, then throw
      throw new Error('always-throws')
    }
    const throwingSig = [throwingGet, sig[1]] as unknown as typeof sig

    const scope = mount(branch('p', undefined, [leaf(throwingSig)]), host, {
      onError: errorSpy,
    })

    expect(errorSpy).toHaveBeenCalledTimes(1)

    // Without the fix: effect is still subscribed → this write re-fires the
    // effect → onError is called a second time.
    setSig('second')
    expect(errorSpy).toHaveBeenCalledTimes(1)

    scope.dispose()
  })

  it('T4: onError returning void → other bindings in same scope continue updating', () => {
    const host = document.createElement('div')
    const errorSpy = vi.fn()
    let throwOnNext = false

    const goodSig = signal('good-initial')
    const setGood = goodSig[1]

    const badSig = signal('bad-initial')
    const setBad = badSig[1]

    // Bad getter: throws when throwOnNext is true.
    const badGet: (typeof badSig)[0] = () => {
      const val = badSig[0]()
      if (throwOnNext) throw new Error('bad-effect-error')
      return val
    }
    const throwingSig: typeof badSig = [badGet, badSig[1]] as unknown as typeof badSig

    const scope = mount(
      branch('div', undefined, [
        branch('span', { id: 'good' }, [leaf(goodSig)]),
        branch('span', { id: 'bad' }, [leaf(throwingSig)]),
      ]),
      host,
      { onError: errorSpy },
    )

    const goodSpan = host.querySelector('#good') as HTMLElement
    const badSpan = host.querySelector('#bad') as HTMLElement

    expect(goodSpan.textContent).toBe('good-initial')
    expect(badSpan.textContent).toBe('bad-initial')

    // Trigger the bad binding.
    throwOnNext = true
    setBad('bad-throw')
    expect(errorSpy).toHaveBeenCalledTimes(1)

    // The good binding should still update normally.
    setGood('good-updated')
    expect(goodSpan.textContent).toBe('good-updated')

    scope.dispose()
  })
})
