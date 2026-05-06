# @aihu/compiler

## 0.1.6

### Patch Changes

- [#113](https://github.com/fellwork/aihu/pull/113) [`0c2aa00`](https://github.com/fellwork/aihu/commit/0c2aa005967f7d04dcd0636186b499313eb51f12) Thanks [@srmcguirt](https://github.com/srmcguirt)! - `$if` and `$each` template directives are now reactive — UI updates when the
  condition or list mutates after mount.

  Previously, `$if={loading}` compiled to `createIfBoundary(loading, () => ...)`
  where the helper was a plain ternary `cond ? b() : empty`. The condition
  was evaluated **once at component mount time** and snapshotted into the
  DOM tree. When state mutated later (`loading = false`), the UI never
  re-rendered. Same shape for `$each` against plain class-property arrays
  (authored signals via `signal()` already worked through arbor's `each()`).

  Fix:

  - Both inlined helpers now return arbor structural nodes
    (`{ kind: 'structural', structuralKind: 'conditional' | 'list', ... }`)
    whose `condition`/`list` field is a thunk array `[() => expr]`. The
    arbor reconciler sets up an effect that swaps / re-keys the rendered
    subtree whenever the tracked expression changes.
  - The compiler's emit pass for `$if` and the non-signal `$each` fallback
    now wraps the expression in `[() => (expr)]` to match the thunk-array
    shape arbor's `_reconcileWhen` / `_reconcileEach` expect.

  Surfaced by mail dogfooding: `inbox.fellwork.com/inbox` showed
  `Loading…` indefinitely after a successful Supabase fetch resolved with
  zero rows — the `loading=true` snapshot stayed visible because
  `$if={loading}` never re-evaluated.

  This is the matching template-directive fix to R2 Defect B (reactive
  attribute bindings). Together they make all template-side reactivity
  honor state mutations from action / lifecycle / effect bodies.

## 0.1.5

### Patch Changes

- [#111](https://github.com/fellwork/aihu/pull/111) [`c1fa2c7`](https://github.com/fellwork/aihu/commit/c1fa2c7a937bf7186a64dd15661a4f9fbd08ed18) Thanks [@srmcguirt](https://github.com/srmcguirt)! - `$prop` collection-form now emits primitive-type-aware attribute reads.
  Previously, every `$prop: { name: { type: T } }` declaration unconditionally
  wrapped the attribute value in `JSON.parse(... ?? '{}')`. For string-typed
  props sourced from route parameters (router stamps `<el id="abc-123">`), the
  raw attribute value is not valid JSON, so the `try { JSON.parse } catch`
  fell through to `{}` — the prop bound to an empty object instead of the
  intended string. Subsequent reads (`$effect.on(id) { eq('id', id) }`) then
  queried with `[object Object]` instead of the route id.

  New emission per declared type:

  - `type: string` ⇒ `getAttribute(name) ?? ''`
  - `type: number` ⇒ `Number(getAttribute(name) ?? 0)`
  - `type: boolean` ⇒ attribute presence + non-`'false'`
  - complex types (objects, arrays, custom types) ⇒ existing `JSON.parse(...)`
    with `{}` fallback (unchanged)

  Surfaced by mail's `/contact/:id` and `/thread/:id` routes after the A4
  flat-per-attribute router protocol replaced the legacy JSON `route`
  attribute. Mail also migrated authoring from `$prop route: { params: ... }`
  to `$prop id: { type: string }` to match the new contract.

## 0.1.4

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

## 0.1.3

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
