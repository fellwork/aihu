# @aihu/server

## 0.2.1

### Patch Changes

- [#351](https://github.com/fellwork/aihu/pull/351) [`5a94938`](https://github.com/fellwork/aihu/commit/5a949381544afd8276a0f6f5dba10cc4561b1d1a) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Fix SSR dropping text-leaf content. The pure-TS server renderer (the edge/workerd
  path used by `renderToString`/`renderToStream`) read a nonexistent `text` field
  on arbor leaves, so every text leaf serialized as an empty node while element
  tags and attributes rendered fine. Arbor text leaves carry their content in
  `value` (a static string or a `[read, write]` Signal tuple, per `@aihu/arbor`'s
  leaf shape). The renderer now reads `value`, HTML-escapes text content, and
  renders element leaves (`leafKind: 'element'`) as void/closed tags. The prior
  SSR tests asserted the same `text` fiction, so they passed while real
  `leaf('x')` rendered empty — fixtures are corrected to the real arbor shape with
  added coverage (text value, escaping, Signal-tuple value, element leaf).

  Note: `@aihu/server@0.2.1` carrying this fix is already on npm (published out of
  band to unblock a downstream SSR integration); this changeset reconciles main's
  source + version to that release (the publish step will skip the existing
  version).

## 0.2.0

### Minor Changes

- [#221](https://github.com/fellwork/aihu/pull/221) [`90d3174`](https://github.com/fellwork/aihu/commit/90d3174896ee03cf1756f5b92d125be45d13983f) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Add `routeHeadToSsrHead()` — a pure mapper that lowers a route's head metadata
  into the server's renderable `HeadConfig` (B3 of the per-route-`<head>` SEO
  arc). It maps `title` → `<title>`, `description` → `<meta name=description>`,
  `canonical` → `<link rel=canonical>` (resolved absolute against an optional
  `siteUrl`), `og.*` → `og:*` property meta (image/url resolved absolute),
  `twitter.*` → `twitter:*` name meta, and `jsonld` → a
  `<script type="application/ld+json">` block. Route fields override an optional
  `globalHead` per field, with `meta`/`links`/`scripts` arrays key-merged (route
  wins on conflicts); an `undefined` route head returns `globalHead` unchanged.
  The function is self-contained and side-effect free so the SSG-prerender and
  client-nav head Builders can both import it.

  To support the lowering, `HeadConfig` gains an optional `scripts` array (new
  `ScriptTag` type) and `buildHead()` now emits inline `<script>` elements
  (neutralizing any literal `</` in the body so injected JSON-LD cannot break out
  of the element). Both additions are backward compatible: omitting `scripts`
  reproduces the prior `buildHead`/`renderToString` output exactly. New exports:
  `routeHeadToSsrHead`, `RouteHead`, `RouteHeadLowerOptions`, `ScriptTag`.

### Patch Changes

- [#225](https://github.com/fellwork/aihu/pull/225) [`f2005e2`](https://github.com/fellwork/aihu/commit/f2005e222bc720a8cbc69ed81cfafa0cab8d8ced) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Update `document.head` on client-side SPA navigation to reflect each route's
  per-route `<head>` (B5, SEO arc). `createApp()` now lowers the active route's
  `head` (merged with optional global `app.head` defaults and resolved against
  `site.url`) and applies it to the live `document.head` — setting `<title>`,
  upserting `<meta>`/`<link rel=canonical>` by key, and injecting the JSON-LD
  `<script>`. Per-page tags are tracked and cleaned up on every navigation so
  stale title/canonical/OG/JSON-LD never accumulate; global defaults persist.

  The HeadConfig→tag application core is now shared (`head-apply.ts`) between the
  SSG prerender (string transform) and the client (live-DOM) paths so they can
  never diverge. To keep the browser client bundle `node:`-free, `@aihu/server`
  gains a pure `@aihu/server/head-lowering` subpath export for `routeHeadToSsrHead`
  (the barrel reaches the native loader and must not enter a browser bundle).

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
