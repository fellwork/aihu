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
    // Agent-readiness: emit the machine-readable agent surface — llms.txt,
    // llms-full.txt, robots.txt, and the MCP server card at
    // /.well-known/mcp/server-card.json (written to dist/ at build, served in
    // `vite dev`). Wired directly (rather than via viteAihuPlugin's
    // agentReadiness option) so it loads as an ESM import in vite.config.
    viteAgentReadinessIntegration({
      name: 'legacy-snapshot',
      summary: 'A reactive Web Components app built with aihu — agent-callable by default.',
      version: '0.1.0',
      // Canonical origin. Drives JSON-LD, MCP discovery, and the card's endpoint.
      // Replace 'https://example.com' with your deployed URL.
      siteUrl: 'https://example.com',
      // The MCP server card is a DISCOVERY document advertising the tools below.
      // Making the endpoint actually CALLABLE requires running @aihu/server (SSR)
      // at this URL; a static client build only publishes the card, not a live
      // tool endpoint.
      endpoint: 'https://example.com/.well-known/mcp/server-card.json',
      mcpDiscovery: true,
      // No hand-written skills list. The card's tools are DERIVED from the
      // compiler-populated @aihu/agent registry — the same source
      // @aihu/agent-server reads — so the MCP card can never drift from the
      // `$action` entries in src/pages/index.aihu (thesis §2, Derived). A static
      // client build has an empty registry at build time, so the card advertises
      // no tools until the app runs under @aihu/server (SSR), where the registry
      // is populated and the card reflects the live `$action` surface.
    }),
  ],
})
