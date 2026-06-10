/**
 * Headless tooltip stories (Plan 6, spec §10.2 required set for an overlay
 * primitive: Default, States, Open, OpenWithLongContent, KeyboardActivation,
 * DarkMode).
 *
 * Headless = zero CSS; assertions target behavior (aria-describedby wiring,
 * focus-open, Escape-dismiss, data-state). Styled coverage lives in the
 * UI/Tooltip recipe stories (Phase 2).
 */
import { expect, userEvent, waitFor } from 'storybook/test'

import { defineTooltip } from './index.ts'

defineTooltip() // module-level; registration is guarded

export default {
  title: 'Primitives/Tooltip',
  tags: ['autodocs', 'headless', 'phase-1', 'apg-tooltip'],
}

/** Zero delays so play functions and snapshots see deterministic state. */
const TOOLTIP = (body = 'Helpful hint') => `
  <aihu-tooltip-root placement="top" open-delay="0" close-delay="0">
    <aihu-tooltip-trigger tabindex="0">Hover or focus me</aihu-tooltip-trigger>
    <aihu-tooltip-content>${body}</aihu-tooltip-content>
  </aihu-tooltip-root>`

export const Default = {
  render: (): string => TOOLTIP(),
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

export const DarkMode = {
  render: (): string => TOOLTIP(),
  globals: { mode: 'dark' },
}
