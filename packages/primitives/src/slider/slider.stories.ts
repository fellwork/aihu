/**
 * Headless slider stories (Plan 6, spec §10.2 required set for an interactive
 * keyboard-operable primitive: Default, States, Focus, Disabled, DarkMode,
 * KeyboardActivation).
 *
 * Headless = zero CSS by contract; these stories assert BEHAVIOR (ARIA value
 * reflection, keyboard adjustment, state reflection), not appearance. The
 * host carries aria-label (role=slider needs an accessible name for axe).
 * Styled coverage lives in the UI/Before-after recipe stories, which is the
 * one registry component this primitive backs this slice.
 */
import { expect, fn, userEvent } from 'storybook/test'

import { type AihuSliderRoot, defineSlider } from './index.ts'

defineSlider() // module-level; registration is guarded

export default {
  title: 'Primitives/Slider',
  tags: ['autodocs', 'headless', 'phase-2', 'apg-slider'],
}

export const Default = {
  render: (): string => `<aihu-slider-root aria-label="Comparison position"></aihu-slider-root>`,
}

export const States = {
  render: (): string => `
    <div style="display: flex; gap: 1rem;">
      <aihu-slider-root value="0" aria-label="At minimum"></aihu-slider-root>
      <aihu-slider-root value="50" aria-label="Midpoint"></aihu-slider-root>
      <aihu-slider-root value="100" aria-label="At maximum"></aihu-slider-root>
      <aihu-slider-root disabled aria-label="Disabled"></aihu-slider-root>
    </div>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const [min, mid, max, disabled] = Array.from(canvasElement.querySelectorAll('aihu-slider-root'))
    await expect(min).toHaveAttribute('aria-valuenow', '0')
    await expect(mid).toHaveAttribute('aria-valuenow', '50')
    await expect(max).toHaveAttribute('aria-valuenow', '100')
    await expect(disabled).toHaveAttribute('data-disabled')
  },
}

export const Focus = {
  render: (): string => `<aihu-slider-root aria-label="Focus me"></aihu-slider-root>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const s = canvasElement.querySelector('aihu-slider-root') as HTMLElement
    await expect(s).toHaveAttribute('role', 'slider')
    await expect(s).toHaveAttribute('tabindex', '0')
    s.focus()
    await expect(s).toHaveFocus()
  },
}

export const Disabled = {
  render: (): string => `<aihu-slider-root disabled aria-label="Disabled"></aihu-slider-root>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const s = canvasElement.querySelector('aihu-slider-root') as HTMLElement
    const onChange = fn()
    s.addEventListener('value-change', onChange)
    s.focus()
    await userEvent.keyboard('{ArrowRight}')
    await expect(onChange).not.toHaveBeenCalled()
    await expect(s).toHaveAttribute('aria-valuenow', '50')
  },
}

export const DarkMode = {
  render: (): string => `<aihu-slider-root aria-label="Dark mode"></aihu-slider-root>`,
  globals: { mode: 'dark' },
}

export const KeyboardActivation = {
  render: (): string =>
    `<aihu-slider-root value="50" aria-label="Adjust with arrow keys"></aihu-slider-root>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const s = canvasElement.querySelector('aihu-slider-root') as AihuSliderRoot
    s.focus()
    await userEvent.keyboard('{ArrowRight}')
    await expect(s).toHaveAttribute('aria-valuenow', '51')
    await userEvent.keyboard('{ArrowLeft}')
    await expect(s).toHaveAttribute('aria-valuenow', '50')
    await userEvent.keyboard('{Home}')
    await expect(s).toHaveAttribute('aria-valuenow', '0')
    await userEvent.keyboard('{End}')
    await expect(s).toHaveAttribute('aria-valuenow', '100')
  },
}
