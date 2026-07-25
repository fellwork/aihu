/**
 * Executable proof that the substrate is load-bearing, not decoration.
 *
 * The SAME assertions run against either the naive light-DOM implementation
 * (`el.contains(event.target)` / `document.activeElement`) or the substrate,
 * selected by an env var:
 *
 *   AIHU_NAIVE=1 bunx vitest run packages/use/tests/composed-tree-naive-proof.test.ts   -> FAILS
 *                bunx vitest run packages/use/tests/composed-tree-naive-proof.test.ts   -> PASSES
 *
 * Default (no env var) is the substrate, so this file is a normal green test in
 * CI. Setting `AIHU_NAIVE=1` is how a reviewer re-confirms the bug is real
 * rather than taking the design note's word for it.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { composedActiveElement, isEventInside } from '../src/shared/composed-tree.ts'

const NAIVE = process.env.AIHU_NAIVE === '1'

/** The implementation almost every VueUse/reactuse port ships. */
const naiveHitTest = (event: Event, node: Node): boolean =>
  node instanceof Element && node.contains(event.target as Node)
const naiveActiveElement = (): Element | null => document.activeElement

const hitTest: (event: Event, node: Node) => boolean = NAIVE
  ? naiveHitTest
  : (event, node) => isEventInside(event, node)
const activeElement: () => Element | null = NAIVE
  ? naiveActiveElement
  : () => composedActiveElement()

afterEach(() => {
  document.body.innerHTML = ''
})

describe(`shadow-boundary correctness [impl: ${NAIVE ? 'NAIVE (expected to fail)' : 'substrate'}]`, () => {
  it('a click inside a shadow-hosted panel counts as INSIDE that panel', () => {
    // The exact shape of a dropdown/popover rendered inside a custom element:
    // the panel the composable guards lives in the shadow tree, and the
    // document-level listener only ever sees the retargeted host.
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = host.attachShadow({ mode: 'open' })
    const panel = document.createElement('div')
    const button = document.createElement('button')
    panel.appendChild(button)
    root.appendChild(panel)

    // `composedPath()` is only populated during dispatch, so the hit-test has
    // to happen inside the listener — exactly as a real composable would.
    let inside: boolean | undefined
    const onClick = (e: Event) => {
      inside = hitTest(e, panel)
    }
    document.addEventListener('click', onClick)
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))
    document.removeEventListener('click', onClick)

    expect(inside).toBeDefined()
    // NAIVE: false (spurious "outside" -> the dropdown closes on its own clicks)
    expect(inside).toBe(true)
  })

  it('the focused element is the deep leaf, not the outermost shadow host', () => {
    const outerHost = document.createElement('div')
    document.body.appendChild(outerHost)
    const outerRoot = outerHost.attachShadow({ mode: 'open' })
    const innerHost = document.createElement('div')
    outerRoot.appendChild(innerHost)
    const innerRoot = innerHost.attachShadow({ mode: 'open' })
    const input = document.createElement('input')
    innerRoot.appendChild(input)

    input.focus()

    // NAIVE: `outerHost` (a <div> nobody focused) instead of the <input>.
    expect(activeElement()).toBe(input)
  })
})
