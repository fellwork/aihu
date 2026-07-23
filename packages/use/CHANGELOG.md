# @aihu/use

## 0.2.0

### Minor Changes

- [#523](https://github.com/fellwork/aihu/pull/523) [`f80128f`](https://github.com/fellwork/aihu/commit/f80128f136beea220d455039121987c1120c246f) Thanks [@srmcguirt](https://github.com/srmcguirt)! - New package: `@aihu/use` — utility/sensor/state composables for aihu (the
  VueUse analog), built on `@aihu/signals` (signals + effect scope) as its sole
  dependency (effect-scope plan §5).

  This landing establishes the pattern for the curated ~25 set with the package
  scaffold, the shared substrate (`isClient`/`defaultWindow`/`defaultDocument`/
  `defaultNavigator`, `toValue` — no tuple detection, `unrefElement`,
  `tryOnScopeDispose`, `tryOnMounted`), and two reference composables, each its
  own subpath entry with its own size row:

  - `useEventListener(target, event, handler, options?) → stop()` — the
    foundational composable: manual `stop()` plus scope-owned auto-cleanup;
    getter targets rebind reactively via per-run effect cleanup; handler event
    types inferred from the DOM event maps for `Window`/`Document`/
    `HTMLElement` targets. Explicit `null` target means "nothing" — only an
    omitted target falls back to a default.
  - `useMouse(options?) → { x, y }` — the reference sensor: an object of named
    getters (the ratified return convention), batched per-mousemove updates.

  Conventions this package pins: composable returns are **objects of named
  getters read as `{x()}` in templates — parens required** (a bare `{x}`
  renders the getter's source text); and SSR-safety via the **`isClient` no-op
  invariant** — no composable creates a listener, effect, or timer when
  `isClient` is `false`, enforced by a table-driven SSR gate test that every
  future composable entry joins.

### Patch Changes

- Updated dependencies [[`18e5f6d`](https://github.com/fellwork/aihu/commit/18e5f6dda93772877690e88e8c217dcdcf4bddc2), [`ea8d2eb`](https://github.com/fellwork/aihu/commit/ea8d2ebb91c28132f399a708e2bd88877072d1db)]:
  - @aihu/signals@0.4.0
