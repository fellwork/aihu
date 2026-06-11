/**
 * aihu-textarea recipe stories (Phase 2, spec §10.2 set for an interactive,
 * non-keyboard-activated form control: Default, States, Focus, Disabled,
 * DarkMode, FormParticipation).
 *
 * The recipe is a LIGHT-DOM presentational element: `<aihu-textarea>` wraps a
 * native <textarea> (no $extends) that joins the outer form. NOT part of the
 * registry payload (gen-registry excludes stories).
 */
import { expect, userEvent } from 'storybook/test'

import '@storybook-recipes/aihu-textarea.aihu'

export default {
  title: 'UI/Textarea',
  tags: ['autodocs', 'recipe', 'phase-2'],
}

export const Default = {
  render: (): string =>
    `<aihu-textarea aria-label="Bio" placeholder="Tell us about yourself"></aihu-textarea>`,
  parameters: { chromatic: { viewports: [1280, 375] } },
}

export const States = {
  render: (): string => `
    <div style="display: flex; flex-direction: column; gap: 1rem; max-width: 24rem;">
      <aihu-textarea aria-label="Empty" placeholder="Empty"></aihu-textarea>
      <aihu-textarea aria-label="Filled" value="Hello from aihu."></aihu-textarea>
      <aihu-textarea aria-label="Disabled" placeholder="Disabled" disabled></aihu-textarea>
    </div>`,
  parameters: { chromatic: { viewports: [1280, 375] } },
}

export const Focus = {
  render: (): string => `<aihu-textarea aria-label="Focus" placeholder="Focus me"></aihu-textarea>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const ta = canvasElement.querySelector('textarea') as HTMLTextAreaElement
    ta.focus()
    await expect(ta).toHaveFocus()
    await userEvent.type(ta, 'abc')
    await expect(ta).toHaveValue('abc')
  },
}

export const Disabled = {
  render: (): string =>
    `<aihu-textarea aria-label="Disabled" placeholder="Disabled" disabled></aihu-textarea>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const ta = canvasElement.querySelector('textarea') as HTMLTextAreaElement
    await expect(ta).toBeDisabled()
  },
}

export const DarkMode = {
  render: (): string => `
    <div style="display: flex; flex-direction: column; gap: 1rem; max-width: 24rem;">
      <aihu-textarea aria-label="Empty" placeholder="Empty"></aihu-textarea>
      <aihu-textarea aria-label="Filled" value="Hello from aihu."></aihu-textarea>
    </div>`,
  globals: { mode: 'dark' },
}

export const FormParticipation = {
  render: (): string => `
    <form>
      <aihu-textarea name="bio" value="hi there" aria-label="Bio"></aihu-textarea>
    </form>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const form = canvasElement.querySelector('form') as HTMLFormElement
    // Light-DOM host → the native <textarea> joins the outer form.
    await expect(new FormData(form).get('bio')).toBe('hi there')
  },
}
