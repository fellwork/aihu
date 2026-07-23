---
'@aihu/use': minor
---

New package: `@aihu/use` — utility/sensor/state composables for aihu (the
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
