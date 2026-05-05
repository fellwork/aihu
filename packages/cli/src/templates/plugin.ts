/**
 * Plugin skeleton template file contents.
 * Used by `aihu plugin` to generate the plugin entry point.
 */

export function pluginIndexTs(name: string): string {
  return `import { definePlugin } from '@aihu/plugin'

export default definePlugin({
  name: '${name}',
  version: '0.1.0',
  namespace: '${name}',
  contributes: {},
})
`
}
