/**
 * `createFocusTrap` — a tiny native-DOM focus trap (no library). Queries the
 * focusable descendants of a container, wraps Tab at the edges, moves focus to
 * the first focusable (or the container) on activate, and restores focus to the
 * previously-active element on deactivate. Used by `dialog-content`.
 */

const FOCUSABLE =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), ' +
  'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), ' +
  '[contenteditable="true"], audio[controls], video[controls], details>summary:first-of-type'

export interface FocusTrap {
  activate(): void
  deactivate(): void
}

function focusables(container: Element): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement || isInJsdom(el),
  )
}

/** jsdom does not lay out, so `offsetParent` is always null — treat all as visible there. */
function isInJsdom(_el: HTMLElement): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom')
}

export function createFocusTrap(container: Element): FocusTrap {
  let previouslyFocused: HTMLElement | null = null
  let active = false

  const onKeydown = (ev: KeyboardEvent): void => {
    if (!active || ev.key !== 'Tab') return
    const items = focusables(container)
    if (items.length === 0) {
      ev.preventDefault()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    const current = (container.getRootNode() as Document | ShadowRoot).activeElement as HTMLElement

    if (ev.shiftKey && (current === first || !container.contains(current))) {
      ev.preventDefault()
      last.focus()
    } else if (!ev.shiftKey && (current === last || !container.contains(current))) {
      ev.preventDefault()
      first.focus()
    }
  }

  return {
    activate(): void {
      if (active) return
      active = true
      previouslyFocused = document.activeElement as HTMLElement | null
      const items = focusables(container)
      const target = items[0] ?? (container as HTMLElement)
      // Ensure the container itself is focusable as a fallback.
      if (!items.length && !(container as HTMLElement).hasAttribute('tabindex')) {
        ;(container as HTMLElement).setAttribute('tabindex', '-1')
      }
      target.focus()
      document.addEventListener('keydown', onKeydown, true)
    },
    deactivate(): void {
      if (!active) return
      active = false
      document.removeEventListener('keydown', onKeydown, true)
      // Return focus to whatever opened the trap.
      previouslyFocused?.focus?.()
      previouslyFocused = null
    },
  }
}
