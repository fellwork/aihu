/**
 * arch-5 M1 — accessibility primitive runtime tests.
 *
 * Covers RFC-A5-018 (`<focusTrap>`), RFC-A5-021 (`$announce`), and the shared
 * sr-only / skip-link CSS injector. `<liveRegion>`, `<skipLink>`, and
 * `<visuallyHidden>` are pure DOM/CSS lowerings exercised in the compiler
 * test suite (`packages/compiler/tests/a11y.rs`); here we verify the runtime
 * helpers in `packages/runtime/src/a11y.ts`.
 */

import type { Branch } from '@aihu/arbor'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _ensureA11yStyles,
  _resetAnnounceForTests,
  announce,
  createFocusTrap,
} from '../src/a11y.ts'

// Helper to drain a microtask plus any pending async tasks.
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  // Reset DOM via removeChild loop (avoids innerHTML XSS lint).
  while (document.body.firstChild) document.body.removeChild(document.body.firstChild)
  document.head.querySelectorAll('style[data-aihu-a11y]').forEach((n) => n.remove())
  _resetAnnounceForTests()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

// ─── _ensureA11yStyles ────────────────────────────────────────────────────────

describe('_ensureA11yStyles — RFC-A5-019/020 CSS injector', () => {
  it('injects a single <style data-aihu-a11y> element on first call', () => {
    _ensureA11yStyles()
    const styles = document.head.querySelectorAll('style[data-aihu-a11y]')
    expect(styles.length).toBe(1)
    expect(styles[0]?.textContent).toContain('.aihu-sr-only')
    expect(styles[0]?.textContent).toContain('.aihu-skip-link')
  })

  it('is idempotent across repeated calls', () => {
    _ensureA11yStyles()
    _ensureA11yStyles()
    _ensureA11yStyles()
    expect(document.head.querySelectorAll('style[data-aihu-a11y]').length).toBe(1)
  })
})

// ─── announce — RFC-A5-021 ────────────────────────────────────────────────────

describe('announce — RFC-A5-021 singleton live region', () => {
  it('appends a single aria-live="polite" region with aria-atomic="true"', () => {
    announce('Hello')
    const live = document.querySelector('[data-aihu-announce]') as HTMLElement | null
    expect(live).not.toBeNull()
    expect(live?.getAttribute('aria-live')).toBe('polite')
    expect(live?.getAttribute('aria-atomic')).toBe('true')
  })

  it('writes the message into the singleton', () => {
    announce('Saved')
    const live = document.querySelector('[data-aihu-announce]') as HTMLElement | null
    expect(live?.textContent).toBe('Saved')
  })

  it('clears the message after 2 seconds', () => {
    announce('Saved')
    const live = document.querySelector('[data-aihu-announce]') as HTMLElement | null
    expect(live?.textContent).toBe('Saved')
    vi.advanceTimersByTime(2000)
    expect(live?.textContent).toBe('')
  })

  it('reuses the same singleton across repeated calls', () => {
    announce('First')
    const liveA = document.querySelector('[data-aihu-announce]') as HTMLElement | null
    announce('Second')
    const liveB = document.querySelector('[data-aihu-announce]') as HTMLElement | null
    expect(liveA).toBe(liveB)
    expect(document.querySelectorAll('[data-aihu-announce]').length).toBe(1)
    expect(liveB?.textContent).toBe('Second')
  })

  it('resets the 2-second clear timer on subsequent calls', () => {
    announce('First')
    vi.advanceTimersByTime(1000)
    announce('Second')
    // Old timer would have cleared at t=2000; new timer should fire at t=3000.
    vi.advanceTimersByTime(1000) // t=2000 from start, t=1000 since Second
    const live = document.querySelector('[data-aihu-announce]') as HTMLElement | null
    expect(live?.textContent).toBe('Second')
    vi.advanceTimersByTime(1000) // t=3000, t=2000 since Second
    expect(live?.textContent).toBe('')
  })
})

// ─── createFocusTrap — RFC-A5-018 ─────────────────────────────────────────────

function materialize(node: Branch): HTMLElement {
  const el = document.createElement(node.tag ?? 'div')
  if (node.attrs) {
    for (const [k, v] of Object.entries(node.attrs)) {
      el.setAttribute(k, String(v))
    }
  }
  for (const child of node.children ?? []) {
    if (typeof child === 'object' && child !== null && 'kind' in child && child.kind === 'branch') {
      el.appendChild(materialize(child as Branch))
    }
  }
  return el
}

describe('createFocusTrap — RFC-A5-018', () => {
  it('renders a div with data-aihu-focustrap attribute', () => {
    const node = createFocusTrap(true, true, null, () => {
      return { kind: 'branch', tag: 'div', attrs: null, children: [] } as Branch
    })
    expect(node.kind).toBe('branch')
    expect(node.tag).toBe('div')
    expect(node.attrs).toBeTruthy()
    expect((node.attrs as Record<string, string>)['data-aihu-focustrap']).toMatch(/^\d+$/)
  })

  it('cycles Tab from last focusable to first when active=true', async () => {
    const node = createFocusTrap(true, true, null, () => {
      return {
        kind: 'branch',
        tag: 'div',
        attrs: null,
        children: [
          { kind: 'branch', tag: 'button', attrs: { id: 'a' }, children: [] } as Branch,
          { kind: 'branch', tag: 'button', attrs: { id: 'b' }, children: [] } as Branch,
          { kind: 'branch', tag: 'button', attrs: { id: 'c' }, children: [] } as Branch,
        ],
      } as Branch
    })
    const host = materialize(node)
    document.body.appendChild(host)

    // Let createFocusTrap's queueMicrotask wire the listener.
    vi.useRealTimers()
    await tick()
    vi.useFakeTimers()

    const a = host.querySelector('#a') as HTMLButtonElement
    const c = host.querySelector('#c') as HTMLButtonElement
    expect(a).toBeTruthy()
    expect(c).toBeTruthy()

    c.focus()
    expect(document.activeElement).toBe(c)

    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    c.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(a)
  })

  it('cycles Shift+Tab from first focusable to last when active=true', async () => {
    const node = createFocusTrap(true, true, null, () => {
      return {
        kind: 'branch',
        tag: 'div',
        attrs: null,
        children: [
          { kind: 'branch', tag: 'button', attrs: { id: 'x' }, children: [] } as Branch,
          { kind: 'branch', tag: 'button', attrs: { id: 'y' }, children: [] } as Branch,
        ],
      } as Branch
    })
    const host = materialize(node)
    document.body.appendChild(host)
    vi.useRealTimers()
    await tick()
    vi.useFakeTimers()
    const x = host.querySelector('#x') as HTMLButtonElement
    const y = host.querySelector('#y') as HTMLButtonElement
    x.focus()
    const ev = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    })
    x.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(y)
  })

  it('does not interfere with Tab when active=false', async () => {
    const node = createFocusTrap(false, true, null, () => {
      return {
        kind: 'branch',
        tag: 'div',
        attrs: null,
        children: [
          { kind: 'branch', tag: 'button', attrs: { id: 'p' }, children: [] } as Branch,
          { kind: 'branch', tag: 'button', attrs: { id: 'q' }, children: [] } as Branch,
        ],
      } as Branch
    })
    const host = materialize(node)
    document.body.appendChild(host)
    vi.useRealTimers()
    await tick()
    vi.useFakeTimers()
    const q = host.querySelector('#q') as HTMLButtonElement
    q.focus()
    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    q.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(false)
  })

  it.skip('returns focus to trigger when active=false (requires browser focus model)', () => {
    // Focus return depends on real focus events crossing shadow boundaries
    // and a reactive `active` toggle observable to the trap. Skipped in
    // jsdom per arch-5 §6 (Playwright deferred to v1.2 — see arch-2 §6).
  })

  it.skip('focuses initialFocus selector when activated (requires reactive active flag)', () => {
    // The trap's active-state polling fires on `focusin`. Reliably observing
    // the cross-element focus transition needs a real browser focus model;
    // we cover the selector-resolution branch in static review and exercise
    // it in EX-15 a11y-kit acceptance per arch-5 §8.
  })
})
