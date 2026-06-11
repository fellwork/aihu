/**
 * aihu-tooltip recipe stories (Phase 2, spec §10.2 set for a non-focus-trapping
 * overlay: Default, DarkMode, States, Open, OpenWithLongContent,
 * KeyboardActivation). No FocusManagement — the tooltip never steals focus
 * (meta.capabilities.trapsFocus = false).
 *
 * The recipe pieces are LIGHT-DOM class-extension elements: each `<aihu-tooltip-*>`
 * extends its headless AihuTooltip* primitive, so the styled pieces carry all
 * behavior (hover/focus open, Escape dismiss, aria-describedby, placement).
 * NOT part of the registry payload.
 */
import { expect, userEvent, waitFor } from 'storybook/test'

import '@storybook-recipes/aihu-tooltip-root.aihu'
import '@storybook-recipes/aihu-tooltip-trigger.aihu'
import '@storybook-recipes/aihu-tooltip-content.aihu'

export default {
  title: 'UI/Tooltip',
  tags: ['autodocs', 'recipe', 'phase-2'],
}

/** Zero delays so play functions and snapshots see deterministic state. */
const TOOLTIP = (body = 'Helpful hint'): string => `
  <aihu-tooltip-root placement="top" open-delay="0" close-delay="0">
    <aihu-tooltip-trigger tabindex="0" aria-label="Hover or focus me">Hover or focus me</aihu-tooltip-trigger>
    <aihu-tooltip-content>${body}</aihu-tooltip-content>
  </aihu-tooltip-root>`

export const Default = {
  render: (): string => TOOLTIP(),
}

export const DarkMode = {
  render: (): string => TOOLTIP(),
  globals: { mode: 'dark' },
}

export const States = {
  render: (): string => TOOLTIP(),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const content = canvasElement.querySelector('aihu-tooltip-content') as HTMLElement
    const trigger = canvasElement.querySelector('aihu-tooltip-trigger') as HTMLElement
    await expect(content).toHaveAttribute('role', 'tooltip')
    await expect(content).toHaveAttribute('data-state', 'closed')
    // APG Tooltip: the trigger is DESCRIBED by the content (not labelled-by).
    await expect(trigger.getAttribute('aria-describedby')).toBe(content.id)
  },
}

export const Open = {
  render: (): string => TOOLTIP(),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const trigger = canvasElement.querySelector('aihu-tooltip-trigger') as HTMLElement
    const content = canvasElement.querySelector('aihu-tooltip-content') as HTMLElement
    trigger.focus()
    await waitFor(async () => {
      await expect(content).toHaveAttribute('data-state', 'open')
    })
  },
}

export const OpenWithLongContent = {
  render: (): string => TOOLTIP('A much longer explanation. '.repeat(20)),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const trigger = canvasElement.querySelector('aihu-tooltip-trigger') as HTMLElement
    const content = canvasElement.querySelector('aihu-tooltip-content') as HTMLElement
    trigger.focus()
    await waitFor(async () => {
      await expect(content).toHaveAttribute('data-state', 'open')
    })
  },
}

export const KeyboardActivation = {
  render: (): string => TOOLTIP(),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const trigger = canvasElement.querySelector('aihu-tooltip-trigger') as HTMLElement
    const content = canvasElement.querySelector('aihu-tooltip-content') as HTMLElement
    // Focus opens (keyboard path)…
    trigger.focus()
    await waitFor(async () => {
      await expect(content).toHaveAttribute('data-state', 'open')
    })
    // …Escape dismisses immediately (APG).
    await userEvent.keyboard('{Escape}')
    await waitFor(async () => {
      await expect(content).toHaveAttribute('data-state', 'closed')
    })
  },
}
