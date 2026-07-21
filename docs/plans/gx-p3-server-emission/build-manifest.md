# Build manifest — GX P3, keystone slice: server emission renders a compiled route

Branch `feat/gx-p3-server-emission`, off `origin/main` @ `74eaea47`.
Measured 2026-07-21 on macOS (darwin arm64), bun 1.3.8 / vitest 3.2.6, after
`bun install --frozen-lockfile` and `cargo build` (workspace `target/debug`).

Property closed: **a compiled `.aihu` route renders to HTML server-side.**
Import the `--target server` artifact in plain Node/Bun — no DOM, no shim —
and `renderToString(mod.default, { hydratable: true })` returns real HTML.

Before this slice, `--target server` output was byte-identical to `--target
client` for non-agent components: the only emission was the module-scope
`defineElement('tag', defineComponent(setup))` side-effect, which throws
`ReferenceError: HTMLElement` at import time in Node/Bun, and the setup
closure that builds the arbor tree was reachable only through a constructed
custom element (`connectedCallback` → `_build`).

---

## What the server artifact now looks like

For a **non-agent** component, `--target server` diverges structurally:

1. **Setup hoisted** to a named module const (`const __aihu_setup__ = (ctx) =>
   { … }`) — reachable without any custom-element machinery.
2. **Registration DOM-gated**: `defineElement(...)` runs only when
   `typeof HTMLElement !== 'undefined' && typeof customElements !==
   'undefined'`, so a DOM-shimmed host still registers the element exactly as
   before while a plain Node/Bun import skips it.
3. **`@style` elided**: the style block was the other module-scope DOM
   dependency (`new CSSStyleSheet()` + `adoptedStyleSheets`); styles never
   reach server HTML, so the server artifact carries none of it.
4. **SSR entry exported**: `export const __ssr = () => __aihu_setup__({ host:
   null, element: null, attrs: {}, props: {} })` plus `export default __ssr` —
   the `ComponentDescription` (`() => arborTree`) shape `@aihu/server`'s
   `renderToString`/`renderToStream` accept and `@aihu/app`'s
   `resolveComponent` finds as `mod.default`.

Client and universal targets are untouched (verified below).

## Proof (the exact passing path)

`tests/integration/server-emission-ssr.test.ts` (node environment — asserts
`typeof HTMLElement === 'undefined'` as a precondition) compiles
`bench/compiler-conformance/route/01-basic-route.aihu` with `--target server`
through the real Rust binary, writes the artifact to a scratch file, imports
it, and asserts:

```
renderToString(mod.default, { hydratable: true })
  === '<div class="users" data-aihu-path="0">Users</div>'
renderToString(mod.default)
  === '<div class="users">Users</div>'
```

Also covered: `examples/blog-router/src/pages/index.aihu` (has `@style` +
`$each`) imports cleanly server-side and renders its static template content;
client/universal artifacts keep the ungated registration and contain zero
server-emission bytes.

## Headline numbers

| Gate | Result |
|---|---|
| `cargo test` (packages/compiler) | 35 suites, 0 failures (incl. golden conformance = client/universal byte-identity) |
| `bunx vitest run tests/integration/server-emission-ssr.test.ts` | 4 passed |
| Full root `bun run test` | 2422 passed, 13 skipped, 1 failed — the failure is the documented pre-existing css-engine `resolve-binary` dev-binary check; it passes once `cargo build --bin aihu-css-compile` runs (verified: 5/5 after building) |
| `bun run size` | exit 0 (client bundles unchanged) |
| `bun run typecheck` | 50 tasks completed |
| `bun scripts/sync-readme.ts --check` | all in sync (after regenerating the 6 version-bumped READMEs) |
| `bun run check:compiler-binary-bump` | ok (0.1.12 → 0.1.13, ×5 npm packages + ×5 pins) |
| `biome ci` (changed files) | clean |

## Files changed

- `packages/compiler/src/codegen/emit.rs` — the whole behavioral change:
  `emit_ssr_entry` gate in `emit()` (server target ∧ non-agent), `ssr_entry`
  param + `ssr_standalone` shape in `emit_function_form` (style elision,
  hoisted setup, gated registration, `__ssr`/default exports).
- `tests/integration/server-emission-ssr.test.ts` — the end-to-end proof
  (skips when no compiler binary is built, mirroring the b3b precedent).
- `packages/compiler/npm/*/package.json` (×5) + `packages/compiler/package.json`
  — binary bump 0.1.12 → 0.1.13 per compiler-Rust-change doctrine.
- `packages/compiler/README.md`, `packages/compiler/npm/*/README.md`,
  `scripts/__package-inventory.json` — `sync-readme` regeneration of the
  version strings.
- `docs/plans/gx-p3-server-emission/build-manifest.md` — this note.

## Deliberate scope cuts (agreed slice boundary)

- **No principal-gating / entitlement / loader-filtering** — different lane.
- **Agent components keep today's server emission.** The
  `inject_server_binding_registration` string-surgery anchors on the
  `defineComponent((_ctx) => {` shape; restructuring it would silently drop
  the LiveBinding registration for the `@aihu/agent-service` headless path.
  They get an SSR entry when the stubbed server SetupContext grows signal
  support.
- **Options-form (`$prop`/`@agent inputs`) and `$form` components** keep
  today's server emission: a `mod.default` whose `ctx.props` reads throw
  would be worse than no export. Needs prop-signal stubs seeded from the
  emitted defaults.

## What remains for full P3

1. **Structural directives in the SSR walk**: `$each` boundaries render empty
   (`each(...)` nodes are not understood by `ssr.ts`'s `_renderNode`); same
   for reactive attr tuples (`href: [() => …]`). The blog-index test asserts
   the current gap explicitly so it fails the moment the walk learns them.
2. **Loader routes**: threading route loader data into the setup context
   before the tree build (`ssr: true` routes with `@loader`).
3. **`$suspense` / `@stream`**: wiring the dataSource boundary path
   (`renderToStream` already speaks it) to compiled output.
4. **Prop/attr-carrying components**: server SetupContext stubs that
   synthesize prop signals from the emitted `props:` config defaults, which
   also unlocks options-form + agent components (see scope cuts).
5. **Hydration parity**: client `hydrate()` adopting exactly the
   server-rendered DOM for a compiled route (path-key parity tests exist for
   hand-built trees; compiled-route parity is unproven).
6. **Lifecycle on the server**: `onMount`/`onCleanup` inside setup currently
   throw SCR-R0010 server-side (no owner). Needs a server lifecycle scope
   (collect-and-discard) — deliberately not hacked around here.
