/**
 * Plugin skeleton template file contents.
 * Used by `scribe plugin` to generate the plugin entry point.
 */

export function pluginIndexTs(name: string): string {
  return `import { definePlugin } from '@scribe/plugin'

export default definePlugin({
  name: '${name}',
  version: '0.1.0',
  namespace: '${name}',
  contributes: {},
})
`
}
