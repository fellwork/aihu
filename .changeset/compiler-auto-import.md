---
"@aihu/compiler": minor
---

feat(compiler): auto-import @aihu/use composables

When a `.aihu` `@state` block calls a bare `useMouse()` (or any known
`@aihu/use` composable) without importing it, the compiler now injects the
per-subpath `import { useMouse } from '@aihu/use/useMouse'` into the emitted JS
(and an ambient declaration into the `.aihu.ts` sidecar for type-check
coherence) — mirroring how it already provides the `@state` vocabulary, and
preserving per-composable tree-shaking (granular specifier, never the barrel).

Detection is guarded so it never fires for a name the author already imported
(any source), declared, or shadowed (`const`/`let`/`var`/`function`/`class`/
destructure) — one shared authority drives both the emit injection and the
sidecar declaration, so they can never disagree. Comments and string/template
literals are masked before scanning, so a name mentioned in a comment can't
inject a spurious import. Registry lives in `codegen/use_registry.rs`, kept in
sync with `packages/use/package.json` exports (grows with the composable set).
