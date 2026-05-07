# Director Note — topic:aihu-template-syntax track:userland-dx — Round 1

**Mode:** 2 (build/refactor)
**Iteration counter:** 0 of 5 (fresh)
**Date:** 2026-05-06
**Author:** Director
**Tags:** `topic:aihu-template-syntax track:userland-dx round:1`

**STATUS:** ROUTED to Scout (Architect dispatch GATED on Scout completion + user surface)

---

## 1. On-thesis assessment

**The user's diagnosis is half-right and one critical step out of date.** The userland template surface genuinely *does* feel different from the rest of the SFC infrastructure, but the asymmetry is older than the user's intuition implies, and **macro-vocabulary-v2 has already harmonized half of it on the `@state` side without touching the `@template` side.** The result is that the v1 → v2 reconciliation has *widened* the gap the user is reacting to: `@state` got a clean object-literal collection-form (one keyword, one object, bare-or-wrapped value duality), while `@template` is still on the v1 attribute-directive surface (`$if`/`$each`/`$on:`/`$bind:` with quoted-vs-curly value rules). The screenshot's pain points are precisely where `@template` continues to look like a different language than the `@state` block above it.

Specific evidence the diagnosis is real:

- **`$each="weekDays as day"` (quoted) sitting next to `$key={day.toISOString()}` (curly) on the same element.** This is not a v2 regression; it is a v1 design decision (Template Attribute Syntax Spec §3.3 — `$each` is `iteration` type, **quoted only**; `$key` is `identifier | expression`, **either form**). The directives spec is internally consistent, but the *visible surface* on a single element looks inconsistent because two sibling directives use different value-forms.
- **`class={'month-cell' + (day.getMonth() !== currentDate.getMonth() ? ' other-month' : '')}` inline.** Long inline expressions in attributes are a known antipattern. Template Attribute Syntax Spec §11.3 already flags it as an open question (class/style binding shortcuts deferred to v2). No fix has been spec'd.
- **`$on:click={() => { this.dispatchEvent(new CustomEvent('dayjump', { detail: day, bubbles: true })) }}`.** Three concrete asymmetries with the rest of the framework: (a) raw `this`-bound DOM dispatch breaks the abstraction (the `@aihu/runtime` should own event emission, not userland), (b) raw DOM event-construction is plumbing leaking into the template, (c) the inline arrow body is full-fat JS *inside an attribute value* — exactly the inline-expression antipattern from above.
- **No `$emit`-equivalent.** Vue, Svelte, Solid all expose a clean component-event abstraction. aihu does not, because `@expose` covers the agentic / parent-ref direction but no symmetric child-to-parent event abstraction exists. The user is forcing the calendar to emit raw DOM events because the SFC vocabulary has nothing else to offer.
- **TS lang-server hits handler bodies but the colon-namespaced `$on:click=` attribute name confuses spellcheck.** This is the IDE friction the user observed. The colon-in-attribute-name is HTML-legal but unusual; not all tooling handles it gracefully. Biome formatter behavior on `$bind:value=` and `$on:click=` is also worth verifying — Scout brief covers this.

What macro-vocabulary-v2 **already** addresses (so the Architect must NOT redo it):

- Per-name `describe:` and `expose:` keys eliminate the `@agent` block sprawl. (Out of scope for this track — `@agent` and `@state` are settled.)
- The bare/wrapped duality pattern (`name: () => expr` vs `name: { value: () => expr, describe: '...' }`) is a candidate **template-side analog**: a directive could be bare (current behavior) or wrapped with metadata when needed. Architect should evaluate whether the `@state` collection-form pattern transfers to `@template`.

What macro-vocabulary-v2 **does not** address and the user is correctly flagging:

- Template directive sigil (`$if` vs Vue `v-if` vs Svelte `{#if}` vs Angular `*ngIf` vs new Angular `@if`).
- Quoted-vs-curly value-form discipline (the spec is internally consistent; the *user-felt experience* is jarring).
- Long inline expressions in attribute values (no lift-to-state ergonomic).
- Component event abstraction (no `$emit` analog; userland reaches for raw DOM events).
- Type-checking coverage of attribute expressions (the spec asserts `expression` types; the *implementation* coverage is unverified — Scout must confirm).
- Security defaults around `$html` (acknowledged as React's unsafe-inner-HTML analog; no sanitizer policy beyond build warning per Macro Vocab Spec §3.7).

Conclusion: the user's diagnosis is real, the v1 specs do *not* fully solve it, and v2 widened (not narrowed) the felt asymmetry by harmonizing the `@state` side first. This Architect round is the right next step. We should not rip out `@template` v1 wholesale — we should **find the smallest set of targeted changes that pulls `@template` into the same conceptual frame as `@state` v2**.

---

## 2. Problem decomposition

Six axes. Listed in priority order for the Architect's attention:

### 2.1 Syntactic consistency (`$` sigil discipline + quoted/curly duality)

The user-felt issue. Specific knobs:
- **Sigil family.** Today: `$if`, `$each`, `$on:click`, `$bind:value`. The colon-in-attribute-name is unusual. Alternatives: namespaced (`*if`, `*for` — Angular structural directives), tag-block (`{#if}…{/if}` — Svelte), runes-on-attribute (`onclick={…}` — Svelte 5). Question: does the colon-namespacing pull weight or does it just fight tooling?
- **Quoted-vs-curly.** v1's rule (quoted = identifier/path, curly = expression) is logical but produces visually inconsistent sibling directives (`$each="x as y"` next to `$key={y.id}`). Options: (a) accept asymmetry and document as feature, (b) push everything to curly with a relaxed reactivity contract, (c) push everything to quoted with a richer mini-grammar.
- **Sigil inside element name.** `<$slot>`, `<$suspense>`, `<$shield>` use the `$`-prefixed tag form. This is consistent with the macro vocabulary and probably should not change — but it does mean userland has *three* layers of sigil discipline (block-level `@`, declaration-level `$`, structural-element-level `<$>`).

### 2.2 Reactivity binding (template ↔ signal subscription model)

Today's compiler emits per-binding effects: `effect(() => { el.value = signal })` for `$bind`, `createIfBoundary` for `$if`, etc. Fine-grained, push-based, no VDOM. This is good. The question is whether the *syntax* maps clearly enough to that model — e.g., does `class={signal}` make it visually obvious that the class is reactive, or does it look like a one-shot evaluation? This is a comprehension question (especially for LLM authors), not a semantic-correctness question.

### 2.3 DOM/security boundary

What the screenshot exposes:
- **Raw `this` in event handlers.** `this.dispatchEvent(...)` couples the SFC author to the underlying custom-element host. If the runtime ever moves to a non-custom-element rendering path (server-render, headless), `this` breaks.
- **Raw DOM event construction.** No abstraction around component events.
- **`$html` is unsafe inner-HTML assignment.** Macro Vocab Spec §3.7 acknowledges this is the React analog of the unsafe-set-inner-HTML pattern. No CSP guidance, no trusted-types integration, no sanitizer plug point. Build-time warning is the only check.
- **Attribute injection.** Curly expressions in attribute position get string-concatenated. Need to verify the compiler escapes `"` correctly when computed values flow into attribute serialization (Scout brief).
- **Event handler trust.** Event handler bodies are arbitrary JS. They run in the same module scope as the rest of the SFC. No isolation, no CSP nonce path. This is *correct* for a client framework but should be documented (especially for the agentic story where untrusted-source-of-content might inject template fragments).

### 2.4 Type-safety end-to-end

The spec asserts attribute expressions are typed. Scout must verify:
- Curly expressions in attributes flow through `tsc` — does the lang server actually see `class={someExpr}` as a TS context with the right inferred type for the component scope?
- Quoted identifier references — are these checked against the `@state` symbol table at compile time, or only at runtime?
- `$bind:value="signalName"` — does the lang server confirm `signalName` is a writable signal, or only the compiler at build time?
- Component prop binding — `<UserCard user="currentUser">` — is `currentUser` checked against `UserCard`'s declared `$prop user: T` type?

The screenshot is suggestive (red squiggles on handler-name strings = TS lang server is engaged on at least *some* attribute paths) but not definitive.

### 2.5 Agentic affordance

Two flavors:
- **Read-by-LLM:** can an LLM look at a `.aihu` file and correctly produce a small change? The `@`-block + `$`-macro convention is already strong (block context disambiguates a lot). The question is whether the *template* surface is as agent-friendly as the `@state` block. v2's collection-form is empirically more agent-friendly than v1's macro-statement form because object-literal idioms are dense in training data. The template surface is currently HTML-with-directive-attrs, which is universally familiar but not specifically aihu-shaped.
- **Write-by-LLM:** when an agent generates a template, what's the failure mode? My prior: LLMs reliably produce `class={...}` and `onclick={...}` (Solid/Svelte 5 idioms); they less reliably produce `$on:click=` (colon-namespaced) and `$each="x as y"` (string-mini-grammar with `as`). Architect should weigh this.

### 2.6 Boilerplate budget

User said "light on boilerplate." Comparative tax (per-construct, not per-component):

| Construct | aihu today | Vue 3 SFC | Svelte 5 | Solid |
|---|---|---|---|---|
| Conditional | `<el $if="x">` or `<el $if={x}>` | `<el v-if="x">` | `{#if x}…{/if}` | `<Show when={x}>` |
| List w/ key | `<el $each="xs as x" $key="x.id">` | `<el v-for="x in xs" :key="x.id">` | `{#each xs as x (x.id)}` | `<For each={xs}>{x => …}</For>` |
| Event | `<el $on:click="fn">` or `={fn}` | `<el @click="fn">` | `<el onclick={fn}>` | `<el onClick={fn}>` |
| Two-way bind | `<el $bind:value="sig">` | `<el v-model="sig">` | `<el bind:value={sig}>` | (signal pair pattern) |
| Class binding | `class={expr}` | `:class="expr"` | `class={expr}` | `class={expr}` |

aihu's tax is comparable for events/conditionals, *higher* for `$bind` (literal `$bind:` prefix), and *competitive* for class/style. The single biggest savings would come from eliminating the `$` on event/bind attributes (i.e., `onclick={fn}` and `bind:value={sig}` Svelte-style) — but that costs the discriminator-by-sigil property that makes the rest of the language readable.

---

## 3. Comparative frame (single-line takes per framework)

- **Svelte 5 (runes + snippets):** the `{#each}` block-tag form is more discoverable for cold readers than attribute directives; `bind:value={sig}` (colon, no sigil) is what Svelte settled on after `bind:value="sig"`-style was rejected. **Idea to consider:** block-tag conditionals as an alternative to attribute conditionals.
- **Vue 3 SFC:** `v-` prefix discipline + `:`/`@` shorthand has 12 years of muscle memory but proven brittle around TS inference (the Vue type-helpers ecosystem exists because of this). **Idea to reject:** the `:`/`@` shorthand split (we already see it in deprecated `:prop=`/`@event=` in our compiler — keeping them would re-introduce two-discriminators-per-bind).
- **Solid:** `<Show>`/`<For>` as components, no directives at all. JSX-native, rides on TS. **Idea to consider:** structural components (`<$if>`, `<$for>`) instead of attribute directives — already partially in the codebase via `<$suspense>`/`<$shield>`/`<$guard>`. Architect should evaluate consistency: if `<$suspense>` is a tag, why is `$if` an attribute? Conceptual seam worth examining.
- **Lit:** tagged template literals. Wrong direction for aihu (we have an SFC compiler, not a TTL).
- **Angular:** new `@if`/`@for` control-flow blocks (2024) were added because `*ngIf`/`*ngFor` failed agentic readability. Strong precedent that **block-form control flow beats attribute-form** for both human and LLM comprehension. **Idea to consider seriously.**
- **Astro:** server-first islands; templating is React-flavored JSX. Not directly relevant; aihu's split-bundle compilation already covers the SSR/client seam.

The two strongest external precedents are **Angular's @if/@for migration** (block-form, motivated by exactly the user's complaint) and **Svelte 5's bind: prefix without `$`-style sigil** (less ceremony around two-way binding).

---

## 4. Routing — Scout brief (refined)

The Scout's job is **ground-truth confirmation, not redesign**. Architect dispatches only after Scout completes and user surfaces complete.

**Required deliverables:**

1. **Directive inventory.** Every `$`-prefixed token honored by `packages/compiler/src/parser/directives.rs` and `template.rs`. For each: name, value-form rules (quoted/curly/boolean), where the lowering lives in `codegen/`. Confirm against `2026-05-02-spec-template-attribute-syntax.md` §3.3 — flag any drift.
2. **Reactivity wiring trace.** Pick one concrete example (e.g., `class={signal}`): trace from `parse_attr` → AST node → `emit.rs` lowering → runtime `effect()` call. Document the chain. Confirm there is no VDOM step.
3. **Security audit (load-bearing).** Specifically:
   - Where does `$html` lowering happen? Is there *any* sanitization or trusted-types path? Cite source line.
   - For curly attribute expressions (`href={url}`, `class={...}`): does the compiler/runtime escape `"` and `<` when serializing? Cite source line; if no escaping, that's a finding.
   - Event handler bodies: confirmed un-isolated (same module scope as `@state`). Document any CSP guidance in docs/.
   - Are there any code paths that turn user-supplied strings into executable code at runtime — i.e., string-to-code constructors, `eval`, or `vm.runInThisContext`? **Hard requirement: Scout must answer this with file/line evidence (negative answers OK; the question is whether such a path exists).**
4. **Type-checking pipeline.**
   - For curly expression `class={someExpr}`: does the generated TS code put `someExpr` in a position where `tsc` checks it? Walk the generated `.ts` output.
   - For quoted identifier `$on:click="save"`: is `save`'s existence verified at compile time, runtime, or never?
   - For `$bind:value="signalName"`: is the writability of `signalName` verified?
   - Document the verification matrix (which forms are compile-time-checked, which are runtime-only).
5. **Existing-userland do-not-break list.** Glob every `.aihu` file in `c:\git\fellwork\aihu\examples\`, `packages\templates\cf-team\`, `packages\compiler\fixtures\`, `packages\compiler\tests\fixtures\`, plus the screenshot's calendar component (Scout: locate it; if it lives outside the aihu repo, flag it). For each: count distinct directive uses (`$if`, `$each`, `$bind`, `$on`, `$key`, `$show`, `$html`, etc.). This is the migration scope quantification.
6. **Tooling-friction audit.**
   - Open one `.aihu` file in VS Code with the Biome extension and the aihu LSP (if any). Note where squiggles fire on legitimate constructs and where they fail to fire on illegitimate ones.
   - Confirm whether the `$on:click=` colon-namespacing breaks HTML formatters, eslint plugins, or VS Code's tag-attribute autocomplete.
7. **Risk register (top 5).** Ranked. Include at minimum: (a) compiler error message regression during migration, (b) breakage of `examples/` corpus, (c) breakage of in-flight `cf-team` template, (d) IDE/tooling regression, (e) RFC scope creep into `@state` v2 territory.

**Time budget:** Scout should produce this in one pass, ~60-90 min. If Scout exceeds 90 min, surface — don't grind.

**OUT of scope for Scout:** proposing redesigns. Scout reports ground truth only.

---

## 5. Routing — Architect brief (refined, conditional on Scout completion)

Dispatched only after Scout completes AND user surface questions resolve.

**Required deliverables:**

1. **Three concrete syntax variants (named, side-by-side):**
   - **Variant A — "harmonize-and-stay":** keep `$if`/`$each`/`$on:`/`$bind:` attribute directives but normalize value-form rules so sibling directives match (e.g., either all-quoted-when-identifier or all-curly-when-expression — pick one); kill the colon-in-attribute-name in favor of dot (`$on.click`) or single-token (`$onclick`); add explicit class/style shortcut macros to lift the screenshot's inline ternary.
   - **Variant B — "block-tag control flow":** introduce `{#if cond}…{/if}` and `{#each items as item (key)}…{/each}` Svelte/Angular-style for control flow. Keep `$on:`/`$bind:` for attribute directives (they're well-understood). This addresses the user's "doesn't have the same feel" complaint by visibly separating *structural* directives (block-tag) from *binding* directives (attribute).
   - **Variant C — "structural component pattern":** lean into the `<$suspense>` precedent. Replace `$if`/`$each` with `<$if cond={...}>` / `<$for each={...} key={...}>`. Keep `$on:`/`$bind:` as attribute directives. Most consistent with the existing `<$slot>`/`<$shield>`/`<$guard>` family.
2. **Evaluation matrix.** Each variant scored 1–5 against the user's five non-negotiables (secure / typed / agentic / human / boilerplate) plus a sixth criterion (migration cost). Include `IS-NOT-IN` per variant.
3. **Reactivity-binding model unchanged.** Explicit non-goal: this round must not change the `@state` v2 collection-form, the signal/effect runtime, or the `<$suspense>`/`<$shield>` semantics. The Architect spec must call this out.
4. **Security model upgrades.**
   - Concrete proposal for `$html` (rename to `{@html …}` Svelte-style? plug a sanitizer interface? require trusted-types?).
   - Concrete proposal for component events (introduce `$emit` macro? declarative `$events` on `@state` that lowers to typed event dispatch?).
   - CSP posture statement.
   - Attribute-value escaping audit fixes (if Scout finds gaps).
5. **Type-safety strategy.** Per variant, where does TS coverage close gaps that v1 leaves open? Concrete: how does each variant guarantee `class={user.profile.name}` is a TS expression in the component's scope?
6. **Migration path / codemod sketch.** Following the macro-vocabulary-v2 precedent: hard-cut, error code (e.g., **C500**) pointing at a codemod under `packages/compiler/codemods/template-syntax/`. Estimate codemod LOC (≤ 300 budget per v2 precedent).
7. **Acceptance criteria.** Runnable. At minimum: (a) `wc -l` on a representative SFC drops vs. baseline, (b) directive-count-per-file flat or shrinks, (c) `tsc --noEmit` covers ≥ N% of attribute expressions (Scout supplies the "from" number), (d) cold-read intelligibility test on a fresh LLM session.
8. **IS-NOT-IN list.** Explicit. Reserved entries: `@state` block format, `@route` block, `@expose` semantics, `@agent` block, MCP/agent-binding protocol, `@aihu/signals` runtime, `@aihu/arbor` boundary primitives.

---

## 6. Substance constraints (preserve user intent)

The Architect MUST honor:

- **"Light on boilerplate"** — the *floor* is the v1 attribute-directive form. Any new ceremony (e.g., a `<template #fallback>` slot) must beat the existing `class={ternary}` line on either readability or correctness. If a variant adds tokens-per-construct, it must subtract elsewhere.
- **"Human-formatted"** — long inline expressions in attribute position are the canonical sin. Architect MUST propose a lift mechanism: either a `@state.$computed` lift (already exists; Architect documents the convention), or a template-local `let` binding (new construct), or a class/style helper (e.g., `class={['month-cell', day.isOtherMonth() && 'other-month']}` — array form). The screenshot's `class={'month-cell' + (day.getMonth() !== currentDate.getMonth() ? ' other-month' : '')}` is the reference case to improve.
- **"Agentic-minded"** — sigil discipline must be predictable enough that LLMs produce it correctly cold. English-pronounceable directive names (`$if`, `$each`, `$bind`, `$on`) are good; `:`/`@`/`*` short-forms are bad (Vue's `@click` reads "at-click" not "on-click"). Avoid sigil collision with TS/JS (`*` collides with multiplication; `@` collides with decorators).
- **"Secure"** — escape-by-default in attribute serialization (verify with Scout); raw HTML behind explicit named opt-in (`{@html}` or `$html`); event handlers as typed callable references with no string-to-code execution paths; CSP-compatible (no inline-scripts in compiler output beyond what's strictly needed).
- **"Typed"** — every expression must reach `tsc`. Quoted identifier references must be checked against the symbol table at compile time, not runtime. The Architect should explicitly call out where v1 type-erasure happens (e.g., is `$on:click="save"` resolved to a typed function reference, or stringly-resolved at runtime?).
- **"Language-friendly"** — sigils/directives must not break TS lang-server, Biome formatter, VS Code autocomplete, or Prettier. Where the current surface fights tooling (Scout will surface candidates), call it out. Particular attention: colon-in-attribute-name interaction with HTML formatters.

---

## 7. Mode + iteration discipline

Mode 2 (build/refactor). Iteration counter: 0/5.

**Hard gate:** after Architect spec lands, **surface to user before any Builder dispatch.** This is breaking-change territory — every userland `.aihu` will need a codemod pass. User must approve direction before code moves.

Re-cut threshold: if Architect's spec exceeds ~600 lines or proposes more than two of {sigil change, value-form change, structural-element addition, runtime contract change}, Director re-cuts before Builder. Scope discipline matters; the macro-vocabulary-v2 spec stayed at 311 lines despite covering six macros — that's the bar.

---

## 8. Surface-to-user triggers (BEFORE Scout dispatches)

Team Lead must batch-ask the user these five questions. Three are likely yes/no; two may need a paragraph.

1. **In-flight scope.** "Do you consider the macro-vocabulary-v2 spec (`@state`/`@agent` collection-form, dated 2026-05-05) the in-flight answer for the `@state` side, with this evaluation strictly about `@template`? Or is the v2 spec also up for revision?" **Director default if not answered:** v2 is settled; this round only touches `@template`.
2. **Breaking-change tolerance.** "Is breaking change acceptable for v0.3, requiring a codemod migration of every userland `.aihu` file? Or must the redesign be additive — keep v1 directives working alongside the new surface?" **Director default if not answered:** hard-cut with codemod (matches v2 precedent — aihu pre-v1.0, clean break is in-bounds).
3. **Out-of-repo userland.** "Are there `.aihu` components OUTSIDE the aihu repo we must not break? Specifically: `c:\git\fellwork\mail`, `c:\git\fellwork\pitch`, `c:\git\fellwork\magna`, the bootstrap repo, or any in-flight customer apps?" **No Director default — must answer.** Scope of the codemod depends on this.
4. **Calendar component fate.** "The screenshot's calendar component — is it (a) in the aihu repo, (b) in a sibling fellwork repo, (c) external/customer code? And is it the *canonical* userland reference, or are there other components you want fixed first?" **No Director default — must answer.** Architect's evaluation matrix needs a concrete reference SFC.
5. **`$emit` / component events.** "Should this round include a `$emit`-equivalent for parent↔child component events (so the calendar doesn't reach for raw DOM event construction)? Or scope to template directives only?" **Director default if not answered:** include — this is one of the strongest "doesn't feel like the rest of the framework" signals from the screenshot.

If user answers Q4 with a non-aihu-repo path, Director will re-cut Scout's brief to add cross-repo glob.

---

## 9. Continuity check

First round on `topic:aihu-template-syntax track:userland-dx` in this DB. AGENTS.db delta-layer search returned **zero hits** on `aihu template syntax`, `aihu macro vocabulary template`, `aihu compiler template`, and `aihu sfc syntax`. The closest cross-project priors are the `cli-templates` track (closed v0.2.0) and the `mail-system` track (closed) — neither overlaps substantively.

**Known limitation:** the aihu repo has its own `AGENTS.db` (referenced in `c:\git\fellwork\api\CLAUDE.md` as the rule "use MCP `agents_search` for context") that is NOT registered with the MCP this session — the MCP is hitting the api-repo DB. Any prior Architect spec or Director note inside the aihu repo about template syntax is invisible to `agents_search`. **Recommendation:** Team Lead should consider registering aihu's local AGENTS.db before the Architect dispatches, especially if the Scout finds existing in-repo prior thinking on this exact territory.

Filesystem reads of `c:\git\fellwork\aihu\docs\superpowers\specs\` and `c:\git\fellwork\aihu\.team\director-notes\` are how this round established prior thinking. The four 2026-05-02 specs and the 2026-05-05 v2 spec are the authoritative priors. The `cli-templates` track in `.team/director-notes/` is unrelated.

---

## 10. Anti-pattern self-check

- Did I accept the user's framing without testing whether macro-vocabulary-v2 already addresses some of it? **No** — I explicitly verified v2 addresses `@state` and `@agent` but does not touch `@template`, and called out that v2 *widened* the felt asymmetry. Section 1.
- Am I proposing a redesign before the Scout has confirmed the current surface? **No** — Scout dispatch is gated, Architect dispatch is double-gated (Scout + user surface). Sections 4, 7, 8.
- Am I bundling more than one conceptual seam into a single Builder dispatch? **N/A this round** (no Builder dispatch). Architect brief explicitly asks for three named variants in one spec, not three Builder dispatches. The hard gate at section 7 prevents Builder from firing without user approval, which is where seam-by-seam batching gets re-evaluated.
- Am I respecting v2's settled territory? **Yes** — `@state` collection-form, `@agent` reshape, MCP/agent-binding all in `IS-NOT-IN` list at section 5.8.
- Did I confirm the agents_search limitation rather than assume the DB is empty? **Yes** — section 9 spells it out.
- Risk: I have not personally read every `.aihu` file in the repo. Scout's deliverable #5 (do-not-break inventory) is what closes this gap before Architect dispatches. Director note relies on Scout, not Director, to ground the migration scope claim.

---

*End of round 1 director-note. Synthesizer NOT invoked this round (no Builder/Verifier output). Next role: Scout.*
