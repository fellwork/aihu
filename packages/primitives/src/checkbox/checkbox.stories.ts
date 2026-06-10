/**
 * Headless checkbox stories (Plan 6, spec §10.2 required set for an
 * interactive keyboard-operable primitive: Default, States, Focus, Disabled,
 * DarkMode, KeyboardActivation, FormParticipation).
 *
 * Headless = zero CSS by contract; these stories assert BEHAVIOR (tri-state
 * ARIA, keyboard, state reflection), not appearance. Hosts carry aria-label —
 * a bare role=checkbox host has no visible text, so axe label checks need it.
 * Styled coverage lives in the UI/Checkbox recipe stories.
 */
import { expect, fn, userEvent } from 'storybook/test'

import { type AihuCheckboxRoot, defineCheckbox } from './index.ts'

defineCheckbox() // module-level; registration is guarded

export default {
  title: 'Primitives/Checkbox',
  tags: ['autodocs', 'headless', 'phase-2', 'apg-checkbox'],
}

export const Default = {
  render: (): string => `
    <aihu-checkbox-root aria-label="Accept terms">
      <aihu-checkbox-indicator>✓</aihu-checkbox-indicator>
    </aihu-checkbox-root>`,
}

export const States = {
  render: (): string => `
    <div style="display: flex; gap: 1rem;">
      <aihu-checkbox-root aria-label="Unchecked"></aihu-checkbox-root>
      <aihu-checkbox-root checked aria-label="Checked"></aihu-checkbox-root>
      <aihu-checkbox-root checked="mixed" aria-label="Indeterminate"></aihu-checkbox-root>
      <aihu-checkbox-root disabled aria-label="Disabled"></aihu-checkbox-root>
    </div>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const [unchecked, checked, mixed, disabled] = Array.from(
      canvasElement.querySelectorAll('aihu-checkbox-root'),
    )
    await expect(unchecked).toHaveAttribute('aria-checked', 'false')
    await expect(unchecked).toHaveAttribute('data-state', 'unchecked')
    await expect(checked).toHaveAttribute('aria-checked', 'true')
    await expect(checked).toHaveAttribute('data-state', 'checked')
    await expect(mixed).toHaveAttribute('aria-checked', 'mixed')
    await expect(mixed).toHaveAttribute('data-state', 'indeterminate')
    await expect(disabled).toHaveAttribute('data-disabled')
  },
}

export const Focus = {
  render: (): string => `<aihu-checkbox-root aria-label="Focus me"></aihu-checkbox-root>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const box = canvasElement.querySelector('aihu-checkbox-root') as HTMLElement
    await expect(box).toHaveAttribute('tabindex', '0')
    box.focus()
    await expect(box).toHaveFocus()
  },
}

export const Disabled = {
  render: (): string => `<aihu-checkbox-root disabled aria-label="Disabled"></aihu-checkbox-root>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const box = canvasElement.querySelector('aihu-checkbox-root') as HTMLElement
    const onChange = fn()
    box.addEventListener('checked-change', onChange)
    await userEvent.click(box)
    await expect(onChange).not.toHaveBeenCalled()
    await expect(box).toHaveAttribute('aria-checked', 'false')
  },
}

export const DarkMode = {
  render: (): string => `<aihu-checkbox-root aria-label="Dark mode"></aihu-checkbox-root>`,
  globals: { mode: 'dark' },
}

export const KeyboardActivation = {
  render: (): string => `<aihu-checkbox-root aria-label="Toggle with Space"></aihu-checkbox-root>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const box = canvasElement.querySelector('aihu-checkbox-root') as AihuCheckboxRoot
    box.focus()
    // APG Checkbox: Space toggles…
    await userEvent.keyboard(' ')
    await expect(box).toHaveAttribute('aria-checked', 'true')
    // …but Enter does NOT (APG/Radix).
    await userEvent.keyboard('{Enter}')
    await expect(box).toHaveAttribute('aria-checked', 'true')
  },
}

export const FormParticipation = {
  render: (): string => `
    <form>
      <aihu-checkbox-root name="agree" value="yes" aria-label="Agree"></aihu-checkbox-root>
    </form>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const form = canvasElement.querySelector('form') as HTMLFormElement
    const box = canvasElement.querySelector('aihu-checkbox-root') as HTMLElement
    await expect(new FormData(form).get('agree')).toBeNull()
    await userEvent.click(box)
    await expect(new FormData(form).get('agree')).toBe('yes')
  },
}
