/**
 * `createFocusTrap` — a tiny native-DOM focus trap (no library). Queries the
 * focusable descendants of a container via the composed-tree substrate (so it
 * correctly descends into any nested custom element's OPEN shadow root), wraps
 * Tab at the edges, moves focus to the first focusable (or the container) on
 * activate, and restores focus to the previously-active element on deactivate.
 * Used by `dialog-content`.
 */

import { composedActiveElement, composedContains, queryTabbables } from '../composed-tree.ts'

export interface FocusTrap {
  activate(): void
  deactivate(): void
}

function focusables(container: Element): HTMLElement[] {
  // Include the currently-focused element even if it reports zero layout
  // (e.g. mid-transition) — same carve-out the old implementation had, now
  // resolved via the composed-tree activeElement so it still applies when the
  // focused node is nested inside a shadow root.
  const active = composedActiveElement(container.getRootNode() as Document | ShadowRoot)
  return queryTabbables(container, { includeElement: active })
}

export function createFocusTrap(container: Element): FocusTrap {
  let previouslyFocused: HTMLElement | null = null
  let active = false

  const onKeydown = (ev: KeyboardEvent): void => {
    if (!active || ev.key !== 'Tab') return
    const items = focusables(container)
    const first = items[0]
    const last = items[items.length - 1]
    if (!first || !last) {
      ev.preventDefault()
      return
    }
    const current = composedActiveElement(container.getRootNode() as Document | ShadowRoot)

    if (ev.shiftKey && (current === first || !composedContains(container, current))) {
      ev.preventDefault()
      last.focus()
    } else if (!ev.shiftKey && (current === last || !composedContains(container, current))) {
      ev.preventDefault()
      first.focus()
    }
  }

  return {
    activate(): void {
      if (active) return
      active = true
      previouslyFocused = composedActiveElement(document) as HTMLElement | null
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
