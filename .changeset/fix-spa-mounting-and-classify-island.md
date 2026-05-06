---
'@aihu/app': patch
'@aihu/compiler': patch
---

Fix `RuntimeError: SCR-R0010 'no owner'` when `.aihu` route components use
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
