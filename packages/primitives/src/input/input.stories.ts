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

defineInput('demo-input') // module-level; registration is guarded

export default {
  title: 'Primitives/Input',
  tags: ['autodocs', 'headless', 'phase-2', 'apg-input'],
}

export const Default = {
  render: (): string =>
    `<demo-input placeholder="Type here" aria-label="Default input"></demo-input>`,
}

export const States = {
  render: (): string => `
    <div style="display: flex; gap: 1rem;">
      <demo-input placeholder="Idle" aria-label="Idle"></demo-input>
      <demo-input disabled placeholder="Disabled" aria-label="Disabled"></demo-input>
      <demo-input readonly value="Read only" aria-label="Readonly"></demo-input>
    </div>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const [idle, disabled, readonly] = Array.from(canvasElement.querySelectorAll('demo-input'))
    await expect(idle).toHaveAttribute('data-state', 'idle')
    await expect(disabled).toHaveAttribute('data-state', 'disabled')
    await expect(readonly).toHaveAttribute('data-state', 'readonly')
  },
}

export const Focus = {
  render: (): string => `<demo-input placeholder="Focus me" aria-label="Focus input"></demo-input>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const host = canvasElement.querySelector('demo-input') as AihuInput
    host.focus()
    // focus() delegates to the native light-DOM child.
    await expect(host.querySelector('input')).toHaveFocus()
  },
}

export const Disabled = {
  render: (): string =>
    `<demo-input disabled placeholder="Disabled" aria-label="Disabled input"></demo-input>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const host = canvasElement.querySelector('demo-input') as AihuInput
    const native = host.querySelector('input') as HTMLInputElement
    await expect(native.disabled).toBe(true)
  },
}

export const DarkMode = {
  render: (): string =>
    `<demo-input placeholder="Dark mode" aria-label="Dark mode input"></demo-input>`,
  globals: { mode: 'dark' },
}

export const KeyboardActivation = {
  render: (): string => `<demo-input aria-label="Typing target"></demo-input>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const host = canvasElement.querySelector('demo-input') as AihuInput
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
      <demo-input name="email" aria-label="Email"></demo-input>
    </form>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const form = canvasElement.querySelector('form') as HTMLFormElement
    const native = canvasElement.querySelector('demo-input input') as HTMLInputElement
    await userEvent.type(native, 'a@b.co')
    await expect(new FormData(form).get('email')).toBe('a@b.co')
  },
}
