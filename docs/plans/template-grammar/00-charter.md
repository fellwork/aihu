# Template Grammar — the prefix-less template (charter)

**Status:** ratified design (founder, 2026-07-21) — spec written, no implementation.
**Branch:** `docs/template-grammar-spec` off `origin/main@d5b3242f`.
**Normative document:** `40-spec.md` (this directory). This charter records why and what
was decided; the spec records exactly what builders implement.

## Why this exists

The v1 template surface accreted three parallel dialects for the same jobs: a Svelte-shaped
block DSL (`{#if}…{:else}…{/if}`, `{#each … as …}`), a `$`-prefixed attribute layer
(`$if=`, `$each=`, `$on.click=`, `$bind.value=`), and macro elements (`<$link>`, `<$slot>`,
`<$suspense>`). Every job has at least two spellings; some (`$each={list}` vs
`$each="items as item"` vs `{#each items as item}`) have three. The
advanced-js-template-expressions work (`docs/plans/advanced-js-template-expressions.md`)
showed the cost concretely: ~10 hand lexers each had to understand every spelling, and each
miss was a silent miscompile.

## The ratified design, in one sentence

**One rule: naked keywords + naked HTML attributes + naked framework vocabulary;
`{expr}` braces mean expression, quoted strings mean static; `$` retreats to `@state`
macros only.**

Ratified by the founder 2026-07-21. The spec transcribes this design into normative form —
it does not re-litigate it.

## Scope

- **In:** the full template grammar (control flow, attributes, framework vocabulary,
  elements, interpolation), the retirement of every old form as a compile error with
  `fix:` hints, the TS type-architecture plan (steps 1–5), the migration inventory,
  the SSR-independence invariant, and acceptance criteria.
- **Out (recorded as backlog in the spec, deliberately not specified):**
  `if={expr} as={x}` aliasing, attribute shorthand `{name}`, `{@const}`-style in-template
  locals, macro-body typechecking (TS step 6).

## Posture decisions carried into the spec

- **No deprecation period.** Every retired form becomes a compile error with a `fix:`
  hint (the C471 pattern) in the same wave. There are no external consumers; the
  migration inventory in the spec enumerates every internal occurrence.
- **The v0 `{{ident}}` double-brace form dies in the same wave** (it currently has zero
  corpus usage).
- **Grammar and SSR land independently.** Both grammars lower to the same arbor
  structural nodes; the SSR structural walk (branch `feat/ssr-structural-walk`, same
  base commit) consumes only that contract. See spec §7.

## Relationship to other efforts

- `docs/plans/advanced-js-template-expressions.md` — W1–W4 shipped the oxc expression
  layer this spec's type architecture builds on; step 1 of the spec flips its
  `--expr-parser` default.
- `docs/plans/governed-extractability/` — GX Phase 4 shipped the sidecar guard-threading
  (`SidecarExpr.guards`) that step 2 generalizes.
- `feat/ssr-structural-walk` — the other half of the independence invariant in spec §7.
