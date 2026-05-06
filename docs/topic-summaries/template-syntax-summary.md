# Topic Summary — aihu template-syntax — userland-dx track

**Last updated:** 2026-05-06
**Active rounds:** 7 (5 research/governance + 2 Builder ↔ Verifier iterations closed clean on R1 + R2-R4/Q3-Q4)
**Status:** B1 PASS 11/11 + B2 PASS 12/12 banked; iteration 2 of 5; B3 brief refined (largest round); auto-spine continues per user "go, auto mode" directive
**Tags:** `topic:aihu-template-syntax track:userland-dx round:7 supersedes:1021113227`

---

## Round 4 + Round 5 user-directed scope adjustments

After round-3 audit reconciliation landed, the user directed two scope expansions in quick succession: **r4 pulled D2 ($aria + auto-keyboard-promotion) → R5 and D3 ($controller collection) → R6** into RATIFY-now status (Director r4, `.team/director-notes/template-syntax-004.md`, AGENTS.delta.db record id 2048522989). **r5 pulled D4 ($context collection, WICG-Context-aligned) → R7** (Director r5, `.team/director-notes/template-syntax-005.md`, AGENTS.delta.db record id 4012772269). Manifest now **7 RATIFY-now / 3 DEFER-v0.4 / 8 DEFER-v0.5+ / 1 REJECT**. Codemod budget unchanged at 560 LOC; compiler/runtime grows ~270-390 LOC over r3's projection. Builder seam plan = 5 rounds (Option A: R7 folded into B5 alongside R6) — at iteration ceiling, but compatible.

The three pulls form a coherent sugar-additions-via-`@state`-v2-collection-form bundle: each is a new collection-form macro alongside `$prop`/`$computed`/`$action`/`$resource`/`$effect`/`$lifecycle`/`$event`; each lowers to a well-understood platform mechanism (ElementInternals for $aria; per-instance registry + lifecycle hooks for $controller; WICG Context Protocol for $context); each lands additively with zero codemod cost.

### Round 6 governance: B1 PASS + Q1 lazy-attach decision

V1 Verifier returned **PASS 11/11** on R1 ($prop reactivity fix + Lit-style optional keys) at HEAD `c4b2ede` of `feat/template-syntax-v2-b1` (verifier report id 1915953857; build manifest id 3560191135). All 11 acceptance criteria confirmed by sample-named test rerun across compiler + runtime suites; zero over-implementation; manifest accurate to diff. **Iteration counter: 1 of 5 banked.** Builder ↔ Verifier round 1 closed in a single pass — banking budget for B2-B5.

Director r6 (record id 2093303835) ratified the merge mechanic: **fast-forward `feat/template-syntax-v2-b1` → `feat/template-syntax-v2`** (NOT squash), preserving the per-phase commit lineage (`runtime-fix` / `compiler-emit` / `size-bump`). Eventual main merge stays per r5 §5 — one squash commit `feat: template-syntax-v2 (Variant B + R1-R7)` after B5 lands. Merge complete: -b1 fast-forwarded to parent at commit `c4b2ede`, then r6 governance docs added at `9ec48cf`.

Director r6 adjudicated the four open questions Builder surfaced honestly:

- **Q1 (Runtime size budget) → lazy-attach + per-feature gzipped sub-budgets.** Compiler conditionally emits per-feature imports + wiring code only when the SFC declares the corresponding collection (generalization of what B1 already does for $prop options-form). Per-feature size budgets: **$aria ≤ 600 B, $controller ≤ 400 B, $context ≤ 600 B**, all gzipped, all lazy-attached. Default-attach baseline for `@aihu/runtime` core stays at ~2.75 KB. Marketing position: **"~5 KB if you use everything; ~2.7 KB for legacy SFCs."** Verification mechanic (B4 territory): introduce `bun run size-by-feature` script that synthesizes minimal SFCs per feature and CI-flags regressions per-feature. B4 + B5 briefs MUST absorb the per-feature size budget acceptance criteria.
- **Q2 (Body-call-syntax migration) → folded into B3 codemod.** Mechanical AST rewriting of `comment.by` → `comment().by`, `mockForecasts[location]` → `mockForecasts[location()]` etc. is bog-standard codemod work. One codemod run for userland (Variant B template syntax + $on.click rename + class array form lift + body-call migration, atomic). B3 codemod LOC budget grows from **560 → ~640-700 LOC**; surface trigger if Builder reports past **800 LOC** for B3a/B3b re-cut. Compatibility window: in-tree examples emit broken JS between -b1 merge and B3 codemod ship — acceptable, these are example/dev SFCs, not shipped product surface.
- **Q3 ($bind + reflect interaction) → B2/R4 territory; `_isInternalAttrChange` flag is Director default.** B1's per-instance `Set<string>` reflect re-entrancy guard handles same-component cycles; the cross-component case ($bind:value="parentProp" with parent's `reflect: true`) is guarded via an `_isInternalAttrChange` flag on the host (set in `attributeChangedCallback` entry, cleared in `finally`; reflect path skips when flag set). Builder picks final implementation; B2 AC outcome is "no infinite loop, no stale writes, no double-fire." Test fixture: `packages/runtime/tests/bind-reflect.test.ts`.
- **Q4 (observedAttributes name collision) → compile-time error `C446`.** When two $prop declarations (or one $prop + one explicit `attrs:` entry) map to the same observed-attribute name (via auto-kebab or explicit `attribute:`), compiler emits `C446` naming both colliding props + the conflicting attribute name + suggesting `specify attribute: explicitly on one of the two`. Detection in `state_macros.rs` validator alongside R1's `C445`. Test fixtures cover four collision cases (auto-auto, auto-explicit, explicit-explicit, attrs-prop). LOC: ~15-25 validator + ~30-50 tests, folds cleanly into B2.

**Refined B2 brief (per Director r6 §3):** R2 + R3 + R4 + Q3 reflect-loop guard + Q4 attribute-collision compile-time error. **LOC estimate: ~150-220 LOC src + ~150-200 LOC tests** (was ~80-130 src in r5 §5; addition of Q3 fixture work + Q4 validator pushes higher; still well under the ≤ 500 src+tests playbook ceiling per round). Branch: `feat/template-syntax-v2-b2` off post-FF parent.

**Surface conditions watch (per Director r6 §6):** B2 NEEDS_FIX with reflect-loop unresolved; B3 codemod past 800 LOC after body-call addition; B4 $aria boundary exceeds 600 B gzipped; B5 LOC + tests exceeds 600 LOC (R6+R7 split trigger); any same-defect-class iteration with NEEDS_FIX > 1; or v0.4 deferral pulled into RATIFY-now mid-build. **Currently no surface trigger active.**

### Round 7 governance: B2 PASS + B3 brief refined

V2 Verifier returned **PASS 12/12** on `feat/template-syntax-v2-b2` covering R2 ($lifecycle four-callback), R3 ($show→hidden attribute), R4 ($bind two-way write-back), Q3 (reflect-loop guard via `_isInternalAttrChange`), and Q4 (C446 attribute-collision compile-time error). Verifier report id 2790235213; build manifest id 205759133; director r7 note id 4201323727. **Iteration counter: 2 of 5 banked.** Two consecutive one-pass Builder ↔ Verifier closes (B1 + B2) — banking budget for B3 (the largest round) and beyond.

Director r7 (record id 4201323727) ratified the merge mechanic: **fast-forward `feat/template-syntax-v2-b2` → `feat/template-syntax-v2`** (NOT squash), preserving the 3 B2 phase-commits as bisectable units. Merge complete: -b2 fast-forwarded to parent at commit `124adda`; r7 governance docs added at `da53779`. Eventual main merge stays per r5 §5 — one squash commit `feat: template-syntax-v2 (Variant B + R1-R7)` after B5 lands.

Director r7 adjudicated the two open questions B2 surfaced honestly:

- **Surface 1 (R4 typed-conv at $bind site) → bundled into B3 compiler emit.** B2's R4 added auto write-back via `setName(e.target.value)`, which always stores a string — numeric signals get `'5'` instead of `5`. r7 routed to mirror R1's `_convert` direction at the bind write site (~20-40 LOC compiler emit + ~50 LOC tests). Lands as B3 AC #11. Defense: R1 + R4 together form the durable invariant ("a typed prop signal stays typed across both attribute-set and bind-input pathways"); coupling gain from one B3 emit-pass review is high; 5-round ceiling preserved (vs option (c) B2.1 split).
- **Surface 2 (Q3 async-batched-attribute-write reverify trigger) → documented as v0.5+ watched assumption.** `_isInternalAttrChange` host-wide single boolean is correct for synchronous-per-attribute platform contract (WHATWG today; Lit's `_isReflecting` precedent). No current WHATWG proposal exists for async-batched attribute writes. Documented-watch with explicit re-verification trigger if/when WHATWG ratifies such a proposal. **No code change in v0.3.**

**Critical r7 finding on the colon→dot transition.** B2's R4 added write-back to the **existing colon-form `$bind:value`** — it did NOT add the dot-form `$bind.value` parsing/emit. The Variant B spec (Architect §3.B.5) requires `$on.click` and `$bind.value` dot-forms. **Implication for B3:** B3 must handle the **complete global colon→dot transition** — both compiler emit (parse and lower the dot-form, with v1 colon-form still parsing under W202 deprecation warning during the transition window) AND codemod migration of all colon-form usages in the corpus. r7 confirms the existing 640-700 LOC codemod estimate from r6 §2.Q2 already encompasses this work.

**Variant B canonical block-tag token is `{#each}` (NOT `{#for}`).** r7 §3.A.1 names this explicitly per Sample-catalog usage AND Svelte training-data alignment AND Prober report. If Builder finds spec-doc text uses `{#for}`, file the inconsistency and align to `{#each}`.

**Refined B3 brief (per Director r7 §3): the largest round.** Variant B template syntax (block-tag control flow `{#if}` / `{#each}` / `{:else if}` / `{:else}` / `{:empty}`) + global colon→dot transition (`$on.click` + `$bind.value` dot-form parsing+emit; v1 colon-form preserved with W202 deprecation) + class-array form + `{@html}` + `$emit.<name>(payload)` via `$event` collection + R4 typed-conv at $bind site + sidecar `.aihu.ts` for type-safety + 640-700 LOC codemod (incl body-call-syntax migration) applied to in-aihu-repo corpus (62 .aihu files). **~1090-1390 LOC src+tests.** Branch: `feat/template-syntax-v2-b3` off post-B2 parent.

**Surface conditions watch (per Director r7 §6):** carries forward r6 §6 and supersedes r6 §6 #2 (the 800 LOC codemod-only threshold) with a **1500 LOC threshold for the full B3 scope** for B3a/B3b re-cut (B3a = compiler emit + sidecar + R4 typed-conv ~430-540 LOC src; B3b = codemod + corpus + body-call ~640-700 LOC src). Adds: R4 typed-conv at $bind site reveals `_convert` not directly reachable at bind-emit (would need R1-machinery pre-pass); sidecar `.aihu.ts` discovery reveals existing TS pipeline can't ingest per-SFC sidecar without significant build-config change; codemod corpus migration breaks an in-aihu-repo `.aihu` file beyond mechanical fixup; body-call-syntax scope-tracking AST is materially harder than estimated. **Currently no surface trigger active.**

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

**Blocking:** none. User cleared go-auto-mode directive (post-r5). B1 closed clean; B2 dispatched per Director r6 §3 refined brief. Hard gate from Director r1 §7 / r2 §8 has been satisfied.

**Gate question (post-r7):** Auto-spine continues per user "go, auto mode" directive. B3 is the largest round; surface conditions watched per r6 §6 + r7 §6. Currently no surface trigger active.

**Next:** B2 Builder ↔ Verifier round in flight (R2 + R3 + R4 + Q3 + Q4). Architect §11 acceptance criteria (a–i) remain runnable; B3 codemod (with body-call-migration, ~640-700 LOC) follows B2 close. B4 introduces $aria + auto-keyboard with lazy-attach + per-feature size budget. B5 lands $controller + $context combined (R6+R7) per r5 §5 Option A; B5a/B5b split named as fallback if WICG interop test goes flaky.

---

## Open questions

- **Sanitizer default for `{@html}`:** identity (no-op) — userland opts in by writing `aihu.config.ts` `templates.htmlSanitizer`. Default proposed by Director r2 §5 (alt: bundle DOMPurify, +25KB). User can override.
- **Codemod CLI surface:** `aihu codemod template-syntax <glob>` subcommand. Default Director r2 §5 (alt: standalone `npx @aihu/codemods/template-syntax <glob>`).
- **`aihu.tmLanguage.json` regex update timing:** ride this PR. Default Director r2 §5 — Scout `D6.2` nested-brace tokenizer bug is a current pain point; landing it in the same PR closes a tooling friction the user already feels.
- **Variant B's `{:else if}` vs `{#else if}`:** Architect spec §3.B.1 proposed the in-block sibling form `{:else if}`; user-surface deferred to Builder round (low-stakes detail; Prober fixture didn't exercise it).
- **Whether to fix existing `$bind:` curly-form spec drift** (Scout `D1.1`: parser accepts but spec §3.2 forbids): codemod must decide accept-or-fix. Default is **fix** for spec hygiene — Variant B/C tighten and re-quote; codemod errors C501 on non-identifier curly content (Prober §2.4 R6).
- **Re-cut threshold check:** Director r1 §7 strict reading of the trigger says re-cut (Variant B triggers 3 of 4 categories: sigil change, value-form change, structural-element addition; runtime change is non-goal). Director r2 §3 overrode because the spec at 540 lines is under the 600-line ceiling and the user-gate is the binding constraint. Flagged for retro if the Builder phase grows beyond the 560 LOC envelope.

### Closed in r6

- **Q1 — Runtime size budget for R5/R6/R7:** **CLOSED** — lazy-attach (Director default option b). Per-feature gzipped sub-budgets ratified: $aria ≤ 600 B, $controller ≤ 400 B, $context ≤ 600 B. Marketing position: "~5 KB runtime if you use everything; ~2.7 KB for legacy SFCs."
- **Q2 — Body-call-syntax migration:** **CLOSED** — folds into B3 codemod (option a). LOC budget grows 560 → ~640-700; surface trigger at 800 LOC for B3a/B3b re-cut.
- **Q3 — $bind two-way + reflect interaction:** **CLOSED** — B2/R4 territory; guard mechanism is `_isInternalAttrChange` flag on host (set in `attributeChangedCallback` entry, cleared in `finally`; reflect path skips when flag set). Builder picks final implementation; AC outcome: no infinite loop, no stale writes, no double-fire.
- **Q4 — observedAttributes name collision:** **CLOSED** — compile-time error `C446` emitted by `state_macros.rs` validator. Diagnostic names both colliding props + the conflicting attribute name; suggests explicit `attribute:` override. Folded into B2 brief.

### Closed in r7

- **Surface 1 — R4 typed-conversion at `$bind` write site:** **CLOSED** — folds into B3 compiler emit (~20-40 LOC + ~50 LOC tests; mirrors R1's `_convert` direction at the symmetric write side). Lands as B3 AC #11. Defense: R1 + R4 together form the durable invariant — typed prop signal stays typed across both attribute-set and bind-input pathways.
- **Surface 2 — Q3 async-batched-attribute-write reverify trigger:** **CLOSED INFORMATIONALLY** — documented as v0.5+ watched assumption. No code change in v0.3. No current WHATWG proposal for async-batched attribute writes; Lit's `_isReflecting` precedent stands. Re-verify trigger is well-defined: if/when WHATWG ratifies an async-batched-attribute-write proposal, r-stage governance for that round revisits the assumption.

### v0.5+ watched assumptions

- **Q3 reflect-loop guard async-batch reverify** (watched; no current WHATWG proposal). The `_isInternalAttrChange` host-wide single boolean assumes synchronous-per-attribute platform contract (WHATWG today; Lit precedent). If async batched attribute writes ever land as a platform feature, the guard's correctness must be re-verified — sits alongside Trusted Types CSP integration, DSD, $form, LSP on the v0.5+ watched-items list.

### Active open items (post-r7)

- **B3 brief (the largest round):** Variant B template syntax + global colon→dot transition (`$on.click` + `$bind.value` dot-form parsing+emit with v1 colon-form preserved under W202) + 640-700 LOC codemod (incl body-call-syntax migration) + R4 typed-conv at $bind site + sidecar `.aihu.ts` for type-safety + apply codemod to 62 in-aihu-repo `.aihu` files. **~1090-1390 LOC src+tests.** Surface trigger at 1500 LOC for B3a/B3b re-cut (B3a = compiler emit + sidecar + R4 typed-conv; B3b = codemod + corpus + body-call). Variant B canonical block-tag token is `{#each}` (NOT `{#for}`).

### Durably-true facts (post-r7)

- **B1 closed clean (V1 PASS 11/11); iteration 1 of 5 banked.** R1 ($prop reactivity fix + Lit-style optional keys) ratified in code; -b1 fast-forwarded into parent at `c4b2ede`; r6 docs added at `9ec48cf`.
- **B2 closed clean (V2 PASS 12/12); iteration 2 of 5 banked.** R2/R3/R4/Q3/Q4 ratified in code on parent at HEAD post-merge; -b2 fast-forwarded into parent at `124adda`; r7 docs added at `da53779`. Surface 1 (R4 typed-conv) folds into B3. Surface 2 (Q3 async-batched-writes) documented as v0.5+ watched assumption.
- **Two consecutive one-pass Builder closes** (B1 + B2). Banking budget for B3 (largest round) and beyond.
- **Lazy-attach architectural decision ratified for R5/R6/R7.** Per-feature gzipped sub-budgets: $aria ≤ 600 B / $controller ≤ 400 B / $context ≤ 600 B. `@aihu/runtime` core baseline stays at ~2.75 KB.
- **Marketing position: ~5 KB runtime if you use everything; ~2.7 KB for legacy SFCs that don't opt into v2 collections.** Honest, dev-tool-inspectable via existing `bun run size-rows` pre-push; B4 introduces `bun run size-by-feature` for per-feature CI gating.
- **B3 codemod scope expanded to include body-call-syntax migration** (~640-700 LOC budget, up from 560; r7 supersedes r6 §6 #2 with a 1500 LOC full-B3-scope threshold for B3a/B3b re-cut).
- **B3 = Variant B syntax + codemod (640-700 LOC) + R4 typed-conv + sidecar `.aihu.ts`; ~1090-1390 LOC src+tests; the largest round.** Surface trigger at 1500 LOC for B3a/B3b re-cut.
- **B2's R4 added write-back to colon-form (`$bind:value`) only; B3 handles the complete global colon→dot transition** (dot-form parsing+emit added in B3; v1 colon-form preserved under W202 deprecation; codemod migrates corpus).

---

## Resume protocol pointer

Any future session reads this summary as the topic snapshot, then reads:

1. **Director r2 note** at `c:\git\fellwork\aihu\.team\director-notes\template-syntax-002.md` — the latest reconciliation (`director_note` id 2273508187).
2. **Architect spec** at `c:\git\fellwork\aihu\docs\superpowers\specs\2026-05-06-spec-template-syntax-v2.md` — the PROPOSED v2 spec doc (`architecture_spec` id 76882731).
3. **AGENTS.db records:** search `agents_search --kind topic_summary --query "aihu template syntax" --limit 1` for the latest summary; cross-reference the four ratified records (Architect spec 76882731, Prober report 3373363951, Director r2 note 2273508187, user-answers dispatch_record 1824268415).

If the user has already answered the go/no-go, the next move is **Builder dispatch** in two sub-rounds (B1 — codemod scaffolding + Variant B compiler arms + `$ref` codegen; B2 — sidecar TS sidecar emission + acceptance criteria a–i runnable). All Architect §11 acceptance criteria are runnable; Builder must cite Prober §6 LOC table to close the per-variant codemod sketch gap (Architect §9 only fully sketched A).

Aihu repo's local `AGENTS.db` is still not registered with this MCP — disk mirrors at `c:\git\fellwork\aihu\.team\` and `c:\git\fellwork\aihu\docs\topic-summaries\` are authoritative for the aihu repo until that DB comes online. All AGENTS.db writes from this round went to the api-repo's delta layer (`AGENTS.delta.db` at the api workspace root), which is what the MCP currently exposes.
