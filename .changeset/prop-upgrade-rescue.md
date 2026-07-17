---
"@aihu/runtime": patch
---

Prop set before a custom element upgrades is no longer lost.

A `.aihu` component compiles to a custom element, and its prop accessors live on
the class prototype. If a prop is assigned to an element BEFORE its tag is
`define()`d — the lazy/async-import case, where a page renders a tag and binds it
before the component's chunk lands — there is no accessor yet, so the write lands
as an OWN property. When the element later upgrades, that own property SHADOWS the
prototype accessor forever: the setter never runs, the signal never sees the
value, and the prop silently reverts to its default.

The element constructor now performs the standard upgrade rescue — for each
declared prop, capture any shadowing own property, delete it, and re-assign
through the accessor, which buffers it for the pre-connect seed. This makes
route-scoped / lazily-imported components safe to render before their definition
loads.
