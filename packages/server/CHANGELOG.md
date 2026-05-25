# @aihu/server

## 0.1.4

### Patch Changes

- [#201](https://github.com/fellwork/aihu/pull/201) [`ec9f59b`](https://github.com/fellwork/aihu/commit/ec9f59b345116576b58f85298501d43d9ac33d61) Thanks [@srmcguirt](https://github.com/srmcguirt)! - isolate native loader behind `@aihu/server/native`; main entry is node:module-free for browser/edge/Deno portability; fixes the client-leak regression

  The Bug 4 fix set `platform: 'node'` on @aihu/server's main rolldown build, which made Rolldown hoist a static `import { createRequire } from "node:module"` into `dist/index.js`. A static `node:module` import does not tree-shake, so consumers bundling @aihu/server for the browser (transitively, alongside @aihu/app) leaked `createRequire` and threw a `TypeError` on bootstrap (the @aihu/app@0.1.8 regression).

  The native binary loader (`node:module` / `createRequire` / the napi `.node` load) now lives in a dedicated `@aihu/server/native` entry (`dist/native.js`), built with `platform: 'node'` so its `createRequire` still survives a downstream Rolldown re-bundle (Bug 4 stays fixed). The main entry imports it lazily via `import('./native.js')`, so `dist/index.js` builds `node:module`-free and is safe to bundle for browser / Cloudflare-Vercel edge / Deno. No public API changes — `renderToString` and all other exports keep the same surface and behavior.

## 0.1.3

### Patch Changes

- [#193](https://github.com/fellwork/aihu/pull/193) [`afead86`](https://github.com/fellwork/aihu/commit/afead86a982ca8df290f2970e3a16f5f003c0c03) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Set `platform: 'node'` in the server's `rolldown.config.ts` so the externalized
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

## 0.1.2

### Patch Changes

- [#172](https://github.com/fellwork/aihu/pull/172) [`ac63d4b`](https://github.com/fellwork/aihu/commit/ac63d4b9a2a5296de8a20b80049e2c5bbc493880) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Fix critical packaging bug: @aihu/server@0.1.1 shipped with optionalDependencies pinning native subpackages at 0.1.1, but those versions were never published (only 0.1.0 exists). This made @aihu/server unusable on every platform.

  Republishes all 6 server packages in lockstep at 0.1.2:

  - @aihu/server: 0.1.2 with native pinned at 0.1.2 (coherent)
  - @aihu/server-{darwin-arm64,darwin-x64,linux-x64-gnu,win32-x64-msvc}: 0.1.2 (first publish at this version)
  - @aihu/agent-readiness: 0.1.2 with @aihu/server@0.1.2 pin (was pinning broken 0.1.0)

  Reported by a downstream consumer. Bug surface includes the original workspace:\* leak in @aihu/server@0.1.0 (immutable; will be deprecated separately) and the broken transitive chain through @aihu/agent-readiness@0.1.1.
