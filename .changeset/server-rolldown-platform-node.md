---
"@aihu/server": patch
---

Set `platform: 'node'` in the server's `rolldown.config.ts` so the externalized
`require` is emitted as a real `import { createRequire } from "node:module";
var __require = createRequire(import.meta.url)` instead of the default
`typeof require` Proxy interop shim (Bug 4).

The Proxy shim evaluated `false` (collapsing to a no-op `Proxy`) whenever a
downstream bundler — e.g. Vite 8's Rolldown config loader — re-bundled a
transitive `@aihu/server` import into an ESM scope with no `require`. The native
loader's `createRequire(...)('@aihu/server-<platform>')` call then threw,
surfacing as `SCRIBE_NATIVE_LOAD_FAILED` and breaking
`viteAgentReadinessIntegration` (and any plugin that imports `@aihu/server`
transitively) inside `vite.config.ts`.

The `createRequire` import is a real static ESM external import that survives a
downstream re-bundle, so `@aihu/server` (and its transitive consumers) now build
and load cleanly when re-bundled by a non-node config loader.

Config-only — no source change, no export-surface change (still a single `.`
ESM entry). The dist bytes change (the require-interop preamble), hence this
patch bump.
