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
