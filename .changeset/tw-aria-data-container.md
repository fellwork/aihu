---
"@aihu/css-engine": minor
---

Add aria-_/data-_ attribute variants and container-query support.

- `aria-checked:`, `aria-disabled:`, `aria-expanded:`, `aria-selected:`,
  `aria-pressed:` and the arbitrary `aria-[name=value]:` form compile to an
  attribute selector appended to the class (`[aria-expanded="true"]`).
- `data-[state=open]:` (arbitrary `name=value`) and bare `data-active:`
  (presence) compile to `[data-state="open"]` / `[data-active]`.
- `@container` (and named `@container/<name>`) mark a query container
  (`container-type: inline-size`); the `@sm:`/`@md:`/`@lg:`/`@xl:`/`@2xl:`
  container-query variants wrap the rule in an `@container (min-width: …)`
  at-rule on Tailwind's container-query scale.
