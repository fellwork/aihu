---
'@aihu/compiler': patch
---

Fix a `js/polynomial-redos` (CWE-1333) alert in `_buildStaticIsland`'s
`TAIL_WITH_SHADOW_ONLY` regex, surfaced by a fresh CodeQL pass during a
full-diff release review — not one of the 17 alerts an earlier pass in this
same effort closed (that pass covered `_buildDeferredHydration`,
`_injectAutoWiring`, `_passivizeOutlet`, `_foldCssEngineStyles` and
`_foldSsrCssExport`; this regex predates it, introduced by the OXC strip-types
work, and was never in scope).

`_injectShadowMode`'s two-argument branch always emits the exact literal
`, { shadowMode: 'shadow' }` — one space at each junction, never a trailing
comma — but the matcher kept `\s*,?\s*` around the optional comma: two
adjacent `\s*` groups with only a zero-width `,?` between them. A long
whitespace run between `'shadow'` and a `}` that never arrives lets the
engine split that run across the pair in O(n) ways per position. Measured
before fixing: 333ms at 30,000 repetitions and climbing quadratically.

Rewritten to one `\s*` per junction, none of them adjacent to another —
matches the exact same real compiler output (verified against the existing
`static-island.test.ts`/`classify-island.test.ts` suites, both still green)
with no such ambiguity. New regression test in `regex-redos.test.ts`,
mutation-tested: reverting the fix reproduces 355ms against the 250ms budget.
