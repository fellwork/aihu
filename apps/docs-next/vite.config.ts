import { viteAihuPlugin } from '@aihu/app'
import { viteAgentReadinessIntegration } from '@aihu-plugin/agent-readiness'
import { defineConfig } from 'vite'
import { agentReadinessConfig } from './agent-readiness.config.ts'
import aihuConfig from './aihu.config.ts'

// The SSG build is driven entirely by `aihu.config.ts` (output: 'static').
// viteAihuPlugin wires the Rust compiler, the file-router integration, per-route
// <head> injection, and the prerender closeBundle pass.
//
// viteAgentReadinessIntegration emits the agent-discovery documents (llms.txt,
// llms-full.txt, robots.txt, sitemap.xml, and the MCP/A2A cards) as real static
// assets. Without it Pages' SPA fallback answers those paths with index.html at
// HTTP 200 — see `agent-readiness.config.ts`.
export default defineConfig({
  plugins: [viteAihuPlugin(aihuConfig), viteAgentReadinessIntegration(agentReadinessConfig)],
})
