/**
 * Unit tests for the lifecycle-ownership DX arc's `@aihu/runtime` side:
 * `ctx.connected`, the bare `onCommit` export, and the `LifecycleHost`
 * contract it shares with `@aihu/signals/lifecycle`.
 * docs/plans/2026-07-24-lifecycle-ownership-dx.md §2, §4, §6.
 *
 * `_flushCommits` (the deterministic test hook — §2.3) is used throughout
 * instead of awaiting a real animation frame; every test that schedules a
 * commit flushes it before the test ends so the module-level queue never
 * leaks state into a later test.
 */
import { leaf, mount } from '@aihu/arbor'
import { effect, signal } from '@aihu/signals'
import { getLifecycleHost } from '@aihu/signals/lifecycle'
import { describe, expect, it, vi } from 'vitest'
import { _commitQueueSize, _flushCommits } from '../src/commit.ts'
import {
  _setHydrate,
  _setMount,
  _setSignal,
  defineComponent,
  _onCommit as onCommit,
  _onMount as onMount,
} from '../src/define-component.ts'
import { defineElement } from '../src/define-element.ts'
import { RuntimeError } from '../src/types.ts'

_setMount(mount)
_setSignal(signal as Parameters<typeof _setSignal>[0])

let _ctr = 0
function tag(): string {
  return `x-commit-${++_ctr}`
}

describe('connected() — SetupContext.connected', () => {
  it('is true for the lifetime of a connection and latches false on disconnect', () => {
    let captured: (() => boolean) | undefined
    const Cmp = defineComponent((ctx) => {
      captured = ctx.connected
      return leaf('a')
    })
    const t = tag()
    defineElement(t, Cmp)
    const el = document.createElement(t)
    document.body.appendChild(el)

    expect(captured?.()).toBe(true)
    el.remove()
    expect(captured?.()).toBe(false)
  })

  it('never re-arms — a reconnect gets a FRESH connected(), the old one stays latched false', () => {
    let first: (() => boolean) | undefined
    let second: (() => boolean) | undefined
    let calls = 0
    const Cmp = defineComponent((ctx) => {
      calls += 1
      if (calls === 1) first = ctx.connected
      else second = ctx.connected
      return leaf('b')
    })
    const t = tag()
    defineElement(t, Cmp)
    const el = document.createElement(t)
    document.body.appendChild(el)
    el.remove()
    // Reconnect the SAME element — a fresh _build(), fresh scope, fresh signal.
    document.body.appendChild(el)

    expect(first?.()).toBe(false)
    expect(second?.()).toBe(true)
    el.remove()
  })

  it('works identically on the options/props-form component', () => {
    let captured: (() => boolean) | undefined
    const Cmp = defineComponent({
      setup: (ctx) => {
        captured = ctx.connected
        return leaf('opts')
      },
    })
    const t = tag()
    defineElement(t, Cmp)
    const el = document.createElement(t)
    document.body.appendChild(el)
    expect(captured?.()).toBe(true)
    el.remove()
    expect(captured?.()).toBe(false)
  })
})

describe('connected() — adoption path (first-render DOM adoption, one shared connect path)', () => {
  it('is true right after an adopted connect and flips false on disconnect', () => {
    const realMount = mount
    // The isolation strategy from hydrate-integration.test.ts stubs
    // _hydrate so it never touches the real arbor hydrate implementation
    // — but here we DO invoke the passed builder (unlike those tests),
    // because the point is to run the real `_build()` so a real component
    // scope + connected signal + LifecycleHost get created and registered.
    const hydrateSpy = vi.fn((component: () => unknown, host: Element | ShadowRoot) => {
      const tree = component()
      return realMount(tree as Parameters<typeof realMount>[0], host)
    })
    _setHydrate(hydrateSpy as unknown as Parameters<typeof _setHydrate>[0])

    let captured: (() => boolean) | undefined
    const t = tag()
    const Cmp = defineComponent((ctx) => {
      captured = ctx.connected
      return leaf('hydrate-connected')
    })
    defineElement(t, Cmp, { shadowMode: 'light' })

    const el = document.createElement(t)
    el.setAttribute('data-aihu-ssr', '')
    el.innerHTML = '<p data-aihu-path="0">srv</p>'
    document.body.appendChild(el)

    expect(hydrateSpy).toHaveBeenCalledTimes(1)
    expect(captured?.()).toBe(true)

    el.remove()
    expect(captured?.()).toBe(false)

    _setHydrate(null)
    _setMount(mount)
  })
})

describe('onCommit — bare @aihu/runtime export (setup-only, _cur-gated)', () => {
  it('does not fire synchronously at connect — only after the commit queue is flushed', () => {
    const spy = vi.fn()
    const Cmp = defineComponent(() => {
      onCommit(spy)
      return leaf('c')
    })
    const t = tag()
    defineElement(t, Cmp)
    const el = document.createElement(t)
    document.body.appendChild(el)

    expect(spy).not.toHaveBeenCalled()
    _flushCommits()
    expect(spy).toHaveBeenCalledTimes(1)
    el.remove()
  })

  it('is skipped entirely if the element disconnects BEFORE the frame flushes', () => {
    const spy = vi.fn()
    const Cmp = defineComponent(() => {
      onCommit(spy)
      return leaf('d')
    })
    const t = tag()
    defineElement(t, Cmp)
    const el = document.createElement(t)
    document.body.appendChild(el)

    el.remove() // disconnect BEFORE _flushCommits
    _flushCommits()
    expect(spy).not.toHaveBeenCalled()
  })

  it("returned teardown joins the unified LIFO list and runs when the component's scope disposes", () => {
    const teardown = vi.fn()
    const Cmp = defineComponent(() => {
      onCommit(() => teardown)
      return leaf('e')
    })
    const t = tag()
    defineElement(t, Cmp)
    const el = document.createElement(t)
    document.body.appendChild(el)

    _flushCommits()
    expect(teardown).not.toHaveBeenCalled()
    el.remove()
    expect(teardown).toHaveBeenCalledTimes(1)
  })

  it('throws RuntimeError SCR-R0014 when called outside setup', () => {
    expect(() => onCommit(() => {})).toThrow(RuntimeError)
    try {
      onCommit(() => {})
      throw new Error('unreachable')
    } catch (err) {
      expect((err as RuntimeError).code).toBe('SCR-R0014')
    }
  })

  it('throws even when called from inside an onMount body — the bare export is TIGHTER than LifecycleHost.onCommit', () => {
    let threw = false
    const Cmp = defineComponent(() => {
      onMount(() => {
        try {
          onCommit(() => {})
        } catch (err) {
          threw = err instanceof RuntimeError && err.code === 'SCR-R0014'
        }
      })
      return leaf('f')
    })
    const t = tag()
    defineElement(t, Cmp)
    const el = document.createElement(t)
    document.body.appendChild(el)
    expect(threw).toBe(true)
    el.remove()
  })

  it('throws SCR-R0014 (fails loud, does not silently drop the callback) when called synchronously inside an effect() body during setup — signals P0-1 clears the current scope for the duration of every effect run, so `_cur` is non-null but getLifecycleHost() resolves nothing', () => {
    const spy = vi.fn()
    let threw: RuntimeError | undefined
    const Cmp = defineComponent(() => {
      effect(() => {
        try {
          onCommit(spy)
        } catch (err) {
          threw = err as RuntimeError
        }
      })
      return leaf('effect-onCommit')
    })
    const t = tag()
    defineElement(t, Cmp)
    const el = document.createElement(t)
    document.body.appendChild(el)

    expect(threw).toBeInstanceOf(RuntimeError)
    expect(threw?.code).toBe('SCR-R0014')
    expect(spy).not.toHaveBeenCalled()
    el.remove()
  })

  it('registered in setup, still fires on an ADOPTED connect — and so does onMount (the old hydration fork skipped it; adoption shares the one connect path)', () => {
    const realMount = mount
    const hydrateSpy = vi.fn((component: () => unknown, host: Element | ShadowRoot) => {
      const tree = component()
      return realMount(tree as Parameters<typeof realMount>[0], host)
    })
    _setHydrate(hydrateSpy as unknown as Parameters<typeof _setHydrate>[0])

    const commitSpy = vi.fn()
    const mountSpy = vi.fn()
    const t = tag()
    const Cmp = defineComponent(() => {
      onCommit(commitSpy)
      onMount(mountSpy)
      return leaf('hydrate-commit')
    })
    defineElement(t, Cmp, { shadowMode: 'light' })

    const el = document.createElement(t)
    el.setAttribute('data-aihu-ssr', '')
    el.innerHTML = '<p data-aihu-path="0">srv</p>'
    document.body.appendChild(el)

    expect(hydrateSpy).toHaveBeenCalledTimes(1)
    // onMount runs synchronously at connect on the adopted path too.
    expect(mountSpy).toHaveBeenCalledTimes(1)
    expect(commitSpy).not.toHaveBeenCalled()
    _flushCommits()
    expect(commitSpy).toHaveBeenCalledTimes(1)

    el.remove()
    _setHydrate(null)
    _setMount(mount)
  })
})

describe('LifecycleHost.onCommit — the wider getCurrentScope()-gated entry point', () => {
  it('is legal from inside an onMount body, unlike the bare onCommit export', () => {
    const spy = vi.fn()
    const Cmp = defineComponent(() => {
      onMount(() => {
        // Must NOT throw — this is exactly the "measure after the
        // third-party widget I just created in onMount" use site (§2.2).
        getLifecycleHost()?.onCommit(spy)
      })
      return leaf('g')
    })
    const t = tag()
    defineElement(t, Cmp)
    const el = document.createElement(t)
    document.body.appendChild(el)

    expect(spy).not.toHaveBeenCalled()
    _flushCommits()
    expect(spy).toHaveBeenCalledTimes(1)
    el.remove()
  })

  it('connected on the LifecycleHost is the SAME liveness token as ctx.connected', () => {
    let ctxConnected: (() => boolean) | undefined
    let hostConnected: (() => boolean) | undefined
    const Cmp = defineComponent((ctx) => {
      ctxConnected = ctx.connected
      onMount(() => {
        hostConnected = getLifecycleHost()?.connected
      })
      return leaf('h')
    })
    const t = tag()
    defineElement(t, Cmp)
    const el = document.createElement(t)
    document.body.appendChild(el)

    expect(hostConnected).toBe(ctxConnected)
    expect(hostConnected?.()).toBe(true)
    el.remove()
    expect(hostConnected?.()).toBe(false)
  })
})

describe('commit queue retention on scope disposal', () => {
  it('a disconnect before flush releases the queued entry immediately — it does not linger until a frame that may never fire', () => {
    const spy = vi.fn()
    const Cmp = defineComponent(() => {
      onCommit(spy)
      return leaf('queue-retention')
    })
    const t = tag()
    defineElement(t, Cmp)
    const el = document.createElement(t)
    document.body.appendChild(el)

    expect(_commitQueueSize()).toBe(1)
    el.remove() // disconnect BEFORE _flushCommits — no rAF fires in this test
    // The entry must be dropped by disposal, not merely gated at flush time:
    // a suspended/hidden background tab may never deliver the next frame,
    // so anything still `live()`-gated-only would retain the dead scope (and
    // whatever its closure captured) indefinitely.
    expect(_commitQueueSize()).toBe(0)
    _flushCommits()
    expect(spy).not.toHaveBeenCalled()
  })

  it("disconnecting one component does not drop a DIFFERENT component's still-pending commit", () => {
    const spyA = vi.fn()
    const spyB = vi.fn()
    const CmpA = defineComponent(() => {
      onCommit(spyA)
      return leaf('queue-a')
    })
    const CmpB = defineComponent(() => {
      onCommit(spyB)
      return leaf('queue-b')
    })
    const tA = tag()
    const tB = tag()
    defineElement(tA, CmpA)
    defineElement(tB, CmpB)
    const elA = document.createElement(tA)
    const elB = document.createElement(tB)
    document.body.appendChild(elA)
    document.body.appendChild(elB)

    expect(_commitQueueSize()).toBe(2)
    elA.remove()
    expect(_commitQueueSize()).toBe(1)

    _flushCommits()
    expect(spyA).not.toHaveBeenCalled()
    expect(spyB).toHaveBeenCalledTimes(1)
    elB.remove()
  })
})
