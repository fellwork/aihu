---
"@aihu/router": patch
---

Split the server-only `handle(req)` request handler out of `createRouter` into a new `@aihu/router/server` subpath export (`createServerRouter`). The `@aihu/router` root entry is now strictly browser-safe and contains zero `@aihu/server` imports.

Previously `packages/router/src/router.ts` imported `renderToString` from the `@aihu/server` barrel solely to power `router.handle()`. That barrel's `renderToString` carries an `await import('./native.js')`, and the built `native.js` statically imports `node:module`. Because `@aihu/router` is browser-eligible (every SPA depends on it via `@aihu/app/client`), Vite/Rolldown chased the dynamic import during SPA builds and choked with `Module "node:module" has been externalized for browser compatibility`. SPA examples like `examples/blog-router` and `examples/css-engine-utility` failed to build.

The fix mirrors the existing fence `@aihu/server/head-lowering` that `@aihu/app/client` uses: a clean subpath with zero `node:*` reach. The `Router` type no longer carries `handle`; SSR consumers should import `createServerRouter` from `@aihu/router/server`. Browser consumers (the vast majority — `createRouter`, `useRoute`, `navigate`, `<$link>`, `<$navigate>`, guards) are unaffected.

Also adds a `bun run lint:node-leak` CI gate (`scripts/lint-node-bundle-leaks.ts`) that builds the browser-eligible examples and greps `dist/assets/*.js` for any surviving `from "node:` specifier. This catches future regressions where a server-only entry sneaks into a browser-reachable graph.
