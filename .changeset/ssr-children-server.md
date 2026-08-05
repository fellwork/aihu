---
'@aihu/server': minor
---

Render child components server-side via `SsrOptions.children`.

A component referenced inside another component's template rendered as an
empty shell. Supplying a pre-resolved `ReadonlyMap<tag, module>` now lets both
renderers fill it in — the compiled string renderer receives it on its opts and
the tree walker reads it here, and both hand it to the same `__aihu_schild`, so
a resolved child is serialized in exactly one place.

A Map rather than a callback because module loading is async while the compiled
fast path is synchronous; a per-render callback would have forced every page off
the fast path.

`children` joins `loader.ts`'s FFI fall-through guard for the same reason
`lightScopeId` is there — the napi `renderTree(treeJson, hydratable)` signature
has nowhere to put it, and without the guard the native path would silently
render every child empty while the TS paths filled them in.

Also deletes `_renderNode`, the sync tree walker. It has had no caller since
`ec24d411` and was not exported; successive waves kept updating it anyway.

Omitting `children` renders byte-identically to before.
