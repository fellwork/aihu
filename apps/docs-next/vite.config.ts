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

  build: {
    // Keep `builtin:vite-dynamic-import-vars` away from compiled `.aihu` modules.
    //
    // That plugin re-parses, as plain JavaScript, modules in a graph containing
    // a dynamic import — and it engages on the module GRAPH, not merely the file
    // holding the token. The playground legitimately needs dynamic imports
    // (CodeMirror and the ~1 MB `typescript` stripper are lazy chunks, and the
    // compiler WASM is fetched from a runtime URL under public/), so the moment
    // <playground-embed> becomes reachable from the client entry the plugin
    // starts parsing `.aihu` modules too. Those are still TypeScript at that
    // point (`import type { Signal }`,
    // `let __aihu_setup__: ((ctx: any) => any) | undefined`), so rolldown dies
    // with a PARSE_ERROR and the affected routes never prerender — /playground
    // and /examples both went missing from dist exactly this way.
    //
    // Excluding `.aihu` is the narrow fix: those modules never contain a dynamic
    // import needing the plugin's rewrite, while real `.ts` modules that do are
    // still processed normally. The underlying framework bug — the plugin
    // treating compiled-`.aihu` ids as JS rather than TS — is worth fixing
    // upstream in @aihu/app; this unblocks the app either way.
    dynamicImportVarsOptions: {
      exclude: [/\.aihu$/],
    },
  },
})
