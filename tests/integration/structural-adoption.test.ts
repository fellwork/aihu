/**
 * Structural IN-PLACE adoption (#465 follow-up to adopt-by-replace).
 *
 * `hydrate()` now claims the server-rendered DOM inside
 * `<!--aihu:s:PATH-->` … `<!--aihu:/s:PATH-->` segments into live reconciler
 * child scopes instead of replacing it. These tests pin the properties a
 * page-load probe cannot see:
 *
 *  1. IDENTITY — the server's own elements survive hydration (same objects).
 *  2. TRUTHFUL BOOKKEEPING — the first post-hydration mutation (append,
 *     remove, reorder, condition flip) operates on the adopted DOM without
 *     corruption. This is the failure mode most likely to slip through:
 *     adopting nodes without registering them in the child scopes renders
 *     fine at load and falls apart on the first update.
 *  3. DIVERGENCE — client state that disagrees with what the server rendered
 *     (flipped condition, changed list) resolves to client truth, exactly
 *     once, in position.
 */

import { branch, each, hydrate, leaf, when } from '@aihu/arbor'
import { renderToString } from '@aihu/server'
import type { Signal } from '@aihu/signals'
import { signal } from '@aihu/signals'
import { describe, expect, it } from 'vitest'

const sig = <T>(pair: readonly unknown[]) => pair as unknown as Signal<T>

async function hostFor(component: () => unknown): Promise<HTMLDivElement> {
  const html = await renderToString(component, { hydratable: true })
  const host = document.createElement('div')
  host.innerHTML = html
  return host
}

describe('structural in-place adoption — identity', () => {
  it('A1: each() rows are ADOPTED — the server elements survive as the same objects', async () => {
    const [items, setItems] = signal(['Alpha', 'Beta', 'Gamma'])
    const component = () =>
      branch('ul', undefined, [
        each(
          sig<string[]>([items, setItems]),
          (s) => s as string,
          (s) => branch('li', undefined, [leaf(s as string)]),
        ),
      ])

    const host = await hostFor(component)
    const before = Array.from(host.querySelectorAll('li'))
    expect(before.length).toBe(3)

    hydrate(component as () => never, host, {})

    const after = Array.from(host.querySelectorAll('li'))
    expect(after.length).toBe(3)
    for (let i = 0; i < 3; i++) expect(after[i]).toBe(before[i])
  })

  it('A2: an active when() branch is ADOPTED byte-identically (no DOM mutation at all)', async () => {
    const [on, setOn] = signal(true)
    const component = () =>
      branch('main', undefined, [
        when(sig<boolean>([on, setOn]), () => branch('p', { class: 'g' }, [leaf('gated')])),
      ])

    const host = await hostFor(component)
    const htmlBefore = host.innerHTML
    const pBefore = host.querySelector('p')

    hydrate(component as () => never, host, {})

    expect(host.innerHTML).toBe(htmlBefore)
    expect(host.querySelector('p')).toBe(pBefore)
  })

  it('A3: reactive bindings inside adopted rows drive the SERVER text nodes', async () => {
    const [label, setLabel] = signal('server-label')
    const [items, setItems] = signal(['only'])
    const component = () =>
      branch('ul', undefined, [
        each(
          sig<string[]>([items, setItems]),
          (s) => s as string,
          () => branch('li', undefined, [leaf(sig<string>([label, setLabel]))]),
        ),
      ])

    const host = await hostFor(component)
    const textNode = host.querySelector('li')?.firstChild ?? null
    expect(textNode?.nodeValue).toBe('server-label')

    hydrate(component as () => never, host, {})

    setLabel('updated-in-place')
    expect(textNode?.nodeValue).toBe('updated-in-place')
  })
})

describe('structural in-place adoption — post-adoption mutations (the real test)', () => {
  const listComponent = (items: Signal<string[]>) => () =>
    branch('ul', undefined, [
      each(
        items,
        (s) => s as string,
        (s) => branch('li', undefined, [leaf(s as string)]),
      ),
    ])

  it('B1: APPEND after adoption — new row lands in position, adopted rows untouched', async () => {
    const [items, setItems] = signal(['A', 'B'])
    const component = listComponent(sig<string[]>([items, setItems]))
    const host = await hostFor(component)
    const [liA, liB] = Array.from(host.querySelectorAll('li'))

    hydrate(component as () => never, host, {})

    setItems(['A', 'B', 'C'])
    const lis = Array.from(host.querySelectorAll('li'))
    expect(lis.map((l) => l.textContent)).toEqual(['A', 'B', 'C'])
    expect(lis[0]).toBe(liA)
    expect(lis[1]).toBe(liB)
    // New row is INSIDE the <ul>, not appended past the segment boundary.
    expect(lis[2]?.parentElement?.tagName).toBe('UL')
  })

  it('B2: REMOVE after adoption — the adopted row and its anchor leave cleanly', async () => {
    const [items, setItems] = signal(['A', 'B', 'C'])
    const component = listComponent(sig<string[]>([items, setItems]))
    const host = await hostFor(component)

    hydrate(component as () => never, host, {})

    setItems(['A', 'C'])
    const lis = Array.from(host.querySelectorAll('li'))
    expect(lis.map((l) => l.textContent)).toEqual(['A', 'C'])
    expect(host.textContent).not.toContain('B')

    // And a subsequent re-add works (scope map stayed coherent).
    setItems(['A', 'B', 'C'])
    expect(Array.from(host.querySelectorAll('li')).map((l) => l.textContent)).toEqual([
      'A',
      'B',
      'C',
    ])
  })

  it('B3: REORDER after adoption — same elements, new order', async () => {
    const [items, setItems] = signal(['A', 'B', 'C'])
    const component = listComponent(sig<string[]>([items, setItems]))
    const host = await hostFor(component)
    const before = new Map(Array.from(host.querySelectorAll('li')).map((l) => [l.textContent, l]))

    hydrate(component as () => never, host, {})

    setItems(['C', 'A', 'B'])
    const lis = Array.from(host.querySelectorAll('li'))
    expect(lis.map((l) => l.textContent)).toEqual(['C', 'A', 'B'])
    // Rows were MOVED, not rebuilt: identity preserved across the reorder.
    for (const l of lis) expect(l).toBe(before.get(l.textContent))
  })

  it('B4: condition flips OFF and back ON after an adopted when()', async () => {
    const [on, setOn] = signal(true)
    const component = () =>
      branch('main', undefined, [
        branch('h1', undefined, [leaf('before')]),
        when(sig<boolean>([on, setOn]), () => branch('p', undefined, [leaf('gated')])),
        branch('footer', undefined, [leaf('after')]),
      ])
    const host = await hostFor(component)

    hydrate(component as () => never, host, {})

    setOn(false)
    expect(host.querySelector('p')).toBeNull()
    expect(host.textContent).not.toContain('gated')
    setOn(true)
    // Rebuilt IN POSITION (between h1 and footer), exactly once.
    const kids = Array.from(host.querySelector('main')!.children).map((el) => el.tagName)
    expect(kids).toEqual(['H1', 'P', 'FOOTER'])
  })

  it('B5: the docs-sidebar shape — each() rows containing per-row when() — adopts and stays live', async () => {
    // <li each> containing <a if={ready}> / <span if={!ready}> per row.
    const [rows, setRows] = signal([
      { href: '/a', ready: true },
      { href: '/b', ready: false },
    ])
    type Row = { href: string; ready: boolean }
    const component = () =>
      branch('ul', undefined, [
        each(
          sig<Row[]>([rows, setRows]),
          (r) => (r as Row).href,
          (r) =>
            branch('li', undefined, [
              when(sig<boolean>([() => (r as Row).ready]), () =>
                branch('a', { href: (r as Row).href }, [leaf('link')]),
              ),
              when(sig<boolean>([() => !(r as Row).ready]), () =>
                branch('span', undefined, [leaf('soon')]),
              ),
            ]),
        ),
      ])

    const host = await hostFor(component)
    const aBefore = host.querySelector('a')
    const liBefore = Array.from(host.querySelectorAll('li'))

    hydrate(component as () => never, host, {})

    // Adopted: same <li> elements, same <a>, exactly one of each arm.
    expect(Array.from(host.querySelectorAll('li'))).toEqual(liBefore)
    expect(host.querySelector('a')).toBe(aBefore)
    expect(host.querySelectorAll('a').length).toBe(1)
    expect(host.querySelectorAll('span').length).toBe(1)

    // Post-adoption list mutation with per-row structural content.
    setRows([
      { href: '/b', ready: false },
      { href: '/a', ready: true },
      { href: '/c', ready: true },
    ])
    // NOTE: /a and /b keep their KEY but arrive as NEW objects — FEL-395
    // re-grows them by design; the pinned property is correctness, not reuse.
    expect(host.querySelectorAll('li').length).toBe(3)
    expect(host.querySelectorAll('a').length).toBe(2)
    expect(host.querySelectorAll('span').length).toBe(1)
  })
})

describe('structural in-place adoption — divergence', () => {
  it('C1: client condition FALSE against server-rendered TRUE branch → content removed', async () => {
    const [on, setOn] = signal(true)
    const component = () =>
      branch('main', undefined, [
        when(sig<boolean>([on, setOn]), () => branch('p', undefined, [leaf('gated')])),
        branch('footer', undefined, [leaf('after')]),
      ])
    const host = await hostFor(component)
    expect(host.textContent).toContain('gated')

    setOn(false) // client-divergent state (e.g. media query, localStorage)
    hydrate(component as () => never, host, {})

    expect(host.textContent).not.toContain('gated')
    setOn(true)
    expect(host.querySelectorAll('p').length).toBe(1)
  })

  it('C2: client list diverges from server list → matched keys adopted, extras swept, missing created', async () => {
    const [items, setItems] = signal(['A', 'B', 'C'])
    const component = () =>
      branch('ul', undefined, [
        each(
          sig<string[]>([items, setItems]),
          (s) => s as string,
          (s) => branch('li', undefined, [leaf(s as string)]),
        ),
      ])
    const host = await hostFor(component)
    const before = new Map(Array.from(host.querySelectorAll('li')).map((l) => [l.textContent, l]))

    setItems(['B', 'D']) // diverge BEFORE hydration
    hydrate(component as () => never, host, {})

    const lis = Array.from(host.querySelectorAll('li'))
    expect(lis.map((l) => l.textContent)).toEqual(['B', 'D'])
    // B (matching key) was adopted — the server's own element.
    expect(lis[0]).toBe(before.get('B'))
    // A and C (server-only keys) are gone, D (client-only key) was created.
    expect(host.textContent).not.toContain('A')
    expect(host.textContent).not.toContain('C')
  })

  it('C3: server rendered an EMPTY list, client has items → rows created in position', async () => {
    const [items, setItems] = signal<string[]>([])
    const component = () =>
      branch('main', undefined, [
        branch('ul', undefined, [
          each(
            sig<string[]>([items, setItems]),
            (s) => s as string,
            (s) => branch('li', undefined, [leaf(s as string)]),
          ),
        ]),
        branch('footer', undefined, [leaf('after')]),
      ])
    const host = await hostFor(component)

    setItems(['X', 'Y'])
    hydrate(component as () => never, host, {})

    const lis = Array.from(host.querySelectorAll('li'))
    expect(lis.map((l) => l.textContent)).toEqual(['X', 'Y'])
    for (const l of lis) expect(l.parentElement?.tagName).toBe('UL')
  })

  it('C4: client list EMPTY against server-rendered rows → all rows swept', async () => {
    const [items, setItems] = signal(['A', 'B'])
    const component = () =>
      branch('ul', undefined, [
        each(
          sig<string[]>([items, setItems]),
          (s) => s as string,
          (s) => branch('li', undefined, [leaf(s as string)]),
        ),
      ])
    const host = await hostFor(component)
    expect(host.querySelectorAll('li').length).toBe(2)

    setItems([])
    hydrate(component as () => never, host, {})

    expect(host.querySelectorAll('li').length).toBe(0)
    setItems(['A'])
    expect(host.querySelectorAll('li').length).toBe(1)
  })

  it('C5: keys containing dots and hyphens round-trip the path transform', async () => {
    const [items, setItems] = signal(['/guides/getting-started', 'v1.2.3'])
    const component = () =>
      branch('ul', undefined, [
        each(
          sig<string[]>([items, setItems]),
          (s) => s as string,
          (s) => branch('li', undefined, [leaf(s as string)]),
        ),
      ])
    const host = await hostFor(component)
    const before = Array.from(host.querySelectorAll('li'))

    hydrate(component as () => never, host, {})

    const after = Array.from(host.querySelectorAll('li'))
    expect(after).toEqual(before)
    setItems(['v1.2.3', '/guides/getting-started'])
    expect(Array.from(host.querySelectorAll('li')).map((l) => l.textContent)).toEqual([
      'v1.2.3',
      '/guides/getting-started',
    ])
  })

  it('C6: dispose() after adoption removes the structural content it owns', async () => {
    const [items, setItems] = signal(['A', 'B'])
    const [on, setOn] = signal(true)
    const component = () =>
      branch('main', undefined, [
        branch('ul', undefined, [
          each(
            sig<string[]>([items, setItems]),
            (s) => s as string,
            (s) => branch('li', undefined, [leaf(s as string)]),
          ),
        ]),
        when(sig<boolean>([on, setOn]), () => branch('p', undefined, [leaf('gated')])),
      ])
    const host = await hostFor(component)

    const scope = hydrate(component as () => never, host, {})
    scope.dispose()

    // Child scopes were REAL (adopted, not orphaned): dispose tears them down.
    expect(host.querySelectorAll('li').length).toBe(0)
    expect(host.querySelector('p')).toBeNull()
    // And the effects are dead: writes change nothing.
    setItems(['Z'])
    setOn(false)
    expect(host.querySelectorAll('li').length).toBe(0)
  })
})
