/**
 * arch-5 M1 a11y primitive runtime — RFC-A5-017..021 (arch-5 §2.6).
 *
 * Tree-shakable: an SFC that uses only `<$visuallyHidden>` imports
 * `_ensureA11yStyles`; `<$focusTrap>` users import `createFocusTrap`;
 * `$announce(...)` action sites import `announce`.
 *
 * Budget: arch-5 §2.6 caps the total compiled-runtime cost across the 5
 * primitives at ~800 bytes. `<$liveRegion>`, `<$skipLink>`, and
 * `<$visuallyHidden>` lower to plain `branch()` calls; only the CSS
 * injector + announce singleton + focus-trap helper add JS.
 */

import type { Branch } from '@aihu/arbor'
import { branch } from '@aihu/arbor'

// ─── sr-only + skip-link CSS ──────────────────────────────────────────────────

let _stylesInjected = false

/** @internal — idempotent style injection used by `<$visuallyHidden>` and `<$skipLink>`. */
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

// ─── <$focusTrap> — RFC-A5-018 ────────────────────────────────────────────────

const _Q =
  'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])'

let _trapSeq = 0

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
    const host = document.querySelector<HTMLElement>(`[data-aihu-focustrap="${id}"]`)
    if (!host) {
      setTimeout(wire, 0)
      return
    }
    const focusables = (): HTMLElement[] => Array.from(host.querySelectorAll<HTMLElement>(_Q))
    const sync = (): void => {
      const a = isActive()
      if (a === lastActive) return
      lastActive = a
      if (a) {
        prevFocus = (document.activeElement as HTMLElement) ?? null
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
      const t = document.activeElement as HTMLElement | null
      if (e.shiftKey) {
        if (t === first || !host.contains(t)) {
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
