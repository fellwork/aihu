# @aihu/compiler

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
