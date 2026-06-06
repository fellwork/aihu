# Plan: Runtime Layout Rendering + Dynamic Layout Switching

**Status:** scoped, not started. Session handoff — pick up at Step 1.

## TL;DR

The layout feature is **half-built**. The build-time *metadata* pipeline works
and is tested (compiler emits the `layout` key; the router scans layouts + reads
the sidecar). But the **runtime that actually renders a layout around a page —
loading the layout, filling its `<$outlet>` with the page — is missing/unwired.**

Consequences:
- **Publishing the compiler alone will NOT fix consumer apps.** It ships the
  `layout` *metadata*; if nothing renders the layout, the layout still does
  nothing.
- **"Dynamic layout switching" is not a small toggle** — there is no static
  layout-render layer for it to sit on. The static render must exist first.

Symptom that started this (a real `fellwork` web project): `@route { layout: "app" }`
+ `app.aihu` + `<$outlet>` declared, but the page renders with no layout —
`app.aihu`, the layouts scan, and the `layout:"app"` key "appear nowhere in the
build."

## Verified findings (with file:line — do NOT re-investigate)

### WORKS — build-time / metadata (and is tested)
- **Compiler emits the `layout` key in the `.route.json` sidecar.** VERIFIED by
  reproduction. `emit_route_json` at `packages/compiler/src/codegen/emit.rs:412`
  (the `"layout": "{}"` field, line ~433). Repro: a `src/pages/*.aihu` with
  `@route { layout: "app" }`, compiled via the file-mode binary
  (`aihu-compile file.aihu --out <dir>`), writes `<tag>.route.json` containing
  `"layout": "app"` (`packages/compiler/src/bin/main.rs:391` writes it). Note:
  `@route` is C500-gated to `src/pages/` paths — compile from there.
- **`<$outlet>` lowers correctly** to `branch('div', { 'data-aihu-outlet': '' }, [])`
  — the marker the runtime is meant to fill. VERIFIED.
- **Router build-time:** `scanLayouts(dir)` (`packages/router/src/vite-plugin.ts:106`)
  scans `*.aihu` → `LayoutMap`; `genL` generates the `\0virtual:aihu-layouts`
  module (`vite-plugin.ts:20`, ~141); `readRouteSidecar` (`vite-plugin.ts:95`)
  reads the sidecar's `layout` into generated routes (it's in the `SK` allowlist).
  `genR` **falls back to name-only when there is no sidecar** — that is the
  silent-drop path on the published toolchain.
- **Tested:** `packages/router/tests/v0.6b.test.ts` (20 pass) — but ONLY metadata
  (sidecar parsing, `scanLayouts`). It NEVER renders a layout.

### MISSING / UNVERIFIED — runtime rendering (the gap)
- **Nothing at runtime imports `virtual:aihu-layouts`** — grep across `packages/`
  found only the vite-plugin *defining* it. No consumer.
- **`@aihu/app` client mounts the matched page DIRECTLY into the root outlet**
  (`packages/app/src/client.ts:140`–`171`, `outlet.replaceChildren(...)`) with
  **no layout wrapping**.
- **`packages/router/components/Outlet.aihu` exists** (the `<$outlet>` SFC) — read
  it first; it is unclear if/how it is wired to render the layout.
- **No code anywhere** that, on navigation: (a) reads the matched route's
  `layout`, (b) loads it from the `LayoutMap`, (c) renders the layout, (d) mounts
  the page into the layout's `data-aihu-outlet`. **This is the work.**

## Release-coherence context (separate but related)
Published set is incoherent (from the #299 release): `@aihu/compiler@0.6.0`
(predates the v0.6.2 route sidecar → emits **no** sidecar → the `layout` metadata
never even reaches the build), `@aihu/router@0.1.8` (`scanLayouts` is tagged
v0.6.8 internally — likely not published), `@aihu/runtime@1.0.0`,
`@aihu/app@1.0.0`. So on the *published* toolchain even the metadata is absent.
A consumer app must use the source/local toolchain, or wait for a coherent
release. (See also the docs playground, which fetches the lagging release WASM —
`apps/docs/build.ts:5`.)

## The plan (in order)

### Step 1 — Build runtime layout rendering (the missing piece)
Wire `@aihu/app/src/client.ts` + `Outlet.aihu` so that on each navigation:
1. read the matched route's `layout` (from the generated routes / route context),
2. if set, load the layout module from the `virtual:aihu-layouts` map,
3. render the layout, find its `data-aihu-outlet` marker, mount the page into it,
4. if no `layout`, mount the page into the root outlet (current behavior).

- **Read first:** `packages/router/components/Outlet.aihu`; `client.ts` render
  path (~120–175); `runtime.ts` route context + `<$outlet>`; the generated
  `virtual:aihu-routes` / `virtual:aihu-layouts` shapes (`genR`/`genL` in
  `vite-plugin.ts`).
- **Scope decision:** client-only first; SSR/prerender parity
  (`packages/app/src/prerender.ts:156` `injectContent`) as a follow-up.
- **Tests (the key new coverage — repo has none):** mount an app with a
  route+layout, assert the page renders *inside* the layout's outlet (not the
  root). This is the regression guard the feature has always lacked.

### Step 2 — Dynamic layout switching (small, ONLY after Step 1)
- Add a layout-override signal in the router/route context (e.g. `setLayout(name | null)`);
  the renderer/`<$outlet>` resolves `override ?? route.layout`. Swapping the
  override re-renders under the new layout **without navigating**.
- Expose it so both a human toggle AND an `@agent` action can switch layouts
  (ties into the agent-drive demo — e.g. an action `setLayout("compact")`).
- **Test:** toggle the override → outlet re-renders under the new layout on the
  same route.

### Step 3 — Example + tests + release
- Add `examples/layouts/`: ≥2 custom layouts, ≥2 routes switching by navigation,
  + a dynamic-switch toggle. Doubles as the **regression example** (repo has
  none) and the **"custom layouts + switching" demo**.
- Changesets bumping `@aihu/router` + `@aihu/app` (+ `@aihu/compiler` if any
  sidecar change) — publish in lockstep (compiler emits what router/app consume).
- **Add to the release set** — cut a coherent release so the published toolchain
  finally ships working layouts and unblocks the `fellwork` app.

## Open questions / decisions for next session
- **Nested layouts?** Current model is a single `layout` per route. Decide scope
  (a route inside multiple layouts) before Step 1's API.
- **SSR/prerender parity** (`prerender.ts:156` `injectContent`) — same session as
  client, or a fast follow-up?
- **Dynamic-switch API surface:** global `setLayout` vs a router method vs a
  context signal. Recommended: a **router-context signal** — scoped, reactive,
  and naturally `@agent`-exposable for the demo.

## Reproduction (recreate from these snippets)
`src/pages/home.aihu`:
```
@route { path: "/", name: "home", layout: "app" }
@state { export default function() { return [] } }
@template { <div>home page</div> }
```
`src/layouts/app.aihu`:
```
@template { <div class="app-shell"><header>App Header</header><main><$outlet></$outlet></main></div> }
```
Compile the page from a `src/pages/` path with the source binary
(`aihu-compile src/pages/home.aihu --out out/`) → `out/home.route.json` carries
`"layout": "app"`. Compiling `app.aihu` (`--stdin --tag app-layout`) emits the
`data-aihu-outlet` marker. Both confirmed. The gap is everything *after* the
build: no runtime renders the layout around the page.
