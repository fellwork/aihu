---
"@aihu/compiler": minor
"@aihu/router": minor
"@aihu/app": minor
---

Runtime layout rendering + dynamic layout switching.

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
