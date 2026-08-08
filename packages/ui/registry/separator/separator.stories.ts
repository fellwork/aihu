/**
 * aihu-separator recipe stories (Plan 6, spec §10.2 set for a presentational
 * recipe with a variant matrix: Default, Variants, DarkMode) plus an a11y
 * States probe (role / aria-orientation are part of this recipe's contract).
 *
 * NOT part of the registry payload — gen-registry excludes `*.stories.ts`.
 */
import { expect } from 'storybook/test'

import '@storybook-recipes/aihu-separator.aihu'

export default {
  title: 'UI/Separator',
  tags: ['autodocs', 'recipe', 'phase-1'],
}

export const Default = {
  render: (): string => `
    <div style="max-width: 20rem;">
      above
      <aihu-separator></aihu-separator>
      below
    </div>`,
}

export const Variants = {
  render: (): string => `
    <div style="max-width: 20rem;">
      horizontal
      <aihu-separator orientation="horizontal"></aihu-separator>
      <div style="display: flex; gap: 0.5rem; height: 2rem; align-items: stretch;">
        left
        <aihu-separator orientation="vertical"></aihu-separator>
        right
      </div>
    </div>`,
}

export const States = {
  render: (): string =>
    `<aihu-separator orientation="vertical" style="height: 2rem;"></aihu-separator>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const host = canvasElement.querySelector('aihu-separator') as HTMLElement
    // The ARIA contract lives on the rendered template element, which is where
    // the recipe authors it. (It briefly ALSO appeared to live on the host, via
    // a `@state` class that turned out never to register — see
    // `.changeset/registry-dead-registration.md`; that block is gone.)
    const inner = host.shadowRoot?.querySelector('[data-slot="separator"]')
    await expect(inner).toBeTruthy()
    await expect(inner as HTMLElement).toHaveAttribute('role', 'separator')
    await expect(inner as HTMLElement).toHaveAttribute('aria-orientation', 'vertical')
  },
}

export const DarkMode = {
  render: (): string => `
    <div style="max-width: 20rem;">
      above
      <aihu-separator></aihu-separator>
      below
    </div>`,
  globals: { mode: 'dark' },
}
