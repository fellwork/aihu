---
'@aihu/server': patch
---

isolate native loader behind `@aihu/server/native`; main entry is node:module-free for browser/edge/Deno portability; fixes the client-leak regression

The Bug 4 fix set `platform: 'node'` on @aihu/server's main rolldown build, which made Rolldown hoist a static `import { createRequire } from "node:module"` into `dist/index.js`. A static `node:module` import does not tree-shake, so consumers bundling @aihu/server for the browser (transitively, alongside @aihu/app) leaked `createRequire` and threw a `TypeError` on bootstrap (the @aihu/app@0.1.8 regression).

The native binary loader (`node:module` / `createRequire` / the napi `.node` load) now lives in a dedicated `@aihu/server/native` entry (`dist/native.js`), built with `platform: 'node'` so its `createRequire` still survives a downstream Rolldown re-bundle (Bug 4 stays fixed). The main entry imports it lazily via `import('./native.js')`, so `dist/index.js` builds `node:module`-free and is safe to bundle for browser / Cloudflare-Vercel edge / Deno. No public API changes — `renderToString` and all other exports keep the same surface and behavior.
