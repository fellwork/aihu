---
'@aihu/server': minor
'@aihu/app': patch
'@aihu/compiler': patch
---

First batch of SSR child-rendering review follow-ups.

A component reference cycle now WARNS instead of failing the build. The hard
failure rejected ordinary recursive shapes — trees, nested menus, comment
threads — because the tag set is derived from reference sites and cannot see a
guard, and its stated justification (that a cycle would ship 32 nested copies)
stopped being true once the renderer gained a depth cap and an output budget.
`ChildCycleError` is replaced by a reported `ChildCycle`.

Component discovery no longer follows symlinks out of the components directory
(`readdir({recursive:true})` follows them under bun and not under Node, and
every match is compiled and evaluated at build time), and no longer flattens
nested paths when `parentPath` is absent.

New build diagnostics for the silent-empty-render cases: a referenced tag the
registry cannot supply, and a module exporting no `__aihu_tag__`.

Prerender content is spliced with the function form of `String.replace`, so
`` $` ``/`$&`/`$'` in page prose no longer re-splices the layout shell.
