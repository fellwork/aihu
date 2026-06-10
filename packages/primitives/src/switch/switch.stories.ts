/**
 * Headless switch stories (Plan 6, spec §10.2 required set for an
 * interactive keyboard-operable primitive: Default, States, Focus, Disabled,
 * DarkMode, KeyboardActivation, FormParticipation).
 *
 * Headless = zero CSS by contract; these stories assert BEHAVIOR (binary
 * ARIA, Space+Enter keyboard, state reflection), not appearance. Hosts carry
 * aria-label — a bare role=switch host has no visible text, so axe label
 * checks need it. Styled coverage lives in the UI/Switch recipe stories.
 */
import { expect, fn, userEvent } from 'storybook/test'

import { type AihuSwitchRoot, defineSwitch } from './index.ts'

defineSwitch() // module-level; registration is guarded

export default {
  title: 'Primitives/Switch',
  tags: ['autodocs', 'headless', 'phase-2', 'apg-switch'],
}

export const Default = {
  render: (): string => `
    <aihu-switch-root aria-label="Enable notifications">
      <aihu-switch-thumb></aihu-switch-thumb>
    </aihu-switch-root>`,
}

export const States = {
  render: (): string => `
    <div style="display: flex; gap: 1rem;">
      <aihu-switch-root aria-label="Off"></aihu-switch-root>
      <aihu-switch-root checked aria-label="On"></aihu-switch-root>
      <aihu-switch-root disabled aria-label="Disabled"></aihu-switch-root>
    </div>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const [off, on, disabled] = Array.from(canvasElement.querySelectorAll('aihu-switch-root'))
    await expect(off).toHaveAttribute('aria-checked', 'false')
    await expect(off).toHaveAttribute('data-state', 'unchecked')
    await expect(on).toHaveAttribute('aria-checked', 'true')
    await expect(on).toHaveAttribute('data-state', 'checked')
    await expect(disabled).toHaveAttribute('data-disabled')
  },
}

export const Focus = {
  render: (): string => `<aihu-switch-root aria-label="Focus me"></aihu-switch-root>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const sw = canvasElement.querySelector('aihu-switch-root') as HTMLElement
    await expect(sw).toHaveAttribute('role', 'switch')
    await expect(sw).toHaveAttribute('tabindex', '0')
    sw.focus()
    await expect(sw).toHaveFocus()
  },
}

export const Disabled = {
  render: (): string => `<aihu-switch-root disabled aria-label="Disabled"></aihu-switch-root>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const sw = canvasElement.querySelector('aihu-switch-root') as HTMLElement
    const onChange = fn()
    sw.addEventListener('checked-change', onChange)
    await userEvent.click(sw)
    await expect(onChange).not.toHaveBeenCalled()
    await expect(sw).toHaveAttribute('aria-checked', 'false')
  },
}

export const DarkMode = {
  render: (): string => `<aihu-switch-root aria-label="Dark mode"></aihu-switch-root>`,
  globals: { mode: 'dark' },
}

export const KeyboardActivation = {
  render: (): string =>
    `<aihu-switch-root aria-label="Toggle with Space or Enter"></aihu-switch-root>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const sw = canvasElement.querySelector('aihu-switch-root') as AihuSwitchRoot
    sw.focus()
    // APG Switch: BOTH Space and Enter toggle.
    await userEvent.keyboard(' ')
    await expect(sw).toHaveAttribute('aria-checked', 'true')
    await userEvent.keyboard('{Enter}')
    await expect(sw).toHaveAttribute('aria-checked', 'false')
  },
}

export const FormParticipation = {
  render: (): string => `
    <form>
      <aihu-switch-root name="notify" aria-label="Notify"></aihu-switch-root>
    </form>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const form = canvasElement.querySelector('form') as HTMLFormElement
    const sw = canvasElement.querySelector('aihu-switch-root') as HTMLElement
    await expect(new FormData(form).get('notify')).toBeNull()
    await userEvent.click(sw)
    await expect(new FormData(form).get('notify')).toBe('on')
  },
}
