import { createAgentReadinessRoutes } from '../../packages/agent-readiness/src/index.ts'
import {
  createRequestRouter,
  defineRoute,
  notFound,
  renderToString,
} from '../../packages/server/src/index.ts'
import { AboutPage } from './pages/about.ts'
import { HomePage } from './pages/home.ts'

const ar = createAgentReadinessRoutes({
  name: 'Aihu Demo',
  summary: 'A aihu-powered demo app.',
  endpoint: 'https://demo.aihu.dev/mcp',
  version: '0.0.0',
})

const headConfig = {
  title: 'Aihu',
  lang: 'en',
  meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
  links: [{ rel: 'stylesheet', href: '/style.css' }],
} as const

const CSS = 'body { font-family: sans-serif; margin: 2rem; }'

const router = createRequestRouter(
  {
    routes: [
      defineRoute('/', async (_req) => {
        const html = await renderToString(HomePage, { head: headConfig })
        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        })
      }),
      defineRoute('/about', async (_req) => {
        const html = await renderToString(AboutPage, { head: headConfig })
        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        })
      }),
      defineRoute('/style.css', (_req) => {
        return new Response(CSS, {
          status: 200,
          headers: { 'Content-Type': 'text/css; charset=utf-8' },
        })
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

console.log('Aihu demo running at http://localhost:3456/')
