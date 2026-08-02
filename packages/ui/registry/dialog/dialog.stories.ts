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
    // Closed at rest: content hidden (visibility:hidden — see the Motion
    // stories below for why it is no longer display:none), trigger collapsed.
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

// ── Motion (tailwind-animations port, Track A Slice 12) ─────────────────────
// The panel + scrim animate in and out by default; the `animate-dialog-*`
// utility family only RETUNES that built-in motion by overriding the shared
// `--aihu-anim-dialog-*` custom properties. Storybook mounts no global utility
// sheet (see .storybook/main.ts — only the pack token CSS is injected), so
// these stories ship the exact declaration bodies `tokens.rs` emits for those
// classes rather than pretending the classes resolve on their own. That keeps
// the demo honest AND makes it a real regression net: if the emitted custom
// property names ever drift from the ones the recipe pieces read, the panel
// visibly stops responding to the class.
const DIALOG_UTILITIES = `
  <style>
    .animate-dialog-from-top { --aihu-anim-dialog-start-x: 0px; --aihu-anim-dialog-start-y: -1.5rem; }
    .animate-dialog-from-bottom { --aihu-anim-dialog-start-x: 0px; --aihu-anim-dialog-start-y: 1.5rem; }
    .animate-dialog-from-left { --aihu-anim-dialog-start-x: -1.5rem; --aihu-anim-dialog-start-y: 0px; }
    .animate-dialog-from-right { --aihu-anim-dialog-start-x: 1.5rem; --aihu-anim-dialog-start-y: 0px; }
    .animate-dialog-fade { --aihu-anim-dialog-start-x: 0px; --aihu-anim-dialog-start-y: 0px; --aihu-anim-dialog-start-scale: 1; }
    .animate-dialog-zoom { --aihu-anim-dialog-start-x: 0px; --aihu-anim-dialog-start-y: 0px; --aihu-anim-dialog-start-scale: 0.92; }
    .animate-dialog-duration-1200 { --aihu-anim-dialog-duration: 1200ms; }
  </style>`

/** One dialog whose content carries `classes` (an `animate-dialog-*` set). */
const MOTION_DIALOG = (label: string, classes: string): string => `
  ${DIALOG_UTILITIES}
  <aihu-dialog-root modal>
    <aihu-dialog-trigger>${label}</aihu-dialog-trigger>
    <aihu-dialog-backdrop></aihu-dialog-backdrop>
    <aihu-dialog-content class="${classes}">
      <aihu-dialog-title>${label}</aihu-dialog-title>
      <aihu-dialog-description>Entrance tuned by <code>${classes}</code>.</aihu-dialog-description>
      <aihu-dialog-close aria-label="Close">×</aihu-dialog-close>
    </aihu-dialog-content>
  </aihu-dialog-root>`

/**
 * The four directional entrances. Deliberately slowed to 1200ms so the motion
 * is legible in a manual pass and so the `play` assertion below observes the
 * panel mid-transition rather than racing the default 350ms.
 */
export const MotionDirections = {
  render: (): string =>
    ['top', 'bottom', 'left', 'right']
      .map((dir) =>
        MOTION_DIALOG(`From ${dir}`, `animate-dialog-from-${dir} animate-dialog-duration-1200`),
      )
      .join(''),
}

/** The two named presets: fade (opacity only) and zoom (scale only). */
export const MotionPresets = {
  render: (): string =>
    ['fade', 'zoom']
      .map((preset) =>
        MOTION_DIALOG(`Dialog ${preset}`, `animate-dialog-${preset} animate-dialog-duration-1200`),
      )
      .join(''),
}

/**
 * The load-bearing behavioural claim of Slice 12: the closed panel is no longer
 * removed from layout with `display: none`, so it can be transitioned into and
 * out of. Asserting on the COMPUTED style is the only way to catch a regression
 * back to `display: none` — the `data-state` attribute alone would still pass.
 */
export const MotionExitIsAnimated = {
  render: (): string => MOTION_DIALOG('Animated exit', 'animate-dialog-duration-1200'),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const trigger = canvasElement.querySelector('aihu-dialog-trigger') as HTMLElement
    const content = canvasElement.querySelector('aihu-dialog-content') as HTMLElement

    await userEvent.click(trigger)
    await waitFor(async () => {
      await expect(content).toHaveAttribute('data-state', 'open')
    })
    await expect(getComputedStyle(content).display).not.toBe('none')

    await userEvent.keyboard('{Escape}')
    await waitFor(async () => {
      await expect(content).toHaveAttribute('data-state', 'closed')
    })
    // Still rendered while the exit transition runs — the whole point of using
    // a delayed `visibility` rather than an instant `display` cutover.
    await expect(getComputedStyle(content).display).not.toBe('none')
  },
}
