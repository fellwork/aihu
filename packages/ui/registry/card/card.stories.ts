/**
 * aihu-card recipe stories (Plan 6, spec §10.2 set for a presentational
 * recipe without a variant matrix: Default, DarkMode).
 *
 * NOT part of the registry payload — gen-registry excludes `*.stories.ts`.
 */
import { expect } from 'storybook/test'

import '@storybook-recipes/aihu-card.aihu'

export default {
  title: 'UI/Card',
  tags: ['autodocs', 'recipe', 'phase-1'],
}

const CARD = `
  <aihu-card style="max-width: 24rem;">
    <h3 slot="header" style="margin: 0;">Card title</h3>
    <p style="margin: 0;">Body content lives in the default slot. Header and
    footer project into named slots.</p>
    <span slot="footer">Footer</span>
  </aihu-card>`

export const Default = {
  render: (): string => CARD,
  // R2, in a REAL browser. `tests/shadow-adoption.test.ts` proves the shape
  // against the compiled module under jsdom — which implements neither
  // `CSSStyleSheet.replaceSync` nor a real `adoptedStyleSheets`, so it has to
  // shim both. This runs in chromium, where both are genuine, and asks the
  // only question that finally matters: did the rules PAINT?
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const host = canvasElement.querySelector('aihu-card') as HTMLElement
    const root = host.shadowRoot as ShadowRoot
    await expect(root).toBeTruthy()

    // One shared Constructable StyleSheet, adopted — not an inline <style>.
    await expect(root.adoptedStyleSheets.length).toBe(1)
    await expect(root.querySelector('style')).toBeNull()
    await expect(root.adoptedStyleSheets[0]!.cssRules.length).toBeGreaterThan(0)

    // …and the rules are in effect on the rendered template.
    const card = root.querySelector('[data-slot="card"]') as HTMLElement
    const body = root.querySelector('.aihu-card-body') as HTMLElement
    await expect(getComputedStyle(card).display).toBe('block')
    await expect(getComputedStyle(card).borderTopWidth).toBe('1px')
    await expect(getComputedStyle(card).borderTopStyle).toBe('solid')
    await expect(getComputedStyle(card).borderTopLeftRadius).toBe('8px') // 0.5rem
    await expect(getComputedStyle(body).paddingTop).toBe('24px') // 1.5rem
  },
}

export const DarkMode = {
  render: (): string => CARD,
  globals: { mode: 'dark' },
}
