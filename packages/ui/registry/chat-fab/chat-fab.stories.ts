/**
 * aihu-chat-fab recipe stories (Phase 2, performativeUI port Slice 7 — spec
 * §10.2 set for a non-modal overlay: Default, DarkMode, States, Open,
 * OpenWithLongContent, KeyboardActivation — no Hover/Focus/Disabled/
 * FocusManagement, same narrowing as `popover` — see meta.json).
 *
 * `<aihu-chat-fab>` COMPOSES the `popover-{root,trigger,content}` styled
 * recipe pieces as children (see chat-fab.aihu's header comment) — both this
 * recipe and the popover pieces must be imported here so their tags register.
 */
import { expect, userEvent, waitFor } from 'storybook/test'

import '@storybook-recipes/aihu-chat-fab.aihu'
import '@storybook-recipes/aihu-popover-root.aihu'
import '@storybook-recipes/aihu-popover-trigger.aihu'
import '@storybook-recipes/aihu-popover-content.aihu'

export default {
  title: 'UI/Chat-fab',
  tags: ['autodocs', 'recipe', 'phase-2'],
}

const FAB = (body = '<p>Hi! How can we help?</p>', attrs = ''): string => `
  <div style="position: relative; width: 100%; height: 20rem;">
    <aihu-chat-fab label="Open chat" ${attrs}>${body}</aihu-chat-fab>
  </div>`

const parts = (canvasElement: HTMLElement): { trigger: HTMLElement; content: HTMLElement } => ({
  trigger: canvasElement.querySelector('aihu-popover-trigger') as HTMLElement,
  content: canvasElement.querySelector('aihu-popover-content') as HTMLElement,
})

export const Default = {
  render: (): string => FAB(),
}

// meta.json declares `corner` as a closed 4-value enum (bottom-right
// (default) | bottom-left | top-right | top-left — see chat-fab.aihu's
// header). scripts/check-required-stories.ts only requires this Variants
// story to EXIST once `variants` is declared; it does not verify every listed
// value is actually rendered, so this renders all 4 explicitly rather than
// just the default. `.aihu-chat-fab-anchor` is `position: fixed` (viewport-
// relative, not the wrapper div), which is exactly why all 4 can render
// simultaneously without overlapping — each corner is a real position on the
// Storybook canvas viewport.
const CORNERS = ['bottom-right', 'bottom-left', 'top-right', 'top-left'] as const

export const Variants = {
  render: (): string => `
    <div style="position: relative; width: 100%; height: 20rem;">
      ${CORNERS.map(
        (corner) =>
          `<aihu-chat-fab label="Open chat (${corner})" corner="${corner}"><p>${corner}</p></aihu-chat-fab>`,
      ).join('\n      ')}
    </div>`,
}

export const DarkMode = {
  render: (): string => FAB(),
  globals: { mode: 'dark' },
}

export const States = {
  render: (): string => FAB(),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const { trigger, content } = parts(canvasElement)
    await expect(trigger).toHaveAttribute('aria-label', 'Open chat')
    await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await expect(content).toHaveAttribute('data-state', 'closed')
  },
}

// REGRESSION GUARD for the `_ceReactionDepth` fix (packages/runtime/src/
// define-component.ts, commit 38917c56). This story's whole markup shape —
// aihu-chat-fab COMPOSING aihu-popover-{root,trigger,content} as children in
// its OWN @template (see chat-fab.aihu's header comment) — is exactly what
// triggered the bug: arbor's _materialize builds that subtree via
// document.createElement + a single outer appendChild, which upgrades the
// nested popover-root/-slot children with an undrained, pending
// connectedCallback reaction BEFORE this element's own light-DOM-slot carve
// runs; the carve's `removeChild` eagerly drains that queue, firing the
// popover's connectedCallback prematurely on a still-detached node, and
// injectContext's ancestor-walk threw MissingContextError even though the
// context WAS provided. jsdom cannot reproduce this — its custom-element
// reaction queue doesn't model the drain — so this play function, run for
// real under Playwright/Chromium via `bun run check:a11y` (--failOnConsole,
// scripts/check-storybook-a11y.sh), is the actual regression test: clicking
// the trigger and asserting the popover reaches `data-state="open"` can only
// pass if construction never threw. Do not delete/weaken this assertion
// without an equivalent real-browser check elsewhere.
export const Open = {
  render: (): string => FAB(),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const { trigger, content } = parts(canvasElement)
    await userEvent.click(trigger)
    await waitFor(async () => {
      await expect(content).toHaveAttribute('data-state', 'open')
      await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    })
    await expect(getComputedStyle(content).display).not.toBe('none')
  },
}

export const OpenWithLongContent = {
  render: (): string => FAB('<p>' + 'A much longer chat panel body. '.repeat(30) + '</p>'),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const { trigger, content } = parts(canvasElement)
    await userEvent.click(trigger)
    await waitFor(async () => {
      await expect(content).toHaveAttribute('data-state', 'open')
    })
    // The panel caps its own height and scrolls rather than growing unbounded.
    await expect(getComputedStyle(content).overflow).toBe('auto')
  },
}

export const KeyboardActivation = {
  render: (): string => FAB(),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const { trigger, content } = parts(canvasElement)
    trigger.focus()
    await userEvent.keyboard('{Enter}')
    await waitFor(async () => {
      await expect(content).toHaveAttribute('data-state', 'open')
    })
    await userEvent.keyboard('{Escape}')
    await waitFor(async () => {
      await expect(content).toHaveAttribute('data-state', 'closed')
    })
    await expect(document.activeElement).toBe(trigger)
  },
}
