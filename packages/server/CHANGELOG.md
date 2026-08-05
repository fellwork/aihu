# @aihu/server

## 0.5.0

### Minor Changes

- [#762](https://github.com/fellwork/aihu/pull/762) [`ac9c045`](https://github.com/fellwork/aihu/commit/ac9c04599b2fbf57c9f39a39e1c9db7fe1388028) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Adopt the server-rendered DOM on first render instead of rebuilding it.

  Prerendering used to buy first paint and crawlability but zero client work: the
  client discarded the entire server-rendered subtree and rebuilt it. Measured on
  apps/docs by tagging every prerendered node before hydration and counting
  survivors — **0 of 393**. It is now **320 of 393**, with no duplication (total
  node count identical to a pure client render) and Lighthouse unchanged at
  perf 100 / LCP 1480ms.

  **BREAKING (`@aihu/runtime`):** `DefineOptions.hydrate` is removed. It gated a
  hydration branch in `define-element.ts` that nothing in production ever set —
  the compiler never emitted it — and that branch bypassed `defineComponent`'s
  connect path entirely, so `onMount` never ran under hydration. Rather than
  enable a lifecycle-skipping bypass, the fork is deleted: `defineComponent`'s
  `connectedCallback` is now the single connect path and chooses its renderer
  (`_adoptSsrTemplate` vs `_mount`). Everything downstream — `onMount`, slot
  projection, scope registration, teardown — is byte-identical, so the lifecycle
  cannot drift again.

  The adoptable boundary is server-declared, not client-guessed:
  `renderToString({ wrapTag, hydratable })` stamps `data-aihu-ssr` on the host it
  wraps, meaning "these children are this host's own rendered template". That
  resolves an ambiguity `data-aihu-path` could not — slotted content from a
  parent's server render carries paths too, but its receiving host is never
  marked.

  Three latent bugs surfaced only once adoption ran, and are fixed here: arbor's
  `hydrate()` pathMap collided across nested wrapped renders (the page overwrote
  the layout's root key); `hydrate()` never assigned `branch.el`, silently
  no-op'ing `class:`/`html={}` effects on adopted trees; and the compiler wrapped
  enhanced `<a>` multi-children in a fragment the server never renders,
  duplicating every prerendered link's children.

  Remaining ceiling: structural `each`/`if` segments still use arbor's
  adopt-by-replace, which is why 73 nodes do not survive.

## 0.4.1

### Patch Changes

- Updated dependencies [[`ad6921a`](https://github.com/fellwork/aihu/commit/ad6921a018ef4a479f6540278e549aa9a8cab387)]:
  - @aihu/signals@0.5.0

## 0.4.0

### Minor Changes

- [#514](https://github.com/fellwork/aihu/pull/514) [`061eefb`](https://github.com/fellwork/aihu/commit/061eefb3e94fdbbe9e6f5d5301db3bcdd3fa3b22) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Compile-time SSR string-template emit target (wave-3 keystone).

  - `--target server` artifacts now additionally export `__ssrString(props,
{ hydratable })` — a compiled string renderer of straight-line
    concatenation with interpolated dynamic holes and static-subtree constant
    folding (Svelte/Solid-SSR style), byte-identical to the tree-walk renderer
    including the full hydration wire grammar (`data-aihu-path`,
    `<!--aihu:s:PATH-->` structural markers, `<!--|-->` text-leaf boundaries).
    Templates using constructs outside the lowerable set (suspense/shield/
    guard/warp/focusTrap/router-macro elements, duplicate attr keys) simply
    ship without the export and keep the walker.
  - New `@aihu/runtime/ssr` subpath entry with the SSR string helpers
    (`__aihu_stext`, `__aihu_sattr`, …) mirroring the walker's escaping —
    server-only bytes on their own entry, so the client bundle size gate is
    untouched.
  - `@aihu/server` renderToString/renderToStream take the string fast path when
    the component carries a compiled renderer (`AIHU_SSR_STRING=0` opts out);
    new `attachSsrString` carries the renderer across props-binding wrappers
    (used by the router's governed path).
  - SSR walker fix: reactive attribute tuples/thunks now serialize their
    CURRENT VALUE (previously the getter's function source was printed into the
    attribute) and function-valued attrs (event handlers) never serialize.
  - Compiler fixes surfaced by the differential gate: `show`/`class:`/`ref`/
    `html` effect IIFEs guard their `onMount` registration (host-less SSR and
    loop-item factories previously crashed with SCR-R0010 'no owner'), and an
    `each`+`empty` chain now emits the `createIfBoundary` helper it references.

### Patch Changes

- [#519](https://github.com/fellwork/aihu/pull/519) [`2ef2830`](https://github.com/fellwork/aihu/commit/2ef2830aa737906d09a5d870176da34a22f20b99) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Rename the remaining legacy `SCRIBE_*` environment variables and markers to the
  `AIHU_*` family (following `SCRIBE_VERSION` → `AIHU_VERSION` in [#516](https://github.com/fellwork/aihu/issues/516)). No
  deprecated aliases — aihu has no external consumers.

  - `SCRIBE_NATIVE_SKIP` → `AIHU_NATIVE_SKIP` (documented SSR native-loader escape
    hatch), plus the internal `SCRIBE_NATIVE_MISSING` / `SCRIBE_NATIVE_LOAD_FAILED`
    diagnostic codes → `AIHU_NATIVE_MISSING` / `AIHU_NATIVE_LOAD_FAILED`.
  - `SCRIBE_COMPILE_BIN` → `AIHU_COMPILE_BIN`, **consolidated with** the existing
    `AIHU_COMPILE_BIN` drive-test override into a single variable. The sidecar
    `resolveBinPath()` / `resolveSpawnBinPath()` resolution and the drive/differential
    tests now both read one `AIHU_COMPILE_BIN`.
  - `SCRIBE_STATIC_ISLAND` audit marker → `AIHU_STATIC_ISLAND`.

- [#515](https://github.com/fellwork/aihu/pull/515) [`8924c51`](https://github.com/fellwork/aihu/commit/8924c51da6e6c25fb2664a7ab6fe9c628895161d) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Retire the `$server` macro and its `createServerCall` client RPC bridge.

  The feature was half-wired and effectively broken: the compiler recognized
  `$server` only as a substring and, on a `--target client` build, emitted a
  `// [client build] $server macro reference elided` comment while leaving the
  `$server.*` reference untouched in the output — no server artifact and no
  `createServerCall` stub were ever generated, so any reference resolved to an
  undefined identifier. The whole surface is removed rather than finished:

  - `@aihu/server`: delete `createServerCall` (`src/client.ts`) and its barrel
    re-export.
  - `@aihu/compiler`: drop the `$server` client-build elision branch from
    `codegen/emit.rs`. A stray `$server` is no longer special-cased — it passes
    through as an ordinary (undefined) identifier and surfaces as a normal
    type-check / runtime error, instead of a misleading "elided" comment.
  - `@aihu/language-server`: remove the `$server` hover entry.
  - Spec: Macro Vocabulary §2.12 marked **RETIRED** (no drop-in replacement).

  Platform binary packages bumped 0.1.24 → 0.1.25 (Rust source changed).

- [#527](https://github.com/fellwork/aihu/pull/527) [`27a3268`](https://github.com/fellwork/aihu/commit/27a326826ee9a4d0a9b46bf50ca31686543848fe) Thanks [@srmcguirt](https://github.com/srmcguirt)! - fix(server): dispose setup-created effects per SSR render (effect-scope plan §3)

  SSR runs a component's full setup body by calling the `component()` factory —
  bypassing `defineComponent`'s component scope — so any `effect()`/`computed()`
  created there (directly or via a composable) leaked per request. Both factory
  seams now wrap the call in a per-render detached `effectScope`:

  - `renderToStream` (TS path): the scope stays alive through the async walk and
    suspended boundaries, and is stopped exactly once on every terminal path —
    walk done, last-boundary close, sync factory throw, walk/boundary errors,
    and the consumer's `cancel()` (client disconnect / streaming timeout with a
    boundary still pending).
  - `renderToStringNative`: scope wraps the factory; serialization, the state
    script's signal reads, and the dialect-guard TS fallback all complete before
    the finally-phase `stop()`. A throwing user disposer is reported via
    `console.error`, never masking an in-flight render error.

  Rendered bytes are unchanged — the wrap affects lifecycle only. `@aihu/signals`
  is a new dependency and is external in both build entries (a bundled private
  copy would split the `_currentScope` module-global and silently break scope
  adoption). The compiled ssr-string fast path never calls setup and needs no
  wrap.

- Updated dependencies [[`18e5f6d`](https://github.com/fellwork/aihu/commit/18e5f6dda93772877690e88e8c217dcdcf4bddc2), [`ea8d2eb`](https://github.com/fellwork/aihu/commit/ea8d2ebb91c28132f399a708e2bd88877072d1db)]:
  - @aihu/signals@0.4.0

## 0.3.0

### Minor Changes

- [#463](https://github.com/fellwork/aihu/pull/463) [`bc0f289`](https://github.com/fellwork/aihu/commit/bc0f289ee38871cda8002e56fba3e3b8b7e34d84) Thanks [@srmcguirt](https://github.com/srmcguirt)! - GX Phase 3 ([#437](https://github.com/fellwork/aihu/issues/437)-GX) — derive robots.txt, noindex, and discovery output from
  the compiled `extract.read` axis.

  - `@aihu/server`: new `deriveReadPolicy` / `extractReadValue` /
    `isCallAdvertised` — the one read-axis derivation table (crawl access per
    bot tier, robots advertisability, noindex, discovery membership), fail-closed
    on malformed values. `AgentReadinessConfig` gains `routes` (the compiled
    route table conduit).
  - `@aihu-plugin/agent-readiness`: `generateRobotsTxt` accepts `routes` and
    derives per-path directives per route `read:` value over the tiered bot
    registry (`'all'` → all tiers; `'agents'` → the [#430](https://github.com/fellwork/aihu/issues/430) tiered default, now
    derived per route; `'search'` → searchers only; `'none'` → all crawlers
    disallowed; hard values → not advertised at all). llms.txt gains a derived
    `## Routes` section and filters its components section by the declared
    policy; MCP server-card tools are filtered by read + call advertisability.
    With no routes declared, robots.txt is byte-identical to the shipped [#430](https://github.com/fellwork/aihu/issues/430)
    default.
  - `@aihu/router`: `RouteDefinition`/`RouteSidecar` carry the compiled
    `extract` member; `createServerRouter.handle` sends `X-Robots-Tag: noindex`
    for `read:'none'`/hard/malformed routes.
  - `@aihu/compiler`: `RouteMeta` types the `extract` member the binary already
    emits (type-only).

  All of this is compliance-tier: advisory signals honored by compliant,
  self-identifying crawlers. Hard-tier enforcement (SSR withholding, the
  bundle/data boundary) is Phase 4 and is not part of this change.

### Patch Changes

- Updated dependencies [[`30ed2b5`](https://github.com/fellwork/aihu/commit/30ed2b51c215512f840b113afaa1636378e31407), [`889830d`](https://github.com/fellwork/aihu/commit/889830d907e83b7d74dc8e64503d8bb4b4711812), [`549448c`](https://github.com/fellwork/aihu/commit/549448cd042ba89b94ddb291be741f015c3d0d9c), [`e01f19d`](https://github.com/fellwork/aihu/commit/e01f19d70eabe867b8b8c310a6928b9576461cf0)]:
  - @aihu/agent@0.2.0
  - @aihu/agent-service@0.3.0

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
