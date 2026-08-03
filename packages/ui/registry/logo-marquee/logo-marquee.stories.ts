/**
 * aihu-logo-marquee recipe stories (performativeUI port, Slice 5). Mandated
 * set for a presentational-but-hoverable recipe (no variant matrix, not
 * keyboard/form/overlay/directional, `hoverable: true`): Default, DarkMode,
 * Hover.
 *
 * NOT part of the registry payload (gen-registry excludes `*.stories.ts`).
 */
import { expect, userEvent, waitFor } from 'storybook/test'

import '@storybook-recipes/aihu-logo-marquee.aihu'

export default {
  title: 'UI/Logo-marquee',
  tags: ['autodocs', 'recipe', 'phase-1'],
}

// Duplicated twice per the component's documented seamless-loop expectation.
//
// `opacity: 0.75`, not the 0.6 a marketing marquee reaches for first:
// `--color-foreground` at 0.6 composites to 4.37:1 on `--color-background`
// (aihu-default light), under the 4.5:1 WCAG 2 AA floor these bold-but-16px
// wordmarks need — axe flagged it as a `color-contrast` violation. 0.75
// clears it in every pack x mode (>=7.1:1).
const LOGOS = Array.from(
  { length: 2 },
  () => `
    <span style="font-weight: 700; opacity: 0.75;">Acme</span>
    <span style="font-weight: 700; opacity: 0.75;">Globex</span>
    <span style="font-weight: 700; opacity: 0.75;">Initech</span>
    <span style="font-weight: 700; opacity: 0.75;">Umbrella</span>`,
).join('')

export const Default = {
  render: (): string => `<aihu-logo-marquee>${LOGOS}</aihu-logo-marquee>`,
}

export const DarkMode = {
  render: (): string => `<aihu-logo-marquee>${LOGOS}</aihu-logo-marquee>`,
  globals: { mode: 'dark' },
}

/** Every `animation-play-state` declared under a `:hover` selector that also
 * mentions the track — read straight off the recipe's stylesheet. See the
 * `Hover` play function for why the assertion works this way.
 *
 * `adoptedStyleSheets` is scanned alongside `document.styleSheets`: the
 * css-engine adopts light-DOM recipe CSS as a constructable sheet, so the
 * rules are NOT reachable through `document.styleSheets` alone. */
function hoverPauseDeclarations(): string[] {
  const found: string[] = []
  const sheets = [...Array.from(document.styleSheets), ...document.adoptedStyleSheets]
  for (const sheet of sheets) {
    let rules: CSSRuleList
    try {
      rules = sheet.cssRules
    } catch {
      continue // cross-origin sheet; nothing of ours lives there
    }
    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSStyleRule)) continue
      const sel = rule.selectorText
      if (!sel.includes(':hover') || !sel.includes('aihu-logo-marquee-track')) continue
      found.push(rule.style.animationPlayState)
    }
  }
  return found
}

export const Hover = {
  render: (): string => `<aihu-logo-marquee>${LOGOS}</aihu-logo-marquee>`,
  // Asserts the hover-pause CONTRACT off the stylesheet rather than reading
  // `getComputedStyle(track).animationPlayState` after `userEvent.hover()`.
  //
  // Chromium resolves `:hover` from the compositor's hit-test of the real
  // cursor, which synthetic pointer events cannot move — so the computed-style
  // form of this assertion never actually passed headlessly. It LOOKED green
  // only because `.storybook/test-runner.ts` runs axe in `postVisit`, which
  // throws its own assertion error after a failing play function and masks it;
  // clearing this story's `color-contrast` violation (see LOGOS above) is what
  // unmasked it. Real-cursor hover does pause the track — verified with a
  // direct `page.mouse.move()` probe — it is simply not reachable from inside
  // a play function, which is also why `scripts/check-required-stories.ts`
  // documents Hover as "visual; not headless".
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const marquee = canvasElement.querySelector('aihu-logo-marquee') as HTMLElement
    // Still exercised: the host must be hoverable at all (a `pointer-events:
    // none` regression would throw here).
    await userEvent.hover(marquee)
    const track = marquee.shadowRoot
      ? marquee.shadowRoot.querySelector('.aihu-logo-marquee-track')
      : marquee.querySelector('.aihu-logo-marquee-track')
    await expect(track).not.toBe(null)
    // The track animates by default...
    await expect(getComputedStyle(track as Element).animationPlayState).toBe('running')
    // ...and hovering is wired to pause it.
    await waitFor(async () => {
      const decls = hoverPauseDeclarations()
      await expect(decls.length).toBeGreaterThan(0)
      await expect(decls.every((d) => d === 'paused')).toBe(true)
    })
  },
}
