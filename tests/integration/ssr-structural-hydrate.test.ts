/**
 * SSR structural walk → hydrate() non-breakage (#465).
 *
 * The structural walk makes the server render `{#if}`/`{#each}` content that
 * previously rendered empty. That changes hydration's starting DOM: the old
 * `_hydrateNode` structural fallback (unconditional `_materialize` append)
 * would now build a SECOND copy of every server-rendered structural subtree
 * beside the server's bytes — the silent duplicated-content failure mode the
 * adoption checker exists for.
 *
 * These tests pin the adopt-by-replace contract: hydrating real
 * `renderToString(…, { hydratable: true })` output containing structural
 * nodes yields content EXACTLY ONCE, in its original position, with the
 * reconciler live (condition flips and list updates work after hydration).
 *
 * Full adoption parity — claiming the server's structural DOM nodes into the
 * reconciler's ChildScopes without a rebuild — is reconciler-integration work
 * and intentionally NOT asserted here; `innerHTML` inside a structural
 * segment MAY be rebuilt. What must hold is exactly-once content, position,
 * order, and live reactivity. Nodes OUTSIDE structural segments must still be
 * adopted untouched.
 */

import { branch, each, leaf, when } from '@aihu/arbor'
import { hydrate } from '@aihu/arbor/hydrate'
import { renderToString } from '@aihu/server'
import type { Signal } from '@aihu/signals'
import { signal } from '@aihu/signals'
import { describe, expect, it } from 'vitest'

const GATED_TEXT = 'GATED-CONTENT-EXACTLY-ONCE'

function countOccurrences(haystack: string, needle: string): number {
  let n = 0
  let i = haystack.indexOf(needle)
  while (i !== -1) {
    n++
    i = haystack.indexOf(needle, i + needle.length)
  }
  return n
}

async function hostFor(component: () => unknown): Promise<HTMLDivElement> {
  const html = await renderToString(component, { hydratable: true })
  const host = document.createElement('div')
  host.innerHTML = html
  return host
}

describe('SSR structural content survives hydration exactly once', () => {
  it('a true {#if} branch is not duplicated by hydrate()', async () => {
    const [on, setOn] = signal(true)
    const component = () =>
      branch('main', { id: 'page' }, [
        branch('h1', undefined, [leaf('Title')]),
        when([on, setOn] as unknown as Signal<boolean>, () =>
          branch('p', { class: 'gated' }, [leaf(GATED_TEXT)]),
        ),
        branch('footer', undefined, [leaf('after')]),
      ])

    const host = await hostFor(component)
    // The server really rendered the gated content (the point of #465).
    expect(host.textContent).toContain(GATED_TEXT)

    hydrate(component as () => never, host, {})

    expect(countOccurrences(host.textContent ?? '', GATED_TEXT)).toBe(1)
    // Position preserved: gated <p> sits between <h1> and <footer>.
    const kids = Array.from(host.querySelector('main')!.children).map((el) => el.tagName)
    expect(kids).toEqual(['H1', 'P', 'FOOTER'])
    // Reconciler is LIVE after hydration: flipping the condition removes it.
    setOn(false)
    expect(countOccurrences(host.textContent ?? '', GATED_TEXT)).toBe(0)
    setOn(true)
    expect(countOccurrences(host.textContent ?? '', GATED_TEXT)).toBe(1)
  })

  it('a false {#if} branch stays absent and can appear later (no phantom content)', async () => {
    const [on, setOn] = signal(false)
    const component = () =>
      branch('main', undefined, [
        when([on, setOn] as unknown as Signal<boolean>, () =>
          branch('p', undefined, [leaf(GATED_TEXT)]),
        ),
      ])

    const host = await hostFor(component)
    expect(host.textContent).not.toContain(GATED_TEXT)

    hydrate(component as () => never, host, {})
    expect(countOccurrences(host.textContent ?? '', GATED_TEXT)).toBe(0)
    setOn(true)
    expect(countOccurrences(host.textContent ?? '', GATED_TEXT)).toBe(1)
  })

  it('{#each} items are not duplicated and the list stays live', async () => {
    const [items, setItems] = signal(['Alpha', 'Beta'])
    const component = () =>
      branch('ul', undefined, [
        each(
          [items, setItems] as unknown as Signal<string[]>,
          (s) => s,
          (s) => branch('li', undefined, [leaf(s)]),
        ),
      ])

    const host = await hostFor(component)
    expect(countOccurrences(host.textContent ?? '', 'Alpha')).toBe(1)

    hydrate(component as () => never, host, {})

    expect(countOccurrences(host.textContent ?? '', 'Alpha')).toBe(1)
    expect(countOccurrences(host.textContent ?? '', 'Beta')).toBe(1)
    expect(host.querySelectorAll('li').length).toBe(2)

    setItems(['Alpha', 'Beta', 'Gamma'])
    expect(host.querySelectorAll('li').length).toBe(3)
    expect(countOccurrences(host.textContent ?? '', 'Gamma')).toBe(1)
  })

  it('siblings OUTSIDE the structural segment are still ADOPTED (not rebuilt)', async () => {
    const [on, setOn] = signal(true)
    const [title, setTitle] = signal('server-title')
    const component = () =>
      branch('main', undefined, [
        branch('h1', undefined, [leaf([title, setTitle] as unknown as Signal<string>)]),
        when([on, setOn] as unknown as Signal<boolean>, () =>
          branch('p', undefined, [leaf(GATED_TEXT)]),
        ),
      ])

    const host = await hostFor(component)
    const h1Before = host.querySelector('h1')
    const h1TextNode = h1Before?.firstChild ?? null

    hydrate(component as () => never, host, {})

    // The non-structural sibling kept node identity AND its reactive wiring
    // drives the server's own text node — adoption, not reconstruction.
    expect(host.querySelector('h1')).toBe(h1Before)
    setTitle('updated-in-place')
    expect(h1TextNode?.nodeValue).toBe('updated-in-place')
  })

  it('the compiled if/else group pair hydrates to exactly one arm', async () => {
    // The compiler's lowering: fragment wrapping two sibling when() nodes.
    const [entitled, setEntitled] = signal(true)
    const component = () =>
      branch('article', undefined, [
        branch('', undefined, [
          when([entitled, setEntitled] as unknown as Signal<boolean>, () =>
            branch('', undefined, [branch('section', { class: 'gx-senses' }, [leaf(GATED_TEXT)])]),
          ),
          when([() => !entitled()] as unknown as Signal<boolean>, () =>
            branch('', undefined, [branch('p', { class: 'gx-locked' }, [leaf('locked')])]),
          ),
        ]),
      ])

    const host = await hostFor(component)
    expect(host.querySelectorAll('.gx-senses').length).toBe(1)
    expect(host.querySelectorAll('.gx-locked').length).toBe(0)

    hydrate(component as () => never, host, {})

    expect(host.querySelectorAll('.gx-senses').length).toBe(1)
    expect(host.querySelectorAll('.gx-locked').length).toBe(0)
    expect(countOccurrences(host.textContent ?? '', GATED_TEXT)).toBe(1)

    setEntitled(false)
    expect(host.querySelectorAll('.gx-senses').length).toBe(0)
    expect(host.querySelectorAll('.gx-locked').length).toBe(1)
  })

  it('markerless (legacy/terminal) HTML keeps the old fallback: content appended, nothing thrown', async () => {
    // Non-hydratable output has no structural delimiters — the walker cannot
    // locate a segment and must fall back to append-materialize, the exact
    // pre-#465 behavior for structural nodes.
    const [on] = signal(true)
    const component = () =>
      branch('main', undefined, [
        when([on, () => {}] as unknown as Signal<boolean>, () =>
          branch('p', undefined, [leaf(GATED_TEXT)]),
        ),
      ])
    const html = await renderToString(component) // NOT hydratable
    const host = document.createElement('div')
    host.innerHTML = html

    hydrate(component as () => never, host, {})
    // Non-hydratable SSR HTML + hydrate is a misuse pairing (no markers of any
    // kind), so duplication is expected here exactly as before the walk; the
    // pinned property is only that hydration completes and content is present.
    expect(host.textContent).toContain(GATED_TEXT)
  })
})
