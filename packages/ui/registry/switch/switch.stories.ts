/**
 * aihu-switch recipe stories (Phase 2, spec §10.2 set for an interactive
 * form control: Default, States, Focus, Disabled, DarkMode, KeyboardActivation,
 * FormParticipation).
 *
 * The recipe is a LIGHT-DOM class-extension element: `<aihu-switch>` extends
 * the headless AihuSwitchRoot, so the host itself carries role=switch +
 * behavior (binary aria-checked, Space/Enter toggle). NOT part of the registry
 * payload (gen-registry excludes stories).
 */
import { expect, fn, userEvent } from 'storybook/test'

import '@storybook-recipes/aihu-switch.aihu'

export default {
  title: 'UI/Switch',
  tags: ['autodocs', 'recipe', 'phase-2'],
}

export const Default = {
  render: (): string => `<aihu-switch aria-label="Notifications"></aihu-switch>`,
  parameters: { chromatic: { viewports: [1280, 375] } },
}

export const States = {
  render: (): string => `
    <div style="display: flex; gap: 1rem; align-items: center;">
      <aihu-switch aria-label="Off"></aihu-switch>
      <aihu-switch aria-label="On" checked></aihu-switch>
      <aihu-switch aria-label="Disabled" disabled></aihu-switch>
    </div>`,
  parameters: { chromatic: { viewports: [1280, 375] } },
}

export const Focus = {
  render: (): string => `<aihu-switch aria-label="Focus"></aihu-switch>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const sw = canvasElement.querySelector('aihu-switch') as HTMLElement
    sw.focus()
    await expect(sw).toHaveFocus()
    await expect(sw).toHaveAttribute('role', 'switch')
  },
}

export const Disabled = {
  render: (): string => `<aihu-switch aria-label="Disabled" disabled></aihu-switch>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const sw = canvasElement.querySelector('aihu-switch') as HTMLElement
    const onChange = fn()
    sw.addEventListener('checked-change', onChange)
    await userEvent.click(sw)
    await expect(onChange).not.toHaveBeenCalled()
  },
}

export const DarkMode = {
  render: (): string => `
    <div style="display: flex; gap: 1rem; align-items: center;">
      <aihu-switch aria-label="Off"></aihu-switch>
      <aihu-switch aria-label="On" checked></aihu-switch>
    </div>`,
  globals: { mode: 'dark' },
}

export const KeyboardActivation = {
  render: (): string => `<aihu-switch aria-label="Toggle"></aihu-switch>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const sw = canvasElement.querySelector('aihu-switch') as HTMLElement
    sw.focus()
    await expect(sw).toHaveAttribute('aria-checked', 'false')
    await userEvent.keyboard(' ')
    // Space toggles (APG Switch); the host (extending AihuSwitchRoot) handles it.
    await expect(sw).toHaveAttribute('aria-checked', 'true')
  },
}

export const FormParticipation = {
  render: (): string => `
    <form>
      <aihu-switch name="notify" value="on" aria-label="Notify"></aihu-switch>
    </form>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const form = canvasElement.querySelector('form') as HTMLFormElement
    const sw = canvasElement.querySelector('aihu-switch') as HTMLElement
    await expect(new FormData(form).get('notify')).toBeNull()
    await userEvent.click(sw)
    // Light-DOM host → the sibling hidden input joins the outer form.
    await expect(new FormData(form).get('notify')).toBe('on')
  },
}
