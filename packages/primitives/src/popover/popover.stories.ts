/**
 * Headless popover stories (spec §10.2 required set for an overlay primitive:
 * Default, DarkMode, States, KeyboardActivation, Open, OpenWithLongContent —
 * `Focus`/`Disabled` are narrowed out of the gate for overlays but authored
 * here anyway, because unlike tooltip a popover's focus behavior and its
 * disabled trigger are real, observable contracts worth pinning).
 *
 * Headless = zero CSS; assertions target behavior (disclosure wiring,
 * click-toggle, Escape-closes-and-returns-focus, outside dismissal,
 * data-state). Styled coverage lands with the `popover-*` recipes.
 */
import { expect, userEvent, waitFor } from 'storybook/test'

import { definePopover } from './index.ts'

definePopover('demo') // module-level; registration is guarded

export default {
  title: 'Primitives/Popover',
  tags: ['autodocs', 'headless', 'phase-2', 'apg-disclosure'],
}

const POPOVER = (body = '<button type="button">Act</button>', triggerAttrs = ''): string => `
  <demo-popover-root placement="bottom">
    <demo-popover-trigger ${triggerAttrs}>Toggle popover</demo-popover-trigger>
    <demo-popover-content>${body}</demo-popover-content>
  </demo-popover-root>`

const parts = (
  canvasElement: HTMLElement,
): { root: HTMLElement; trigger: HTMLElement; content: HTMLElement } => ({
  root: canvasElement.querySelector('demo-popover-root') as HTMLElement,
  trigger: canvasElement.querySelector('demo-popover-trigger') as HTMLElement,
  content: canvasElement.querySelector('demo-popover-content') as HTMLElement,
})

export const Default = {
  render: (): string => POPOVER(),
}

export const States = {
  render: (): string => POPOVER(),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const { trigger, content } = parts(canvasElement)
    // Non-modal disclosure wiring: haspopup + expanded + controls, and a
    // role=dialog panel that is deliberately NOT aria-modal.
    await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await expect(trigger.getAttribute('aria-controls')).toBe(content.id)
    await expect(content).toHaveAttribute('role', 'dialog')
    await expect(content).not.toHaveAttribute('aria-modal')
    await expect(content).toHaveAttribute('data-state', 'closed')
  },
}

export const Open = {
  render: (): string => POPOVER(),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const { trigger, content } = parts(canvasElement)
    await userEvent.click(trigger)
    await waitFor(async () => {
      await expect(content).toHaveAttribute('data-state', 'open')
      await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    })
  },
}

export const OpenWithLongContent = {
  render: (): string =>
    POPOVER(
      `<p>${'A much longer popover body. '.repeat(20)}</p><button type="button">Act</button>`,
    ),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const { trigger, content } = parts(canvasElement)
    await userEvent.click(trigger)
    await waitFor(async () => {
      await expect(content).toHaveAttribute('data-state', 'open')
      // The shim resolved a placement (possibly flipped off `bottom`).
      await expect(content).toHaveAttribute('data-placement')
    })
  },
}

export const Focus = {
  render: (): string => POPOVER(),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const { trigger, content } = parts(canvasElement)
    trigger.focus()
    await userEvent.click(trigger)
    // Non-modal: opening does NOT move focus into the panel, and the panel
    // imposes no tabindex of its own — its children stay the tab order.
    await expect(document.activeElement).toBe(trigger)
    await expect(content).not.toHaveAttribute('tabindex')
    const inner = content.querySelector('button') as HTMLButtonElement
    inner.focus()
    await expect(document.activeElement).toBe(inner)
  },
}

export const Disabled = {
  render: (): string => POPOVER('<button type="button">Act</button>', 'disabled'),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const { trigger, content } = parts(canvasElement)
    await expect(trigger).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(trigger)
    await expect(content).toHaveAttribute('data-state', 'closed')
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  },
}

export const KeyboardActivation = {
  render: (): string => POPOVER(),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const { trigger, content } = parts(canvasElement)
    trigger.focus()
    // Enter opens the trigger…
    await userEvent.keyboard('{Enter}')
    await waitFor(async () => {
      await expect(content).toHaveAttribute('data-state', 'open')
    })
    // …and Escape closes it, returning focus to the trigger.
    await userEvent.keyboard('{Escape}')
    await waitFor(async () => {
      await expect(content).toHaveAttribute('data-state', 'closed')
    })
    await expect(document.activeElement).toBe(trigger)
  },
}

export const DarkMode = {
  render: (): string => POPOVER(),
  globals: { mode: 'dark' },
}
