/**
 * Behavioural tests for the `@aihu/use` composed-tree substrate.
 *
 * These exercise REAL shadow boundaries — nested open roots, slotted content,
 * and closed roots — because the whole point of the module is that light-DOM
 * tests pass while the real thing is broken. jsdom implements event
 * retargeting, `composedPath()` (including closed-root truncation and
 * post-dispatch emptying) and per-root `activeElement` faithfully, so every
 * assertion below is against genuine platform behaviour rather than a mock.
 *
 * Note the shape of `duringClick`: the substrate is read INSIDE the listener,
 * because `composedPath()` is only populated during dispatch. That is not a
 * test artefact — it is the contract every consuming composable must honour.
 *
 * The naive-vs-correct proof lives in `composed-tree-naive-proof.test.ts`
 * (runnable both ways via `AIHU_NAIVE=1`); the negative controls here assert
 * the same thing inline.
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  composedActiveElement,
  composedContains,
  composedEventTarget,
  composedParent,
  composedPathOf,
  isEventInside,
  isEventInsideAny,
} from '../src/shared/composed-tree.ts'

afterEach(() => {
  document.body.innerHTML = ''
})

/**
 * Dispatch a composed, bubbling click from `from` and run `read` against the
 * event a `document`-level listener actually receives — the retargeting-exposed
 * situation every real `useClickOutside` runs in.
 */
function duringClick<T>(from: Element, read: (event: Event) => T): T {
  let out: T | undefined
  let ran = false
  const onClick = (e: Event) => {
    out = read(e)
    ran = true
  }
  document.addEventListener('click', onClick)
  try {
    from.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))
  } finally {
    document.removeEventListener('click', onClick)
  }
  if (!ran) throw new Error('event never reached the document listener')
  return out as T
}

/** `<div host>` with an open shadow root containing `<div panel><button/></div>`. */
function openHostFixture() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = host.attachShadow({ mode: 'open' })
  const panel = document.createElement('div')
  const button = document.createElement('button')
  panel.appendChild(button)
  root.appendChild(panel)
  return { host, root, panel, button }
}

describe('isEventInside — open shadow roots', () => {
  it('reports TRUE for a click inside a panel that lives in a shadow root', () => {
    const { panel, button } = openHostFixture()
    expect(duringClick(button, (e) => isEventInside(e, panel))).toBe(true)
  })

  it('NEGATIVE CONTROL: both native contains() and the composed UP-walk get this wrong', () => {
    const { host, panel, button } = openHostFixture()
    const seen = duringClick(button, (e) => ({
      target: e.target,
      native: panel.contains(e.target as Node),
      upWalk: composedContains(panel, e.target as Node),
      composed: isEventInside(e, panel),
    }))

    // Retargeting has already rewritten `target` to the outermost host.
    expect(seen.target).toBe(host)
    // …so the native check says the click was outside the panel. It was not.
    expect(seen.native).toBe(false)
    // …and so does an up-walk, because `panel` sits BELOW the host the target
    // was retargeted to. This is why `composedContains` is NOT the fix here.
    expect(seen.upWalk).toBe(false)
    // Only the composed path recovers the truth.
    expect(seen.composed).toBe(true)
  })

  it('reports FALSE for a click genuinely outside the panel', () => {
    const { panel } = openHostFixture()
    const outside = document.createElement('div')
    document.body.appendChild(outside)
    expect(duringClick(outside, (e) => isEventInside(e, panel))).toBe(false)
  })

  it('reports TRUE when asked about the host itself', () => {
    const { host, button } = openHostFixture()
    expect(duringClick(button, (e) => isEventInside(e, host))).toBe(true)
  })

  it('crosses TWO nested shadow boundaries', () => {
    const outerHost = document.createElement('div')
    document.body.appendChild(outerHost)
    const outerRoot = outerHost.attachShadow({ mode: 'open' })
    const midPanel = document.createElement('div')
    outerRoot.appendChild(midPanel)
    const innerHost = document.createElement('div')
    midPanel.appendChild(innerHost)
    const innerRoot = innerHost.attachShadow({ mode: 'open' })
    const deep = document.createElement('button')
    innerRoot.appendChild(deep)

    const seen = duringClick(deep, (e) => ({
      target: e.target,
      native: midPanel.contains(e.target as Node),
      mid: isEventInside(e, midPanel),
      inner: isEventInside(e, innerHost),
      deep: isEventInside(e, deep),
    }))
    expect(seen.target).toBe(outerHost) // retargeted all the way out
    expect(seen.native).toBe(false) // native: wrong
    expect(seen.mid).toBe(true) // ours: right
    expect(seen.inner).toBe(true)
    expect(seen.deep).toBe(true)
  })

  it('sees SLOTTED light content as inside the shadow tree that projects it', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = host.attachShadow({ mode: 'open' })
    const wrapper = document.createElement('div')
    wrapper.appendChild(document.createElement('slot'))
    root.appendChild(wrapper)

    const slotted = document.createElement('button')
    host.appendChild(slotted) // light DOM, projected into `wrapper`

    const seen = duringClick(slotted, (e) => ({
      onSlotted: isEventInside(e, slotted),
      inWrapper: isEventInside(e, wrapper),
      native: wrapper.contains(e.target as Node),
    }))
    expect(seen.onSlotted).toBe(true)
    // …and inside the shadow-tree wrapper it renders into, which no light-DOM
    // API would ever report.
    expect(seen.inWrapper).toBe(true)
    expect(seen.native).toBe(false)
  })
})

describe('isEventInside — closed shadow roots', () => {
  /** `<div host>` with a CLOSED root; the root reference is the only way in. */
  function closedHostFixture() {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = host.attachShadow({ mode: 'closed' })
    const panel = document.createElement('div')
    const button = document.createElement('button')
    panel.appendChild(button)
    root.appendChild(panel)
    return { host, root, panel, button }
  }

  it('composedPath() is truncated at a closed host — the platform limitation', () => {
    const { host, panel, button } = closedHostFixture()
    const path = duringClick(button, (e) => composedPathOf(e))
    expect(path).not.toContain(button)
    expect(path).not.toContain(panel)
    expect(path[0]).toBe(host)
  })

  it('still reports TRUE for a node inside the closed tree the event came from', () => {
    const { panel, button } = closedHostFixture()
    // Path-based matching cannot work here; the closed-host fallback does.
    expect(duringClick(button, (e) => isEventInside(e, panel))).toBe(true)
  })

  it('reports FALSE for a node in a DIFFERENT closed tree', () => {
    const a = closedHostFixture()
    const b = closedHostFixture()
    expect(duringClick(a.button, (e) => isEventInside(e, b.panel))).toBe(false)
  })

  it('reports FALSE for a closed-tree node when the click was in the light DOM', () => {
    const { panel } = closedHostFixture()
    const outside = document.createElement('div')
    document.body.appendChild(outside)
    expect(duringClick(outside, (e) => isEventInside(e, panel))).toBe(false)
  })
})

describe('isEventInside — degenerate inputs', () => {
  it('is FALSE for null / undefined targets', () => {
    const { button } = openHostFixture()
    const seen = duringClick(button, (e) => [isEventInside(e, null), isEventInside(e, undefined)])
    expect(seen).toEqual([false, false])
  })

  it('falls back to a composed up-walk when the event has no composedPath', () => {
    const outer = document.createElement('div')
    const inner = document.createElement('span')
    outer.appendChild(inner)
    document.body.appendChild(outer)
    // An event object with no `composedPath` at all (legacy / hand-built).
    const fake = { target: inner } as unknown as Event
    expect(composedPathOf(fake)).toEqual([])
    expect(isEventInside(fake, outer)).toBe(true)
    expect(isEventInside(fake, document.createElement('div'))).toBe(false)
  })

  it('DOCUMENTED GOTCHA: after dispatch ends the path empties and precision is lost', () => {
    // Kept as an executable warning: the platform clears `composedPath()` once
    // propagation finishes, so a composable that stashes the event and
    // hit-tests later silently regresses to the broken `event.target` answer.
    const { panel, button } = openHostFixture()
    const stashed = duringClick(button, (e) => e)
    expect(composedPathOf(stashed)).toEqual([])
    expect(isEventInside(stashed, panel)).toBe(false) // <- read it in the handler
  })
})

describe('isEventInsideAny', () => {
  it('is TRUE when any listed node contains the event, across separate shadow trees', () => {
    const a = openHostFixture()
    const b = openHostFixture()
    const seen = duringClick(b.button, (e) => ({
      both: isEventInsideAny(e, [a.panel, b.panel]),
      onlyA: isEventInsideAny(e, [a.panel]),
    }))
    expect(seen.both).toBe(true)
    expect(seen.onlyA).toBe(false)
  })

  it('skips null / undefined entries (unresolved $ref getters)', () => {
    const { panel, button } = openHostFixture()
    const seen = duringClick(button, (e) => ({
      withPanel: isEventInsideAny(e, [null, undefined, panel]),
      nullishOnly: isEventInsideAny(e, [null, undefined]),
    }))
    expect(seen.withPanel).toBe(true)
    expect(seen.nullishOnly).toBe(false)
  })
})

describe('composedEventTarget', () => {
  it('returns the REAL originating node, not the retargeted host', () => {
    const { host, button } = openHostFixture()
    const seen = duringClick(button, (e) => ({
      target: e.target,
      real: composedEventTarget(e),
    }))
    expect(seen.target).toBe(host)
    expect(seen.real).toBe(button)
  })

  it('falls back to event.target when there is no composed path', () => {
    const el = document.createElement('div')
    const fake = { target: el } as unknown as Event
    expect(composedEventTarget(fake)).toBe(el)
  })
})

describe('composedActiveElement', () => {
  it('drills through TWO nested open roots to the truly-focused leaf', () => {
    const outerHost = document.createElement('div')
    document.body.appendChild(outerHost)
    const outerRoot = outerHost.attachShadow({ mode: 'open' })
    const innerHost = document.createElement('div')
    outerRoot.appendChild(innerHost)
    const innerRoot = innerHost.attachShadow({ mode: 'open' })
    const button = document.createElement('button')
    innerRoot.appendChild(button)

    button.focus()
    // NEGATIVE CONTROL: the API every port reaches for stops at the outer host.
    expect(document.activeElement).toBe(outerHost)
    expect(composedActiveElement()).toBe(button)
  })

  it('accepts a ShadowRoot as the starting scope', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = host.attachShadow({ mode: 'open' })
    const button = document.createElement('button')
    root.appendChild(button)
    button.focus()
    expect(composedActiveElement(root)).toBe(button)
  })

  it('returns a plain light-DOM focused element unchanged', () => {
    const button = document.createElement('button')
    document.body.appendChild(button)
    button.focus()
    expect(composedActiveElement()).toBe(button)
  })

  it('stops at a CLOSED host — the documented degradation, asserted not assumed', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = host.attachShadow({ mode: 'closed' })
    const button = document.createElement('button')
    root.appendChild(button)
    button.focus()
    expect(composedActiveElement()).toBe(host)
  })
})

describe('composedParent / composedContains', () => {
  it('hops ShadowRoot -> host, multi-level', () => {
    const { host, root, panel, button } = openHostFixture()
    expect(composedParent(button)).toBe(panel)
    expect(composedParent(panel)).toBe(host)
    expect(root.host).toBe(host)
    expect(composedContains(host, button)).toBe(true)
    expect(composedContains(document.body, button)).toBe(true)
  })

  it('resolves a slotted node UP to its <slot>, not its light-DOM parent', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = host.attachShadow({ mode: 'open' })
    const wrapper = document.createElement('div')
    const slot = document.createElement('slot')
    wrapper.appendChild(slot)
    root.appendChild(wrapper)
    const slotted = document.createElement('span')
    host.appendChild(slotted)

    expect(composedParent(slotted)).toBe(slot)
    expect(composedContains(wrapper, slotted)).toBe(true)
  })

  it('treats an UNSLOTTED light child of a shadow host as off the composed tree', () => {
    const host = document.createElement('div')
    const orphan = document.createElement('span')
    host.appendChild(orphan)
    document.body.appendChild(host)
    host.attachShadow({ mode: 'open' }) // no <slot> — `orphan` renders nowhere

    expect(composedParent(orphan)).toBe(null)
    expect(composedContains(host, orphan)).toBe(false)
  })

  it('is FALSE for null / undefined', () => {
    const host = document.createElement('div')
    expect(composedContains(host, null)).toBe(false)
    expect(composedContains(host, undefined)).toBe(false)
  })
})
