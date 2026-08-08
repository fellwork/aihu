---
'@aihu/compiler': patch
---

Close 17 CodeQL `js/polynomial-redos` (CWE-1333) alerts in the compiler's Vite
plugin layer: a hostile `.aihu` file could make a build spend minutes inside a
regex instead of compiling.

**Why it was reachable.** Every flagged pattern in `js/index.ts` scans COMPILED
MODULE TEXT, and compiled module text carries authored `.aihu` bytes verbatim —
a template text node becomes `leaf('<text>')` (`codegen/template_emit.rs`) and
an `@style` body becomes ``__style__.replaceSync(`<css>`)`` (`codegen/emit.rs`).
So the subject string is controlled by whoever authors the SFC: an untrusted PR
in a monorepo with CI, or a template distributed to other developers. This is
not "our own generated output"; all 17 alerts sit downstream of user bytes.

**What the 17 alerts actually were.** Three ambiguity shapes, all polynomial
rather than exponential — the cost is re-scanning, not nested quantifiers:

- **A — named-import matchers (12 alerts, one duplicated pattern).**
  `import\s*\{[^}]*\}\s*from '@aihu/<pkg>'`, copied across `_buildHmrCode`,
  `_buildDeferredHydration`, `_buildStaticIsland` and `_injectAutoWiring` for
  the runtime/arbor/signals modules. `[^}]` does not exclude `{`, so each of the
  N `import{` offsets in the subject restarted a scan that ran to the END of the
  string before failing. Fixed by narrowing the class to `[^{}]`, which bounds
  each scan to the next brace. An ES import specifier list can never contain
  `{`, so nothing legitimate changes meaning.
- **B — literal prefix + lazy any-char scan (4 alerts, 3 distinct sites).**
  ``(__style__\.replaceSync\(`)[^]*?(`\);)``, the `createOutletBoundary` block
  matcher, and the `defineComponent({ … base:` probe. Repeating the prefix gives
  N start offsets, each running a fresh O(n) lazy scan. A regex cannot express
  "first prefix, then first terminator" without that re-scan, so these became
  literal `indexOf` scans (`_replaceDelimitedBody`, `_passivizeOutlet`,
  `_hasBaseRecipe`).
- **C — greedy `.*` between two literals (1 alert).**
  `/import.*from\s*'@aihu\/signals'/`, one start offset per `import` on the
  line. Anchored to a line start under `m`, which caps the offsets at one per
  line.

Two further whitespace pumps rode along in the strip-the-runtime-import matcher:
adjacent unbounded `\s*` runs (`\s*;?\s*$` can split a whitespace tail O(n) ways
when `$` never holds — rewritten as the exactly-equivalent `(?:\s*;)?\s*$`), and
`^\s*` under `m`, where `\s` matches `\n` so every line start could scan the
rest of the file — narrowed to `[^\S\r\n]*`, which is what "the import line"
means.

**Verification.** `packages/compiler/tests/regex-redos.test.ts` pins both
halves. Each shape's pump was timed against the ORIGINAL patterns first and
grows cleanly 4x per doubling — at 32k repetitions: 2.45 s (shape A runtime),
2.84 s (shape A signals), 4.73 s (shape A `import type`), 4.38 s (outlet block),
2.46 s (shape C), 0.83 s (the whitespace-tail pump). Every rewrite runs the same
input in under 1.5 ms, and the suite asserts a 250 ms budget through the
exported functions, not through copies of the patterns.

Behaviour preservation is a differential diff: every changed pattern is replayed
in its original form and compared match-for-match (index, span and captures)
against the shipped one over a corpus of real codegen output plus the awkward
edges — multi-line specifier lists, `import type`, aliases, empty lists, CRLF,
indentation, semicolons, repeated and decoy imports. The suite was mutation-
tested: reverting any one of the 16 rewritten sites individually makes it fail.

Three inputs deliberately change meaning, each unreachable from the codegen and
each pinned by a test: a `{` inside a specifier list (invalid JS) no longer
matches; blank lines *before* the runtime import are no longer deleted along
with it; and the any-signals probe now requires the import to own its line.

The first of those is also a latent correctness bug fixed. A `.aihu` author
writing the literal text `import {` compiles to `leaf('import {')`, and `[^}]`
ran straight through the string literal to the next `}` — hoovering
`')\nimport {  branch ` into the specifier list and rewriting the module into
`import { '), import {, branch, mount } from '@aihu/arbor'`, which is not valid
JS. `[^{}]` stops at the planted brace and matches the real import.
