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
const LOGOS = Array.from(
  { length: 2 },
  () => `
    <span style="font-weight: 700; opacity: 0.6;">Acme</span>
    <span style="font-weight: 700; opacity: 0.6;">Globex</span>
    <span style="font-weight: 700; opacity: 0.6;">Initech</span>
    <span style="font-weight: 700; opacity: 0.6;">Umbrella</span>`,
).join('')

export const Default = {
  render: (): string => `<aihu-logo-marquee>${LOGOS}</aihu-logo-marquee>`,
}

export const DarkMode = {
  render: (): string => `<aihu-logo-marquee>${LOGOS}</aihu-logo-marquee>`,
  globals: { mode: 'dark' },
}

export const Hover = {
  render: (): string => `<aihu-logo-marquee>${LOGOS}</aihu-logo-marquee>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const marquee = canvasElement.querySelector('aihu-logo-marquee') as HTMLElement
    await userEvent.hover(marquee)
    const track = marquee.shadowRoot
      ? marquee.shadowRoot.querySelector('.aihu-logo-marquee-track')
      : marquee.querySelector('.aihu-logo-marquee-track')
    await waitFor(async () => {
      await expect(getComputedStyle(track as Element).animationPlayState).toBe('paused')
    })
  },
}
