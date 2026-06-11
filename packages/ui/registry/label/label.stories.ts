/**
 * aihu-label recipe stories (Phase 2, spec §10.2 set for a non-interactive
 * presentational element: Default, DarkMode only).
 *
 * The recipe is a LIGHT-DOM presentational element: `<aihu-label>` wraps a
 * native <label> (no $extends) and forwards its `for` association via the
 * `html-for` attribute (kebab of the `htmlFor` prop — `for` is a reserved
 * word and cannot be a prop identifier). NOT part of the registry payload
 * (gen-registry excludes stories).
 */
import '@storybook-recipes/aihu-label.aihu'

export default {
  title: 'UI/Label',
  tags: ['autodocs', 'recipe', 'phase-2'],
}

export const Default = {
  render: (): string => `<aihu-label html-for="email">Email address</aihu-label>`,
  parameters: { chromatic: { viewports: [1280, 375] } },
}

export const DarkMode = {
  render: (): string => `<aihu-label html-for="email">Email address</aihu-label>`,
  globals: { mode: 'dark' },
}
