---
'@aihu/compiler': patch
'@aihu/server': patch
'@aihu/language-server': patch
---

Retire the `$server` macro and its `createServerCall` client RPC bridge.

The feature was half-wired and effectively broken: the compiler recognized
`$server` only as a substring and, on a `--target client` build, emitted a
`// [client build] $server macro reference elided` comment while leaving the
`$server.*` reference untouched in the output — no server artifact and no
`createServerCall` stub were ever generated, so any reference resolved to an
undefined identifier. The whole surface is removed rather than finished:

- `@aihu/server`: delete `createServerCall` (`src/client.ts`) and its barrel
  re-export.
- `@aihu/compiler`: drop the `$server` client-build elision branch from
  `codegen/emit.rs`. A stray `$server` is no longer special-cased — it passes
  through as an ordinary (undefined) identifier and surfaces as a normal
  type-check / runtime error, instead of a misleading "elided" comment.
- `@aihu/language-server`: remove the `$server` hover entry.
- Spec: Macro Vocabulary §2.12 marked **RETIRED** (no drop-in replacement).

Platform binary packages bumped 0.1.24 → 0.1.25 (Rust source changed).
