---
"@aihu/runtime": patch
---

Fix reactive `$prop` bindings being silently dropped when applied to a custom
element before it connects to the DOM. Arbor's `_materialize` applies reactive
prop bindings via `el.prop = v` the instant the element is created — before it
is appended/connected. At that point the per-instance prop-signal map
(`PROPS_SYM`) is still `null` (it is built in `_build()` from
`connectedCallback`), so the prototype prop setter's `this[PROPS_SYM]?.[name]?.set(v)`
no-opped and the write was lost. `_build()` then seeded the signal from
`getAttribute` (never set, since the property path was taken) and the prop
reverted to its declared default. For static content whose source signal never
re-fires after mount, the bound value never arrived.

The prop setter now buffers pre-connect writes per prop (raw value, any type —
no stringification), and `_build()` drains the buffer, letting a buffered value
take precedence over the attribute/default fallback when seeding the signal.
Objects, functions, and arrays survive intact. Attribute-declared props,
post-mount signal updates, and the default fallback are all preserved.

The buffering map adds ~47 B gz to `@aihu/runtime`, which sat at +47 B headroom
against its 3400 B gate (i.e. the fix lands at exactly the limit). The
`@aihu/runtime` size-limit row is bumped 3400 B → 3450 B to restore a small
headroom margin (now +50 B per `bun run size`) rather than ship at the
zero-margin boundary — consistent with the README policy of bumping a row's
limit for a justified footprint increase.
