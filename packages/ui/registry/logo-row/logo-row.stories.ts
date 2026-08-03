/**
 * aihu-logo-row recipe stories (performativeUI port, Slice 2). Mandated set
 * for a presentational recipe with `hoverable: true` and no variants:
 * Default, DarkMode, Hover.
 *
 * NOT part of the registry payload — gen-registry excludes `*.stories.ts`.
 */
import { userEvent } from 'storybook/test'
import '@storybook-recipes/aihu-logo-row.aihu'

export default {
  title: 'UI/Logo-row',
  tags: ['autodocs', 'recipe', 'phase-1'],
}

const LOGO_SVG = (label: string): string =>
  `<svg width="72" height="24" viewBox="0 0 72 24" role="img" aria-label="${label}">
    <rect width="72" height="24" rx="4" fill="currentColor" />
  </svg>`

export const Default = {
  render: (): string => `
    <aihu-logo-row>
      ${LOGO_SVG('Acme')}
      ${LOGO_SVG('Globex')}
      ${LOGO_SVG('Initech')}
    </aihu-logo-row>`,
}

export const Hover = {
  render: (): string => `
    <aihu-logo-row>
      ${LOGO_SVG('Acme')}
      ${LOGO_SVG('Globex')}
    </aihu-logo-row>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const svg = canvasElement.querySelector('svg')
    if (svg) await userEvent.hover(svg)
  },
}

export const DarkMode = {
  render: (): string => `
    <aihu-logo-row>
      ${LOGO_SVG('Acme')}
      ${LOGO_SVG('Globex')}
      ${LOGO_SVG('Initech')}
    </aihu-logo-row>`,
  globals: { mode: 'dark' },
}
