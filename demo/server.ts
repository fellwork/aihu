import { createRouter, defineRoute, renderToString, json, notFound } from '../packages/server/src/index.ts'
import { createAgentReadinessRoutes } from '../packages/agent-readiness/src/index.ts'
import { HomePage } from './pages/home.ts'
import { AboutPage } from './pages/about.ts'

const ar = createAgentReadinessRoutes({
  name: 'Scribe Demo',
  summary: 'A scribe-powered demo app.',
  endpoint: 'https://demo.scribe.dev/mcp',
  version: '0.0.0',
})

const headConfig = {
  title: 'Scribe',
  lang: 'en',
  meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
  links: [{ rel: 'stylesheet', href: '/style.css' }],
} as const

const CSS = 'body { font-family: sans-serif; margin: 2rem; }'

const router = createRouter(
  {
    routes: [
      defineRoute('/', async (_req) => {
        const html = await renderToString(HomePage, { head: headConfig })
        return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
      }),
      defineRoute('/about', async (_req) => {
        const html = await renderToString(AboutPage, { head: headConfig })
        return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
      }),
      defineRoute('/style.css', (_req) => {
        return new Response(CSS, { status: 200, headers: { 'Content-Type': 'text/css; charset=utf-8' } })
      }),
      defineRoute('/llms.txt', ar.llmsTxt),
      defineRoute('/llms-full.txt', ar.llmsFullTxt),
      defineRoute('/.well-known/mcp/server-card.json', ar.mcpServerCard),
      defineRoute('/robots.txt', ar.robotsTxt),
    ],
  },
  { notFound: (_req) => notFound() },
)

export default Bun.serve({
  fetch: router,
  port: 3456,
})

console.log('Scribe demo running at http://localhost:3456/')
