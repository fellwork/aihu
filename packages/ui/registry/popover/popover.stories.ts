/**
 * aihu-popover recipe stories (Phase 2, performativeUI port Slice 7 — spec
 * §10.2 set for a non-modal overlay: Default, DarkMode, States, Open,
 * OpenWithLongContent, KeyboardActivation — no Hover/Focus/Disabled
 * (narrowed out for overlays) and no FocusManagement (`trapsFocus: false`,
 * same as the headless primitive's own required set — see meta.json).
 *
 * The recipe pieces are LIGHT-DOM class-extension elements: each
 * `<aihu-popover-*>` extends its headless AihuPopover* primitive, so the
 * styled pieces carry all behavior (disclosure wiring, positioning, outside
 * dismissal, Escape). NOT part of the registry payload.
 */
import { expect, userEvent, waitFor } from 'storybook/test'

import '@storybook-recipes/aihu-popover-root.aihu'
import '@storybook-recipes/aihu-popover-trigger.aihu'
import '@storybook-recipes/aihu-popover-content.aihu'

export default {
  title: 'UI/Popover',
  tags: ['autodocs', 'recipe', 'phase-2'],
}

const POPOVER = (body = '<p>A small panel of content.</p>'): string => `
  <aihu-popover-root placement="bottom">
    <aihu-popover-trigger>Open popover</aihu-popover-trigger>
    <aihu-popover-content>${body}</aihu-popover-content>
  </aihu-popover-root>`

export const Default = {
  render: (): string => POPOVER(),
}

export const DarkMode = {
  render: (): string => POPOVER(),
  globals: { mode: 'dark' },
}

export const States = {
  render: (): string => POPOVER(),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const trigger = canvasElement.querySelector('aihu-popover-trigger') as HTMLElement
    const content = canvasElement.querySelector('aihu-popover-content') as HTMLElement
    await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await expect(content).toHaveAttribute('role', 'dialog')
    await expect(content).not.toHaveAttribute('aria-modal')
    await expect(content).toHaveAttribute('data-state', 'closed')
  },
}

export const Open = {
  render: (): string => POPOVER(),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const trigger = canvasElement.querySelector('aihu-popover-trigger') as HTMLElement
    const content = canvasElement.querySelector('aihu-popover-content') as HTMLElement
    await userEvent.click(trigger)
    await waitFor(async () => {
      await expect(content).toHaveAttribute('data-state', 'open')
      await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    })
    // Real panel styling — a rendered box, not display:none.
    await expect(getComputedStyle(content).display).not.toBe('none')
  },
}

export const OpenWithLongContent = {
  render: (): string =>
    POPOVER(
      `<p>${'A much longer popover body. '.repeat(20)}</p><button type="button">Act</button>`,
    ),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const trigger = canvasElement.querySelector('aihu-popover-trigger') as HTMLElement
    const content = canvasElement.querySelector('aihu-popover-content') as HTMLElement
    await userEvent.click(trigger)
    await waitFor(async () => {
      await expect(content).toHaveAttribute('data-state', 'open')
      await expect(content).toHaveAttribute('data-placement')
    })
  },
}

export const KeyboardActivation = {
  render: (): string => POPOVER(),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const trigger = canvasElement.querySelector('aihu-popover-trigger') as HTMLElement
    const content = canvasElement.querySelector('aihu-popover-content') as HTMLElement
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
