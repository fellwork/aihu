import { viteAihuPlugin } from '@aihu/app'
import { defineConfig } from 'vite'

export default defineConfig({
  // Vite/esbuild pre-bundles dependencies for dev. `@aihu/app`'s client entry
  // imports the `virtual:aihu-routes` / `virtual:aihu-layouts` modules that the
  // router plugin resolves at request time — esbuild's pre-bundle pass can't see
  // them, so it MUST be excluded or `vite dev` fails to start.
  optimizeDeps: { exclude: ['@aihu/app'] },
  plugins: [
    // This is the whole aihu configuration surface. It lives here rather than
    // in a separate aihu.config.ts on purpose: the `aihu` CLI and the language
    // server read it straight out of this file (via the plugin's own api
    // handle), so a second file would only be a place for the two to drift.
    viteAihuPlugin({
      dir: { pages: 'src/pages' },

      // Injected into index.html's <head> at build time.
      app: {
        head: {
          title: 'legacy-snapshot',
        },
      },

      // ── Agent + SEO surface ───────────────────────────────────────────
      // Emits /llms.txt, /llms-full.txt, /robots.txt and JSON-LD at build
      // time, and serves them in `vite dev`. Set to `false` to turn the
      // whole surface off.
      //
      // Honesty rule: this is a STATIC CLIENT build, whose @aihu/agent
      // registry is empty at build time. A client target compiles `$action`
      // entries out (they are server-only artifacts), so
      // <legacy-snapshot-root> publishes a declaration here, not callable tools.
      // This therefore declares NO MCP `endpoint` and no A2A card: a card at
      // the right path advertising zero tools is indistinguishable from a
      // real one to anything that reads it. The `full` template ships the
      // server that serves those cards from the LIVE registry, listing
      // exactly the callable tools. Run under @aihu/server (SSR) and set
      // `endpoint` to the real MCP URL to make them callable.
      agentReadiness: {
        name: 'legacy-snapshot',
        summary:
          'A reactive Web Components app built with aihu. Static build — component ' +
          'actions are declared in source; no live tool endpoint is served here.',
        version: '0.1.0',
        // Replace with your deployed origin. Drives JSON-LD, robots'
        // Sitemap: line, and absolute URLs in the generated documents.
        siteUrl: 'https://example.com',
      },
    }),
  ],
})
