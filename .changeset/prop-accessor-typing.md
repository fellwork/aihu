---
"@aihu/compiler": patch
---

Type-check surface: type a `$prop` binding as a Signal accessor (`() => T`), not a
plain value.

At runtime `ctx.props.<name>` is a `Signal`, read via the getter call
(`props.title()`), so a template reads a prop as `language()`. The sidecar typed
the binding as a plain `T`, which made every such call a `TS2349` "not callable".
This also correctly flags the inverse — a prop read *without* a call
(`route.data`) — as the bug it is.
