# @aihu/tsc

## 0.2.3

### Patch Changes

- Updated dependencies [[`df40c34`](https://github.com/fellwork/aihu/commit/df40c34526e985ce656a6a5650ac1d83ebef3a80), [`b279f74`](https://github.com/fellwork/aihu/commit/b279f74b34cd4e901be1cfa5d70c212cf604dfc1), [`212e3e3`](https://github.com/fellwork/aihu/commit/212e3e38ae57de7e38c3211ef0223729ba1511e1), [`212e3e3`](https://github.com/fellwork/aihu/commit/212e3e38ae57de7e38c3211ef0223729ba1511e1), [`38652d5`](https://github.com/fellwork/aihu/commit/38652d544fd1001e42d505627de88976d69c1710)]:
  - @aihu/compiler@0.11.0

## 0.2.2

### Patch Changes

- Updated dependencies [[`6334637`](https://github.com/fellwork/aihu/commit/6334637c00e68dec8ba52c6633f229a79fae00a1)]:
  - @aihu/compiler@0.10.2

## 0.2.1

### Patch Changes

- Updated dependencies [[`d6c252f`](https://github.com/fellwork/aihu/commit/d6c252f0cc16ee494c303d83c6e4c19d60c5469a)]:
  - @aihu/compiler@0.10.1

## 0.2.0

### Minor Changes

- [#395](https://github.com/fellwork/aihu/pull/395) [`8127925`](https://github.com/fellwork/aihu/commit/8127925482725c8394c03298a27b91cbbfc59418) Thanks [@srmcguirt](https://github.com/srmcguirt)! - **`.aihu` files are now type-checked.** They were not before — at all.

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

### Patch Changes

- Updated dependencies [[`8127925`](https://github.com/fellwork/aihu/commit/8127925482725c8394c03298a27b91cbbfc59418), [`8127925`](https://github.com/fellwork/aihu/commit/8127925482725c8394c03298a27b91cbbfc59418), [`8127925`](https://github.com/fellwork/aihu/commit/8127925482725c8394c03298a27b91cbbfc59418), [`250dbbf`](https://github.com/fellwork/aihu/commit/250dbbf4024f77ddfe41cf9d04b14ad5266ccfee), [`8127925`](https://github.com/fellwork/aihu/commit/8127925482725c8394c03298a27b91cbbfc59418)]:
  - @aihu/compiler@0.10.0
