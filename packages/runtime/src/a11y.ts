/**
 * arch-5 M1 a11y primitive runtime — RFC-A5-017..021 (arch-5 §2.6).
 *
 * Tree-shakable: an SFC that uses only `<visuallyHidden>` imports
 * `_ensureA11yStyles`; `<focusTrap>` users import `createFocusTrap`;
 * `$announce(...)` action sites import `announce`.
 *
 * Budget: arch-5 §2.6 caps the total compiled-runtime cost across the 5
 * primitives at ~800 bytes. `<liveRegion>`, `<skipLink>`, and
 * `<visuallyHidden>` lower to plain `branch()` calls; only the CSS
 * injector + announce singleton + focus-trap helper add JS.
 */

import type { Branch } from '@aihu/arbor'
import { branch } from '@aihu/arbor'

// ─── sr-only + skip-link CSS ──────────────────────────────────────────────────

let _stylesInjected = false

/** @internal — idempotent style injection used by `<visuallyHidden>` and `<skipLink>`. */
export function _ensureA11yStyles(): void {
  if (_stylesInjected || typeof document === 'undefined') return
  _stylesInjected = true
  const s = document.createElement('style')
  s.setAttribute('data-aihu-a11y', '')
  s.textContent =
    '.aihu-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}' +
    '.aihu-skip-link{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}' +
    '.aihu-skip-link:focus{position:fixed;left:1rem;top:1rem;width:auto;height:auto;padding:.5rem 1rem;background:#000;color:#fff;z-index:9999;clip:auto}'
  document.head.appendChild(s)
}

// ─── $announce — RFC-A5-021 ───────────────────────────────────────────────────

let _liveEl: HTMLElement | null = null
let _clearTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Programmatic ARIA announcement. Singleton `<div aria-live="polite"
 * aria-atomic="true">` appended to `<body>` once and reused; messages
 * cleared after 2 s. Compiler rewrites `$announce('...')` in `@state`
 * action bodies to `__a11y_announce('...')`.
 */
export function announce(message: string): void {
  if (typeof document === 'undefined') return
  if (!_liveEl?.isConnected) {
    const d = document.createElement('div')
    d.setAttribute('aria-live', 'polite')
    d.setAttribute('aria-atomic', 'true')
    d.setAttribute('data-aihu-announce', '')
    d.className = 'aihu-sr-only'
    _ensureA11yStyles()
    document.body.appendChild(d)
    _liveEl = d
  }
  _liveEl.textContent = message
  if (_clearTimer) clearTimeout(_clearTimer)
  _clearTimer = setTimeout(() => {
    if (_liveEl) _liveEl.textContent = ''
    _clearTimer = null
  }, 2000)
}

/** @internal — test-only reset hook; rolldown DCE strips this for production. */
export function _resetAnnounceForTests(): void {
  if (_clearTimer) {
    clearTimeout(_clearTimer)
    _clearTimer = null
  }
  if (_liveEl?.parentNode) _liveEl.parentNode.removeChild(_liveEl)
  _liveEl = null
  _stylesInjected = false
  document.querySelectorAll('style[data-aihu-a11y]').forEach((n) => n.remove())
}

// ─── <focusTrap> — RFC-A5-018 ────────────────────────────────────────────────

const _Q =
  'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])'

let _trapSeq = 0

/**
 * Shadow-DOM-aware `querySelector`: `Document`/`Element.querySelector` never
 * descends into shadow roots, so a trap host rendered inside a component that
 * opts into `shadowMode: 'shadow'` (arch-5 thesis DA4 — leaf/design-system
 * components keep shadow encapsulation) is otherwise unfindable from
 * `document`. Falls through into every element's OPEN shadow root (recursing
 * for arbitrarily nested shadow trees) when a direct match isn't found in the
 * current root. Closed shadow roots are unavoidably invisible here (same
 * documented limitation as `@aihu/primitives/composed-tree.ts`'s
 * `composedQuerySelector`, the canonical multi-consumer version of this same
 * rule) — this is a deliberately minimal, single-selector inline kept local
 * to `@aihu/runtime` rather than a `@aihu/primitives` dependency: the a11y
 * primitives here are budgeted at ~800 B total (see file header), and
 * `composed-tree.ts`'s tabbable-detection machinery (`queryTabbables`,
 * `composedActiveElement`, `walkComposedTree`, etc.) needed for its full
 * generality would blow that on its own, on top of `@aihu/runtime`'s
 * whole-package 4500 B size-limit gate it is already close to (see
 * `.size-limit.json` / `bun run size`).
 */
function _deepQuerySelector<T extends Element = HTMLElement>(
  root: ParentNode,
  selector: string,
): T | null {
  const direct = root.querySelector<T>(selector)
  if (direct) return direct
  for (const el of Array.from(root.querySelectorAll('*'))) {
    const shadow = (el as HTMLElement).shadowRoot
    if (shadow) {
      const found = _deepQuerySelector<T>(shadow, selector)
      if (found) return found
    }
  }
  return null
}

/**
 * Shadow-DOM-aware `querySelectorAll`: recurses into OPEN shadow roots to
 * enumerate focusables across composed boundaries (#537).
 */
function _deepQuerySelectorAll<T extends Element = HTMLElement>(
  root: ParentNode,
  selector: string,
): T[] {
  const results: T[] = Array.from(root.querySelectorAll<T>(selector))
  for (const el of Array.from(root.querySelectorAll('*'))) {
    const shadow = (el as HTMLElement).shadowRoot
    if (shadow) {
      results.push(..._deepQuerySelectorAll<T>(shadow, selector))
    }
  }
  return results
}

/**
 * Shadow-DOM-aware `document.activeElement`: plain `document.activeElement`
 * stops at the outermost OPEN shadow host — it never drills in to the
 * actually-focused leaf inside that host's shadow tree — so a trap wired
 * inside a shadow root would otherwise compare Tab's "current focus" against
 * the wrong element and never fire. Recurses through nested shadow roots'
 * own `.activeElement` (mirrors `@aihu/primitives/composed-tree.ts`'s
 * `composedActiveElement`, kept local here for the same budget reason as
 * `_deepQuerySelector` above).
 */
function _deepActiveElement(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  let active: Element | null = document.activeElement
  while (active !== null && active.shadowRoot !== null) {
    const inner: Element | null = active.shadowRoot.activeElement
    if (inner === null) break
    active = inner
  }
  return active as HTMLElement | null
}

/**
 * Focus-trap boundary. Renders `<div data-aihu-focustrap="N">` containing
 * `childFn()`. While `active` is truthy, Tab cycles within the host's
 * focusable descendants. `active` may be a boolean or `() => boolean`
 * (signal-ref). On Tab keydown, the trap re-checks `active` so reactive
 * toggling needs no subscription.
 */
export function createFocusTrap(
  active: boolean | (() => boolean),
  returnFocus: boolean,
  initialFocus: string | null,
  childFn: () => Branch,
): Branch {
  const id = String(++_trapSeq)
  const sub = childFn()
  const isActive = (): boolean => (typeof active === 'function' ? active() : active)

  let prevFocus: HTMLElement | null = null
  let lastActive = false

  const wire = (): void => {
    if (typeof document === 'undefined') return
    const host = _deepQuerySelector<HTMLElement>(document, `[data-aihu-focustrap="${id}"]`)
    if (!host) {
      setTimeout(wire, 0)
      return
    }
    const focusables = (): HTMLElement[] => _deepQuerySelectorAll<HTMLElement>(host, _Q)
    const sync = (): void => {
      const a = isActive()
      if (a === lastActive) return
      lastActive = a
      if (a) {
        prevFocus = _deepActiveElement()
        const init = initialFocus ? host.querySelector<HTMLElement>(initialFocus) : focusables()[0]
        init?.focus()
      } else if (returnFocus && prevFocus) {
        prevFocus.focus()
        prevFocus = null
      }
    }
    host.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !isActive()) return
      const items = focusables()
      if (!items.length) {
        e.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const t = _deepActiveElement()
      // `host.contains(t)` is shadow-blind: `Node.contains()` walks light-DOM
      // tree order only, so when `t` is the deep leaf inside a nested OPEN
      // shadow root (the DA4-expected composition — a shadow-mode leaf
      // component sitting inside this trap), a genuinely-in-bounds focus
      // reads as "escaped" and gets wrongly yanked to `last`. `e` reached
      // this listener by bubbling (composed) up through however many shadow
      // boundaries separate `t` from `host`, so `e.composedPath()` reflects
      // the true composed ancestry and correctly reports containment where
      // `host.contains()` cannot. (`focusables()` above is still light-DOM-only
      // — see the follow-up filed for full shadow-aware enumeration — so this
      // fixes the wrongful-yank direction; it does not yet make `first`/`last`
      // resolve to a focusable living inside a nested shadow root.)
      if (e.shiftKey) {
        if (t === first || !e.composedPath().includes(host)) {
          e.preventDefault()
          last?.focus()
        }
      } else if (t === last) {
        e.preventDefault()
        first?.focus()
      }
    })
    sync()
    document.addEventListener('focusin', sync)
  }

  if (typeof queueMicrotask === 'function') queueMicrotask(wire)
  else setTimeout(wire, 0)

  return branch('div', { 'data-aihu-focustrap': id }, [sub])
}
