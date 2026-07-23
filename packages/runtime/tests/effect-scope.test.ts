/**
 * Component effect scope — effect-scope plan §2 (runtime binding).
 *
 * Every component instance opens a DETACHED root `effectScope` around its
 * `setup()` call; onMount bodies run inside it (`runWithScope`); teardown is
 * ONE unified LIFO list drained by `scope.stop()` on disconnect, before
 * `MountScope.dispose()` (DOM removal last) and the base's teardown.
 *
 * Covers the review findings: P0-2a (scope excludes `_mount`), P0-2b
 * (re-entrant child upgrades never adopt bindings into the parent scope),
 * P0-3 (unified-LIFO order + throw containment), detached roots (finding B),
 * hydration disconnect bridge (finding C), setup-throw + SCR-R0011
 * (finding F), and disconnect throw containment (finding G).
 *
 * Throw-observation strategy: as in define-component.test.ts (Bug 6), jsdom
 * turns synchronous lifecycle-callback throws into unhandled exceptions
 * rather than propagating through appendChild/remove — direct
 * connectedCallback()/disconnectedCallback() calls are how we observe them.
 */

import { branch, leaf, type MountScope, mount } from '@aihu/arbor'
import { effect, effectScope, runWithScope, signal } from '@aihu/signals'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _setMount,
  _setSignal,
  defineComponent,
  _onCleanup as onCleanup,
  _onMount as onMount,
} from '../src/define-component.ts'
import { _setHydrate, defineElement } from '../src/define-element.ts'
import { RuntimeError } from '../src/types.ts'

_setMount(mount)
_setSignal(signal)

let _ctr = 0
function tag(): string {
  return `x-es-${++_ctr}`
}

type SignalLeaf = Parameters<typeof leaf>[0]

describe('component effect scope — ownership', () => {
  it('a composable effect created in setup auto-disposes on unmount (no manual dispose)', () => {
    const [n, setN] = signal(0)
    let runs = 0
    const Cmp = defineComponent(() => {
      // A composable's effect: created while the component scope is current.
      effect(() => {
        n()
        runs++
      })
      return leaf('x')
    })
    const t = tag()
    defineElement(t, Cmp)
    const el = document.createElement(t)
    document.body.appendChild(el)
    expect(runs).toBe(1)
    setN(1)
    expect(runs).toBe(2)
    el.remove()
    setN(2)
    expect(runs).toBe(2) // scope.stop() disposed it — no manual dispose anywhere
  })

  it('an onMount-created effect is scope-owned and disposes on unmount', () => {
    const [n, setN] = signal(0)
    let runs = 0
    const Cmp = defineComponent(() => {
      onMount(() => {
        effect(() => {
          n()
          runs++
        })
      })
      return leaf('x')
    })
    const t = tag()
    defineElement(t, Cmp)
    const el = document.createElement(t)
    document.body.appendChild(el)
    expect(runs).toBe(1)
    el.remove()
    setN(1)
    expect(runs).toBe(1)
  })

  it('rebinding composable: per-run cleanup re-runs on dep change, final cleanup on unmount', () => {
    const [target, setTarget] = signal('a')
    const bound: string[] = []
    const unbound: string[] = []
    // The useEventListener shape: an effect over a reactive arg that
    // self-cleans per run via the effect's own onCleanup registrar.
    function useRebinder(): void {
      effect((onEffectCleanup) => {
        const t = target()
        bound.push(t)
        onEffectCleanup(() => unbound.push(t))
      })
    }
    const Cmp = defineComponent(() => {
      useRebinder()
      return leaf('x')
    })
    const t = tag()
    defineElement(t, Cmp)
    const el = document.createElement(t)
    document.body.appendChild(el)
    expect(bound).toEqual(['a'])
    expect(unbound).toEqual([])
    setTarget('b')
    expect(bound).toEqual(['a', 'b'])
    expect(unbound).toEqual(['a']) // previous run's cleanup fired before re-run
    el.remove()
    expect(unbound).toEqual(['a', 'b']) // final cleanup on scope stop
    setTarget('c')
    expect(bound).toEqual(['a', 'b']) // effect gone
  })

  it('P0-2b: a child upgrading synchronously inside a parent onMount body keeps its bindings out of the parent scope', () => {
    const [n, setN] = signal(0)
    const childTag = tag()
    const Child = defineComponent(() =>
      branch('span', undefined, [leaf([n, setN] as unknown as SignalLeaf)]),
    )
    defineElement(childTag, Child)

    let childEl: HTMLElement | null = null
    const parentTag = tag()
    const Parent = defineComponent(() => {
      onMount(() => {
        // Appending to a connected node upgrades + connects the child
        // SYNCHRONOUSLY while the parent's component scope is current
        // (onMount runs under runWithScope). No runEffect frame here, so
        // P0-1's save/clear does not apply — only arbor's runWithoutScope
        // wrap keeps the child's binding effects unowned.
        childEl = document.createElement(childTag)
        document.body.appendChild(childEl)
      })
      return leaf('p')
    })
    defineElement(parentTag, Parent)

    const p = document.createElement(parentTag)
    document.body.appendChild(p)
    const child = childEl as HTMLElement | null
    expect(child).not.toBeNull()
    const span = child?.shadowRoot?.querySelector('span')
    expect(span?.textContent).toBe('0')

    // Unmount the PARENT alone — its scope.stop() must not have adopted
    // (and therefore must not dispose) the child's binding effects.
    p.remove()
    setN(1)
    expect(span?.textContent).toBe('1') // child binding still live

    child?.remove()
    setN(2)
    expect(span?.textContent).toBe('1') // child's own MountScope owned it
  })

  it('finding B — detached root: a nested child component scope is NOT in the parent scope disposer list', () => {
    const childCleanup = vi.fn()
    const childTag = tag()
    const Child = defineComponent(() => {
      onCleanup(childCleanup)
      return leaf('c')
    })
    defineElement(childTag, Child)

    let childEl: HTMLElement | null = null
    const parentTag = tag()
    const Parent = defineComponent(() => {
      // Child upgrades synchronously INSIDE the parent's scoped setup. Its
      // root scope is detached, so it must not auto-parent into the
      // parent's scope (element↔element ownership is the DOM tree).
      childEl = document.createElement(childTag)
      document.body.appendChild(childEl)
      return leaf('p')
    })
    defineElement(parentTag, Parent)

    const p = document.createElement(parentTag)
    document.body.appendChild(p)
    expect(childCleanup).not.toHaveBeenCalled()

    // Parent scope stops — must NOT cascade into the child's scope.
    p.remove()
    expect(childCleanup).not.toHaveBeenCalled()

    // The child's own disconnect is what stops its scope.
    ;(childEl as HTMLElement | null)?.remove()
    expect(childCleanup).toHaveBeenCalledTimes(1)
  })
})

describe('component effect scope — unified-LIFO teardown (P0-3)', () => {
  it('onMount-returned teardown runs BEFORE setup-time onCleanup (ratified reversal)', () => {
    const order: string[] = []
    const Cmp = defineComponent(() => {
      onCleanup(() => order.push('setup-cleanup'))
      onMount(() => () => order.push('mount-teardown'))
      return leaf('x')
    })
    const t = tag()
    defineElement(t, Cmp)
    const el = document.createElement(t)
    document.body.appendChild(el)
    el.remove()
    // ONE list, LIFO: the teardown registered last (at mount time) drains
    // first. This reverses the pre-scope order (onCleanup FIFO first).
    expect(order).toEqual(['mount-teardown', 'setup-cleanup'])
  })

  it('all teardown (scope) runs before MountScope.dispose', () => {
    const order: string[] = []
    const realMount = mount
    _setMount((node, host) => {
      const scope = realMount(node, host)
      const orig = scope.dispose.bind(scope)
      return {
        ...scope,
        dispose() {
          order.push('mount-scope-dispose')
          orig()
        },
      }
    })
    try {
      const Cmp = defineComponent(() => {
        onCleanup(() => order.push('cleanup'))
        return leaf('x')
      })
      const t = tag()
      defineElement(t, Cmp)
      const el = document.createElement(t)
      document.body.appendChild(el)
      el.remove()
      expect(order).toEqual(['cleanup', 'mount-scope-dispose'])
    } finally {
      _setMount(realMount)
    }
  })

  it('finding G — a throwing disposer still lets MountScope.dispose + the base disconnectedCallback run', () => {
    const order: string[] = []
    class BaseEl extends HTMLElement {
      disconnectedCallback(): void {
        order.push('base')
      }
    }
    const realMount = mount
    _setMount((node, host) => {
      const scope = realMount(node, host)
      const orig = scope.dispose.bind(scope)
      return {
        ...scope,
        dispose() {
          order.push('mount-scope-dispose')
          orig()
        },
      }
    })
    try {
      const Cmp = defineComponent({
        base: BaseEl as unknown as typeof HTMLElement,
        setup: () => {
          onCleanup(() => order.push('other-cleanup'))
          onCleanup(() => {
            throw new Error('teardown boom')
          })
          return leaf('x')
        },
      })
      const t = tag()
      defineElement(t, Cmp)
      const el = document.createElement(t) as HTMLElement & { disconnectedCallback(): void }
      document.body.appendChild(el)
      // Direct call so the rethrow is observable (jsdom swallows reaction
      // throws). Fail-loud: the first disposer error still propagates...
      expect(() => el.disconnectedCallback()).toThrow('teardown boom')
      // ...but never skips the rest: sibling disposers ran
      // (collect-run-all-rethrow-first), then MountScope.dispose, then base.
      expect(order).toEqual(['other-cleanup', 'mount-scope-dispose', 'base'])
      el.remove() // second disconnect is a no-op (scope already stopped+deleted)
      expect(order).toEqual(['other-cleanup', 'mount-scope-dispose', 'base', 'base'])
    } finally {
      _setMount(realMount)
    }
  })
})

describe('component effect scope — setup-throw + fail-loud contract (finding F)', () => {
  it('a setup throw stops the just-opened scope (pre-throw effects do not leak)', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const [n, setN] = signal(0)
      let runs = 0
      const cleanup = vi.fn()
      const Cmp = defineComponent(() => {
        effect(() => {
          n()
          runs++
        })
        onCleanup(cleanup)
        throw new Error('setup boom')
      })
      const t = tag()
      defineElement(t, Cmp)
      const el = document.createElement(t) as HTMLElement & { connectedCallback(): void }
      expect(() => el.connectedCallback()).toThrow('setup boom')
      // The scope was stopped in the catch: the pre-throw effect is disposed
      // and the pre-throw onCleanup ran.
      expect(cleanup).toHaveBeenCalledTimes(1)
      expect(runs).toBe(1)
      setN(1)
      expect(runs).toBe(1)
    } finally {
      errSpy.mockRestore()
    }
  })

  it('onCleanup with no active scope still throws SCR-R0011 (never a silent no-op)', () => {
    let err: unknown
    try {
      onCleanup(() => {})
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(RuntimeError)
    expect((err as RuntimeError).code).toBe('SCR-R0011')
  })
})

describe('component effect scope — hydration disconnect bridge (finding C)', () => {
  let originalState: unknown
  beforeEach(() => {
    originalState = (globalThis as Record<string, unknown>).__aihu_state__
  })
  afterEach(() => {
    ;(globalThis as Record<string, unknown>).__aihu_state__ = originalState
  })

  it('a hydrated component stops its scope on disconnect — no leak', () => {
    const order: string[] = []
    // Stub hydrateFn with the real contract's shape: call component() (which
    // runs _build → opens the component scope) and hand back a MountScope.
    _setHydrate((component) => {
      component()
      return { dispose: () => order.push('hs.dispose') } as unknown as MountScope
    })
    try {
      const [n, setN] = signal(0)
      let runs = 0
      const Cmp = defineComponent(() => {
        effect(() => {
          n()
          runs++
        })
        onCleanup(() => order.push('scope-cleanup'))
        return leaf('h')
      })
      const t = tag()
      ;(globalThis as Record<string, unknown>).__aihu_state__ = { [t]: {} }
      defineElement(t, Cmp, { hydrate: true })
      const el = document.createElement(t)
      document.body.appendChild(el)
      expect(runs).toBe(1)
      el.remove()
      // The bridge stopped the component scope (user cleanups first), then
      // disposed the hydrate MountScope (DOM teardown last).
      expect(order).toEqual(['scope-cleanup', 'hs.dispose'])
      setN(1)
      expect(runs).toBe(1) // the setup-time effect did not leak
    } finally {
      _setHydrate(null as unknown as Parameters<typeof _setHydrate>[0])
    }
  })

  it('a _build throw in the hydrate path stops the scope', () => {
    _setHydrate((component) => {
      component() // rethrows the _build error, like real hydrate without onError
      return { dispose: () => {} } as unknown as MountScope
    })
    try {
      const cleanup = vi.fn()
      const Cmp = defineComponent(() => {
        onCleanup(cleanup)
        throw new Error('hydrate build boom')
      })
      const t = tag()
      ;(globalThis as Record<string, unknown>).__aihu_state__ = { [t]: {} }
      defineElement(t, Cmp, { hydrate: true })
      const el = document.createElement(t) as HTMLElement & { connectedCallback(): void }
      expect(() => el.connectedCallback()).toThrow('hydrate build boom')
      expect(cleanup).toHaveBeenCalledTimes(1) // scope stopped on the throw path
    } finally {
      _setHydrate(null as unknown as Parameters<typeof _setHydrate>[0])
    }
  })
})

describe('component effect scope — review-fix pins', () => {
  it('Q1 pin: onCleanup inside an effect body throws SCR-R0011; onMount there still registers', () => {
    // runEffect clears the current scope for every run (P0-1), including a
    // scoped effect's OWN first run — so onCleanup (scope-routed) must fail
    // loud there, while onMount (_cur-routed) still works. Ruled acceptable:
    // the old onCleanup-in-effect behavior was itself a bug (worked only on
    // the first run, risked cross-component mis-registration).
    let cleanupErr: unknown
    const mountSpy = vi.fn()
    const Cmp = defineComponent(() => {
      effect(() => {
        onMount(mountSpy) // _cur is still set during setup's effect first run
        try {
          onCleanup(() => {})
        } catch (e) {
          cleanupErr = e
        }
      })
      return leaf('x')
    })
    const t = tag()
    defineElement(t, Cmp)
    const el = document.createElement(t)
    document.body.appendChild(el)
    expect(cleanupErr).toBeInstanceOf(RuntimeError)
    expect((cleanupErr as RuntimeError).code).toBe('SCR-R0011')
    expect(mountSpy).toHaveBeenCalledTimes(1)
    el.remove()
  })

  it('P2-1: onCleanup under a STOPPED current scope throws SCR-R0011 (not a silent drop)', () => {
    const stopped = effectScope()
    stopped.stop()
    let err: unknown
    runWithScope(stopped, () => {
      try {
        onCleanup(() => {})
      } catch (e) {
        err = e
      }
    })
    expect(err).toBeInstanceOf(RuntimeError)
    expect((err as RuntimeError).code).toBe('SCR-R0011')
  })

  it('disconnect → reconnect: fresh scope per connection; cleanups fire again on the second disconnect', () => {
    const cleanups: number[] = []
    let conn = 0
    const Cmp = defineComponent(() => {
      const id = ++conn
      onCleanup(() => cleanups.push(id))
      return leaf('x')
    })
    const t = tag()
    defineElement(t, Cmp)
    const el = document.createElement(t)
    document.body.appendChild(el)
    expect(conn).toBe(1)
    el.remove()
    expect(cleanups).toEqual([1])
    // Reconnect: connectedCallback re-runs _build → a FRESH scope (the old
    // one is stop-once and was deleted on disconnect).
    document.body.appendChild(el)
    expect(conn).toBe(2)
    el.remove()
    expect(cleanups).toEqual([1, 2])
  })

  it('P0-2b (template path): a child component in the parent TEMPLATE keeps bindings out of the parent scope', () => {
    const [n, setN] = signal(0)
    const childTag = tag()
    const Child = defineComponent(() =>
      branch('span', undefined, [leaf([n, setN] as unknown as SignalLeaf)]),
    )
    defineElement(childTag, Child)

    // The common composed path: the child upgrades during the parent's
    // _mount (materialize appends it to the connected shadow host).
    let span: Element | null | undefined
    let observed: string | null | undefined
    const parentTag = tag()
    const Parent = defineComponent(() => {
      onCleanup(() => {
        // Runs at parent scope.stop(), BEFORE the parent's MountScope
        // dispose (which is what removes/disconnects the child). If the
        // child's binding had been adopted into the parent scope it would
        // already be dead here (registered after this onCleanup → drained
        // before it, LIFO) and the write below would not render.
        setN(99)
        observed = span?.textContent
      })
      return branch(childTag)
    })
    defineElement(parentTag, Parent)

    const p = document.createElement(parentTag)
    document.body.appendChild(p)
    span = p.shadowRoot?.querySelector(childTag)?.shadowRoot?.querySelector('span')
    expect(span?.textContent).toBe('0')

    p.remove()
    expect(observed).toBe('99') // binding was still live at parent-scope stop
  })

  it('onCleanup inside an onMount body (newly legal) fires on unmount', () => {
    const spy = vi.fn()
    const Cmp = defineComponent(() => {
      onMount(() => {
        // onMount runs under runWithScope(es) — pre-scope this threw
        // SCR-R0011 (_cur was already null at mount time).
        onCleanup(spy)
      })
      return leaf('x')
    })
    const t = tag()
    defineElement(t, Cmp)
    const el = document.createElement(t)
    document.body.appendChild(el)
    expect(spy).not.toHaveBeenCalled()
    el.remove()
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
