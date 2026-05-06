# Topic Summary — aihu template-syntax — userland-dx track

**Last updated:** 2026-05-06
**Active rounds:** 5 (research/governance; 0 Builder ↔ Verifier iterations)
**Status:** AUDIT RECONCILED + R5/R6/R7 user-pulled into v0.3 ship; awaiting user gate before Builder dispatch
**Tags:** `topic:aihu-template-syntax track:userland-dx round:5 supersedes:264831801`

---

## Round 4 + Round 5 user-directed scope adjustments

After round-3 audit reconciliation landed, the user directed two scope expansions in quick succession: **r4 pulled D2 ($aria + auto-keyboard-promotion) → R5 and D3 ($controller collection) → R6** into RATIFY-now status (Director r4, `.team/director-notes/template-syntax-004.md`, AGENTS.delta.db record id 2048522989). **r5 pulled D4 ($context collection, WICG-Context-aligned) → R7** (Director r5, `.team/director-notes/template-syntax-005.md`, AGENTS.delta.db record id 4012772269). Manifest now **7 RATIFY-now / 3 DEFER-v0.4 / 8 DEFER-v0.5+ / 1 REJECT**. Codemod budget unchanged at 560 LOC; compiler/runtime grows ~270-390 LOC over r3's projection. Builder seam plan = 5 rounds (Option A: R7 folded into B5 alongside R6) — at iteration ceiling, but compatible.

The three pulls form a coherent sugar-additions-via-`@state`-v2-collection-form bundle: each is a new collection-form macro alongside `$prop`/`$computed`/`$action`/`$resource`/`$effect`/`$lifecycle`/`$event`; each lowers to a well-understood platform mechanism (ElementInternals for $aria; per-instance registry + lifecycle hooks for $controller; WICG Context Protocol for $context); each lands additively with zero codemod cost.

---

## Round 3 audit reconciliation (most recent)

**Headline finding from round-3 audit: aihu IS already Web-Components-native.**

Two parallel auditors (platform-integration + cross-cutting) confirmed the compiler emits `customElements.define()` per SFC with default-open Shadow DOM and Constructable Stylesheets (`emit.rs:858-861`, `define-element.ts:75-87`, `emit.rs:32-77`). **16 of 38 audited template constructs are already-integrated** with platform primitives; 6 are integrable-with-rework; 13 are genuinely-extrapolating (signals/control-flow/boundaries have no platform equivalent); 3 are platform-is-worse. Stronger native-platform alignment than Vue or Svelte; closest to Lit. Variant B preserves cleanly.

**Manifest counts (Director r3 §3, revised by r4 + r5):** 7 RATIFY-now / 3 DEFER-v0.4 / 8 DEFER-v0.5+ / 1 REJECT.

- **RATIFY-now (7):** R1 `$prop` reactivity fix (CORRECTNESS bug — props read once at mount via `JSON.parse(getAttribute)` `emit.rs:660-662`; fix adds optional `attribute`/`reflect`/`converter` keys); R2 `$lifecycle` four-callback extension (`mount`/`dispose`/`adopt?`/`attributeChange?`); R3 `$show` switch from `--show` custom property to `hidden` HTML attribute; R4 `$bind` write-side wiring verification (Builder verifies; +30 LOC if absent); R5 `$aria` collection + auto-keyboard-promotion (highest-leverage marketing — no framework has shipped; r4 pull-in); R6 `$controller` collection (Lit-Reactive-Controller via collection-form unification; r4 pull-in); R7 `$context` collection (WICG-Context-aligned tree-scoped DI; r5 pull-in).
- **DEFER v0.4 (3):** D1 DSD in SSR (best-in-class WC SSR; user's Vite-elimination interest connects); D5 `$form` collection (form-associated custom elements; shares `attachInternals()` cache with R5 — work reduction in v0.4); D6 `defineAihuSanitizer` factory + TT chokepoint + LSP (Volar-shaped — largest DX gap).
- **DEFER v0.5+ (8):** L1 shared `adoptedStyleSheets` aggregation; L2 CSS `@layer aihu-component`; L3 event modifiers `.once`/`.passive`/`.signal`; L4 build-time a11y lint pass; L5 community DevTools panel; L6 runtime plugin contract; L7 `BuildHost` abstraction (Vite-decoupling); L8 `$reactive.motion`.
- **REJECT (1):** X1 Customized built-ins (`<button is="my-btn">`) — Safari refused since 2018; autonomous + `ElementInternals` covers without polyfill.

**Master audit doc:** `docs/superpowers/specs/2026-05-06-spec-template-syntax-v2-platform-audit.md` (consolidated; companion to the Variant B spec). Patched per r4 + r5 director-notes.

**Codemod budget unchanged at 560 LOC.** All RATIFY-now amendments are additive (no userland `.aihu` source changes). Compiler/runtime adds ~270-390 LOC across R1-R7. Still well within scope when split across B1-B5 Builder seams.

**Two clear advantages over Vue worth marketing:**
- Zero dynamic-code-execution paths in production source. Vue's runtime template compiler requires `unsafe-eval` unless AOT-precompiled; aihu compiles ahead-of-time, period. CSP-friendly by default.
- Collection-form unification across `@state` v2 (`$prop`/`$computed`/`$action`/`$resource`/`$effect`/`$lifecycle`/`$event` + now `$aria`/`$controller`/`$context`). Vue's six separate macros (defineProps/Emits/Expose/Slots/Model/Options) can't match. Each new collection extends the same shape with zero new conceptual cost.

**User-surface block (paste verbatim, Director r5 §7):**

> **Round-5 update on aihu template-syntax v2: `$context` pulled into the v0.3 ship per your direction.**
>
> Updated manifest: **7 RATIFY-now / 3 DEFER-v0.4 / 8 DEFER-v0.5+ / 1 REJECT.** The seven round-3 amendments now include `$context` (provide/consume) — WICG-Context-Protocol-aligned tree-scoped DI, the Vue/Solid-shaped data-flow gap closer that walks across Shadow DOM boundaries via `composedPath()`-style event propagation. This means an aihu consumer reads from a Lit provider (and vice versa) with zero shim — load-bearing for the Web-Components-native marketing story.
>
> **Spec-section text drafted** at `.team/director-notes/template-syntax-005.md` §2 (R7: `$context`). The section covers provider/consumer surface (collection-form, wrapped consumer entries canonical), tree-scoped lookup semantics, WICG Context Protocol alignment (we ship our own implementation, not a `@lit/context` runtime dep), compile-time type-safety via the `.aihu.ts` sidecar's `AihuContextRegistry` aggregation, lifecycle/reconnection edge cases (microtask-deferred dispatch handles consumer-mounts-before-provider), IS-NOT-IN scope, and Builder acceptance criteria including a Lit-interop test.
>
> **Three remaining v0.4 deferrals:** DSD-in-SSR (D1, the Vite-elimination connection), `$form` (D5, pairs with `$aria` via shared `attachInternals()`), LSP (D6, single largest devex gap). Confirm these stay deferred, or call them out individually for a r6 pull-in.
>
> **Codemod budget unchanged at 560 LOC.** Compiler/runtime grows to ~270-390 LOC additions across all seven RATIFY-now items. All additive — existing `.aihu` files keep working.
>
> **Builder seam plan: 5 rounds (Option A — R7 folded into B5 alongside R6).** B1: $prop reactivity fix (canonical first). B2: $lifecycle/$show/$bind small additive. B3: Variant B template syntax + codemod (largest round). B4: $aria + auto-keyboard. B5: $controller + $context (combined collection round, ~520-630 LOC src+tests; B5a/B5b split named as fallback if WICG interop test goes flaky). At 5-round iteration ceiling.
>
> **Synthesizer doc + topic_summary still stale on three rows** — Team Lead patches per r5 §6 post-this-round.
>
> **Go/no-go:** "Ratify the 7 round-3 amendments (R1-R7), accept the 5-round Builder seam plan with R7 folded into B5 alongside `$controller`, and dispatch B1 (`$prop` reactivity fix) — yes/no?"
>
> **Optional clause:** if you want to pull D5 (`$form`) or D1 (DSD-in-SSR) too, say so and I'll re-cut. Otherwise these stay v0.4.

**Top 5 strong-signal proposals (ordered by Director r3 §4):** R1 `$prop` reactivity fix → R5 `$aria` + auto-keyboard (was D2) → R6 `$controller` (was D3) → R7 `$context` (was D4) → D1 DSD in SSR.

---

## Current understanding

The userland `@template` surface diverged from `@state` v2 because macro-vocabulary-v2 (2026-05-05) harmonized the `@state`/`@agent` side onto an object-literal collection-form with bare/wrapped duality but did not touch `@template`. The result is a felt asymmetry the user reported on `CalendarGrid.aihu` (`c:\git\fellwork\mail\src\components\CalendarGrid.aihu`): `$each="weekDays as day"` (quoted mini-grammar) sitting next to `$key={day.toISOString()}` (curly expression) on the same element; long inline class ternaries (`class={'month-cell' + (cond ? ' other-month' : '')}`); and raw `this.dispatchEvent(new CustomEvent('dayjump', ...))` because no `$emit`-equivalent exists (Scout `D3e` confirmed zero hits across all production source). 62 in-aihu-repo `.aihu` files plus 1 cross-repo reference are in scope; ~166 directive sites total (Scout `D5.2`).

The chosen direction is **Variant B — block-tag control flow** per Director r2 reconciliation (`director_note` id 2273508187). Block tags `{#if cond}…{:else if cond}…{:else}…{/if}` and `{#each items as item, i (key)}…{:empty}…{/for}` replace the `$if`/`$each`/`$key` attribute trio; binding directives stay attribute-form with the colon→dot rename (`$on.click`, `$bind.value`); `$html` becomes `{@html expr}` (Svelte-style call-site warning sigil). Architect r1 spec at `c:\git\fellwork\aihu\docs\superpowers\specs\2026-05-06-spec-template-syntax-v2.md` (PROPOSED, 540 lines) formally evaluated three variants — A (harmonize-and-stay), B (block-tag), C (structural component) — and recommended A on a smallest-delta criterion; Prober (`prober_report` id 3373363951) recommended B on cold-read intelligibility, LLM-precedent density, and structural decomposition. Director sided with Prober: B is the only variant where directive-count-per-file shrinks (folds three v1 directives into one block-tag); user non-negotiables (agentic-minded, human-formatted) tilt to B; Variant A merely renames the asymmetry from quoted-vs-curly to two-curly-attributes (Prober §5); Variant C is off the table without a render-prop rescue for its `as="..."` string-attribute regression (Architect §3.C, Prober §3.2 E-C-1).

Compiler/runtime constraints are settled. The VDOM-free fine-grained reactivity model is preserved across all variants — `parser → Attr::Binding → codegen tuple → runtime _applyAttrs → mountEffect + setAttribute` (Scout `D2`); `<$suspense>`/`<$shield>`/`<$guard>` boundary primitives are explicit non-goals (spec §8, §10). The security floor is cleaner than initially feared: Scout `D3c` confirmed zero string-to-code paths across all production aihu packages — the only DOM-injection vector is `$html`, preserved across variants behind a renamed call site. `$ref` is silently dropped by codegen today (`emit.rs:2088` `_ => {}` default arm; 7 in-repo files affected) and is fixed this round via a `"ref"` arm + C500 exhaustiveness error (Architect §3.A.3, §11.h). The codemod budget is anchored on Prober's 12 hand-transformations: **560 LOC**, error code **C500**, target path `packages/compiler/js/codemods/template-syntax/migrate.ts` (note `js/` per Prober's correction of Scout's miss). The macro-simplification codemod precedent at `packages/compiler/js/codemods/macro-simplification/migrate.ts` is 1720 LOC, not the "≤300 LOC" Scout originally implied — Prober reset the anchor and Director r2 ratified 560 as the mid-low estimate banking on scanner-primitive reuse (`matchBrace`, `matchParen`, `skipString`, `splitTopLevelEntries`).

---

## What changed in the most recent round

Round 2 produced a reconciled recommendation, a corrected codemod budget, and a fix-this-round disposition for a pre-existing codegen bug. No code moved.

- **Architect r1 spec landed** (`architecture_spec` id 76882731) — 540 lines under the 600-line ceiling, three named variants formally evaluated, recommended Variant A, defended on a "harmonizes-with-@state-v2" criterion.
- **Prober r1 report landed** (`prober_report` id 3373363951) — 12 hand-transformations across 4 files × 3 variants, complexity scores (A: 2/5 ~400–480 LOC; B: 4/5 ~560–660 LOC; C: 3/5 ~460–560 LOC), recommended Variant B on cold-read intelligibility plus the structural decomposition argument (only B shrinks directive-count-per-file).
- **Director r2 reconciled to Variant B** (`director_note` id 2273508187) on five grounds (r2 §2): user non-negotiables tilt to B; Variant A's `$for="...as ... (key)"` puts a parenthesized key inside a quoted mini-grammar — a stricter version of the user's complaint; Variant C is internally inconsistent (Typed 5/5 score contradicts the `as="..."` string-attribute regression); migration-cost gap is bounded (~150 LOC, ~1 Builder day); Angular's `*ngIf` → `@if` migration is a cautionary tale, not a model — pay once, on smaller userland.
- **Codemod budget reset 280 → 560 LOC.** Prober corrected Scout's `js/` subpath miss; the macro-simplification precedent is 1720 LOC at `packages/compiler/js/codemods/macro-simplification/migrate.ts`, not 0; the "≤300 LOC v2 budget" Architect cited was wishful (anchored on Scout's misread). Director r2 §3 ratified 560 (low end of Prober's 560–660 estimate).
- **`$ref` silent-drop closure folded into this round.** Pre-existing bug (Scout `D1.1`/`D1.4`); Architect chose fix this round (§3.A.3) — ~10 LOC codegen + ~20 LOC test. Builder fixes via the `"ref"` arm in `emit_macro_effects` plus a C500 exhaustiveness check that closes Scout Risk-7 (silent drop of unknown `$<name>` directives).
- **Sample-level finding to carry forward:** Variant B fixture (`CalendarGrid.variantB.aihu:53`) left `$on:click` in colon form, inconsistent with Architect spec §3.B.1 which specifies the `$on.click` dot-form. Real B = fixture + ~30 LOC of colon→dot rename pass that A also requires (cross-variant invariant per Prober §3.3 #1). Builder synthetic test must catch this. Same fixture used two `{#if}` blocks instead of `{:else if}`; Architect spec §3.B.1 specified the in-block sibling form; codemod correctness on `{:else if}` is unproven and must be exercised by a Builder synthetic acceptance test.

---

## Distance to product goal

**Have:** ratified problem statement; three-variant spec at 540 lines; reconciled recommendation (Variant B); feasibility data with hand-transformations on 4 files × 3 variants; codemod path (`packages/compiler/js/codemods/template-syntax/migrate.ts`) and budget (560 LOC); error code reservation (C500); `$emit` design integrated into `@state` v2 collection-form via a new `$event:` collection (typed payloads, `$emit.<name>(payload)` resolves at compile time, lowers to real `CustomEvent`); type-safety strategy (path (i) — generated `.aihu.ts` sidecar with `@state` in scope, `tsc --noEmit` over `**/*.aihu.ts` in CI, no tsserver plugin required to ship); security model (escape-by-default preserved via `setAttribute(key, String(value))`, identity sanitizer hook in `aihu.config.ts`, `$html` → `{@html}` call-site rename, zero string-to-code paths preserved across all variants).

**Blocking:** user gate (3 open questions + 1 go/no-go from Director r2 §5). Hard gate per Director r1 §7 reconfirmed in r2 §8: Builder dispatch is blocked until the user approves direction.

**Next:** post-user-approval, Builder dispatch in 1–2 sub-rounds per Director r2 timeline. Architect §11 acceptance criteria (a–i) are all runnable; Builder map by Architect §11 + Prober §6 LOC table closes the per-variant codemod sketch gap (Architect only fully sketched A; B/C said "would extend"). If the user balks at B and picks A, drop budget to 430 LOC for a single Builder round. If user picks C, a third research round is required (render-prop spike before any Builder). If user gives a non-binary answer ("A now, B in v0.4"), Director writes a round-3 director-note before any Builder — two-codemod-passes is a real cost not to bake in by assumption.

---

## Open questions

- **Sanitizer default for `{@html}`:** identity (no-op) — userland opts in by writing `aihu.config.ts` `templates.htmlSanitizer`. Default proposed by Director r2 §5 (alt: bundle DOMPurify, +25KB). User can override.
- **Codemod CLI surface:** `aihu codemod template-syntax <glob>` subcommand. Default Director r2 §5 (alt: standalone `npx @aihu/codemods/template-syntax <glob>`).
- **`aihu.tmLanguage.json` regex update timing:** ride this PR. Default Director r2 §5 — Scout `D6.2` nested-brace tokenizer bug is a current pain point; landing it in the same PR closes a tooling friction the user already feels.
- **Variant B's `{:else if}` vs `{#else if}`:** Architect spec §3.B.1 proposed the in-block sibling form `{:else if}`; user-surface deferred to Builder round (low-stakes detail; Prober fixture didn't exercise it).
- **Whether to fix existing `$bind:` curly-form spec drift** (Scout `D1.1`: parser accepts but spec §3.2 forbids): codemod must decide accept-or-fix. Default is **fix** for spec hygiene — Variant B/C tighten and re-quote; codemod errors C501 on non-identifier curly content (Prober §2.4 R6).
- **Re-cut threshold check:** Director r1 §7 strict reading of the trigger says re-cut (Variant B triggers 3 of 4 categories: sigil change, value-form change, structural-element addition; runtime change is non-goal). Director r2 §3 overrode because the spec at 540 lines is under the 600-line ceiling and the user-gate is the binding constraint. Flagged for retro if the Builder phase grows beyond the 560 LOC envelope.

---

## Resume protocol pointer

Any future session reads this summary as the topic snapshot, then reads:

1. **Director r2 note** at `c:\git\fellwork\aihu\.team\director-notes\template-syntax-002.md` — the latest reconciliation (`director_note` id 2273508187).
2. **Architect spec** at `c:\git\fellwork\aihu\docs\superpowers\specs\2026-05-06-spec-template-syntax-v2.md` — the PROPOSED v2 spec doc (`architecture_spec` id 76882731).
3. **AGENTS.db records:** search `agents_search --kind topic_summary --query "aihu template syntax" --limit 1` for the latest summary; cross-reference the four ratified records (Architect spec 76882731, Prober report 3373363951, Director r2 note 2273508187, user-answers dispatch_record 1824268415).

If the user has already answered the go/no-go, the next move is **Builder dispatch** in two sub-rounds (B1 — codemod scaffolding + Variant B compiler arms + `$ref` codegen; B2 — sidecar TS sidecar emission + acceptance criteria a–i runnable). All Architect §11 acceptance criteria are runnable; Builder must cite Prober §6 LOC table to close the per-variant codemod sketch gap (Architect §9 only fully sketched A).

Aihu repo's local `AGENTS.db` is still not registered with this MCP — disk mirrors at `c:\git\fellwork\aihu\.team\` and `c:\git\fellwork\aihu\docs\topic-summaries\` are authoritative for the aihu repo until that DB comes online. All AGENTS.db writes from this round went to the api-repo's delta layer (`AGENTS.delta.db` at the api workspace root), which is what the MCP currently exposes.
