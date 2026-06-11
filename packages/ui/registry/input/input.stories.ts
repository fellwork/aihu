/**
 * aihu-input recipe stories (Phase 2, spec §10.2 set for an interactive,
 * non-keyboard-activated form control: Default, States, Focus, Disabled,
 * DarkMode, FormParticipation).
 *
 * The recipe is a LIGHT-DOM presentational element: `<aihu-input>` wraps a
 * native <input> (no $extends) that joins the outer form. NOT part of the
 * registry payload (gen-registry excludes stories).
 */
import { expect, userEvent } from 'storybook/test'

import '@storybook-recipes/aihu-input.aihu'

export default {
  title: 'UI/Input',
  tags: ['autodocs', 'recipe', 'phase-2'],
}

export const Default = {
  render: (): string =>
    `<aihu-input aria-label="Email" placeholder="you@example.com"></aihu-input>`,
}

export const States = {
  render: (): string => `
    <div style="display: flex; flex-direction: column; gap: 1rem; max-width: 18rem;">
      <aihu-input aria-label="Empty" placeholder="Empty"></aihu-input>
      <aihu-input aria-label="Filled" value="hello@aihu.dev"></aihu-input>
      <aihu-input aria-label="Disabled" placeholder="Disabled" disabled></aihu-input>
    </div>`,
}

export const Focus = {
  render: (): string => `<aihu-input aria-label="Focus" placeholder="Focus me"></aihu-input>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const input = canvasElement.querySelector('input') as HTMLInputElement
    input.focus()
    await expect(input).toHaveFocus()
    await userEvent.type(input, 'abc')
    await expect(input).toHaveValue('abc')
  },
}

export const Disabled = {
  render: (): string =>
    `<aihu-input aria-label="Disabled" placeholder="Disabled" disabled></aihu-input>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const input = canvasElement.querySelector('input') as HTMLInputElement
    await expect(input).toBeDisabled()
  },
}

export const DarkMode = {
  render: (): string => `
    <div style="display: flex; flex-direction: column; gap: 1rem; max-width: 18rem;">
      <aihu-input aria-label="Empty" placeholder="Empty"></aihu-input>
      <aihu-input aria-label="Filled" value="hello@aihu.dev"></aihu-input>
    </div>`,
  globals: { mode: 'dark' },
}

export const FormParticipation = {
  render: (): string => `
    <form>
      <aihu-input name="email" value="a@b.com" aria-label="Email"></aihu-input>
    </form>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const form = canvasElement.querySelector('form') as HTMLFormElement
    // Light-DOM host → the native <input> joins the outer form.
    await expect(new FormData(form).get('email')).toBe('a@b.com')
  },
}
