import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AgentReadinessConfig } from '@aihu-plugin/agent-readiness'

/**
 * The agent-discovery surface for the docs app.
 *
 * `apps/docs` serves these documents from its `_worker.js` at request time.
 * the docs app is `output: 'static'` with no server runtime, so the same
 * documents have to be emitted as real files at build time — otherwise Pages'
 * SPA fallback answers `/llms.txt` with `index.html` at HTTP 200, which is
 * worse than a 404 because agents cannot tell it apart from real content.
 *
 * `viteAgentReadinessIntegration` (wired in `vite.config.ts`) emits most of
 * them from this config via its `generateBundle` hook. The one it does not
 * model — the `/.well-known/agents.json` directory — is checked in under
 * `public/`.
 *
 * There is deliberately NO `/.well-known/webmcp`. Two checked-in files used to
 * serve one there, declaring `"spec": "webmcp/0.1"` and a `tools[]` array of
 * url/method/parameters. That was not WebMCP in any sense: the real API is
 * `document.modelContext.registerTool({ name, description, inputSchema,
 * execute })`, called from JavaScript at runtime, and the spec defines no
 * discovery endpoint at all — the W3C repo contains zero occurrences of
 * `well-known`. Tools exist only once JS has run and registered them, which is
 * why `docs/domain-hints/seo-and-agent-discoverability.md` §7.6 calls emitting
 * them statically a category error. Publishing an invented manifest under a
 * real spec's name is worse than publishing nothing, so it is gone. If aihu
 * ever exposes WebMCP tools it belongs in the runtime, not here.
 *
 * Every URL here is absolute against the production origin. the docs app already
 * declares `site.url` as https://aihu.dev (see `vite.config.ts`) and emits its
 * canonical link against it, so these documents are authored for the domain
 * this app is meant to serve, not for its .pages.dev staging host.
 */

const SITE = 'https://aihu.dev'

const summary =
  'A zero-dependency Web Components meta-framework. .aihu SFCs compile to vanilla custom elements ' +
  'with sub-2 kB reactive primitives. Every component is agent-discoverable and callable as an MCP tool.'

const pagesDir = join(dirname(fileURLToPath(import.meta.url)), 'src/pages')

/**
 * Route patterns, read off the file router's page directory.
 *
 * Hand-maintaining this list is how `apps/docs`' sitemap drifted from the site
 * it describes. The file tree IS the route table under `output: 'static'` —
 * every `.aihu` under `src/pages` prerenders to `<pattern>/index.html` — so
 * deriving from it means a new page cannot ship undiscoverable.
 */
function routePatterns(dir: string, prefix = ''): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (entry.isDirectory()) {
      out.push(...routePatterns(join(dir, entry.name), `${prefix}/${entry.name}`))
      continue
    }
    if (!entry.name.endsWith('.aihu')) continue
    const stem = entry.name.slice(0, -'.aihu'.length)
    out.push(stem === 'index' ? prefix || '/' : `${prefix}/${stem}`)
  }
  return out
}

/** Section landing pages rank above the leaf pages they index. */
function priorityFor(pattern: string): number {
  if (pattern === '/') return 1.0
  if (pattern.startsWith('/guides/')) return 0.9
  const depth = pattern.split('/').filter(Boolean).length
  return depth === 1 ? 0.8 : 0.6
}

const patterns = routePatterns(pagesDir)

export const agentReadinessConfig: AgentReadinessConfig = {
  name: 'aihu',
  version: '0.4',
  summary,
  siteUrl: SITE,
  endpoint: `${SITE}/.well-known/mcp/server-card.json`,

  // Matches the policy apps/docs serves today. Changing the crawl posture is a
  // separate decision from the cutover, so it is deliberately carried over.
  aiAgents: 'allow-all',

  // Both default OFF — their generators return 404 and the Vite plugin only
  // emits handlers that answer 200, so omitting these silently ships a site
  // with no A2A card and no MCP discovery document. Readiness graders probe
  // both by name, and apps/docs serves both today.
  a2aCard: true,
  mcpDiscovery: true,

  sitemap: `${SITE}/sitemap.xml`,
  sitemapPages: patterns.map((pattern) => ({
    url: `${SITE}${pattern === '/' ? '/' : pattern}`,
    changefreq: pattern === '/' ? ('weekly' as const) : ('monthly' as const),
    priority: priorityFor(pattern),
  })),

  // apps/docs' llms.txt points at `/#guides/...` fragments, which are inert to
  // any agent that does not run JS — the server never sees a fragment. These
  // are the docs app's real prerendered paths.
  llmsSections: [
    {
      title: 'Getting Started',
      links: [
        {
          title: 'Installation',
          url: `${SITE}/guides/installation`,
          description: 'Install aihu into a new or existing project',
        },
        {
          title: 'Getting Started',
          url: `${SITE}/guides/getting-started`,
          description: 'Your first .aihu component',
        },
      ],
    },
    {
      title: 'Core Concepts',
      links: [
        {
          title: 'Authoring Components',
          url: `${SITE}/guides/authoring-components`,
          description: 'SFC anatomy, @state, @template, @style blocks',
        },
        {
          title: 'Reactivity',
          url: `${SITE}/guides/reactivity`,
          description: 'Signals, computed values, and effects',
        },
        {
          title: 'Routing & Layouts',
          url: `${SITE}/guides/routing-layouts`,
          description: 'File-based routes, layouts, and nested routes',
        },
      ],
    },
    {
      title: 'Advanced',
      links: [
        {
          title: 'SSR & Hydration',
          url: `${SITE}/guides/ssr-hydration`,
          description: 'Static prerendering and island hydration',
        },
        {
          title: 'Agent Discovery',
          url: `${SITE}/guides/agent-discovery`,
          description: 'llms.txt, MCP server cards, and robots.txt',
        },
        {
          title: 'Deployment',
          url: `${SITE}/guides/deployment`,
          description: 'Cloudflare, Vercel, and Node.js adapters',
        },
      ],
    },
    {
      title: 'Reference',
      links: [
        {
          title: 'API Reference',
          url: `${SITE}/api`,
          description: 'Typed signatures for every export across all packages',
        },
        {
          title: 'Examples',
          url: `${SITE}/examples`,
          description: 'The governed example set, with a live playground',
        },
        {
          title: 'Cookbook',
          url: `${SITE}/cookbook`,
          description: 'Task-shaped recipes for common component patterns',
        },
      ],
    },
  ],

  llmsOptional: [{ title: 'Full docs (LLM-optimised)', url: `${SITE}/llms-full.txt` }],
}
