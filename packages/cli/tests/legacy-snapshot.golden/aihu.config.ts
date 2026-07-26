import { defineConfig } from '@aihu/app'

/**
 * Project configuration. Consumed by `vite.config.ts` (via `viteAihuPlugin`)
 * and by the `aihu` CLI. Everything below is optional — delete what you do
 * not need.
 */
export default defineConfig({
  dir: { pages: 'src/pages' },

  // Injected into index.html's <head> at build time.
  app: {
    head: {
      title: 'legacy-snapshot',
    },
  },

  // ── Agent + SEO surface ─────────────────────────────────────────────────
  // Emits /llms.txt, /llms-full.txt, /robots.txt and JSON-LD at build time,
  // and serves them in `vite dev`. Set to `false` to turn the whole surface
  // off.
  //
  // The <legacy-snapshot-root> component's `$action` entries are its agent-callable
  // surface. NOTE: a static client build compiles them out (they are
  // server-only artifacts), so this config deliberately does NOT declare an
  // MCP `endpoint` — there is no process to serve one. Adding `endpoint`
  // here publishes a server card advertising tools that nothing answers for.
  // Run the app under @aihu/server (SSR) and set `endpoint` to the real MCP
  // URL to make the card meaningful.
  agentReadiness: {
    name: 'legacy-snapshot',
    summary: 'A reactive Web Components app built with aihu.',
    version: '0.1.0',
    // Replace with your deployed origin. Drives JSON-LD, robots' Sitemap:
    // line, and absolute URLs in the generated documents.
    siteUrl: 'https://example.com',
  },
})
