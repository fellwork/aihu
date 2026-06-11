/**
 * aihu-checkbox recipe stories (Plan 6, spec §10.2 set for an interactive
 * form control: Default, States, Focus, Disabled, DarkMode, KeyboardActivation,
 * FormParticipation).
 *
 * The recipe is a LIGHT-DOM class-extension element: `<aihu-checkbox>` extends
 * the headless AihuCheckboxRoot, so the host itself carries role=checkbox +
 * behavior. NOT part of the registry payload (gen-registry excludes stories).
 */
import { expect, fn, userEvent } from 'storybook/test'

import '@storybook-recipes/aihu-checkbox.aihu'

export default {
  title: 'UI/Checkbox',
  tags: ['autodocs', 'recipe', 'phase-2'],
}

export const Default = {
  render: (): string => `<aihu-checkbox aria-label="Accept"></aihu-checkbox>`,
}

export const States = {
  render: (): string => `
    <div style="display: flex; gap: 1rem; align-items: center;">
      <aihu-checkbox aria-label="Unchecked"></aihu-checkbox>
      <aihu-checkbox aria-label="Checked" checked></aihu-checkbox>
      <aihu-checkbox aria-label="Indeterminate" checked="mixed"></aihu-checkbox>
      <aihu-checkbox aria-label="Disabled" disabled></aihu-checkbox>
    </div>`,
}

export const Focus = {
  render: (): string => `<aihu-checkbox aria-label="Focus"></aihu-checkbox>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const box = canvasElement.querySelector('aihu-checkbox') as HTMLElement
    box.focus()
    await expect(box).toHaveFocus()
    await expect(box).toHaveAttribute('role', 'checkbox')
  },
}

export const Disabled = {
  render: (): string => `<aihu-checkbox aria-label="Disabled" disabled></aihu-checkbox>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const box = canvasElement.querySelector('aihu-checkbox') as HTMLElement
    const onChange = fn()
    box.addEventListener('checked-change', onChange)
    await userEvent.click(box)
    await expect(onChange).not.toHaveBeenCalled()
  },
}

export const DarkMode = {
  render: (): string => `
    <div style="display: flex; gap: 1rem; align-items: center;">
      <aihu-checkbox aria-label="Unchecked"></aihu-checkbox>
      <aihu-checkbox aria-label="Checked" checked></aihu-checkbox>
    </div>`,
  globals: { mode: 'dark' },
}

export const KeyboardActivation = {
  render: (): string => `<aihu-checkbox aria-label="Toggle"></aihu-checkbox>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const box = canvasElement.querySelector('aihu-checkbox') as HTMLElement
    box.focus()
    await expect(box).toHaveAttribute('aria-checked', 'false')
    await userEvent.keyboard(' ')
    // Space toggles (APG); the host (extending AihuCheckboxRoot) handles it.
    await expect(box).toHaveAttribute('aria-checked', 'true')
  },
}

export const FormParticipation = {
  render: (): string => `
    <form>
      <aihu-checkbox name="agree" value="yes" aria-label="Agree"></aihu-checkbox>
    </form>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const form = canvasElement.querySelector('form') as HTMLFormElement
    const box = canvasElement.querySelector('aihu-checkbox') as HTMLElement
    await expect(new FormData(form).get('agree')).toBeNull()
    await userEvent.click(box)
    // Light-DOM host → the sibling hidden input joins the outer form.
    await expect(new FormData(form).get('agree')).toBe('yes')
  },
}
