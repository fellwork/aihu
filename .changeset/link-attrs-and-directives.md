---
"@aihu/compiler": patch
---

Fix `<$link>` dropping everything except `href`. The `<$link>` codegen path
forwarded only `href`/`prefetch`/`replace` and never ran the generic
attribute/directive lowering, so:

- `class`, `$class`, `id`, `aria-*`, and `$on.click` were silently dropped from
  the rendered `<a>` — and because a handler's only references lived in the
  dropped `$on.click`, the "unused" import then got pruned;
- structural directives (`$each`, `$if`, `$key`) on a `<$link>` were dropped
  entirely — `$each` left a dangling loop variable (`ReferenceError: b is not
  defined`).

`<$link>` now forwards the author's attributes onto the `<a>` and composes
structural directives like a plain element. Its click handler also guards on
`useRouter()`: with no reactive `<$router>` context (e.g. a `createApp` SPA) it
no longer hard-`location.assign`s — it defers to `@aihu/app`'s document-level
link delegation, so in-layout `<$link>` navigation stays client-side.
