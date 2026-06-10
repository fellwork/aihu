/**
 * Headless dialog stories (Plan 6, spec §10.2 required set for an overlay
 * primitive: Default, States, Open, OpenWithLongContent, FocusManagement,
 * KeyboardActivation, DarkMode).
 *
 * Headless = zero CSS; assertions target behavior (focus trap, Escape,
 * ARIA plumbing, data-state reflection). Styled coverage lives in the
 * UI/Dialog recipe stories (Phase 2).
 */
import { expect, userEvent, waitFor } from 'storybook/test'

import { defineDialog } from './index.ts'

defineDialog() // module-level; registration is guarded

export default {
  title: 'Primitives/Dialog',
  tags: ['autodocs', 'headless', 'phase-1', 'apg-dialog-modal'],
}

const DIALOG = (body = 'Body') => `
  <aihu-dialog-root modal>
    <aihu-dialog-trigger>Open dialog</aihu-dialog-trigger>
    <aihu-dialog-backdrop></aihu-dialog-backdrop>
    <aihu-dialog-content>
      <aihu-dialog-title>Title</aihu-dialog-title>
      <aihu-dialog-description>${body}</aihu-dialog-description>
      <button type="button">Action</button>
      <aihu-dialog-close>Close</aihu-dialog-close>
    </aihu-dialog-content>
  </aihu-dialog-root>`

export const Default = {
  render: (): string => DIALOG(),
}

export const States = {
  render: (): string => DIALOG(),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const content = canvasElement.querySelector('aihu-dialog-content') as HTMLElement
    const trigger = canvasElement.querySelector('aihu-dialog-trigger') as HTMLElement
    await expect(content).toHaveAttribute('data-state', 'closed')
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  },
}

export const Open = {
  render: (): string => DIALOG(),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const trigger = canvasElement.querySelector('aihu-dialog-trigger') as HTMLElement
    const content = canvasElement.querySelector('aihu-dialog-content') as HTMLElement
    await userEvent.click(trigger)
    await waitFor(async () => {
      await expect(content).toHaveAttribute('data-state', 'open')
      await expect(content).toHaveAttribute('role', 'dialog')
      await expect(content).toHaveAttribute('aria-modal', 'true')
    })
  },
}

export const OpenWithLongContent = {
  render: (): string => DIALOG('Long content. '.repeat(120)),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const trigger = canvasElement.querySelector('aihu-dialog-trigger') as HTMLElement
    const content = canvasElement.querySelector('aihu-dialog-content') as HTMLElement
    await userEvent.click(trigger)
    await waitFor(async () => {
      await expect(content).toHaveAttribute('data-state', 'open')
    })
  },
}

export const FocusManagement = {
  render: (): string => DIALOG(),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const trigger = canvasElement.querySelector('aihu-dialog-trigger') as HTMLElement
    const content = canvasElement.querySelector('aihu-dialog-content') as HTMLElement
    await userEvent.click(trigger)
    // APG: focus moves INTO the content on open…
    await waitFor(async () => {
      await expect(content.contains(document.activeElement)).toBe(true)
    })
    // …Escape closes…
    await userEvent.keyboard('{Escape}')
    await waitFor(async () => {
      await expect(content).toHaveAttribute('data-state', 'closed')
    })
    // …and focus returns to the trigger that opened it.
    await waitFor(async () => {
      await expect(trigger).toHaveFocus()
    })
  },
}

export const KeyboardActivation = {
  render: (): string => DIALOG(),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const trigger = canvasElement.querySelector('aihu-dialog-trigger') as HTMLElement
    const content = canvasElement.querySelector('aihu-dialog-content') as HTMLElement
    await userEvent.click(trigger)
    await waitFor(async () => {
      await expect(content).toHaveAttribute('data-state', 'open')
    })
    // APG Dialog: Escape is the contractual keyboard dismissal.
    await userEvent.keyboard('{Escape}')
    await waitFor(async () => {
      await expect(content).toHaveAttribute('data-state', 'closed')
    })
  },
}

export const DarkMode = {
  render: (): string => DIALOG(),
  globals: { mode: 'dark' },
}
