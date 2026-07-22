---
'@aihu/compiler': patch
'@aihu/cli': patch
'@aihu/tsc': patch
---

Fix the codemod and sidecar defects surfaced by the v2 canary migration
(#502, #503, #504).

- `aihu migrate` (macro-simplification): consume a multi-line `import { … }`
  as a single statement so its members are no longer orphaned below the
  closing brace and single-line imports are no longer hoisted into the open
  brace (the import-scrambling defect).
- `aihu migrate --state` (state-wrapper): de-call prop reads (`name()` →
  `name`) after `$prop` → `prop()`, since `prop()` returns a value in the
  wrapper model rather than a callable signal.
- `aihu migrate --v2` (template-grammar): accept the dot spelling
  `$class.modifier` in addition to `$class:modifier`.
- Type-check sidecar: `__aihu_each` over an `any` iterable now types loop
  bindings as `any` instead of `unknown` (one conditional-typed generic with
  an IsAny guard).
- `aihu-tsc`: surface the first real compile error when a file cannot be
  compiled (a stale-compiler error immediately reveals a version mismatch),
  and document version-aligning `@aihu/tsc` with `@aihu/compiler`.
