/**
 * Storybook stub for `config-provider` (Plan 6 wires the Storybook app).
 * Authored stub only — NOT a Storybook build.
 */
import { defineConfigProvider } from './index.ts'

export default {
  title: 'Primitives/ConfigProvider',
  tags: ['headless', 'phase-0'],
}

export const Default = {
  render: (): string => {
    defineConfigProvider()
    return `<aihu-config-provider color-scheme="dark" density="compact" dir="ltr">
  <p>descendants inject configContext to read app config reactively</p>
</aihu-config-provider>`
  },
}
