---
'@aihu/compiler': patch
---

`$prop` collection-form now emits primitive-type-aware attribute reads.
Previously, every `$prop: { name: { type: T } }` declaration unconditionally
wrapped the attribute value in `JSON.parse(... ?? '{}')`. For string-typed
props sourced from route parameters (router stamps `<el id="abc-123">`), the
raw attribute value is not valid JSON, so the `try { JSON.parse } catch`
fell through to `{}` — the prop bound to an empty object instead of the
intended string. Subsequent reads (`$effect.on(id) { eq('id', id) }`) then
queried with `[object Object]` instead of the route id.

New emission per declared type:

- `type: string` ⇒ `getAttribute(name) ?? ''`
- `type: number` ⇒ `Number(getAttribute(name) ?? 0)`
- `type: boolean` ⇒ attribute presence + non-`'false'`
- complex types (objects, arrays, custom types) ⇒ existing `JSON.parse(...)`
  with `{}` fallback (unchanged)

Surfaced by mail's `/contact/:id` and `/thread/:id` routes after the A4
flat-per-attribute router protocol replaced the legacy JSON `route`
attribute. Mail also migrated authoring from `$prop route: { params: ... }`
to `$prop id: { type: string }` to match the new contract.
