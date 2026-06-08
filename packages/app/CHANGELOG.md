# @aihu/app

## 2.0.3

### Patch Changes

- [#342](https://github.com/fellwork/aihu/pull/342) [`a96c49b`](https://github.com/fellwork/aihu/commit/a96c49b27b42d8271664e4f1c0907cbd27e70dbe) Thanks [@srmcguirt](https://github.com/srmcguirt)! - SSG/prerender layout parity (composition). When a static route declares a
  `layout` and that layout module exposes an SSR-renderable `default`, the
  prerender now renders the layout shell and injects the page content into its
  `data-aihu-outlet` marker — so prerendered HTML matches the client's layout
  wrapping. Layouts that aren't server-renderable (compiled SFCs, which register a
  side-effect custom element with no `default`) are unchanged: the page ships the
  SPA shell and the layout is applied client-side on hydration. A layout that
  renders no `<$outlet>` marker warns and ships the page unwrapped.

## 2.0.2

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

- Updated dependencies [[`fb436ac`](https://github.com/fellwork/aihu/commit/fb436ac2a1ecb6f9d570ccc05beeeab666c3ad6d)]:
  - @aihu/router@0.2.1

## 2.0.1

### Patch Changes

- [#336](https://github.com/fellwork/aihu/pull/336) [`0ab1988`](https://github.com/fellwork/aihu/commit/0ab1988b5f546f2050fa3eaea1b0ac1a26a32f96) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Fix SPA link interception for `<a>` nested inside a shadow root. A click inside
  a shadow-DOM layout/page (the default shadow mode) is retargeted at the host, so
  `e.target.closest('a')` missed the real anchor and the click fell through to a
  full page reload. The handler now resolves the anchor via `composedPath()`, so
  client-side navigation works inside shadow-DOM layouts — `shadowMode: 'none'` is
  no longer required just to make in-layout nav links work.

## 2.0.0

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

### Patch Changes

- Updated dependencies [[`eaadd45`](https://github.com/fellwork/aihu/commit/eaadd459118055e422e4ae025ceaa72be39ee17c)]:
  - @aihu/router@0.2.0

## 1.0.0

### Patch Changes

- Updated dependencies [[`b85f400`](https://github.com/fellwork/aihu/commit/b85f4008c489a0dba9e36cbdfc48b635eeea375f), [`7ec7155`](https://github.com/fellwork/aihu/commit/7ec71553722eaa4e3f6814e79ec747db68b72451), [`24dee56`](https://github.com/fellwork/aihu/commit/24dee56964e5afdac11c858cca0da2b3ec2483c9), [`1132357`](https://github.com/fellwork/aihu/commit/113235708bac1e8f9263d35feb865af8f8127f86)]:
  - @aihu/signals@0.2.0
  - @aihu/runtime@1.0.0
  - @aihu/arbor@1.0.0
  - @aihu/router@0.1.8

## 0.3.2

### Patch Changes

- [#276](https://github.com/fellwork/aihu/pull/276) [`22234fa`](https://github.com/fellwork/aihu/commit/22234fa1d34e913d84bcdbcc9c2bcf1fb315186b) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Scaffold `@aihu/css-engine` out of the box, with a shadow-mode choice.

  `aihu app <name>` gains two flags on the legacy scaffold path:

  - `--css <engine|none>` (with `--css-engine` as a boolean alias for
    `--css engine`) — includes `@aihu/css-engine` in `dependencies` and emits a
    utility-class starter page (`flex gap-4 max-w-7xl mx-auto p-8`, `text-3xl
font-bold`, …) instead of the hand-written `@style` starter.
  - `--shadow <open|closed|none>` — the shadow mode threaded into the compiler
    when css-engine is on (default `open`). `--shadow` without `--css engine`
    warns and is ignored.

  The `create-aihu` interactive wizard asks the same two questions. The default
  css-engine mode is `open` (scoped shadow fold), which is the compiler default —
  so the default css-engine scaffold writes **no** `css` block; only
  `closed`/`none` emit an explicit `css: { shadowMode }`. The plain (no-flag)
  scaffold output is unchanged.

  `@aihu/app` patch: corrected the `CssConfig` JSDoc — `@aihu/css-engine` is
  scoped by design and works in any shadow mode (its utilities fold into each
  component's shadow style); `shadowMode: 'none'` is only needed for
  global-cascade frameworks (Tailwind/UnoCSS/Pico) or to style light-DOM /
  external (slotted) children. (Wording only; no type or validation change.)

## 0.3.1

### Patch Changes

- Updated dependencies [[`2aecb07`](https://github.com/fellwork/aihu/commit/2aecb071623d989e7dc331c5e487eb6bdf756c2e)]:
  - @aihu/runtime@0.1.8

## 0.3.0

### Minor Changes

- [#253](https://github.com/fellwork/aihu/pull/253) [`d42793b`](https://github.com/fellwork/aihu/commit/d42793b8258d723ae7c80179dcc82e2db8d0afc4) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Forward `shadowMode` through `viteAihuPlugin` for utility-class CSS frameworks.

  - **`@aihu/app`** — new `css.shadowMode` option on `AihuConfig`. When set, it
    forwards to the compiler's per-plugin `shadowMode` injection
    (`'open' | 'closed' | 'none'`). Required for consumers of
    `@aihu/css-engine` (and other cascade-dependent CSS frameworks) so the
    utility classes the compiler folds in are not trapped inside a shadow root.
    Default behaviour is unchanged.
  - **`@aihu/compiler`** — `_maybeCompileUtilityCss` now emits a one-shot
    `console.warn` when `@aihu/css-engine` resolves but `compileSfc()` throws
    (typically: the native `aihu-css-core` binary is unresolvable). Build is
    still non-fatal; previously this case was completely silent and users
    could not discover why their utility classes never emitted.
  - **`@aihu/css-engine`** — README now documents the canonical
    `viteAihuPlugin({ css: { shadowMode: 'none' } })` wiring and points to the
    new `examples/css-engine-utility/` end-to-end example.

### Patch Changes

- Updated dependencies [[`84352bc`](https://github.com/fellwork/aihu/commit/84352bcb901b7213d67727648545b41652b2092a), [`1bf3145`](https://github.com/fellwork/aihu/commit/1bf3145bd6c627537448bdd72af378933ab851f2)]:
  - @aihu/arbor@0.1.5
  - @aihu/runtime@0.1.7
  - @aihu/router@0.1.7

## 0.2.0

### Minor Changes

- [#224](https://github.com/fellwork/aihu/pull/224) [`e1a6cfc`](https://github.com/fellwork/aihu/commit/e1a6cfcc9e50688592d580cd515b60c8faa50839) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Add a build-time **static / SSG output mode** (`output: 'static'`) that
  prerenders every route to content-ful HTML (B4 of the SEO arc).

  The default `output: 'spa'` ships an empty shell — crawlers and non-JS agents
  see no content. `output: 'static'` now prerenders each route at build time:
  the route's real module is loaded by file path (via a short-lived Vite SSR
  loader, so `.aihu`/TS compile exactly like the dev pipeline), rendered to
  content HTML with `@aihu/server`'s `renderToString`, and its per-route
  `<head>` (from the compiler's `.route.json` sidecar) is folded in via
  `routeHeadToSsrHead` — resolving relative `canonical`/`og:*`/`twitter:*` URLs
  to absolute against the new `site.url`, and emitting JSON-LD. The built
  `index.html` is used as the template so each emitted `<pattern>/index.html`
  keeps the client bundle `<script>` tags and hydrates into the live SPA
  (progressive enhancement). Ideal for content sites on static hosts (e.g.
  Cloudflare Pages).

  - `OutputMode` gains `'static'`; `defineConfig()` accepts it.
  - New `AihuConfig.site.url` (the absolute base URL) feeds absolute
    canonical/OG/Twitter resolution.
  - Dynamic routes (`:param` / `[param]`) are prerendered when their module
    exports `getStaticPaths()` (one HTML per returned path); without it the
    route is skipped with a clear build warning.
  - `output: 'spa'` behavior is unchanged. The SSG code is build-time only — no
    `.size-limit.json` row and no client-bundle impact.

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

- [#216](https://github.com/fellwork/aihu/pull/216) [`0628885`](https://github.com/fellwork/aihu/commit/0628885ae3948bf6432a44102f92a00ce60f040b) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Inject `app.head` into the built `index.html`. `AihuConfig.app.head`
  (`title`, `charset`, `viewport`, `meta[]`) was accepted by `defineConfig()`
  but never read by any plugin, so the configured global head was silently
  dropped from SPA/static output — bad for SEO and non-JS agents.

  `viteAihuPlugin()` now registers an `aihu-head` plugin whose
  `transformIndexHtml` hook applies the configured head. Precedence is
  **config overrides source**: when the source `index.html` already declares a
  tag that `app.head` also configures (title, charset, viewport, or a meta with
  a matching `name`/`property`), the configured value replaces the source value
  in place — no duplicate `<title>`/charset/meta is emitted. Tags present only
  in config are injected before `</head>`. Values are HTML-escaped.

- Updated dependencies [[`f2005e2`](https://github.com/fellwork/aihu/commit/f2005e222bc720a8cbc69ed81cfafa0cab8d8ced), [`41c5e35`](https://github.com/fellwork/aihu/commit/41c5e355a55ca91872ac66ffb7375d1dd20570cc), [`a4b62f2`](https://github.com/fellwork/aihu/commit/a4b62f2229f43cdb30d117a5d33cb1702153446b), [`90d3174`](https://github.com/fellwork/aihu/commit/90d3174896ee03cf1756f5b92d125be45d13983f)]:
  - @aihu/server@0.2.0
  - @aihu/router@0.1.6
  - @aihu/runtime@0.1.6

## 0.1.9

### Patch Changes

- Updated dependencies []:
  - @aihu/router@0.1.5

## 0.1.8

### Patch Changes

- Updated dependencies [[`faca280`](https://github.com/fellwork/aihu/commit/faca2804cf62c05ffc90ef867faa2058b5e267ad)]:
  - @aihu/runtime@0.1.5
  - @aihu/router@0.1.4

## 0.1.7

### Patch Changes

- Updated dependencies []:
  - @aihu/router@0.1.3

## 0.1.6

### Patch Changes

- [#155](https://github.com/fellwork/aihu/pull/155) [`2aedc11`](https://github.com/fellwork/aihu/commit/2aedc113385896a0c9deefd6bd9e17d0f71fff4b) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Republish so peerDependencies pin `@aihu/router@0.1.2` (clean) instead of the
  stale `0.1.1` that the previous build emitted. Root cause: `bun pm pack`
  resolves `workspace:*` peer-dep ranges from `bun.lock`, not from the local
  workspace `package.json`. The Release-PR flow updates package versions but
  not the lockfile, so pack saw stale resolutions. Fixed in
  `scripts/publish-all.sh` by refreshing the lock before packing.

## 0.1.5

### Patch Changes

- [#153](https://github.com/fellwork/aihu/pull/153) [`f2421b1`](https://github.com/fellwork/aihu/commit/f2421b17a534d518c4f21c22d7f5e47a45c030da) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Scaffold install path fixes.

  `@aihu/cli`:

  - `aihu app <name>` now emits `package.json` with `latest` ranges for all `@aihu/*` deps instead of the aspirational `^1.0.0` (no 1.x exists on npm; the old pins broke `bun install` immediately).
  - Adds the missing `@aihu/app` (used by `src/main.ts`) and `@aihu/compiler` (used by `rolldown.config.ts`) to the generated dependency list.
  - Drops the malformed `bun@1` `packageManager` fallback — detects bun via `globalThis.Bun?.version`, omits the field when no real version is detectable.
  - Generates `.vscode/extensions.json` (recommends `fellwork.vscode-aihu`) and `.vscode/settings.json` (file association for `.aihu`) so new adopters get language support out of the box.

  `@aihu/router`, `@aihu/app`:

  - Republish so transitive pins point at clean versions. Previously `@aihu/router@0.1.1` pinned `@aihu/server@0.1.0` (carries the `workspace:*` leak) and `@aihu/app@0.1.4` peer-pinned `@aihu/router@0.1.0` (also leaked). Combined effect: `bun install` of any scaffolded app failed at the workspace-protocol resolution step. Both republish with deps targeting the post-leak versions.

- Updated dependencies [[`f2421b1`](https://github.com/fellwork/aihu/commit/f2421b17a534d518c4f21c22d7f5e47a45c030da)]:
  - @aihu/router@0.1.2

## 0.1.4

### Patch Changes

- Updated dependencies [[`70fdad2`](https://github.com/fellwork/aihu/commit/70fdad254bedab492e3b46b131564605d4665537)]:
  - @aihu/arbor@0.1.4
  - @aihu/runtime@0.1.4

## 0.1.3

### Patch Changes

- Updated dependencies []:
  - @aihu/arbor@0.1.3
  - @aihu/runtime@0.1.3

## 0.1.2

### Patch Changes

- [#109](https://github.com/fellwork/aihu/pull/109) [`82954a5`](https://github.com/fellwork/aihu/commit/82954a576a3f558133ee9cdb18df233c3b991972) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Round 2 SPA emit-correctness fixes — three layered defects surfaced by
  fellwork/mail dogfooding.

  - **Defect B (`@aihu/compiler` — runtime crash)**: template attribute bindings
    that reference any name declared in `@state` are now lowered to a
    single-element thunk array `[() => (expr)]`. Previously, an attribute like
    `<CalendarGrid events={events}>` where `events: any[] = []` emitted the raw
    array as the attribute value. arbor's `_applyAttrs` discriminates reactive
    bindings via `Array.isArray(value)`, so an empty-array state value was
    mis-detected as a Signal tuple and the runtime threw
    `TypeError: c is not a function` when it invoked `value[0]() as () =>
unknown`. The thunk-array form makes the discriminant explicit:
    `value[0]` is a getter, `mountEffect` reads the current value reactively.
    Static literals (`class="static"`), event handlers (`on*`), and locally
    declared `<script setup>` consts continue to pass through unwrapped.

  - **Defect A (`@aihu/compiler` — runtime crash)**: state declarations from
    `@state` blocks are now emitted _before_ the action / effect / lifecycle
    registration code in the setup body. `effect(...)`, `onMount(...)`, and
    `onCleanup(...)` synchronously invoke their callbacks once at registration
    time to track dependencies, so any reference to a state variable declared
    later hit the temporal dead zone and threw
    `ReferenceError: Cannot access 'n' before initialization`. Bare class-property
    declarations (`count: number = 0`) now lower to `let`, not `const`, so
    reassignments from action / lifecycle bodies (`count = count + 1`) don't
    throw `Assignment to constant variable`.

  - **Defect C (`@aihu/app` — stale published artifact)**: republish to ensure
    the round-1 `viteAihuPlugin({ islands: false })` plumbing actually ships in
    the consumed package. SPA route components are top-level mounts that should
    always go through `defineComponent`; the Round 1 fix made
    `viteAihuPlugin()` pass `islands: false` to `aihuCompilerPlugin()`, but the
    npm artifact for `@aihu/app@0.1.1` did not pick up the rebuilt `dist/`.
    Bumping the patch republishes with the corrected plumbing — login (and
    any route without `signal`/`computed`/`effect`/`onMount`/`onCleanup`) now
    emits a `defineElement(... defineComponent(...))` chunk shape instead of
    the static-island `customElements.define(...)` shim that strips the runtime.

## 0.1.1

### Patch Changes

- [`4dea3a4`](https://github.com/fellwork/aihu/commit/4dea3a4d98509742553dc654ef023cd6f8189edb) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Fix `RuntimeError: SCR-R0010 'no owner'` when `.aihu` route components use
  `$lifecycle.mount` / `$lifecycle.dispose` (or any `onMount` / `onCleanup`
  call) without also using `signal()`. Two changes:

  - **`@aihu/compiler`**: `_classifyIsland` now treats `onMount(` and
    `onCleanup(` as interactive primitives. Previously only
    `signal/computed/effect/setSignal` flipped a module to interactive, so a
    page that only used lifecycle hooks was mis-classified as static — the
    static-island shim then stripped `defineComponent`, leaving the lifecycle
    call without an owner. The compiler also now lifts `import` statements
    from `@state` blocks to module scope (deduped against framework-emitted
    imports) so consumed identifiers actually resolve at runtime.
  - **`@aihu/app`**: `viteAihuPlugin()` now passes `{ islands: false }` to
    `aihuCompilerPlugin()`. SPA route components are top-level mounts that
    should always go through the full reactive pipeline; the static-island
    optimization is for MPA-style mixed-island layouts and saves ~0 B in an
    SPA where the runtime is already shared in the main bundle. Set
    `islands: true` on the compiler plugin directly if you genuinely need
    per-component static-island emission.
  - **`@aihu/app`**: `createApp()` accepts a `provide` config and hoists
    the values into `globalThis` before any component runs, so app-level
    singletons (db clients, auth helpers) resolve as bare identifiers in
    `@state` blocks without manual `window.*` wiring. Mirrored on
    `AihuConfig` for build-time documentation.
