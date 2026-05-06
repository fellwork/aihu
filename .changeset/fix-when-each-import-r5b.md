---
'@aihu/compiler': patch
---

`$if` and `$each` now import + delegate to arbor's exported `when()` and
`each()` instead of synthesizing the structural node literal directly.

**Why this matters:** the published `@aihu/arbor` bundle uses oxc-minify
with property-name mangling (`structuralKind` → `sk`, `condition` → `cn`,
`keyFn` → `kf`, `listGrow` → `lg`). The R5 first-pass fix synthesized the
node literally with full property names; the bundled reconciler then read
the mangled names off it, found `undefined`, and crashed with
`TypeError: Cannot read properties of null (reading '0')` inside `gs`
(the `_reconcileEach` shim) on first mount.

**Fix:** the compiler now adds `when` to the `@aihu/arbor` import list
when `$if` is present (and `each` when `$each` is present), and the
inlined boundary helpers delegate: `createIfBoundary = (cond, grow) =>
when(cond, grow)`. Because `when()`/`each()` ship in the same minified
bundle as the reconciler, the property names match by construction.

**Surfaced by:** mail dogfooding immediately after the R5 first-pass
ship — `/inbox` threw the gs/null crash on every load.
