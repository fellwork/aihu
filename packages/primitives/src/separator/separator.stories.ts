/**
 * Headless separator stories (Plan 6, spec §10.2 required set for a static,
 * non-interactive primitive: Default, States, DarkMode).
 *
 * Headless = zero CSS by contract; these stories assert BEHAVIOR (role,
 * aria-orientation, data-orientation reflection), not appearance. Styled
 * coverage lives in the UI/Separator recipe stories.
 */
import { expect } from 'storybook/test'

import { defineSeparator } from './index.ts'

defineSeparator('demo-separator') // module-level; registration is guarded

export default {
  title: 'Primitives/Separator',
  tags: ['autodocs', 'headless', 'phase-2', 'apg-separator'],
}

export const Default = {
  render: (): string => `
    <div>
      <p>Above</p>
      <demo-separator></demo-separator>
      <p>Below</p>
    </div>`,
}

export const States = {
  render: (): string => `
    <div style="display: flex; gap: 1rem; align-items: center;">
      <demo-separator></demo-separator>
      <demo-separator orientation="vertical"></demo-separator>
      <demo-separator decorative></demo-separator>
    </div>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const [horizontal, vertical, decorative] = Array.from(
      canvasElement.querySelectorAll('demo-separator'),
    )
    await expect(horizontal).toHaveAttribute('role', 'separator')
    await expect(horizontal).toHaveAttribute('data-orientation', 'horizontal')
    await expect(horizontal).not.toHaveAttribute('aria-orientation')
    await expect(vertical).toHaveAttribute('aria-orientation', 'vertical')
    await expect(vertical).toHaveAttribute('data-orientation', 'vertical')
    await expect(decorative).toHaveAttribute('role', 'none')
  },
}

export const DarkMode = {
  render: (): string => `
    <div>
      <p>Above</p>
      <demo-separator></demo-separator>
      <p>Below</p>
    </div>`,
  globals: { mode: 'dark' },
}
