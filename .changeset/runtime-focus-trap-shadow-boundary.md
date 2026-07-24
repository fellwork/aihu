---
"@aihu/runtime": patch
---

Fix `<focusTrap>` (the compiler-level a11y primitive backing `createFocusTrap`
in `packages/runtime/src/a11y.ts`) so it actually wires up when it renders
inside a shadow root.

Two `document`-global assumptions silently broke it there:

- The trap located its own container via plain `document.querySelector`,
  which never descends into shadow roots — so a `<focusTrap>` rendered inside
  any component with `shadowMode: 'shadow'` was never found, and trapping
  simply never activated.
- Even once the container is found, the Tab-cycling handler compared the
  current focus against plain `document.activeElement`, which stops at the
  outermost shadow host rather than drilling in to the actually-focused leaf
  — so the "is focus at the first/last focusable" check always failed for
  focus living inside that shadow root, and Tab silently escaped the trap.

Both are fixed in place with small local shadow-crossing helpers
(`_deepQuerySelector` / `_deepActiveElement`) rather than by taking on a new
`@aihu/runtime` -> `@aihu/primitives` dependency: `@aihu/primitives` has no
existing dependency edge to/from `@aihu/runtime` (neither package currently
depends on the other), and the a11y primitives here are budgeted at ~800 B
total — `@aihu/primitives/composed-tree.ts`'s more general tabbable-detection
machinery needed for its own `createFocusTrap` would blow that budget on its
own, on top of `@aihu/runtime`'s whole-package 4500 B size-limit gate it is
already close to (4.29 kB / 4500 B after this fix). The two implementations
remain intentionally distinct:
`@aihu/primitives`' `createFocusTrap(container)` takes an already-resolved
container and exposes an imperative `activate()/deactivate()`; `@aihu/runtime`'s
`createFocusTrap(active, returnFocus, initialFocus, childFn)` is the
compiler-facing surface for the `<focusTrap>` SFC tag, which must render a
placeholder synchronously and resolve its own host asynchronously post-mount
(there is no synchronous DOM ref available from `@aihu/arbor`'s `branch()`).

Adds a regression test: a focus trap rendered inside an open shadow root now
correctly cycles Tab between its focusables.

**Follow-up fix (review pass):** making focus-lookup shadow-aware exposed a
second, narrower gap in the same handler: the boundary check for Shift+Tab
used `host.contains(t)`, and `Node.contains()` also never crosses shadow
boundaries. So once `t` (the deep active element) could legitimately resolve
to a leaf living inside a *nested* open shadow root — a shadow-mode leaf
component sitting inside the trap, exactly the composition these helpers'
own doc comments describe — `host.contains(t)` read that as "focus escaped
the host" on every keystroke and Shift+Tab yanked focus straight to `last`.
Replaced with `e.composedPath().includes(host)`, which reflects the true
composed ancestry (the keydown reached this `host`-level listener at all only
by bubbling, composed, up through those shadow boundaries). Added a
regression test that focuses a button inside a nested shadow leaf and
asserts Shift+Tab is left alone rather than forced to `last`.

This does not yet make `focusables()` itself shadow-aware — it still
enumerates via light-DOM-only `host.querySelectorAll`, so `first`/`last`
cannot resolve to a focusable that lives inside a nested shadow root, and
forward Tab can still walk past such a leaf uncaught. Filed as a follow-up
(full shadow-aware focusable enumeration) rather than folded in here: it
needs `@aihu/primitives/composed-tree.ts`-grade tabbable-walking machinery,
which does not fit this package's ~800 B a11y-primitive budget or its
whole-package 4500 B size-limit gate (4.30 kB / 4500 B after this change).
