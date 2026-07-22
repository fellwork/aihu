# @aihu/runtime

## 3.0.0

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

## 2.0.0

### Minor Changes

- [#411](https://github.com/fellwork/aihu/pull/411) [`8c80d98`](https://github.com/fellwork/aihu/commit/8c80d9844503c248ecf5fb2c0b3ec5ab06128d5e) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Hierarchical provide/inject on the client.

  `inject()` now resolves through the component tree: an ancestor's `provide()` is
  visible to its descendants, scoped to the subtree (siblings don't see it, a
  nearer provider overrides a farther one), and it crosses shadow boundaries. The
  value is whatever you provided — provide a signal and descendants read it
  reactively, for free.

  The mechanism is the Solid/Vue-grade one: each component instance holds a
  `provides` object whose prototype chain IS the ancestor context tree. A component
  that provides nothing shares its parent's object by reference (zero allocation);
  the first `provide()` does one `Object.create`. `inject()` is a single
  prototype-chain lookup — no per-lookup tree walk. The parent is resolved once at
  connect via a single shadow-host hop, which is correct under lazy/async component
  registration too (it runs after upgrade).

  Backward-compatible: the flat SSR context path (`setSsrContextMap` /
  `runWithContext`) is unchanged, and the client hierarchical path only engages
  during a component's setup. `createContext` / `provide` / `inject` keep their
  signatures.

### Patch Changes

- [#412](https://github.com/fellwork/aihu/pull/412) [`e8b082f`](https://github.com/fellwork/aihu/commit/e8b082f708e67de5ca54cf2d1e774a38b650c61c) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Bless composables as a supported, tested contract.

  A plain function called from an `@state` block runs inside the component's setup,
  so it can use the full reactive surface — signals, lifecycle hooks bound to the
  calling component, and hierarchical `inject`/`provide`. This is aihu's Vue-style
  composable pattern; the mechanism already existed, and a contract test now locks
  it (signals + `onMount`/`onCleanup` + inject-with-default all work inside a
  composable). A new "Composition & Injection" guide documents the `use*`
  convention and the layered-injection pattern.

- [#406](https://github.com/fellwork/aihu/pull/406) [`84d6544`](https://github.com/fellwork/aihu/commit/84d654444bbfe2877896bca5ae74cbe5ce3ea364) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Prop set before a custom element upgrades is no longer lost.

  A `.aihu` component compiles to a custom element, and its prop accessors live on
  the class prototype. If a prop is assigned to an element BEFORE its tag is
  `define()`d — the lazy/async-import case, where a page renders a tag and binds it
  before the component's chunk lands — there is no accessor yet, so the write lands
  as an OWN property. When the element later upgrades, that own property SHADOWS the
  prototype accessor forever: the setter never runs, the signal never sees the
  value, and the prop silently reverts to its default.

  The element constructor now performs the standard upgrade rescue — for each
  declared prop, capture any shadowing own property, delete it, and re-assign
  through the accessor, which buffers it for the pre-connect seed. This makes
  route-scoped / lazily-imported components safe to render before their definition
  loads.

- Updated dependencies [[`b279f74`](https://github.com/fellwork/aihu/commit/b279f74b34cd4e901be1cfa5d70c212cf604dfc1), [`8c80d98`](https://github.com/fellwork/aihu/commit/8c80d9844503c248ecf5fb2c0b3ec5ab06128d5e), [`514336d`](https://github.com/fellwork/aihu/commit/514336da5892c29e9e02d7a6391bb06c62d688c3)]:
  - @aihu/context@0.2.0
  - @aihu/signals@0.3.0
  - @aihu/arbor@2.0.0

## 1.1.0

### Minor Changes

- [#348](https://github.com/fellwork/aihu/pull/348) [`dbc0903`](https://github.com/fellwork/aihu/commit/dbc09031f22ee93d9e5c9a46fea2ca2409463e90) Thanks [@srmcguirt](https://github.com/srmcguirt)! - `ComponentOptions.base` (§9.4 recipe class-extension): the options-form
  `defineComponent({ base, props, setup })` now extends the given custom-element
  base class instead of `HTMLElement`. The base's `connectedCallback` runs
  before the template mounts (so context-providing primitives register before
  their child pieces upgrade), `observedAttributes` are unioned with the base's
  (a subclass static would otherwise shadow them), and
  `disconnectedCallback` / `attributeChangedCallback` are forwarded. Without
  `base`, behavior is unchanged.

## 1.0.0

### Minor Changes

- [#328](https://github.com/fellwork/aihu/pull/328) [`7ec7155`](https://github.com/fellwork/aihu/commit/7ec71553722eaa4e3f6814e79ec747db68b72451) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Fix plain `$resource`: emit the `createResource` import + add the runtime primitive.

  The compiler lowered a plain (non-magna) `$resource` entry to `const x = createResource(() => …)` but never emitted the import — the `needs_create_resource` flag was set yet never pushed to the `@aihu/runtime` import list — so any `$resource` produced a bare `ReferenceError: createResource is not defined`. And `@aihu/runtime` had no `createResource` to import (it was meant to live there parallel to `createStream`; only a magna-internal copy in `@aihu-plugin/data` existed).

  - **`@aihu/runtime`**: add `createResource(factory)` next to `createStream` — a reactive async resource with `loading` / `data` / `error` getters + `refetch()`, with a sequence guard so a superseded run never clobbers fresher data. Exported from the barrel.
  - **`@aihu/compiler`**: push `createResource` into the `@aihu/runtime` import when a plain `$resource` is used (`emit.rs`), mirroring `createStream`.

  The compiler emits the runtime import, so these publish in lockstep. Magna-backed `$resource` (`createMagnaResource` from `@aihu/magna`) is unaffected.

- [#325](https://github.com/fellwork/aihu/pull/325) [`24dee56`](https://github.com/fellwork/aihu/commit/24dee56964e5afdac11c858cca0da2b3ec2483c9) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Add the per-element agent-dispatch registry (`_registerAgentDispatcher` / `_takeAgentDispatcher`, from `agent-dispatch.ts`). The compiler injects a `_registerAgentDispatcher(ctx.element, …)` call into each `@agent` component's setup body and imports it from `@aihu/runtime`; the browser capability-bridge client (`@aihu/agent-server`) reads the per-instance dispatcher via `_takeAgentDispatcher`.

  This MUST publish in lockstep with the matching `@aihu/compiler` release. Without this bump, the released compiler emits `import { …, _registerAgentDispatcher } from '@aihu/runtime'` against the previously published runtime (0.1.8), which does not export the symbol — so any compiled `@agent` component would fail to resolve it.

- [#327](https://github.com/fellwork/aihu/pull/327) [`1132357`](https://github.com/fellwork/aihu/commit/113235708bac1e8f9263d35feb865af8f8127f86) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Fix server/universal `@agent` builds: lower `@state` macros and enable headless dispatch.

  Previously the server/universal path (`emit_options_form`) did **not** run `process_state_body`, so `$prop`/`$action`/`$computed` were emitted as raw JS labeled statements and the module-scope `__agentBinding` referenced undeclared symbols — any real compiled `@agent` component was undrivable server-side (only the browser capability-bridge path worked).

  `@agent` SFC emission is now unified on the function form (which already lowers macros and handles props/magna/`$auth`/form/aria), and `emit_options_form` is removed. For the server, the compiler injects an in-setup `_registerAgentServerBinding(ctx.element, …)` (new in `@aihu/runtime`, mirroring the client's `_registerAgentDispatcher`) that registers a full per-instance `LiveBinding` — with the live setup-scope reads/writes/actions plus `scope`/`rateLimit` — into arbor's `componentInstanceRegistry`. So `@aihu/agent-service`'s gate (`getRegistry`) can drive a real compiled component **headless** (no browser bridge).

  The compiler emits `import { …, _registerAgentServerBinding } from '@aihu/runtime'`, so these publish in lockstep. The client/bridge path (`_registerAgentDispatcher`, opaque-ID dispatcher, client-elided raw `__agentBinding`) and the `batch`-returns-value / `$prop` `.set(v)` fixes are preserved. Proven by `packages/agent-server/tests/headless-compiled-dispatch.test.ts`, which compiles a real SFC `--target server` and drives it.

### Patch Changes

- Updated dependencies [[`b85f400`](https://github.com/fellwork/aihu/commit/b85f4008c489a0dba9e36cbdfc48b635eeea375f)]:
  - @aihu/signals@0.2.0
  - @aihu/arbor@1.0.0

## 0.1.8

### Patch Changes

- [#262](https://github.com/fellwork/aihu/pull/262) [`2aecb07`](https://github.com/fellwork/aihu/commit/2aecb071623d989e7dc331c5e487eb6bdf756c2e) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Fix `<$slot>` projection under `shadowMode: 'none'`. The compiler lowers `<$slot>` to a real `<slot>` DOM element, which the browser only projects against light-DOM children when there is an actual Shadow Root. With `shadowMode: 'none'` there is no shadow root, so the `<slot>` element was inert — and worse, the parent's `_materialize` had already appended the page's children to the host BEFORE the layout's `connectedCallback` ran, so the layout template was appended AFTER them. End result: `<layout-default><h1>...</h1></layout-default>` rendered as `[h1, nav]` instead of `[nav, h1]`.

  `defineComponent.connectedCallback` now adds a light-DOM-only branch (guarded by `this.shadowRoot === null`): carve `this.childNodes` into a buffer, clear the host, run `_build()`/`_mount()`, then locate the first default `<slot>` in the host subtree and `replaceWith(...bufferedChildren)`. If the layout exposes no slot, the children are reappended to the host as a graceful fallback (preserves prior behavior for plain custom elements that simply contained children). Both function-form and options/props-form `connectedCallback` are patched. Shadow-DOM path (`this.shadowRoot !== null`) is untouched — the browser continues to handle projection natively.

  **Deferred to follow-up (not in this fix):** named slots (`<slot name="foo">` routing children by `slot="foo"` attribute) and default fallback content (`<slot>fallback</slot>` keeping the fallback subtree when no children are projected). A `TODO(architect)` comment marks the gap in `define-component.ts`.

## 0.1.7

### Patch Changes

- [#252](https://github.com/fellwork/aihu/pull/252) [`84352bc`](https://github.com/fellwork/aihu/commit/84352bcb901b7213d67727648545b41652b2092a) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Hoist `@aihu/signals` to a `peerDependency` with a caret range (via `workspace:^`) on both `@aihu/arbor` and `@aihu/runtime`. Previously arbor declared `@aihu/signals` as a regular `dependencies` entry and runtime declared it as a `peerDependency` with `workspace:*`. `bun pm pack` rewrites `workspace:*` to an exact pin (`"0.1.0"`) at pack time — so the published manifests carried an exact-version requirement. When a consumer installed `@aihu/signals@0.1.1` at the top level, the package manager satisfied arbor's `0.1.0` pin by installing a second nested copy at `node_modules/@aihu/arbor/node_modules/@aihu/signals`.

  `@aihu/signals` keeps its `currentObserver` tracker in a module-scoped `let`. Two copies of the module → two trackers. arbor's effect set copy-A's tracker; user-code signal getters read copy-B's tracker (always `null`); `linkAdd` was skipped; no subscription was created; signal writes propagated to nothing. The user-visible symptom was `$if` (and any compiler-emitted `when([() => sig()], ...)`) rendering once and never re-evaluating.

  `workspace:^` rewrites to `^x.y.z` at pack time, so the published manifests now carry a range — consumers' hoisted copy satisfies it, the duplicate nested install goes away, and the single module instance keeps a single `currentObserver`.

  Adds a CI lint gate (`bun run lint:dep-pins`) that walks every published `@aihu/*` and `@aihu-plugin/*` package manifest and fails the build if any inter-package dependency is declared as an exact pin (bare semver) rather than a range. Prevents regression of this policy across the workspace.

- Updated dependencies [[`84352bc`](https://github.com/fellwork/aihu/commit/84352bcb901b7213d67727648545b41652b2092a)]:
  - @aihu/arbor@0.1.5

## 0.1.6

### Patch Changes

- [#220](https://github.com/fellwork/aihu/pull/220) [`a4b62f2`](https://github.com/fellwork/aihu/commit/a4b62f2229f43cdb30d117a5d33cb1702153446b) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Fix reactive `$prop` bindings being silently dropped when applied to a custom
  element before it connects to the DOM. Arbor's `_materialize` applies reactive
  prop bindings via `el.prop = v` the instant the element is created — before it
  is appended/connected. At that point the per-instance prop-signal map
  (`PROPS_SYM`) is still `null` (it is built in `_build()` from
  `connectedCallback`), so the prototype prop setter's `this[PROPS_SYM]?.[name]?.set(v)`
  no-opped and the write was lost. `_build()` then seeded the signal from
  `getAttribute` (never set, since the property path was taken) and the prop
  reverted to its declared default. For static content whose source signal never
  re-fires after mount, the bound value never arrived.

  The prop setter now buffers pre-connect writes per prop (raw value, any type —
  no stringification), and `_build()` drains the buffer, letting a buffered value
  take precedence over the attribute/default fallback when seeding the signal.
  Objects, functions, and arrays survive intact. Attribute-declared props,
  post-mount signal updates, and the default fallback are all preserved.

  The buffering map adds ~47 B gz to `@aihu/runtime`, which sat at +47 B headroom
  against its 3400 B gate (i.e. the fix lands at exactly the limit). The
  `@aihu/runtime` size-limit row is bumped 3400 B → 3450 B to restore a small
  headroom margin (now +50 B per `bun run size`) rather than ship at the
  zero-margin boundary — consistent with the README policy of bumping a row's
  limit for a justified footprint increase.

## 0.1.5

### Patch Changes

- [#196](https://github.com/fellwork/aihu/pull/196) [`faca280`](https://github.com/fellwork/aihu/commit/faca2804cf62c05ffc90ef867faa2058b5e267ad) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Surface component `setup()`/render throws instead of silently leaving an empty
  shadow root. `connectedCallback` now `console.error`s with the offending
  component tag (`[aihu] setup failed for <tag>:`) and re-throws, so a failing
  setup produces an attributable error rather than a blank component with no
  console signal. The `SCR-R0002`/`SCR-R0003` invariant throws still propagate;
  the hydration path is unchanged. Fixes upstream Bug 6.

## 0.1.4

### Patch Changes

- Updated dependencies [[`70fdad2`](https://github.com/fellwork/aihu/commit/70fdad254bedab492e3b46b131564605d4665537)]:
  - @aihu/arbor@0.1.4

## 0.1.3

### Patch Changes

- Updated dependencies []:
  - @aihu/arbor@0.1.3
