---
'@aihu/compiler': minor
'@aihu/runtime': minor
'@aihu/server': minor
'@aihu/router': patch
---

Compile-time SSR string-template emit target (wave-3 keystone).

- `--target server` artifacts now additionally export `__ssrString(props,
  { hydratable })` — a compiled string renderer of straight-line
  concatenation with interpolated dynamic holes and static-subtree constant
  folding (Svelte/Solid-SSR style), byte-identical to the tree-walk renderer
  including the full hydration wire grammar (`data-aihu-path`,
  `<!--aihu:s:PATH-->` structural markers, `<!--|-->` text-leaf boundaries).
  Templates using constructs outside the lowerable set (suspense/shield/
  guard/warp/focusTrap/router-macro elements, duplicate attr keys) simply
  ship without the export and keep the walker.
- New `@aihu/runtime/ssr` subpath entry with the SSR string helpers
  (`__aihu_stext`, `__aihu_sattr`, …) mirroring the walker's escaping —
  server-only bytes on their own entry, so the client bundle size gate is
  untouched.
- `@aihu/server` renderToString/renderToStream take the string fast path when
  the component carries a compiled renderer (`AIHU_SSR_STRING=0` opts out);
  new `attachSsrString` carries the renderer across props-binding wrappers
  (used by the router's governed path).
- SSR walker fix: reactive attribute tuples/thunks now serialize their
  CURRENT VALUE (previously the getter's function source was printed into the
  attribute) and function-valued attrs (event handlers) never serialize.
- Compiler fixes surfaced by the differential gate: `show`/`class:`/`ref`/
  `html` effect IIFEs guard their `onMount` registration (host-less SSR and
  loop-item factories previously crashed with SCR-R0010 'no owner'), and an
  `each`+`empty` chain now emits the `createIfBoundary` helper it references.
