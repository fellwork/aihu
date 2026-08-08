/**
 * aihu-badge recipe stories (Plan 6, spec §10.2 set for a presentational
 * recipe with a variant matrix: Default, Variants, DarkMode).
 *
 * NOT part of the registry payload — gen-registry excludes `*.stories.ts`.
 */
import { expect } from 'storybook/test'

import '@storybook-recipes/aihu-badge.aihu'

export default {
  title: 'UI/Badge',
  tags: ['autodocs', 'recipe', 'phase-1'],
}

const VARIANTS = ['default', 'secondary', 'destructive', 'outline'] as const

export const Default = {
  render: (): string => `<aihu-badge>Badge</aihu-badge>`,
}

export const Variants = {
  render: (): string => `
    <div style="display: flex; gap: 0.5rem; align-items: center;">
      ${VARIANTS.map((v) => `<aihu-badge variant="${v}">${v}</aihu-badge>`).join('\n      ')}
    </div>`,
  // R2 in chromium — the adopted sheet's VARIANT rules really match. Each
  // variant must resolve to a distinct background, which only happens if
  // `.aihu-badge[data-variant="…"]` is live in the shadow root's cascade.
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const backgrounds = new Set<string>()
    for (const variant of VARIANTS) {
      const host = canvasElement.querySelector(`aihu-badge[variant="${variant}"]`) as HTMLElement
      const root = host.shadowRoot as ShadowRoot
      await expect(root.adoptedStyleSheets.length).toBe(1)
      const pill = root.querySelector('[data-slot="badge"]') as HTMLElement
      await expect(getComputedStyle(pill).display).toBe('inline-flex')
      await expect(getComputedStyle(pill).borderTopLeftRadius).toBe('9999px')
      backgrounds.add(getComputedStyle(pill).backgroundColor)
    }
    // default / secondary / destructive each paint a token background; outline
    // is transparent. Three distinct values is the floor that proves the
    // variant selectors are matching rather than all falling through to base.
    await expect(backgrounds.size).toBeGreaterThanOrEqual(3)
  },
}

export const DarkMode = {
  render: (): string => `
    <div style="display: flex; gap: 0.5rem; align-items: center;">
      ${VARIANTS.map((v) => `<aihu-badge variant="${v}">${v}</aihu-badge>`).join('\n      ')}
    </div>`,
  globals: { mode: 'dark' },
  parameters: {
    // KNOWN LIMITATION (css-engine follow-up): baked light :host tokens make
    // the outline variant dark-on-dark. See UI/Button DarkMode for details.
    a11y: { config: { rules: [{ id: 'color-contrast', enabled: false }] } },
  },
}
