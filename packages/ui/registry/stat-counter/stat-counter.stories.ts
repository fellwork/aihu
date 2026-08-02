/**
 * aihu-stat-counter recipe stories (performativeUI port, Slice 4). Mandated
 * set for a presentational recipe with no variant matrix and no interactive
 * capabilities: Default, DarkMode.
 *
 * Storybook's canvas iframe already has the component in the viewport at
 * render time, so `Default` demonstrates the count-up directly — there's no
 * practical way to author an "off-screen until scrolled" story here.
 *
 * NOT part of the registry payload — gen-registry excludes `*.stories.ts`.
 */
import '@storybook-recipes/aihu-stat-counter.aihu'

export default {
  title: 'UI/Stat-counter',
  tags: ['autodocs', 'recipe', 'phase-1'],
}

export const Default = {
  render: (): string =>
    `<aihu-stat-counter to="1204" duration="1200" label="Builders online" suffix="+"></aihu-stat-counter>`,
}

export const DarkMode = {
  render: (): string =>
    `<aihu-stat-counter to="1204" duration="1200" label="Builders online" suffix="+"></aihu-stat-counter>`,
  globals: { mode: 'dark' },
}

export const ReducedMotion = {
  render: (): string =>
    `<aihu-stat-counter to="1204" duration="1200" label="Builders online" suffix="+"></aihu-stat-counter>`,
  parameters: { chromatic: { prefersReducedMotion: 'reduce' } },
}
