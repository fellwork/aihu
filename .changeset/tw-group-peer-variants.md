---
"@aihu/css-engine": minor
---

Add Tailwind `group:` / `peer:` relational-element variants.

The engine now recognizes the bare `group` / `peer` marker classes plus the
`group-hover:`, `group-focus:`, `group-focus-visible:`, `group-active:`,
`group-disabled:`, `peer-hover:`, `peer-focus:`, `peer-focus-visible:`,
`peer-checked:`, and `peer-disabled:` variant prefixes. `group-*:` compiles to an
ancestor descendant selector (`.group:hover .group-hover\:bg-primary`) and
`peer-*:` to a previous-sibling selector (`.peer:checked ~ .peer-checked\:bg-primary`),
both scoped inside the component's shadow root. The bare `group` / `peer` classes
are emitted as no-op marker rules so they survive scanning and anchor the
relationship.
