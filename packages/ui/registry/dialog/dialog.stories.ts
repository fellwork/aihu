/**
 * aihu-dialog recipe stories (Phase 2, spec §10.2 set for a focus-trapping
 * overlay: Default, DarkMode, States, Open, OpenWithLongContent,
 * KeyboardActivation, FocusManagement).
 *
 * The recipe pieces are LIGHT-DOM class-extension elements: each `<aihu-dialog-*>`
 * extends its headless AihuDialog* primitive, so the styled pieces carry all
 * behavior (focus trap, Escape, aria-modal, click-outside). The consumer
 * composes the panel as plain children of the content (light DOM projects only
 * the default slot). NOT part of the registry payload.
 */
import { expect, userEvent, waitFor } from 'storybook/test'

import '@storybook-recipes/aihu-dialog-root.aihu'
import '@storybook-recipes/aihu-dialog-trigger.aihu'
import '@storybook-recipes/aihu-dialog-backdrop.aihu'
import '@storybook-recipes/aihu-dialog-content.aihu'
import '@storybook-recipes/aihu-dialog-close.aihu'
import '@storybook-recipes/aihu-dialog-title.aihu'
import '@storybook-recipes/aihu-dialog-description.aihu'

export default {
  title: 'UI/Dialog',
  tags: ['autodocs', 'recipe', 'phase-2'],
}

const DIALOG = (
  body = 'Make changes to your profile here. Click save when you are done.',
): string => `
  <aihu-dialog-root modal>
    <aihu-dialog-trigger>Open dialog</aihu-dialog-trigger>
    <aihu-dialog-backdrop></aihu-dialog-backdrop>
    <aihu-dialog-content>
      <aihu-dialog-title>Edit profile</aihu-dialog-title>
      <aihu-dialog-description>${body}</aihu-dialog-description>
      <button type="button">Save</button>
      <aihu-dialog-close aria-label="Close">×</aihu-dialog-close>
    </aihu-dialog-content>
  </aihu-dialog-root>`

export const Default = {
  render: (): string => DIALOG(),
}

export const DarkMode = {
  render: (): string => DIALOG(),
  globals: { mode: 'dark' },
}

export const States = {
  render: (): string => DIALOG(),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const content = canvasElement.querySelector('aihu-dialog-content') as HTMLElement
    const trigger = canvasElement.querySelector('aihu-dialog-trigger') as HTMLElement
    // Closed at rest: content hidden (display:none), trigger collapsed.
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
      // Title wires the accessible name via aria-labelledby.
      await expect(content).toHaveAttribute('aria-labelledby')
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
