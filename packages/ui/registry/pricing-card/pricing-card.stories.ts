/**
 * aihu-pricing-card recipe stories (performativeUI port, Slice 5). Mandated
 * set for a presentational recipe with a variant matrix and no interactive
 * capabilities: Default, DarkMode, Variants.
 *
 * NOT part of the registry payload (gen-registry excludes `*.stories.ts`).
 */
import '@storybook-recipes/aihu-pricing-card.aihu'

export default {
  title: 'UI/Pricing-card',
  tags: ['autodocs', 'recipe', 'phase-1'],
}

const FEATURES = `
  <ul style="margin: 0; padding-left: 1.1rem;">
    <li>Unlimited projects</li>
    <li>Priority support</li>
    <li>Team seats</li>
  </ul>`

export const Default = {
  render: (): string =>
    `<aihu-pricing-card tier="Pro" price="$29" period="/mo">${FEATURES}</aihu-pricing-card>`,
}

export const DarkMode = {
  render: (): string =>
    `<aihu-pricing-card tier="Pro" price="$29" period="/mo">${FEATURES}</aihu-pricing-card>`,
  globals: { mode: 'dark' },
}

export const Variants = {
  render: (): string => `
    <div style="display: flex; gap: 1rem;">
      <aihu-pricing-card tier="Starter" price="$9" period="/mo">${FEATURES}</aihu-pricing-card>
      <aihu-pricing-card tier="Pro" price="$29" period="/mo" featured="on">${FEATURES}</aihu-pricing-card>
    </div>`,
}
