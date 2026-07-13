---
"@aihu/tsc": minor
"@aihu/compiler": minor
"@aihu/cli": patch
---

**`.aihu` files are now type-checked.** They were not before — at all.

The type-check sidecar declared every template-referenced binding as an `any`
parameter and never emitted the `@state` body, so TypeScript was handed a file
that could not disagree with the author about anything. A `const x: number =
'a string'` inside `@state`, or a typo'd property, passed `tsc --noEmit` clean.
The green check was over code TypeScript had never seen.

Two things change:

**`@aihu/compiler`** now inlines the `@state` body into the type-check surface, at
its real source lines. Bindings carry their true types instead of `any`, imports
resolve so call sites are checked, and a diagnostic inside `@state` cites the
`.aihu` line the author wrote it on. Only loop aliases remain `any` — `{#each xs
as m}` binds `m` in the template, so there is no declaration to borrow a type
from.

**`@aihu/tsc`** (new) provides `aihu-tsc`, which projects each `.aihu` into the
TypeScript program as a VIRTUAL file via Volar's `proxyCreateProgram`. No
`.aihu.ts` sidecar is written to disk any more: the Vite plugin no longer emits
them, and consumers can delete the ones they have and drop `*.aihu.ts` from
`.gitignore`.

**Migration.** Replace `tsc --noEmit` with `aihu-tsc` in your `typecheck` script
(`@aihu/cli` now scaffolds this for new projects). Plain `tsc` cannot see inside a
`.aihu` file, so it will keep reporting a clean pass over every SFC in your
project without having checked one.

Expect real diagnostics the first time you run it — this is code that has never
been type-checked. Implicit-`any` inside `.aihu` files is suppressed by default,
since no corpus has ever been annotated for it; `aihu-tsc --strict-templates`
turns it on.
