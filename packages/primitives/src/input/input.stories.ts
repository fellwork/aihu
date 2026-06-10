/**
 * Headless input stories (Plan 6, spec §10.2 required set for a text control:
 * Default, States, Focus, Disabled, DarkMode, KeyboardActivation,
 * FormParticipation).
 *
 * Headless = zero CSS by contract; these stories assert BEHAVIOR (native
 * handoff, value sync, data-state reflection), not appearance. Styled
 * coverage lives in the UI/Input recipe stories.
 */
import { expect, fn, userEvent } from 'storybook/test'

import { type AihuInput, defineInput } from './index.ts'

defineInput() // module-level; registration is guarded

export default {
  title: 'Primitives/Input',
  tags: ['autodocs', 'headless', 'phase-2', 'apg-input'],
}

export const Default = {
  render: (): string =>
    `<aihu-input placeholder="Type here" aria-label="Default input"></aihu-input>`,
}

export const States = {
  render: (): string => `
    <div style="display: flex; gap: 1rem;">
      <aihu-input placeholder="Idle" aria-label="Idle"></aihu-input>
      <aihu-input disabled placeholder="Disabled" aria-label="Disabled"></aihu-input>
      <aihu-input readonly value="Read only" aria-label="Readonly"></aihu-input>
    </div>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const [idle, disabled, readonly] = Array.from(canvasElement.querySelectorAll('aihu-input'))
    await expect(idle).toHaveAttribute('data-state', 'idle')
    await expect(disabled).toHaveAttribute('data-state', 'disabled')
    await expect(readonly).toHaveAttribute('data-state', 'readonly')
  },
}

export const Focus = {
  render: (): string => `<aihu-input placeholder="Focus me" aria-label="Focus input"></aihu-input>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const host = canvasElement.querySelector('aihu-input') as AihuInput
    host.focus()
    // focus() delegates to the native light-DOM child.
    await expect(host.querySelector('input')).toHaveFocus()
  },
}

export const Disabled = {
  render: (): string =>
    `<aihu-input disabled placeholder="Disabled" aria-label="Disabled input"></aihu-input>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const host = canvasElement.querySelector('aihu-input') as AihuInput
    const native = host.querySelector('input') as HTMLInputElement
    await expect(native.disabled).toBe(true)
  },
}

export const DarkMode = {
  render: (): string =>
    `<aihu-input placeholder="Dark mode" aria-label="Dark mode input"></aihu-input>`,
  globals: { mode: 'dark' },
}

export const KeyboardActivation = {
  render: (): string => `<aihu-input aria-label="Typing target"></aihu-input>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const host = canvasElement.querySelector('aihu-input') as AihuInput
    const onChange = fn()
    host.addEventListener('value-change', onChange)
    const native = host.querySelector('input') as HTMLInputElement
    await userEvent.type(native, 'hello')
    // Typing into the native child syncs the host value + fires value-change.
    await expect(host.value()).toBe('hello')
    await expect(onChange).toHaveBeenCalled()
  },
}

export const FormParticipation = {
  render: (): string => `
    <form>
      <aihu-input name="email" aria-label="Email"></aihu-input>
    </form>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const form = canvasElement.querySelector('form') as HTMLFormElement
    const native = canvasElement.querySelector('aihu-input input') as HTMLInputElement
    await userEvent.type(native, 'a@b.co')
    await expect(new FormData(form).get('email')).toBe('a@b.co')
  },
}
