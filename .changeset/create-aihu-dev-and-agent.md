---
"@aihu/cli": minor
---

create-aihu: fix `bun run dev` + ship the agent surface out of the box

- **`bun run dev` no longer crashes.** The generated `vite.config.ts` now sets
  `optimizeDeps: { exclude: ['@aihu/app'] }` — esbuild's dep pre-bundle can't
  resolve the `virtual:aihu-routes` / `virtual:aihu-layouts` modules that
  `@aihu/app`'s client entry imports (the router plugin resolves them at request
  time), so excluding `@aihu/app` from pre-bundling is required for dev to boot.
- **The default scaffold now delivers the agentic surface.** `vite.config.ts`
  wires `viteAgentReadinessIntegration` (imported directly from
  `@aihu-plugin/agent-readiness`, now a scaffolded devDependency), so
  `vite build` emits `llms.txt`, `llms-full.txt`, `robots.txt`, the MCP server
  card at `/.well-known/mcp/server-card.json`, and JSON-LD — all served in
  `vite dev` too. The hello-world page is now an agent-callable component: its
  counter exposes `increment` / `reset` as `$action` tools, mirrored into the
  card's `skills`. (A live, callable MCP endpoint still requires running
  `@aihu/server`; the static card is discovery metadata — noted in the config.)
