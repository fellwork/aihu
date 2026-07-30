# @aihu/app

## 8.1.0

### Minor Changes

- [#719](https://github.com/fellwork/aihu/pull/719) [`c972073`](https://github.com/fellwork/aihu/commit/c972073efcd9ad94e89923432b435ea1e8de0ffa) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Eliminate the need for a scaffolded `src/main.ts` in the common case, and fix a real typecheck/build divergence uncovered along the way.

  - `@aihu/app`: `viteAihuPlugin()` gained an `aihu-entry` sub-plugin
    (`packages/app/src/entry.ts`) that serves `virtual:aihu-entry` — a
    byte-identical stand-in for the old boilerplate `src/main.ts`
    (`import { createApp } from '@aihu/app/client'; createApp()`) — and
    injects its `<script>` tag into `index.html` whenever no real
    `src/main.ts` exists on disk. A project that needs `createApp(options)`
    (`provide`, `outletId`, a non-default `head`) still writes a real
    `src/main.ts`, which makes the virtual entry step aside entirely (full
    eject, not a partial override — mirrors how framework-owned client entries
    work elsewhere, and keeps `provide` where comparable frameworks keep it:
    code, not declarative config, since it holds live values that can't be
    serialized into generated source).
  - `@aihu/cli`: `appMainTs`/`appIndexHtml` (the `minimal`/`docs` templates)
    stop emitting `src/main.ts` and its `<script>` tag — the virtual entry
    above covers it. `AGENTS.md`'s generated project-map table updated to
    match.
  - `@aihu/compiler`: `compileSidecar()` gained a `target` option
    (`'client' | 'server' | 'universal'`), mirroring what `transform()` already
    passes as `--target`. Previously the sidecar (the type-check surface
    `aihu-tsc` and the language server hand to TypeScript) always compiled
    against the binary's `universal` default regardless of what a project's
    `vite.config.ts` actually configured — a real divergence, since `--target`
    changes what the sidecar is derived from (e.g. a `target: 'client'` build
    elides server-only artifacts). `islands`/`shadowMode` are deliberately NOT
    added here: both are JS-side post-processing on the runtime JS output only
    and have no bearing on the sidecar's types.
  - `@aihu/tsc`: `run()`/`aihu-tsc` now read `AihuConfig.compiler.target` and
    `AihuConfig.typecheck.strictTemplates` from the project's `vite.config.ts`
    (new `loadTscProjectConfig()`, invoked from `bin/aihu-tsc.mjs` since
    `run()` itself stays synchronous) and thread `target` into `compileSidecar`
    — closing the gap above for the common `"typecheck": "aihu-tsc"` scaffold
    script, which is invoked with no flags and had no other way to see that
    config.
  - `@aihu/language-server`: reads the same `compiler.target` from the
    workspace root (best-effort — a client that gives no workspace root, or a
    project with no `vite.config.ts`, behaves exactly as before), so editor
    diagnostics match `aihu-tsc`'s and CI's.

## 8.0.1

### Patch Changes

- [#715](https://github.com/fellwork/aihu/pull/715) [`9bba4bb`](https://github.com/fellwork/aihu/commit/9bba4bbf177bcd266502ab9181e91478f1710704) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Fix ReDoS-vulnerable regex patterns and a prototype-pollution gap found by CodeQL code scanning.

  - `@aihu/app`: `applyHeadConfig`'s `<meta>`-tag matching no longer uses a
    `\s+[^>]*attr...[^>]*` nested-quantifier regex over the whole `index.html`
    string (catastrophic backtracking on pathological/repetitive input) — it
    now scans tag boundaries with one unambiguous pass, then tests the
    attribute within just that bounded tag.
  - `@aihu/router`: the file-router's segment builder no longer strips a
    route's extension with a `\.[^/]+$/`-anchored regex (same backtracking
    class) — a plain `lastIndexOf`-based split instead.
  - `@aihu/compiler`: `_isLayoutFile`'s trailing-slash trim no longer uses a
    `\/+$/`-anchored regex — measured 45s on a 200k-character pathological
    input before the fix, sub-millisecond after. The state-wrapper codemod
    (`migrate.ts`/`verify.ts`) also now fully escapes identifiers before
    embedding them into `RegExp` constructors (previously escaped only `$`).
  - `@aihu/cli`: the `full` template's scaffolded `server.ts` had the same
    trailing-slash ReDoS shape in a generated string — fixed so scaffolded
    apps don't inherit it.
  - `@aihu/magna`: `setBuildFlag` (a public function accepting an arbitrary
    dot-notation key) now rejects `__proto__`/`constructor`/`prototype`
    segments, closing a prototype-pollution gap in its public contract.

- Updated dependencies [[`9bba4bb`](https://github.com/fellwork/aihu/commit/9bba4bbf177bcd266502ab9181e91478f1710704)]:
  - @aihu/router@0.4.3

## 8.0.0

### Patch Changes

- Updated dependencies [[`19af14c`](https://github.com/fellwork/aihu/commit/19af14c0989fcae8eed344c119ba91894e13c776)]:
  - @aihu/runtime@5.1.0

## 7.1.0

### Minor Changes

- [#609](https://github.com/fellwork/aihu/pull/609) [`bef4c66`](https://github.com/fellwork/aihu/commit/bef4c66fb59c8d9224d131e158106713cdb0da05) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Config lives in `vite.config.ts`; the CLI reads it from there

  The scaffold no longer emits a separate `aihu.config.ts`. Everything aihu is
  configured with goes inline on `viteAihuPlugin({...})` in `vite.config.ts`, and
  non-Vite consumers read it back from there.

  A second config file is justified exactly as long as something other than Vite
  needs the config and cannot parse the Vite config. That was SvelteKit's stated
  reason for `svelte.config.js` in 2022 — the language server had to know your
  preprocessors and does not run Vite. SvelteKit then removed the reason rather
  than living with it: once the language server could read `vite.config.js`, the
  second file became optional, and SvelteKit 3 makes the Vite config the required
  location.

  **New in `@aihu/app`:**

  - `viteAihuPlugin()` registers an `aihu:config` marker plugin carrying the
    evaluated config on a public `api` handle.
  - `loadAihuConfig(root)` reads it back through Vite's own `loadConfigFromFile`
    — no build. Returns the config, its source path, Vite's dependency list, and
    every registered aihu module's options.
  - `declareAihuModule()` + `collectAihuModules()`: the contract by which any
    package becomes readable by the CLI and the language server without a central
    registry to update.
  - `viteAihuPlugin()` now validates its inline argument. Only `defineConfig` did
    before, so the path every example uses was unvalidated. Unknown keys throw
    with a keypath and a did-you-mean.
  - New options that previously required abandoning `viteAihuPlugin` and wiring
    the underlying plugin by hand: `dir.components`, `compiler.islands`,
    `compiler.target`, `build.bundler`, `dev.*`, `typecheck.*`.

  **In `@aihu/cli`:** `aihu build` and `aihu dev` each had a private loader that
  dynamic-imported `aihu.config.ts` with its own local interface. They now share
  one loader that prefers `vite.config.ts` and falls back to `aihu.config.ts`, so
  existing projects keep working.

  **Also:** the scaffolded config declares no MCP `endpoint`. The previous one
  pointed `endpoint` at the server card's own URL, publishing a card that
  advertised zero tools and named the discovery document as its own transport.
  A static client build has no process to serve MCP, so no card is emitted.

## 7.0.0

### Patch Changes

- Updated dependencies [[`2f24fa3`](https://github.com/fellwork/aihu/commit/2f24fa3fdc592c85e39f500a48a7e4d3ff67c86d), [`a993aa1`](https://github.com/fellwork/aihu/commit/a993aa19d402c221faa463dfb5d94c86cc87b670), [`3790c91`](https://github.com/fellwork/aihu/commit/3790c91331fa7ecb15649213a66c83078e63dafe), [`edc15f2`](https://github.com/fellwork/aihu/commit/edc15f2a2de541fa8f7ffd6266ad984446206257), [`ad6921a`](https://github.com/fellwork/aihu/commit/ad6921a018ef4a479f6540278e549aa9a8cab387), [`51451a4`](https://github.com/fellwork/aihu/commit/51451a47fee517c922d203951baf6442fe806115), [`2ea4a8f`](https://github.com/fellwork/aihu/commit/2ea4a8f4197b5d2f4bf07b122f2e9653508ecf42)]:
  - @aihu/arbor@4.0.0
  - @aihu/runtime@5.0.0
  - @aihu/signals@0.5.0
  - @aihu/router@0.4.2
  - @aihu/server@0.4.1
  - @aihu/store@0.1.2

## 6.0.0

### Patch Changes

- Updated dependencies [[`2ef2830`](https://github.com/fellwork/aihu/commit/2ef2830aa737906d09a5d870176da34a22f20b99), [`8924c51`](https://github.com/fellwork/aihu/commit/8924c51da6e6c25fb2664a7ab6fe9c628895161d), [`18e5f6d`](https://github.com/fellwork/aihu/commit/18e5f6dda93772877690e88e8c217dcdcf4bddc2), [`27a3268`](https://github.com/fellwork/aihu/commit/27a326826ee9a4d0a9b46bf50ca31686543848fe), [`ea8d2eb`](https://github.com/fellwork/aihu/commit/ea8d2ebb91c28132f399a708e2bd88877072d1db), [`061eefb`](https://github.com/fellwork/aihu/commit/061eefb3e94fdbbe9e6f5d5301db3bcdd3fa3b22)]:
  - @aihu/server@0.4.0
  - @aihu/signals@0.4.0
  - @aihu/arbor@3.0.0
  - @aihu/runtime@4.0.0
  - @aihu/router@0.4.1
  - @aihu/store@0.1.1

## 5.0.0

### Major Changes

- [#479](https://github.com/fellwork/aihu/pull/479) [`9dd7654`](https://github.com/fellwork/aihu/commit/9dd7654678da1149705e21324f6b30e9baafcd4b) Thanks [@srmcguirt](https://github.com/srmcguirt)! - DA4 ([#437](https://github.com/fellwork/aihu/issues/437)): the binary shadow API (`'light' | 'shadow'`) and light-DOM-by-default pages — one breaking change.

  **The API.** `ShadowMode` collapsed to a BINARY `'light' | 'shadow'`; the
  `'open'`, `'closed'`, and `'none'` tokens are retired everywhere (the
  `$shadow` macro, the plugin-global `shadowMode` config /
  `css: { shadowMode }`, the runtime `defineElement` options, and the CLI
  `--shadow` flag). `'shadow'` attaches an OPEN root internally — open is the
  only browser mode aihu's composition/hydration can use; `'closed'` was
  self-contradictory (a closed root nulls `this.shadowRoot`, so light-DOM
  detection misclassified it and content rendered into the host anyway).
  `'light'` attaches no root, so `this.shadowRoot === null` is an unambiguous
  detection. Migration: `'open'` → `'shadow'`, `'none'` → `'light'`,
  `'closed'` → `'shadow'`.

  **The defaults.** Page-level components — those with an `@route` block — and
  layout SFCs (files under the configured layouts dir, default `src/layouts/`)
  now default to `'light'`, so server-rendered page content is reachable by
  crawlers and agents that do not execute JavaScript. Leaf components (no
  `@route`) default to `'shadow'` (behaviorally the old `'open'` default).

  Precedence, in order: a per-file `$shadow` pin > an explicit plugin-global
  `shadowMode` config > the page/layout default `'light'` > the leaf default
  `'shadow'`. An unpinned page carries a new `// @aihu:shadow-default light`
  marker (distinct from the `$shadow` pin marker) so the implicit default ranks
  below an explicit plugin-global config.

  Breaking implications:

  - Retired tokens fail loudly: `$shadow` with an old token is a C471 compile
    error; `css.shadowMode` with one throws at config validation; `--shadow`
    with one warns and falls back to the default.
  - A `$shadow`-less `@route` page's `@style` block now joins the global
    cascade instead of being trapped in a shadow root — scope bare element
    selectors under a page root class (see the migration guide §8).
  - W472 (the phase-1 advisory that announced this flip) is retired.
  - The static-island fast path is skipped for light-DOM components — the shim
    cannot honor `shadowMode: 'light'`; such components keep the full runtime
    path.
  - css-engine scaffolds now always emit an explicit `css: { shadowMode }`
    block carrying the wizard's `--shadow` choice (default `'shadow'`), since
    the page default would otherwise override it.

### Patch Changes

- Updated dependencies [[`9dd7654`](https://github.com/fellwork/aihu/commit/9dd7654678da1149705e21324f6b30e9baafcd4b), [`80531dc`](https://github.com/fellwork/aihu/commit/80531dcc4dfc43bc9cd399bbb8ab4520efb8f15a), [`bc0f289`](https://github.com/fellwork/aihu/commit/bc0f289ee38871cda8002e56fba3e3b8b7e34d84)]:
  - @aihu/runtime@3.0.0
  - @aihu/router@0.4.0
  - @aihu/server@0.3.0

## 4.0.0

### Minor Changes

- [#418](https://github.com/fellwork/aihu/pull/418) [`212e3e3`](https://github.com/fellwork/aihu/commit/212e3e38ae57de7e38c3211ef0223729ba1511e1) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Layout-scoped component registration (F2): a layout's own referenced components now get route-scope registered, the same way a page's do. The router's `virtual:aihu-layouts` entries carry a `components` array — the normalized tags the layout SFC's `@template` references, scanned at build time (`readAihuLayoutComponents`, mirroring the compiler's `is_component_tag`/`collect_component_tags` rule). When `@aihu/app` renders a route under a layout, it registers those components (from `virtual:aihu-components`) alongside loading the layout module, so a component used inside a layout — not the page — is defined before the layout element mounts instead of relying on prop-on-upgrade or an eager import. Entries without a `components` field (pre-F2 generated modules) keep working unchanged.

- [#416](https://github.com/fellwork/aihu/pull/416) [`bf66339`](https://github.com/fellwork/aihu/commit/bf66339bfeb7aaf855eb23e804f099c0e7d92726) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Route-scoped component registration (O1c): on navigation the client imports every component the matched route references — from the compile-time `virtual:aihu-components` registry — and registers their custom elements before the page element mounts. Apps no longer need a hand-written entry that eagerly imports every component; just reference the tag in a template. Tags with no registry entry (e.g. globally-registered elements) are skipped silently. Applies to the not-found route too.

### Patch Changes

- [#418](https://github.com/fellwork/aihu/pull/418) [`212e3e3`](https://github.com/fellwork/aihu/commit/212e3e38ae57de7e38c3211ef0223729ba1511e1) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Nested `<$outlet>` component registration (F1): the compiler-emitted `createOutletBoundary` now loads the matched route's referenced components alongside its page module — `Promise.all([m.route.module(), ...(globalThis.__aihuRegisterRouteComponents?.(m.route) ?? [])])` — so pages rendered through a layout's nested outlet get the same route-scoped registration as the top-level render path (O1c). `@aihu/app` publishes the registrar as `globalThis.__aihuRegisterRouteComponents` at module load; a standalone `@aihu/router` app without `@aihu/app` leaves it undefined and the outlet simply skips registration, unchanged from before.

- Updated dependencies [[`e8b082f`](https://github.com/fellwork/aihu/commit/e8b082f708e67de5ca54cf2d1e774a38b650c61c), [`8c80d98`](https://github.com/fellwork/aihu/commit/8c80d9844503c248ecf5fb2c0b3ec5ab06128d5e), [`212e3e3`](https://github.com/fellwork/aihu/commit/212e3e38ae57de7e38c3211ef0223729ba1511e1), [`84d6544`](https://github.com/fellwork/aihu/commit/84d654444bbfe2877896bca5ae74cbe5ce3ea364), [`514336d`](https://github.com/fellwork/aihu/commit/514336da5892c29e9e02d7a6391bb06c62d688c3)]:
  - @aihu/runtime@2.0.0
  - @aihu/router@0.3.0
  - @aihu/signals@0.3.0
  - @aihu/arbor@2.0.0

## 3.0.2

### Patch Changes

- [#374](https://github.com/fellwork/aihu/pull/374) [`6a0d8e4`](https://github.com/fellwork/aihu/commit/6a0d8e426fa2ab53c37fa5d1d4e6ae63ca671e0d) Thanks [@srmcguirt](https://github.com/srmcguirt)! - fix: `viteAihuPlugin({ agentReadiness })` no longer crashes under ESM vite config

  `viteAihuPlugin` lazy-loaded `@aihu-plugin/agent-readiness` with a bare
  `require(...)`, which throws "require is not defined" when vite loads
  `vite.config.ts` as bundled ESM (and `createRequire` fails too, since the
  package is ESM-only with no CJS export). Switched to a dynamic `import()`
  returned as a `Promise<Plugin>` (Vite awaits plugin promises). The plugin
  factory's return type widens from `Plugin[]` to `PluginOption[]`.

## 3.0.1

### Patch Changes

- Updated dependencies [[`5a94938`](https://github.com/fellwork/aihu/commit/5a949381544afd8276a0f6f5dba10cc4561b1d1a)]:
  - @aihu/server@0.2.1
  - @aihu/router@0.2.2

## 3.0.0

### Patch Changes

- Updated dependencies [[`dbc0903`](https://github.com/fellwork/aihu/commit/dbc09031f22ee93d9e5c9a46fea2ca2409463e90)]:
  - @aihu/runtime@1.1.0

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
