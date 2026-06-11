---
"@aihu/server": patch
---

Fix SSR dropping text-leaf content. The pure-TS server renderer (the edge/workerd
path used by `renderToString`/`renderToStream`) read a nonexistent `text` field
on arbor leaves, so every text leaf serialized as an empty node while element
tags and attributes rendered fine. Arbor text leaves carry their content in
`value` (a static string or a `[read, write]` Signal tuple, per `@aihu/arbor`'s
leaf shape). The renderer now reads `value`, HTML-escapes text content, and
renders element leaves (`leafKind: 'element'`) as void/closed tags. The prior
SSR tests asserted the same `text` fiction, so they passed while real
`leaf('x')` rendered empty — fixtures are corrected to the real arbor shape with
added coverage (text value, escaping, Signal-tuple value, element leaf).
