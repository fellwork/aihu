# Director Note — topic:aihu-template-syntax track:userland-dx — Round 3 (Audit Reconciliation)

**Mode:** 2 (build/refactor — research/governance phase, third pass)
**Iteration counter:** 0 of 5 (no Builder ↔ Verifier yet)
**Date:** 2026-05-06
**Author:** Director
**Tags:** `topic:aihu-template-syntax track:userland-dx round:3 audit-reconciliation`

**STATUS:** AUDIT RECONCILED — recommend ratify-now: 4 amendments + 1 correctness fix; defer 6 to v0.4; defer 4 to v0.5+; reject 1. Codemod budget revised to **610 LOC** (560 base + 50 LOC for `$prop` reactivity fix). Synthesizer routes to one master audit doc beside the spec.

---

## §1 — Headline reconciliation: aihu IS already Web-Components-native

**Auditor A's load-bearing finding holds.** I verified the compiler emit path directly:

- `packages/compiler/src/codegen/emit.rs:858-861` emits `defineElement('tag-name', defineComponent((ctx) => {…}))` per SFC.
- `packages/runtime/src/define-element.ts:75-87` — `defineElement` calls `customElements.define(name, Wrapped)` at line 86.
- Line 83: `const mode: ShadowMode = options?.shadowMode ?? 'open'` — default-open Shadow DOM.
- `emit.rs:660-662` — `$prop` lowers to one-shot `JSON.parse((ctx.element as HTMLElement).getAttribute('{name}') ?? '{}')` (Auditor A's claim that props are read-once-at-mount and not reactive is **factually correct**).

**aihu is a Web Components framework, not a manual-DOM framework.** It's closer to Lit than to Vue or Svelte on platform alignment. `@style` blocks emit Constructable Stylesheets (`emit.rs:32-77`) — ahead of Vue 3, on-par with Lit/Stencil/FAST.

This **reframes the user-surface message**. The audit isn't "refactor to integrate with the platform"; it's:

- **16 of 38 audited constructs are ALREADY-INTEGRATED** with Web Components platform primitives.
- **6 are INTEGRABLE-WITH-REWORK** — the gaps to close.
- **13 are GENUINELY-EXTRAPOLATING** — signal-based reactivity, control-flow blocks, async/error boundaries (no platform equivalent; preserve cleanly).
- **3 are PLATFORM-IS-WORSE** — extrapolation justified.

This headline goes to user FIRST, before any list of proposals. It changes the conversation from defensive ("did we build this right?") to offensive ("we're already 16/38; here are the 6 gaps and 3 enhancements worth shipping").

---

## §2 — Cross-audit reconciliation (overlap resolution)

The two auditors converged on similar territory through different lenses. For each overlap, my decision and defense:

### §2.a — Lifecycle composition (A §A1 vs B §5)

**Decision: ADDITIVE, not competing. Both ratify.**

- `$lifecycle` (A §A1): per-SFC platform-callback wiring. Extends the existing `{mount, dispose}` to `{mount, dispose, adopt?, attributeChange?}` covering all four `HTMLElement` lifecycle callbacks. ~10 LOC additive.
- `$controller` (B §5): reusable composable lifecycle logic. Lit-Reactive-Controller-shaped, zero-class-boilerplate composable inside `@state` v2. Each controller's `hostConnected`/`hostDisconnected` wires automatically into the host's lifecycle queue.

**They are not the same surface.** `$lifecycle` is for the SFC author wiring its own component to the platform. `$controller` is for reusable behavior objects (e.g., `useResizeObserver`, `useFetch`) consumed across many components. State this explicitly so Builder doesn't conflate them.

Defense: the Lit ecosystem has both `connectedCallback`/`disconnectedCallback` (per-element platform hooks) AND `ReactiveController` (composable behavior). Both are valuable; neither subsumes the other.

Routing: `$lifecycle` extension is **RATIFY-now** (additive, ~10 LOC). `$controller` is **DEFER to v0.4** (new collection, more design surface; not blocking Variant B).

### §2.b — A11y (A §A9 `@a11y` block vs B §4 `$aria` collection)

**Decision: pick `$aria` collection. Defer to v0.4.**

Both auditors propose declarative ARIA via `ElementInternals`. They differ in syntax:

- A §A9: `@a11y { role: 'button', label: () => '...' }` — top-level block.
- B §4.1: `$aria: { role: { value: 'button', describe: '...' }, label: { value: () => '...' } }` — collection inside `@state` v2.

**I pick B's `$aria` collection over A's `@a11y` block.** Defense:

1. **Director r2 §1 explicit framing**: "@state v2's collection-form is *the* aihu shape going forward." Adding a new top-level `@a11y` block fragments the surface. `$aria` lives alongside `$prop`/`$computed`/`$action`/`$resource`/`$effect`/`$lifecycle`/`$event` with the same bare/wrapped duality.
2. **Cross-cutting summary** (Auditor B): "collection-form unification across @state v2 macros is one of the top-2 advantages over Vue worth marketing." Adding a peer-block undermines that story.
3. The lowering is identical either way (Auditor A owns it: `attachInternals()` once, `mountEffect` per `$aria.<name>`).

**Round-3 ratification or v0.4?** **DEFER to v0.4.** Reasons: (a) `$aria` adds a new collection-form macro to v2 grammar — meaningful surface addition that deserves its own spec round; (b) the highest-leverage proposal in this round is paired with auto-keyboard-promotion (B §4.2) which deserves design discussion (what roles count as "keyboard roles"? what about `menuitemcheckbox`?); (c) Variant B Builder is already fully-scoped at 560 LOC — adding `$aria` pushes us past 700 LOC and into re-cut territory (see §3).

**Surface to user:** flag `$aria` + auto-keyboard-promotion as the highest-leverage v0.4 candidate. No framework has shipped this. Marketing territory.

### §2.c — Form association (A §A3 `@form` block)

**Decision: confirm v0.4 deferral.** Auditor B did not lead on this; Auditor A proposed it; both auditors recommended deferring. No reason to re-prioritize. Tracked as v0.4 alongside `$aria` (both share `attachInternals()` allocation; design them together in one spec round).

If we ship `$aria` and `$form` in v0.4, the surface should be `$aria:` + `$form:` collections (consistent with `$aria` decision in §2.b — no new top-level `@form` block).

### §2.d — Customized built-ins (`<button is="my-btn">`)

**Decision: ratify Auditor A's recommendation AGAINST.** Safari has refused to ship customized built-ins since 2018; polyfill is non-trivial. Auditor B did not address. The autonomous-element + `ElementInternals` path (§2.b/§2.c) covers the same use cases without Safari-polyfill complexity.

Document the decision in the master audit doc; do not add `@component { extends: ... }`.

### §2.e — Style: Constructable Stylesheets + `::part`/`::theme`

**Decision: confirm both auditors. No new action this round.**

- Both auditors verified aihu uses Constructable Stylesheets correctly today (`emit.rs:32-77`).
- Both auditors recommended `::part(name)` as the documented theming surface.
- Auditor B added: aggregate Constructable Stylesheets across instances in v0.4 (current path is per-instance; aggregation cuts bytes invisibly).

All three are v0.4 doc + invisible-runtime work, not Variant B Builder territory. Confirmed.

---

## §3 — Spec amendment manifest

### RATIFY now (round-3 amendments to Variant B spec)

These get incorporated into the Variant B spec before Builder dispatch. Builder picks them up.

| # | Item | Spec section | Amendment text (one paragraph) | Codemod / Builder LOC delta |
|---|---|---|---|---|
| R1 | **`$prop` reactivity fix (CORRECTNESS bug, not sugar)** | New §3.E "Reactive props" | "`$prop` declarations gain optional keys `attribute?: boolean \| string`, `reflect?: boolean`, `converter?: { fromAttribute, toAttribute }` mirroring Lit's `@property` decorator. Function-form `defineComponent` synthesizes `static observedAttributes` from declared `$prop` names with `attribute: true` (default for primitives), allocates one `Signal` per prop at construct time, dispatches `attributeChangedCallback(name, _, newValue)` to the signal setter, and exposes a JS property accessor on the prototype. With `reflect: true`, signal-changes write back to the attribute via `setAttribute`. Defaults: primitives `attribute: true, reflect: false`; objects/arrays `attribute: false`. Closes Auditor A row 11 (`emit.rs:660-662` one-shot bug)." | +50 LOC compiler emit, +20 LOC runtime, **0 LOC codemod** (existing `$prop` declarations remain valid; new keys are optional) |
| R2 | **`$lifecycle` four-callback extension** | §5 "@state v2 collection-form additions" | "`$lifecycle:` accepts `{ mount, dispose, adopt?, attributeChange? }`. `adopt(oldDoc, newDoc)` and `attributeChange(name, oldValue, newValue)` default to no-op. When `attributeChange` is provided, the compiler synthesizes `static observedAttributes` from the union of declared `$prop` names + names referenced in the body. Closes Auditor A row 16." | +10 LOC runtime dispatcher, **0 LOC codemod** (additive) |
| R3 | **`$show` switch from `--show` to `hidden` attribute** | §3.D.27 (existing) | "`$show={cond}` lowers to `effect(() => el.toggleAttribute('hidden', !cond))` instead of the current `el.style.setProperty('--show', cond ? '1' : '0')`. The `hidden` HTML attribute is natively handled by every browser, integrated with the accessibility tree, and removes the userland-CSS-mapping requirement. Closes Auditor A row 27 (PW)." | +5 LOC compiler emit, **0 LOC codemod** (semantics-preserving for any userland that didn't rely on `--show` directly) |
| R4 | **`$bind` write-side wiring verification** | §11 acceptance criterion | "Builder MUST verify the write-side wiring for `$bind.value={signal}`: an `addEventListener('input', e => set(e.target.value))` is emitted alongside the read-side `mountEffect`. If absent in current `attrs.ts`, add it. Synthetic acceptance test: `<input $bind.value={sig}>`; `sig` updates when user types. Closes Auditor A row 22 audit gap." | +0 LOC if already present; +30 LOC if absent (Builder must verify first) |

**Total RATIFY-now codemod/Builder LOC delta:** +85 to +115 LOC of compiler/runtime work; **0 LOC of codemod** (all four amendments are strictly additive — no userland `.aihu` source changes).

**Updated codemod budget:** Variant B base 560 LOC + 0 codemod from R1-R4 = **560 LOC unchanged**. Compiler/runtime gets +85-115 LOC; under 700 LOC headroom (no re-cut). The 50 LOC for `$prop` reactivity is an emit/runtime change, not codemod work.

### DEFER to v0.4 (high-value, not blocking Variant B)

| # | Item | Source | Defense |
|---|---|---|---|
| D1 | **Declarative Shadow DOM (DSD) in SSR** | A §A7 | Eliminates FOUC + hydration mismatch; ~80 LOC SSR rewrite + runtime DSD-detection. **Best-in-class Web Components SSR** when shipped. Lit-SSR has it; Vue 3 / Svelte 5 don't. Separate spec round; user explicitly asked about Vite-elimination earlier and DSD changes the SSR contract — connection to flag. |
| D2 | **`$aria` collection + auto-keyboard-promotion** | B §4.1 + §4.2 | Highest-leverage marketing proposal in audit. No framework has shipped declarative ARIA + auto-Enter/Space wiring on `$on.click` for keyboard-roles. Auditor A owns `ElementInternals` lowering. Per §2.b, lives in `@state` v2 collection-form, not as a peer block. |
| D3 | **`$controller` collection** | A §A10.4 + B §5.2 | Lit-Reactive-Controller pattern with zero class boilerplate. Free ergonomic win via `@state` v2 collection-form unification. Lit users feel at home; Vue users get lifecycle composables they don't have. |
| D4 | **`$context` collection (provide/inject)** | B §2.1 | Closes the only major data-flow gap vs Vue/Solid. WICG-Context-aligned (`@lit/context` as polyfill); standards-track answer. Auditor A owns lowering. |
| D5 | **`$form` collection (form-associated custom elements)** | A §A3 | `formAssociated = true` + `ElementInternals` form-state. **Aihu would lead the framework field on this** (Vue/Svelte have no first-party answer; only Stencil ships). Pairs with `$aria` — share `attachInternals()` allocation. |
| D6 | **`defineAihuSanitizer` factory + Trusted Types chokepoint** | B §1 | Identity-default sanitizer hook (already in spec §6); B's amendment: ship a one-line factory in `@aihu/runtime` for discoverable integration; consolidate raw-HTML write paths into one chokepoint module so TT can be wired without source surgery in v0.4. Cheap forethought now; expensive retrofit later. |

### DEFER to v0.5+ (lower priority; flag for future)

| # | Item | Source | Defense |
|---|---|---|---|
| L1 | **Shared `adoptedStyleSheets` across instances** | A §A5.1, B §3 | Bytes/parse-time win; invisible runtime change. Land alongside `@style` block work in v0.5+. |
| L2 | **CSS `@layer aihu-component` for cascade control** | A §A5.2 | Lower-stakes; defer to userland convention. |
| L3 | **`$on.click.once` / `.passive` / `.signal` modifiers** | A §A1.5 | Maps to `addEventListener` options. Nice-to-have; userland can `$on.click={fn}` + manual `{ once: true }` via `$ref` today. |
| L4 | **Build-time a11y lint pass** | B §4 (bonus 4) | Mirror Svelte's compiler warnings (missing `alt`, icon-only buttons without `$aria.label`). Cheap; build-time only; lands once `$aria` ships. |
| L5 | **DevTools panel (community)** | B §6.5 | Out of core. Use runtime plugin contract as data source. |
| L6 | **Runtime plugin contract (`defineRuntimePlugin`)** | B §6.2 | Distinct from build-time contract; opens tracing/instrumentation use cases. v0.5+ unless user prioritizes. |
| L7 | **`BuildHost` abstraction (Vite decoupling)** | B §6.3 | The user's earlier "remove Vite" interest lands here. Extract `BuildHost` interface in `@aihu/compiler`; Vite becomes one host adapter. v0.5+ — significant work, not blocking template-syntax v2. |
| L8 | **`$reactive.motion` (`prefers-reduced-motion` aware)** | B §4 (bonus 6) | WCAG 2.2 AAA hook. Ships alongside `@style` block work. |

### REJECT

| # | Item | Source | Defense |
|---|---|---|---|
| X1 | **Customized built-ins (`<button is="my-btn">`)** | A §A8 | Safari refuses to implement (since 2018). Polyfill is non-trivial. Autonomous element + `ElementInternals` (§2.b/§2.c) covers the same use cases without polyfill complexity. Per §2.d above, Auditor A's recommendation AGAINST is ratified. |

### Re-cut threshold check (Director r2 §3 + r1 §7)

- Variant B base codemod: 560 LOC.
- RATIFY-now amendments add: +85-115 LOC of compiler/runtime work, **+0 LOC of codemod**.
- Net codemod budget: **560 LOC unchanged** — under the 700 LOC (~25% headroom) ceiling. **No re-cut required.**
- Compiler/runtime LOC adds ~10-20% to Builder rounds but is purely additive (no userland source migration).

The R4 (`$bind` write-side) is a verification ask, not a codemod expansion. If Builder finds it absent and adds it, that's still compiler/runtime work, not codemod work. No threshold trip.

---

## §4 — Strong-signal proposals worth surfacing first to user

The audit produced 30+ proposals. The user can't review 30 things. Top-5 ranked by signal:

1. **`$prop` reactivity fix (R1, RATIFY-now)** — CORRECTNESS BUG, not sugar. Props are read once at mount via `JSON.parse(getAttribute(name))` (`emit.rs:660-662`); not reactive to parent mutations. Affects every SFC that takes props. The fix is additive (existing `$prop` declarations keep working; new optional keys `attribute`/`reflect`/`converter` enable reactivity). Closes the largest INTEGRABLE-WITH-REWORK gap. Possibly elevates to its own Builder round if Variant B is dispatched first.
2. **`$aria` + auto-keyboard-promotion (D2, DEFER v0.4)** — highest-leverage marketing proposal in audit. No framework has shipped declarative ARIA + auto-Enter/Space wiring. Marketing territory: "first SFC framework with first-class declarative a11y." Cost: medium. Lowering via `ElementInternals` is well-understood (Lit/Stencil precedent).
3. **`$controller` collection (D3, DEFER v0.4)** — Lit-Reactive-Controller pattern with zero class boilerplate via `@state` v2 collection-form unification. Free ergonomic win; cost low. Lit users feel at home; Vue users get lifecycle composables Vue's two-layer (composable + directive) story can't match.
4. **`$context` collection (D4, DEFER v0.4)** — closes the WICG-Context-aligned tree-scoped DI gap. Vue/Solid/Svelte/Lit-via-Context all have answers; aihu's only path today is `globalThis` hoisting. The single largest data-flow gap vs the market.
5. **DSD in SSR (D1, DEFER v0.4)** — best-in-class Web Components SSR (Lit-SSR has it; Vue 3 / Svelte 5 don't). Eliminates FOUC + hydration mismatch. **Connection user explicitly asked about**: Vite-elimination is in the same neighborhood as SSR contract changes; DSD work touches both. Flag the interconnect.

These five are reordered from the user's prompt suggestion. I kept all five candidates in the same order (the prompt recommendation was already well-ranked). Defense for keeping `$prop` reactivity at #1: it's a bug, not sugar. Bugs surface ahead of enhancements.

---

## §5 — User-surface message refinement

**To paste verbatim (Team Lead):**

> **Headline finding from round-3 audit: aihu IS already Web-Components-native.**
>
> Two parallel auditors (platform-integration + cross-cutting) confirmed the compiler emits `customElements.define()` per SFC with default-open Shadow DOM and Constructable Stylesheets. **16 of 38 audited template constructs are already-integrated with platform primitives**; 6 are integrable-with-rework; 13 are genuinely-extrapolating (signal-based reactivity has no platform equivalent); 3 are platform-is-worse. This is a stronger native-platform alignment than Vue or Svelte; closest to Lit. Preserves cleanly through Variant B.
>
> Master audit doc (1200 lines, single source) lands at `docs/superpowers/specs/2026-05-06-spec-template-syntax-v2-platform-audit.md` after Synthesizer.
>
> **Top 5 strong-signal proposals from the audit:**
>
> 1. **`$prop` reactivity fix (RATIFY now).** Props are read once at mount, not reactive to parent mutations — a CORRECTNESS bug. Fix adds optional `attribute`/`reflect`/`converter` keys to `$prop` declarations (Lit-flavored). 50 LOC compiler emit; 0 LOC codemod (purely additive). **Possibly its own Builder round.**
> 2. **`$aria` collection + auto-keyboard-promotion on `$on.click` (DEFER v0.4).** Declarative ARIA via `ElementInternals`; Enter/Space auto-fire on keyboard-role components. **No framework has shipped this** — first-mover marketing territory.
> 3. **`$controller` collection (DEFER v0.4).** Lit-Reactive-Controller pattern with zero class boilerplate inside `@state` v2. Free ergonomic win.
> 4. **`$context` collection (DEFER v0.4).** Closes the WICG-Context-aligned tree-scoped DI gap. Vue/Solid/Svelte/Lit all have it; aihu's only path is `globalThis` hoisting today.
> 5. **DSD in SSR (DEFER v0.4).** Best-in-class Web Components SSR. Lit-SSR has it; Vue 3 / Svelte 5 don't. Eliminates FOUC + hydration mismatch. **Connection to your Vite-elimination interest:** DSD changes the SSR contract; v0.4 is the natural slot to do both.
>
> **Two clear advantages over Vue worth marketing:**
> - **Zero dynamic-code-execution paths in production source.** Vue's runtime template compiler requires `unsafe-eval` unless AOT-precompiled; aihu compiles ahead-of-time, period. CSP-friendly by default.
> - **Collection-form unification across `@state` v2.** Vue's six separate macros (defineProps/Emits/Expose/Slots/Model/Options) can't match the one-block-with-named-collections shape. Each new collection (`$aria`, `$controller`, `$context`) extends the same shape with zero new conceptual cost.
>
> **Two market gaps worth addressing:**
> - **No LSP** — Volar (Vue), Svelte LSP, Stencil all ahead. Largest single devex gap. v0.4 priority?
> - **No tree-scoped DI** — `$context` (proposal 4) closes this. v0.4 priority?
>
> **Codemod budget unchanged at 560 LOC** (RATIFY-now amendments are additive — no userland `.aihu` source changes). Compiler/runtime adds ~85-115 LOC.
>
> **Go/no-go:** "Ratify the four round-3 amendments (`$prop` reactivity fix, `$lifecycle` four-callback, `$show` → `hidden` attr, `$bind` write-side verify) and proceed to Variant B Builder — yes/no? OR: more research first, e.g., spike DSD design for v0.4?"

(Word count: 396.)

---

## §6 — Synthesizer routing

**Route to Synthesizer.** Specifically instruct:

**Output:** ONE master audit doc at `c:\git\fellwork\aihu\docs\superpowers\specs\2026-05-06-spec-template-syntax-v2-platform-audit.md`. **Beside the spec, not buried inside it.** This is the consolidated audit surface for users + future sessions reopening this work.

**Structure (six sections):**

- **§1 — Headline finding.** "aihu IS already Web-Components-native." Plain prose. Cite `emit.rs:858-861`, `define-element.ts:75-87`, `emit.rs:32-77`. Three derived realities: default-open Shadow DOM, Constructable Stylesheets in `@style`, `$prop` not reactive (the bug). This is the audit's most important takeaway — lead with it.
- **§2 — Integration matrix.** Reproduce Auditor A's 38-row matrix (block structure, logic blocks, reactive `@state` collections, attribute handling, macro-elements, SSR, component-creation extension points). Verdict legend (AI/IR/GE/PW). Cite path:line for every aihu claim. This is the longest section — ~400 lines acceptable.
- **§3 — Sugar proposals (consolidated, no overlap).** Per my §2 resolution: `$lifecycle` (per-SFC platform hooks) and `$controller` (composable behaviors) presented as additive. `$aria` collection (not `@a11y` block). `$form` deferred. Customized-built-ins rejected. Style chapter is "what aihu got right" (Constructable Stylesheets). Each proposal: 1-paragraph design, concrete spec sketch, default vs opt-in, escape hatch.
- **§4 — Cross-cutting axes.** Reproduce Auditor B's six axes (security, data flow, style, accessibility, extension, pluggability) × 5+ frameworks (Vue, Lit, Svelte, Solid, Stencil, FAST). Convergent signals + recommended aihu posture per axis.
- **§5 — Ratify-now manifest.** My §3 above (R1/R2/R3/R4 + L+D+X). With explicit codemod LOC delta and re-cut threshold check.
- **§6 — Deferred items.** D1-D6 (v0.4), L1-L8 (v0.5+), X1 (rejected). Each: one-paragraph defense.

**Length cap:** 1200 lines. Bigger than either auditor input is acceptable; this is the consolidated doc.

**Synthesizer makes NO priority calls.** I set them in §3 above. Synthesizer writes the prose, organizes the sections, verifies cross-references between A and B, and ensures the auditors' overlap is resolved per my decisions in §2 above. If Synthesizer finds a conflict between A and B not addressed in this director-note, surface to me before publishing.

**Tone:** professional, opinionated, citation-dense. Match the existing Variant B spec's tone. No emoji.

**Author confidence per section:** §1-§4 high (auditors did the work, Synthesizer is consolidating); §5 high (this director-note is the source); §6 medium (deferred items are listed but not fully designed).

---

## §7 — Continuity check

AGENTS.db delta-layer search confirms records:

- r1 director_note (id 2093935075)
- r2 director_note (id 2273508187, cited)
- architecture_spec / Architect spec (id 76882731, cited as source by both auditors)
- prober_report (id 3373363951)
- topic_summary (id 3978623683, cited)
- sample_catalog (id 2593429655, cited)
- platform_audit / Auditor A (id 1158474995, cited)
- cross_cutting_audit / Auditor B (id 3656749825, cited)

**Drift check:** clean. The two auditors cite each other's findings correctly via boundary callouts. Auditor B explicitly defers lowering details to Auditor A throughout. Auditor A's verdict-roll-up (16/6/13/3 across 38 rows) is internally consistent. Auditor B's six-axes structure is orthogonal to A's per-construct matrix; they cover different surface area.

**Contradiction with prior rounds:** none. Round 1 §1 framing ("v2 widened the felt asymmetry; @state v2 already harmonized but @template v1 lags") and Round 2 §1 framing ("Variant B is the right answer despite Architect's smallest-delta argument") are both preserved. Round-3 audit found no reason to revisit either.

**Aihu-side AGENTS.db registration status:** unchanged — MCP `agents_search` still wired to api-repo. Disk mirrors at `.team/audit-reports/` and `.team/director-notes/` are authoritative for the aihu repo. Not blocking.

**One subtle continuity pickup**: Auditor B notes the `@style` block is currently in spec §10 IS-NOT-IN. Auditor B's recommendations don't change the IS-NOT-IN list; they are v0.4-or-later doc/runtime work. No spec re-litigation. Confirmed.

---

## §8 — Iteration discipline

**Counter:** 0 of 5 (Builder ↔ Verifier). **Round 3 of governance/research; not a Builder iteration.**

**Justification for round-3 research depth before Builder:** the user explicitly invoked the audit twice ("yes audit" + "look at syntactic sugar" + "comprehensive and thorough" + "broader concerns"). Three rounds of research before Builder is justified by **user-directed scope expansion**, not analysis paralysis. The user asked for breadth; we delivered breadth.

**Analysis-paralysis check (Director r1 §7):** would Builder dispatch in round 4 actually deliver substance? Yes. Variant B is fully scoped (Architect spec 540 lines + Director r2 reconciliation + Prober fixtures + this round's R1-R4 amendments). All open questions have Director-defaults proposed. The only blocker is the user gate (one go/no-go question per §5).

**Flag for retro:** if Builder isn't dispatched in round 4 (or if user expands scope a third time), Director must explicitly re-justify — three rounds of research before Builder is unusual and on the edge of the iteration discipline. The user-directed scope expansion is the load-bearing justification; if it stops, the discipline tightens.

**Re-cut threshold (Director r1 §7 + r2 §3):**
- Architect spec: 540 lines (under 600 ceiling — pass).
- Variant B trigger categories: 3 of 4 (sigil change, value-form change, structural addition; runtime contract preserved). r2 override stands — user gate is the binding constraint.
- Round-3 RATIFY-now amendments: all additive (no new sigil, no value-form change, no structural addition; +85-115 LOC compiler/runtime, +0 LOC codemod). **Trigger count unchanged.** No re-cut.

**Hard gate per Director r1 §7:** Builder dispatch blocked until user approves direction. **Reconfirmed this round.**

**Re-cut paths:**
- If user approves RATIFY-now amendments + green-lights Builder: round 4 = Builder dispatch; counter goes to 1/5.
- If user wants `$aria` or DSD lifted into round-3 ratification: Director r4 with re-cut (trigger count goes to 4 of 4; codemod budget exceeds 700 LOC — formal re-cut required).
- If user defers Variant B and wants a v0.4 spike on DSD or `$aria` first: Director r4 captures that; counter stays 0/5; new track may be opened.

---

*End of round 3 director-note. Synthesizer to be invoked next per §6. STATUS line + AGENTS.delta.db record below in companion outputs.*
