/**
 * Declarative Shadow DOM adoption — step 2 of the SSR child-component plan
 * (`docs/plans/2026-08-05-ssr-child-components.md`).
 *
 * Adoption used to be light-DOM-only: `isLightDom` (i.e. `shadowRoot === null`)
 * gated the whole `_hydrate` branch, so a shadow-mode component could only ever
 * discard a server template and mount fresh. That is the correct behaviour for
 * a server that emits the tree as light children — and it stays pinned in
 * `hydrate-integration.test.ts`'s T-A3b — but it makes DSD unreachable, and DSD
 * is how a shadow-mode component gets server HTML at all.
 *
 * These tests pin the two halves that make it reachable:
 *   1. `define-element.ts`'s `!this.shadowRoot` guard — a host whose root the
 *      PARSER already attached must upgrade without throwing, and without its
 *      server-rendered content being wiped.
 *   2. `define-component.ts`'s adopt branch — a marked host whose template
 *      lives in that root hydrates INTO the root, not into the element.
 *
 * Every test drives the real ordering that produces a declarative root in a
 * browser: the host exists (with a populated root) BEFORE the definition is
 * registered, and `customElements.define` upgrades it. That is what a deferred
 * `<script type="module">` bootstrap does, which is how `@aihu/app` loads.
 *
 * Nothing on the server emits DSD yet — step 4 does. These paths are dormant
 * until it lands, which is exactly why they are pinned now.
 */

import { leaf, mount } from '@aihu/arbor'
import { signal } from '@aihu/signals'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { _setHydrate, _setMount, _setSignal, defineComponent } from '../src/define-component.ts'
import { defineElement } from '../src/define-element.ts'
import { type SetupContext, SHADOW_ROOT_MODE } from '../src/types.ts'

let tagCounter = 0
const nextTag = (): string => `x-dsd${++tagCounter}`

_setMount(mount)
_setSignal(signal as Parameters<typeof _setSignal>[0])

const fakeScope = () => ({ dispose: vi.fn(), agent: {}, serialize: vi.fn() })

/**
 * Build a host the way the HTML parser does for
 * `<x-foo data-aihu-ssr><template shadowrootmode="open">…</template></x-foo>`:
 * a shadow root that already exists and already holds the server's tree, on an
 * element that has NOT yet been upgraded.
 *
 * jsdom does not parse `shadowrootmode` templates, so the root is attached by
 * hand — but the ordering, which is the whole point, is identical: root first,
 * definition second.
 */
function declarativeHost(tag: string, innerHTML = '<p data-aihu-path="0">srv</p>'): HTMLElement {
  const el = document.createElement(tag)
  el.setAttribute('data-aihu-ssr', '')
  el.attachShadow({ mode: SHADOW_ROOT_MODE }).innerHTML = innerHTML
  return el
}

afterEach(() => {
  _setHydrate(null)
  _setMount(mount)
  document.body.replaceChildren()
})

describe('DSD guard — define-element attaches only when no root exists', () => {
  // These assert that the component RAN, never merely that `defineElement`
  // returned. A constructor throw during upgrade does not propagate out of
  // `customElements.define` — the platform (and jsdom) swallows it into the
  // custom-element reaction queue and leaves the element inert. So
  // `expect(...).not.toThrow()` around `defineElement` passes with or without
  // the guard and proves nothing; "setup ran" is the observable difference.
  it('a host whose root already exists still upgrades and connects', () => {
    const setupSpy = vi.fn(() => leaf('client'))
    _setHydrate(vi.fn().mockReturnValue(fakeScope()) as Parameters<typeof _setHydrate>[0])

    const tag = nextTag()
    const el = declarativeHost(tag)
    document.body.appendChild(el)
    defineElement(
      tag,
      defineComponent(setupSpy as unknown as (ctx: SetupContext) => ReturnType<typeof leaf>),
    )

    // Without the `!this.shadowRoot` guard the constructor's second
    // attachShadow raises NotSupportedError, the upgrade is abandoned, and
    // this count is 0.
    expect(setupSpy).toHaveBeenCalledTimes(1)
  })

  it("the parser's root is kept, populated, and not swapped for a fresh one", () => {
    const setupSpy = vi.fn(() => leaf('client'))
    _setHydrate(vi.fn().mockReturnValue(fakeScope()) as Parameters<typeof _setHydrate>[0])

    const tag = nextTag()
    const el = declarativeHost(tag)
    const parserRoot = el.shadowRoot
    document.body.appendChild(el)
    defineElement(
      tag,
      defineComponent(setupSpy as unknown as (ctx: SetupContext) => ReturnType<typeof leaf>),
    )

    expect(setupSpy).toHaveBeenCalledTimes(1)
    // Identity AND content: per spec, attachShadow over a DECLARATIVE root
    // does not throw — it empties that root and hands it back — so an
    // identity check alone would still pass while the server's tree was
    // silently deleted.
    expect(el.shadowRoot).toBe(parserRoot)
    expect(el.shadowRoot?.querySelector('p')?.textContent).toBe('srv')
  })

  it('a client-only shadow component still gets a root, attached with SHADOW_ROOT_MODE', () => {
    const tag = nextTag()
    defineElement(
      tag,
      defineComponent((_ctx: SetupContext) => leaf('client')),
    )

    const el = document.createElement(tag)
    document.body.appendChild(el)

    expect(el.shadowRoot).not.toBeNull()
    expect(el.shadowRoot?.mode).toBe(SHADOW_ROOT_MODE)
    expect(SHADOW_ROOT_MODE).toBe('open')
  })
})

describe('DSD adoption — a shadow host hydrates into its declarative root', () => {
  it('calls hydrate (not mount) for a marked host with a populated root', () => {
    const hydrateSpy = vi.fn().mockReturnValue(fakeScope())
    const mountSpy = vi.fn().mockReturnValue(fakeScope())
    _setHydrate(hydrateSpy as Parameters<typeof _setHydrate>[0])
    _setMount(mountSpy as Parameters<typeof _setMount>[0])

    const tag = nextTag()
    const el = declarativeHost(tag)
    document.body.appendChild(el)
    defineElement(
      tag,
      defineComponent((_ctx: SetupContext) => leaf('adopt-me')),
    )

    expect(hydrateSpy).toHaveBeenCalledTimes(1)
    expect(mountSpy).not.toHaveBeenCalled()
  })

  it('hands hydrate the SHADOW ROOT as its container, not the element', () => {
    const hydrateSpy = vi.fn().mockReturnValue(fakeScope())
    _setHydrate(hydrateSpy as Parameters<typeof _setHydrate>[0])

    const tag = nextTag()
    const el = declarativeHost(tag)
    document.body.appendChild(el)
    defineElement(
      tag,
      defineComponent((_ctx: SetupContext) => leaf('adopt-me')),
    )

    // The template is inside the root; hydrating against the element would
    // walk an empty child list and silently materialise a second copy.
    expect(hydrateSpy.mock.calls[0]![1]).toBe(el.shadowRoot)
  })

  it('leaves the server nodes in place for hydrate to walk', () => {
    // The content assertion is checked AT the moment hydrate is called, not
    // afterwards: an inert element that never upgraded also ends the test with
    // its server nodes intact, so a post-hoc check would pass vacuously.
    let contentAtHydrate: string | undefined
    const hydrateSpy = vi.fn((_c: unknown, host: Element | ShadowRoot) => {
      contentAtHydrate = (host as ShadowRoot).querySelector('p')?.textContent ?? undefined
      return fakeScope()
    })
    _setHydrate(hydrateSpy as unknown as Parameters<typeof _setHydrate>[0])

    const tag = nextTag()
    const el = declarativeHost(tag)
    document.body.appendChild(el)
    defineElement(
      tag,
      defineComponent((_ctx: SetupContext) => leaf('adopt-me')),
    )

    expect(hydrateSpy).toHaveBeenCalledTimes(1)
    expect(contentAtHydrate).toBe('srv')
  })

  it('still keys the signal snapshot by tag name in shadow mode', () => {
    const hydrateSpy = vi.fn().mockReturnValue(fakeScope())
    _setHydrate(hydrateSpy as Parameters<typeof _setHydrate>[0])

    const tag = nextTag()
    const original = (globalThis as Record<string, unknown>).__aihu_state__
    ;(globalThis as Record<string, unknown>).__aihu_state__ = { [tag]: { '0.text': 'seeded' } }

    const el = declarativeHost(tag)
    document.body.appendChild(el)
    defineElement(
      tag,
      defineComponent((_ctx: SetupContext) => leaf('adopt-me')),
    )

    expect(hydrateSpy.mock.calls[0]![2]).toEqual({ '0.text': 'seeded' })
    ;(globalThis as Record<string, unknown>).__aihu_state__ = original
  })

  it('an UNMARKED host with a populated root is not adopted', () => {
    const hydrateSpy = vi.fn().mockReturnValue(fakeScope())
    const mountSpy = vi.fn().mockReturnValue(fakeScope())
    _setHydrate(hydrateSpy as Parameters<typeof _setHydrate>[0])
    _setMount(mountSpy as Parameters<typeof _setMount>[0])

    const tag = nextTag()
    const el = declarativeHost(tag)
    el.removeAttribute('data-aihu-ssr') // a root aihu did not author
    document.body.appendChild(el)
    defineElement(
      tag,
      defineComponent((_ctx: SetupContext) => leaf('client')),
    )

    // `data-aihu-ssr` is the ONLY thing that declares existing DOM to be this
    // component's own server template. A populated root alone must not.
    expect(hydrateSpy).not.toHaveBeenCalled()
    expect(mountSpy).toHaveBeenCalledTimes(1)
  })

  it('falls back to a fresh mount when no hydrate fn is wired, clearing the stale root', () => {
    _setHydrate(null) // 'spa' bootstrap served a prerendered page
    _setMount(mount)

    const tag = nextTag()
    const el = declarativeHost(tag, '<div class="stale">stale</div>')
    document.body.appendChild(el)
    defineElement(
      tag,
      defineComponent((_ctx: SetupContext) => leaf('client')),
    )

    // Mount targets the root, so an uncleared root would render the client
    // tree beside the server's copy.
    expect(el.shadowRoot?.querySelector('.stale')).toBeNull()
    expect(el.shadowRoot?.textContent).toBe('client')
  })

  it('disconnect clears the adopted root, so a reconnect re-renders cleanly', () => {
    const realMount = mount
    _setHydrate(((component: () => unknown, host: Element | ShadowRoot) =>
      realMount(component() as Parameters<typeof mount>[0], host)) as Parameters<
      typeof _setHydrate
    >[0])

    const tag = nextTag()
    const el = declarativeHost(tag)
    document.body.appendChild(el)
    defineElement(
      tag,
      defineComponent((_ctx: SetupContext) => leaf('adopt-me')),
    )

    el.remove()

    // The first hydration consumed the server's structural markers; leaving
    // that DOM behind would make a reconnect append beside a stale copy.
    expect(el.shadowRoot?.childNodes.length).toBe(0)
  })
})
