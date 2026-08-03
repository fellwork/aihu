/**
 * aihu-mock-ide recipe stories (performativeUI port, Slice 5). Mandated set
 * for a presentational recipe with no variant matrix and no interactive
 * capabilities: Default, DarkMode.
 *
 * NOT part of the registry payload (gen-registry excludes `*.stories.ts`).
 */
import '@storybook-recipes/aihu-mock-ide.aihu'

export default {
  title: 'UI/Mock-ide',
  tags: ['autodocs', 'recipe', 'phase-1'],
}

const CODE = `<pre style="margin:0;"><code>function greet(name) {
  return \`Hello, \${name}!\`
}</code></pre>`

export const Default = {
  render: (): string => `<aihu-mock-ide title="greet.js">${CODE}</aihu-mock-ide>`,
}

export const DarkMode = {
  render: (): string => `<aihu-mock-ide title="greet.js">${CODE}</aihu-mock-ide>`,
  globals: { mode: 'dark' },
}
