/**
 * Headless radio-group stories (Plan 6, spec §10.2 required set for an
 * interactive keyboard-operable primitive: Default, States, Focus, Disabled,
 * DarkMode, KeyboardActivation, FormParticipation, + RTLBehavior for the
 * roving-arrow flip).
 *
 * Headless = zero CSS by contract; these stories assert BEHAVIOR (roving
 * tabindex, arrow-selects, ARIA, state reflection), not appearance. The root
 * carries aria-label (role=radiogroup needs an accessible name for axe) and
 * every item carries aria-label too. Styled coverage lives in the
 * UI/RadioGroup recipe stories.
 */
import { expect, fn, userEvent } from 'storybook/test'

import { type AihuRadioGroupRoot, defineRadioGroup } from './index.ts'

defineRadioGroup() // module-level; registration is guarded

export default {
  title: 'Primitives/RadioGroup',
  tags: ['autodocs', 'headless', 'phase-2', 'apg-radio-group'],
}

const group = (rootAttrs: string, items: Array<[string, string]>): string => `
  <aihu-radio-group-root aria-label="Fruit" ${rootAttrs}>
    ${items
      .map(
        ([value, attrs]) => `
    <aihu-radio-group-item value="${value}" aria-label="${value}" ${attrs}>
      <aihu-radio-group-indicator>●</aihu-radio-group-indicator>
      ${value}
    </aihu-radio-group-item>`,
      )
      .join('')}
  </aihu-radio-group-root>`

export const Default = {
  render: (): string =>
    group('', [
      ['apple', ''],
      ['banana', ''],
      ['cherry', ''],
    ]),
}

export const States = {
  render: (): string =>
    group('value="banana"', [
      ['apple', ''],
      ['banana', ''],
      ['cherry', 'disabled'],
    ]),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const [apple, banana, cherry] = Array.from(
      canvasElement.querySelectorAll('aihu-radio-group-item'),
    )
    await expect(apple).toHaveAttribute('aria-checked', 'false')
    await expect(apple).toHaveAttribute('data-state', 'unchecked')
    await expect(banana).toHaveAttribute('aria-checked', 'true')
    await expect(banana).toHaveAttribute('data-state', 'checked')
    await expect(cherry).toHaveAttribute('data-disabled')
    await expect(cherry).toHaveAttribute('aria-disabled', 'true')
    // The tab stop sits on the checked item.
    await expect(banana).toHaveAttribute('tabindex', '0')
    await expect(apple).toHaveAttribute('tabindex', '-1')
  },
}

export const Focus = {
  render: (): string =>
    group('', [
      ['apple', ''],
      ['banana', ''],
    ]),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const item = canvasElement.querySelector('aihu-radio-group-item') as HTMLElement
    await expect(item).toHaveAttribute('tabindex', '0')
    item.focus()
    await expect(item).toHaveFocus()
  },
}

export const Disabled = {
  render: (): string =>
    group('disabled', [
      ['apple', ''],
      ['banana', ''],
    ]),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const root = canvasElement.querySelector('aihu-radio-group-root') as HTMLElement
    const item = canvasElement.querySelector('aihu-radio-group-item') as HTMLElement
    const onChange = fn()
    root.addEventListener('value-change', onChange)
    await userEvent.click(item)
    await expect(onChange).not.toHaveBeenCalled()
    await expect(root).toHaveAttribute('aria-disabled', 'true')
    await expect(item).toHaveAttribute('aria-checked', 'false')
  },
}

export const DarkMode = {
  render: (): string =>
    group('', [
      ['apple', ''],
      ['banana', ''],
    ]),
  globals: { mode: 'dark' },
}

export const KeyboardActivation = {
  render: (): string =>
    group('', [
      ['apple', ''],
      ['banana', ''],
      ['cherry', ''],
    ]),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const root = canvasElement.querySelector('aihu-radio-group-root') as AihuRadioGroupRoot
    const [apple, banana] = Array.from(
      canvasElement.querySelectorAll('aihu-radio-group-item'),
    ) as HTMLElement[]
    apple?.focus()
    // APG Radio Group: arrows move focus AND select…
    await userEvent.keyboard('{ArrowRight}')
    await expect(banana).toHaveFocus()
    await expect(banana).toHaveAttribute('aria-checked', 'true')
    // …Space selects the focused unchecked item…
    await userEvent.keyboard('{ArrowLeft}')
    await expect(apple).toHaveAttribute('aria-checked', 'true')
    await userEvent.keyboard('{ArrowRight}') // back on banana
    await userEvent.keyboard(' ')
    await expect(banana).toHaveAttribute('aria-checked', 'true')
    // …and Enter does NOT activate.
    await userEvent.keyboard('{ArrowLeft}')
    await expect(root.value()).toBe('apple')
    await userEvent.keyboard('{Enter}')
    await expect(root.value()).toBe('apple')
  },
}

export const FormParticipation = {
  render: (): string => `
    <form>
      ${group('name="fruit"', [
        ['apple', ''],
        ['banana', ''],
      ])}
    </form>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const form = canvasElement.querySelector('form') as HTMLFormElement
    const [, banana] = Array.from(
      canvasElement.querySelectorAll('aihu-radio-group-item'),
    ) as HTMLElement[]
    // No selection ⇒ submits nothing (native parity).
    await expect(new FormData(form).get('fruit')).toBeNull()
    await userEvent.click(banana as HTMLElement)
    await expect(new FormData(form).get('fruit')).toBe('banana')
  },
}

export const RTLBehavior = {
  render: (): string =>
    group('dir="rtl"', [
      ['apple', ''],
      ['banana', ''],
      ['cherry', ''],
    ]),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const [apple, banana] = Array.from(
      canvasElement.querySelectorAll('aihu-radio-group-item'),
    ) as HTMLElement[]
    apple?.focus()
    // RTL: ArrowLeft moves to the NEXT item (and selects it).
    await userEvent.keyboard('{ArrowLeft}')
    await expect(banana).toHaveFocus()
    await expect(banana).toHaveAttribute('aria-checked', 'true')
    // RTL: ArrowRight retreats.
    await userEvent.keyboard('{ArrowRight}')
    await expect(apple).toHaveFocus()
    await expect(apple).toHaveAttribute('aria-checked', 'true')
  },
}
