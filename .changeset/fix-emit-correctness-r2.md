---
'@aihu/compiler': patch
'@aihu/app': patch
---

Round 2 SPA emit-correctness fixes — three layered defects surfaced by
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
  `@state` blocks are now emitted *before* the action / effect / lifecycle
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
