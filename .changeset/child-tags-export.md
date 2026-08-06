---
'@aihu/compiler': patch
---

Export `__aihu_child_tags__` from server-target modules — every component tag
the template references, deduped and sorted.

This is what an SSG/SSR caller walks transitively to build
`SsrOptions.children`: load a module, read its child tags, load those, repeat —
and reject a cyclic graph before any render begins.

Derived from the emitted `__aihu_schild` call sites rather than recomputed from
the template, so the declared set is exactly the set the compiled renderer will
look up at runtime. Omitted entirely when a template references no component.
