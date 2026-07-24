---
"@aihu/use": minor
"@aihu/compiler": patch
---

feat(use): namespace subpaths (`/math`, `/motion`, `/integrations`, `/router`) + Wave 0 gate infrastructure

`@aihu/use` becomes a namespace: the CORE surface (bare `@aihu/use` + its
per-composable subpaths) stays dependency-free (signals-only), while new
FAMILY subpaths may declare optional peer dependencies
(`peerDependenciesMeta.optional`), isolated per-composable entry so a
consumer who never imports a family never resolves its peers.

New family subpaths (additive, purely opt-in):

- `@aihu/use/math` — dep-free pure computed derivations (seeded by `useClamp`)
- `@aihu/use/motion` — reduced-motion/spring-style primitives (seeded by
  `useReducedMotion`)
- `@aihu/use/integrations` — third-party wrappers behind optional peers
  (seeded by `useJwt`, optional peer `jwt-decode`)
- `@aihu/use/router` — router composables behind optional peers on
  `@aihu/router` + `@aihu/context` (seeded by `useRouteParams`)

`packages/use/families.json` is the new single source of truth for family
shape (aggregate/autoImport/size budgets/peer map), enforced by:

- `scripts/dep-check.ts`'s `checkUseSubpathPurity` — walks each rolldown
  entry's reachable-file graph and proves CORE reaches `@aihu/signals` only
  (never a family file), and a family entry reaches only its own
  `families.json`-declared peers (never another family's files or an
  un-declared peer).
- `scripts/check-use-registry-parity.ts` — family-aware six-touch-point
  parity (barrel export, package.json exports key, rolldown input,
  `.size-limit.json` row, `USE_COMPOSABLES` tuple where `autoImport: true`,
  aggregate-barrel invariants).
- `scripts/gen-use.ts` — the scaffolder gains `--family` support, patching
  all of the above consistently for a new family member.

`packages/compiler/src/codegen/use_registry.rs`'s `USE_COMPOSABLES` registry
gains two auto-import entries for the `autoImport: true` family composables
(`useClamp` -> `@aihu/use/math/useClamp`, `useReducedMotion` ->
`@aihu/use/motion/useReducedMotion`), hence the compiler patch bump (and the
matching platform-binary version bump under `packages/compiler/npm/*`, per
`check:compiler-binary-bump`).
