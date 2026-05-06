---
'@aihu/compiler': patch
---

`$each="items as item"` against an explicit signal now passes the signal
tuple `[items, setItems]` to arbor's `each()` (or `[items]` for computed
signals) instead of the bare getter.

**Why this matters:** arbor's `each()` expects a `Signal<T[]>` shape and
reads `items[0]()` inside the reconciler. Passing the bare getter function
made `items[0]` an undefined string-indexed access on a function value, then
`(items[0])()` threw `TypeError: t[0] is not a function` on every render
of a non-empty list — same shape as the R5c $if fix.

Same per-source dedup concern as before: arbor's published bundle minifies
internal property names (`structuralKind` → `sk`, etc.), so the compiler
delegates to arbor's exported `each()` rather than synthesizing the
structural node literal. The fix only changes the call-site argument to
match arbor's `Signal<T[]>` contract.

Surfaced by mail dogfooding: inbox crashed with `t[0] is not a function`
the moment a real mail row was returned (empty arrays didn't trip it
because the iterator never enters the body).
