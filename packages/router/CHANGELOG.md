# @aihu/router

## 0.2.2

### Patch Changes

- Updated dependencies [3ba1ec3]
  - @aihu/server@0.2.1

## 0.2.1

### Patch Changes

- [#339](https://github.com/fellwork/aihu/pull/339) [`fb436ac`](https://github.com/fellwork/aihu/commit/fb436ac2a1ecb6f9d570ccc05beeeab666c3ad6d) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Full per-route metadata (`head`/`middleware`/`params`/`ssr`) now reaches
  `virtual:aihu-routes` in a normal SPA build. Previously only `name`+`layout`
  survived (via an `@route` source regex): the compiler compiles `.aihu` via
  stdin and writes no `.route.json` sidecar, and `genR` runs before pages are
  lazily transformed — so nested metadata like per-route `<head>` SEO tags were
  silently dropped unless the app was prerendered/SSG'd.

  - **@aihu/compiler** — new `--route-json` binary flag (prints the computed
    route sidecar to stdout) and a `compileRouteMeta(source, id)` export that
    wraps it (mirrors `compileToAst`).
  - **@aihu/router** — `genR` accepts a `compileRouteMeta` option and uses it to
    recover full `@route` metadata for `.aihu` pages (precedence: disk sidecar →
    `compileRouteMeta` → `name`+`layout` regex fallback when no compiler is
    wired, so standalone `viteRouterIntegration` still works).
  - **@aihu/app** — wires the compiler's `compileRouteMeta` into the router
    integration, so SPA apps get per-route `<head>` without prerendering.

## 0.2.0

### Minor Changes

- [#334](https://github.com/fellwork/aihu/pull/334) [`eaadd45`](https://github.com/fellwork/aihu/commit/eaadd459118055e422e4ae025ceaa72be39ee17c) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Runtime layout rendering + dynamic layout switching.

  A page's `@route { layout: "<name>" }` now actually renders that layout around
  the page at runtime. Previously the layout metadata was emitted by the compiler
  and scanned by the router, but nothing rendered the layout — pages mounted
  straight into the root outlet.

  These three packages MUST ship in lockstep — the compiler emits what the router
  generates and `@aihu/app` consumes:

  - **@aihu/compiler** — layout SFCs (under the layouts dir) compile in layout
    mode: registered under a valid `aihu-layout-<name>` custom-element tag, with a
    passive `data-aihu-outlet` marker instead of the reactive route-driven
    boundary (which the imperative client renderer would otherwise fight).
  - **@aihu/router** — `virtual:aihu-layouts` now yields runtime
    `{ tag, load }` entries (a dynamic-import loader + the registered tag) instead
    of bare path strings; new `layoutTagFor()` shares the tag convention with the
    compiler. `genR` also recovers `layout` directly from the `@route` block so it
    flows through a normal (sidecar-less) Vite build.
  - **@aihu/app** — `createApp()` reads the matched route's `layout`, loads it,
    and mounts the page into the layout's outlet marker (falling back to the root
    outlet when there is no layout). It now returns an `AppHandle` with
    `setLayout(name | null)` to switch the current route's layout without
    navigating (resets on navigation) — wireable to a UI toggle or an `@agent`
    action.

  Scope: a single layout per route, client-side rendering. Nested layouts and
  SSR/prerender layout parity are follow-ups.

  See `examples/layouts` for a working demo (layouts by navigation + a
  dynamic-switch toolbar).

## 0.1.8

### Patch Changes

- Updated dependencies [[`b85f400`](https://github.com/fellwork/aihu/commit/b85f4008c489a0dba9e36cbdfc48b635eeea375f)]:
  - @aihu/signals@0.2.0

## 0.1.7

### Patch Changes

- [#257](https://github.com/fellwork/aihu/pull/257) [`1bf3145`](https://github.com/fellwork/aihu/commit/1bf3145bd6c627537448bdd72af378933ab851f2) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Split the server-only `handle(req)` request handler out of `createRouter` into a new `@aihu/router/server` subpath export (`createServerRouter`). The `@aihu/router` root entry is now strictly browser-safe and contains zero `@aihu/server` imports.

  Previously `packages/router/src/router.ts` imported `renderToString` from the `@aihu/server` barrel solely to power `router.handle()`. That barrel's `renderToString` carries an `await import('./native.js')`, and the built `native.js` statically imports `node:module`. Because `@aihu/router` is browser-eligible (every SPA depends on it via `@aihu/app/client`), Vite/Rolldown chased the dynamic import during SPA builds and choked with `Module "node:module" has been externalized for browser compatibility`. SPA examples like `examples/blog-router` and `examples/css-engine-utility` failed to build.

  The fix mirrors the existing fence `@aihu/server/head-lowering` that `@aihu/app/client` uses: a clean subpath with zero `node:*` reach. The `Router` type no longer carries `handle`; SSR consumers should import `createServerRouter` from `@aihu/router/server`. Browser consumers (the vast majority — `createRouter`, `useRoute`, `navigate`, `<$link>`, `<$navigate>`, guards) are unaffected.

  Also adds a `bun run lint:node-leak` CI gate (`scripts/lint-node-bundle-leaks.ts`) that builds the browser-eligible examples and greps `dist/assets/*.js` for any surviving `from "node:` specifier. This catches future regressions where a server-only entry sneaks into a browser-reachable graph.

## 0.1.6

### Patch Changes

- [#218](https://github.com/fellwork/aihu/pull/218) [`41c5e35`](https://github.com/fellwork/aihu/commit/41c5e355a55ca91872ac66ffb7375d1dd20570cc) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Thread per-route `<head>` metadata from the compiler's `.route.json` sidecar
  through to `RouteDefinition` and the generated `virtual:aihu-routes` module
  (B2 of the SEO `<head>` arc).

  Adds and exports a new `RouteHead` type (`title`, `description`, `canonical`,
  `og`, `twitter`, `jsonld`) and an optional `head?: RouteHead` field on
  `RouteDefinition` and the build-time `RouteSidecar`. `head` is added to the
  `SK` sidecar-key allowlist so it survives into `virtual:aihu-routes` — without
  it the key would be silently dropped. Routes with no `head:` stay backward
  compatible (`head` is `undefined`).

  Type-only addition; the runtime/browser bundle size is unchanged. Downstream
  consumers (SSG prerender, client-nav head updater) import `RouteHead` from
  `@aihu/router`.

- Updated dependencies [[`f2005e2`](https://github.com/fellwork/aihu/commit/f2005e222bc720a8cbc69ed81cfafa0cab8d8ced), [`90d3174`](https://github.com/fellwork/aihu/commit/90d3174896ee03cf1756f5b92d125be45d13983f)]:
  - @aihu/server@0.2.0

## 0.1.5

### Patch Changes

- Updated dependencies [[`ec9f59b`](https://github.com/fellwork/aihu/commit/ec9f59b345116576b58f85298501d43d9ac33d61)]:
  - @aihu/server@0.1.4

## 0.1.4

### Patch Changes

- Updated dependencies [[`afead86`](https://github.com/fellwork/aihu/commit/afead86a982ca8df290f2970e3a16f5f003c0c03)]:
  - @aihu/server@0.1.3

## 0.1.3

### Patch Changes

- Updated dependencies [[`ac63d4b`](https://github.com/fellwork/aihu/commit/ac63d4b9a2a5296de8a20b80049e2c5bbc493880)]:
  - @aihu/server@0.1.2

## 0.1.2

### Patch Changes

- [#153](https://github.com/fellwork/aihu/pull/153) [`f2421b1`](https://github.com/fellwork/aihu/commit/f2421b17a534d518c4f21c22d7f5e47a45c030da) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Scaffold install path fixes.

  `@aihu/cli`:

  - `aihu app <name>` now emits `package.json` with `latest` ranges for all `@aihu/*` deps instead of the aspirational `^1.0.0` (no 1.x exists on npm; the old pins broke `bun install` immediately).
  - Adds the missing `@aihu/app` (used by `src/main.ts`) and `@aihu/compiler` (used by `rolldown.config.ts`) to the generated dependency list.
  - Drops the malformed `bun@1` `packageManager` fallback — detects bun via `globalThis.Bun?.version`, omits the field when no real version is detectable.
  - Generates `.vscode/extensions.json` (recommends `fellwork.vscode-aihu`) and `.vscode/settings.json` (file association for `.aihu`) so new adopters get language support out of the box.

  `@aihu/router`, `@aihu/app`:

  - Republish so transitive pins point at clean versions. Previously `@aihu/router@0.1.1` pinned `@aihu/server@0.1.0` (carries the `workspace:*` leak) and `@aihu/app@0.1.4` peer-pinned `@aihu/router@0.1.0` (also leaked). Combined effect: `bun install` of any scaffolded app failed at the workspace-protocol resolution step. Both republish with deps targeting the post-leak versions.
