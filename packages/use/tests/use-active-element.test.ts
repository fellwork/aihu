/**
 * Behavioural tests for `useActiveElement` — a reactive
 * `composedActiveElement` (composed-tree-helper design note §6). The
 * load-bearing case: focus landing on a leaf TWO nested open shadow roots
 * deep must be reported as that leaf, not `document.activeElement`'s
 * outermost-host answer.
 */
import { effect } from '@aihu/signals'
import { afterEach, describe, expect, it } from 'vitest'
import { useActiveElement } from '../src/useActiveElement/index.ts'
import { withSSR } from './_ssr.ts'

describe('@aihu/use/useActiveElement', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('starts at the currently-focused (light-DOM) element', () => {
    const button = document.createElement('button')
    document.body.appendChild(button)
    button.focus()
    const { activeElement } = useActiveElement()
    expect(activeElement()).toBe(button)
  })

  it('starts at document.body when nothing is focused (spec default, not null)', () => {
    const { activeElement } = useActiveElement()
    expect(activeElement()).toBe(document.body)
  })

  it('updates on focusin/focusout for plain light-DOM elements', () => {
    const a = document.createElement('button')
    const b = document.createElement('button')
    document.body.append(a, b)
    const { activeElement } = useActiveElement()

    a.focus()
    expect(activeElement()).toBe(a)
    b.focus()
    expect(activeElement()).toBe(b)
    b.blur()
    // Spec default once nothing is explicitly focused — document.body, not
    // null (see module doc).
    expect(activeElement()).toBe(document.body)
  })

  it('SHADOW BOUNDARY: reports the deep leaf across TWO nested open shadow roots, not the outer host', () => {
    const outerHost = document.createElement('div')
    document.body.appendChild(outerHost)
    const outerRoot = outerHost.attachShadow({ mode: 'open' })
    const innerHost = document.createElement('div')
    outerRoot.appendChild(innerHost)
    const innerRoot = innerHost.attachShadow({ mode: 'open' })
    const button = document.createElement('button')
    innerRoot.appendChild(button)

    const { activeElement } = useActiveElement()
    button.focus()

    // NEGATIVE CONTROL: the API every naive port reaches for stops at the
    // outer host — proves the fixture actually exercises the bug.
    expect(document.activeElement).toBe(outerHost)
    expect(activeElement()).toBe(button)
  })

  it('is reactive — an effect reading the getter re-runs when focus moves across a shadow boundary', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = host.attachShadow({ mode: 'open' })
    const button = document.createElement('button')
    root.appendChild(button)

    const { activeElement } = useActiveElement()
    const seen: Array<Element | null> = []
    const dispose = effect(() => {
      seen.push(activeElement())
    })
    button.focus()
    expect(seen).toEqual([document.body, button])
    dispose()
  })
})

describe('@aihu/use/useActiveElement — SSR-static path', () => {
  it('returns a static null getter and registers no listener under SSR', () =>
    withSSR(
      () => import('../src/useActiveElement/index.ts'),
      (mod) => {
        const { activeElement } = mod.useActiveElement()
        expect(activeElement()).toBeNull()
      },
    ))
})
