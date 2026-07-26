import { viteAihuPlugin } from '@aihu/app'
import { viteAgentReadinessIntegration } from '@aihu-plugin/agent-readiness'
import { defineConfig } from 'vite'

export default defineConfig({
  // Vite/esbuild pre-bundles dependencies for dev. `@aihu/app`'s client entry
  // imports the `virtual:aihu-routes` / `virtual:aihu-layouts` modules that the
  // router plugin resolves at request time — esbuild's pre-bundle pass can't see
  // them, so it MUST be excluded or `vite dev` fails to start.
  optimizeDeps: { exclude: ['@aihu/app'] },
  plugins: [
    viteAihuPlugin({
      dir: { pages: 'src/pages' },
    }),
    // Agent-readiness: emit llms.txt, llms-full.txt and robots.txt (written to
    // dist/ at build, served in `vite dev`). Wired directly (rather than via
    // viteAihuPlugin's agentReadiness option) so it loads as an ESM import.
    //
    // Honesty rule: this is a STATIC CLIENT build, whose @aihu/agent registry
    // is empty at build time — so no MCP server card and no A2A card are
    // configured here. A card at the right path advertising zero tools is
    // indistinguishable from a real one to anything that reads it. The `full`
    // template ships the server that serves those cards from the LIVE registry;
    // its documents list exactly the callable tools.
    viteAgentReadinessIntegration({
      name: 'legacy-snapshot',
      summary:
        'A reactive Web Components app built with aihu. Static build — component ' +
        'actions are declared in source; no live tool endpoint is served here.',
      version: '0.1.0',
      // Canonical origin for JSON-LD. Replace with your deployed URL.
      siteUrl: 'https://example.com',
    }),
  ],
})
