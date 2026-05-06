---
'@aihu/compiler': patch
---

`$if` and `$each` template directives are now reactive — UI updates when the
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
