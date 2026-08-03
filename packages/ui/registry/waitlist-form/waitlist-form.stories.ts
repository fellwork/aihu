/**
 * aihu-waitlist-form recipe stories (Phase 2, performativeUI port Slice 7 —
 * spec §10.2 set for an interactive keyboard-operable form recipe: Default,
 * DarkMode, States, Focus, Disabled, Hover, KeyboardActivation,
 * FormParticipation).
 *
 * `<aihu-waitlist-form>` is self-contained (native `<input>`/`<button>`
 * inside its OWN `<form>`, no composed primitive/recipe) — see
 * waitlist-form.aihu's header comment for why. NOT part of the registry
 * payload.
 */
import { expect, userEvent, waitFor } from 'storybook/test'

import '@storybook-recipes/aihu-waitlist-form.aihu'

export default {
  title: 'UI/Waitlist-form',
  tags: ['autodocs', 'recipe', 'phase-2'],
}

const FORM = (attrs = ''): string => `<aihu-waitlist-form ${attrs}></aihu-waitlist-form>`

export const Default = {
  render: (): string => FORM(),
}

export const DarkMode = {
  render: (): string => FORM(),
  globals: { mode: 'dark' },
}

export const States = {
  render: (): string => FORM(),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const input = canvasElement.querySelector('input[type="email"]') as HTMLInputElement
    const label = canvasElement.querySelector('label') as HTMLLabelElement
    // Implicit <label> association (the input is a real light-DOM descendant
    // of the <label> — shadow: 'light' has no ShadowRoot boundary in the way).
    await expect(label.control).toBe(input)
    await expect(input).toHaveAttribute('required')
    await expect(input).toHaveAttribute('type', 'email')
    // No success message until a real submit happens.
    await expect(canvasElement.querySelector('.aihu-waitlist-form-success')).toBeNull()
  },
}

export const Focus = {
  render: (): string => FORM(),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const input = canvasElement.querySelector('input[type="email"]') as HTMLInputElement
    input.focus()
    await expect(input).toHaveFocus()
  },
}

export const Hover = {
  render: (): string => FORM(),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const button = canvasElement.querySelector('button[type="submit"]') as HTMLElement
    await userEvent.hover(button)
  },
}

export const Disabled = {
  render: (): string => FORM('disabled'),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const input = canvasElement.querySelector('input[type="email"]') as HTMLInputElement
    const button = canvasElement.querySelector('button[type="submit"]') as HTMLButtonElement
    await expect(input).toBeDisabled()
    await expect(button).toBeDisabled()
  },
}

export const KeyboardActivation = {
  render: (): string => FORM(),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const input = canvasElement.querySelector('input[type="email"]') as HTMLInputElement
    input.focus()
    await userEvent.keyboard('person@example.com')
    // Enter inside a single-field form submits it (native behavior) — the
    // component swaps to its success message.
    await userEvent.keyboard('{Enter}')
    await waitFor(async () => {
      const success = canvasElement.querySelector('.aihu-waitlist-form-success')
      await expect(success).not.toBeNull()
    })
  },
}

export const FormParticipation = {
  render: (): string => FORM(),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const root = canvasElement.querySelector('aihu-waitlist-form') as HTMLElement
    const input = canvasElement.querySelector('input[type="email"]') as HTMLInputElement
    const button = canvasElement.querySelector('button[type="submit"]') as HTMLButtonElement

    let detail: { email: string } | null = null
    root.addEventListener('waitlist-submit', ((ev: CustomEvent<{ email: string }>) => {
      detail = ev.detail
    }) as EventListener)

    await userEvent.type(input, 'waitlist@example.com')
    await userEvent.click(button)

    await waitFor(async () => {
      await expect(detail).toEqual({ email: 'waitlist@example.com' })
    })
    await waitFor(async () => {
      const success = canvasElement.querySelector('.aihu-waitlist-form-success')
      await expect(success).not.toBeNull()
      await expect(success).toHaveAttribute('role', 'status')
    })
  },
}
