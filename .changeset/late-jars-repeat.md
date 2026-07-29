---
'@aihu/primitives': minor
'@aihu/runtime': minor
---

Dedupe the two focus-trap implementations onto one (FEL-397 / #537), and fix
the escape guard that could never fire.

`@aihu/runtime`'s `<focusTrap>` helper carried its own trap — private focusable
selector, its own shadow-aware DOM walk, its own Tab/Shift+Tab edge handling —
in parallel with `@aihu/primitives`' `createFocusTrap`. It is now a thin
reactive adapter: it locates the emitted host and maps the compiler's reactive
`active` flag onto `activate()` / `deactivate()`. `createFocusTrap(active,
returnFocus, initialFocus, childFn)` keeps its exact signature, so no compiler
change is needed.

This also fixes the asymmetric escape guard rather than papering over it. The
old code bound `keydown` to the trap host and tested
`!e.composedPath().includes(host)` — which can never be true, because a
`composedPath()` IS the event's propagation path and a listener only runs when
its own node is on that path. The guard was unreachable in both directions, so
merely adding the missing forward-Tab copy would have been a no-op. The shared
implementation binds `keydown` on `document` in the CAPTURE phase, where it
observes keydowns originating anywhere — so `composedContains(container,
current)` is a genuinely reachable "focus escaped the trap" state, symmetric
across Tab and Shift+Tab.

New in `@aihu/primitives`:

- `createFocusTrap(container, options?)` accepts `initialFocus` (a selector
  resolved across the COMPOSED subtree, so it reaches into open shadow roots)
  and `returnFocus` (opt out of restoring the previously-focused element).
  `FocusTrapOptions` is exported; the existing no-options call is unchanged.
- A dedicated `@aihu/primitives/focus-trap` subpath entry (1.31 kB gz), so
  consumers get the trap without pulling in the whole dialog primitive.
- A trap whose container is detached without `deactivate()` no longer hijacks
  Tab page-wide (nor reads `activeElement` off a detached root).
