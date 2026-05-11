/**
 * Hello World app template file contents.
 * Used by `aihu app` to generate the initial index.aihu page.
 */

export const APP_INDEX_SCRIBE = `@state {
  $prop name: string = 'world'
}

@template {
  <div>Hello {{ name }}</div>
}

@route {
  path: /
  name: home
}
`

export const APP_DEFAULT_LAYOUT_SCRIBE = `@template {
  <slot />
}
`

/**
 * Generate the server entry for a new aihu app.
 * Wires agent-readiness routes (llms.txt, MCP card, robots.txt) by default.
 */
export function appServerEntry(appName: string): string {
  return `import { createAgentReadinessRoutes } from '@aihu-plugin/agent-readiness'
import { createRequestRouter, defineRoute, defineRoutes, json } from '@aihu/server'

// Agent-readiness endpoints — configure further in aihu.config.ts under \`agent:\`
const ar = createAgentReadinessRoutes({ name: '${appName}' })

export const router = createRequestRouter({
  routes: [
    defineRoutes([
      { pattern: '/llms.txt', handler: ar.llmsTxt },
      { pattern: '/llms-full.txt', handler: ar.llmsFullTxt },
      { pattern: '/.well-known/mcp/server-card.json', handler: ar.mcpServerCard },
      { pattern: '/robots.txt', handler: ar.robotsTxt },
    ]),
    defineRoute('/', () => json({ app: '${appName}', status: 'ok' })),
  ],
})
`
}
