/**
 * Headless textarea stories (Plan 6, spec §10.2 required set for a text
 * control: Default, States, Focus, Disabled, DarkMode, KeyboardActivation,
 * FormParticipation).
 *
 * Headless = zero CSS by contract; these stories assert BEHAVIOR (native
 * handoff, value sync, data-state reflection), not appearance. Styled
 * coverage lives in the UI/Textarea recipe stories.
 */
import { expect, fn, userEvent } from 'storybook/test'

import { type AihuTextarea, defineTextarea } from './index.ts'

defineTextarea('demo-textarea') // module-level; registration is guarded

export default {
  title: 'Primitives/Textarea',
  tags: ['autodocs', 'headless', 'phase-2', 'apg-textarea'],
}

export const Default = {
  render: (): string =>
    `<demo-textarea rows="3" placeholder="Type here" aria-label="Default textarea"></demo-textarea>`,
}

export const States = {
  render: (): string => `
    <div style="display: flex; gap: 1rem;">
      <demo-textarea placeholder="Idle" aria-label="Idle"></demo-textarea>
      <demo-textarea disabled placeholder="Disabled" aria-label="Disabled"></demo-textarea>
      <demo-textarea readonly value="Read only" aria-label="Readonly"></demo-textarea>
    </div>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const [idle, disabled, readonly] = Array.from(canvasElement.querySelectorAll('demo-textarea'))
    await expect(idle).toHaveAttribute('data-state', 'idle')
    await expect(disabled).toHaveAttribute('data-state', 'disabled')
    await expect(readonly).toHaveAttribute('data-state', 'readonly')
  },
}

export const Focus = {
  render: (): string => `<demo-textarea aria-label="Focus textarea"></demo-textarea>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const host = canvasElement.querySelector('demo-textarea') as AihuTextarea
    host.focus()
    // focus() delegates to the native light-DOM child.
    await expect(host.querySelector('textarea')).toHaveFocus()
  },
}

export const Disabled = {
  render: (): string => `<demo-textarea disabled aria-label="Disabled textarea"></demo-textarea>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const host = canvasElement.querySelector('demo-textarea') as AihuTextarea
    const native = host.querySelector('textarea') as HTMLTextAreaElement
    await expect(native.disabled).toBe(true)
  },
}

export const DarkMode = {
  render: (): string => `<demo-textarea aria-label="Dark mode textarea"></demo-textarea>`,
  globals: { mode: 'dark' },
}

export const KeyboardActivation = {
  render: (): string => `<demo-textarea aria-label="Typing target"></demo-textarea>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const host = canvasElement.querySelector('demo-textarea') as AihuTextarea
    const onChange = fn()
    host.addEventListener('value-change', onChange)
    const native = host.querySelector('textarea') as HTMLTextAreaElement
    await userEvent.type(native, 'hello')
    // Typing into the native child syncs the host value + fires value-change.
    await expect(host.value()).toBe('hello')
    await expect(onChange).toHaveBeenCalled()
  },
}

export const FormParticipation = {
  render: (): string => `
    <form>
      <demo-textarea name="bio" aria-label="Bio"></demo-textarea>
    </form>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const form = canvasElement.querySelector('form') as HTMLFormElement
    const native = canvasElement.querySelector('demo-textarea textarea') as HTMLTextAreaElement
    await userEvent.type(native, 'about me')
    await expect(new FormData(form).get('bio')).toBe('about me')
  },
}
