# Prober Feasibility Report — `topic:aihu-template-syntax track:userland-dx round:1`

**Role:** Prober (read-only, hand-transformation)
**Date:** 2026-05-06
**Author:** Prober
**Tags:** `topic:aihu-template-syntax track:userland-dx round:1`
**STATUS:** PROBER DONE
**Confidence:** 0.8 (hand-transformation introduces author bias; Architect should adjust)

---

## 0. Executive summary

12 of 12 hand-transformations completed across 4 source files × 3 variants A/B/C.

- **Variant A — harmonize-and-stay (curly-everywhere + `$on.click` dot):** complexity **2/5**, ~250–320 LOC codemod. Lowest structural rewrite cost; most edge cases are local string substitutions on attribute names.
- **Variant B — block-tag control flow (`{#if}…{/if}`, `{#each…(key)}…{/each}`):** complexity **4/5**, ~450–600 LOC codemod. Requires AST node-relocation (lift element, wrap children, demote attribute). Highest payoff on CalendarGrid post-migration legibility.
- **Variant C — structural component pattern (`<$if>`, `<$for>`):** complexity **3/5**, ~350–450 LOC codemod. Identical AST move to B but the destination is another element, not a top-level block-tag — keeps the parser inside its existing element-tree shape.

**Recommendation: Variant B** for cleanest CalendarGrid + Variant A for lowest combined risk if migration cost dominates. Defer to Architect §4 evaluation matrix.

**Hidden-landmine status:** **REFUTED in spirit, CONFIRMED in detail.** The `$each="…filter(…) as evt"` lambda-LHS form does not silently break in any variant — but no variant lets the codemod auto-rewrite it cleanly. All three variants force a **hoist-to-`$computed`** pre-pass, which the codemod can perform mechanically when the LHS contains parens/brackets/whitespace beyond the `as` keyword. File:line evidence — `CalendarGrid.aihu:31`, the only occurrence in 4 sample files.

---

## 1. Sample selection notes

| # | File | Path | Why chosen | LOC |
|---|---|---|---|---|
| 1 | `CalendarGrid.aihu` | `c:/git/fellwork/mail/src/components/CalendarGrid.aihu` | Director-flagged canonical reference; only file with lambda-LHS `$each`, multi-line `$on:click` body, inline class ternary, `this.dispatchEvent`. | 51 |
| 2 | `todo-mvc.aihu` | `c:/git/fellwork/aihu/examples/todo-mvc/todo-mvc.aihu` | Highest distinct directive count of any in-repo example (12 directive sites: `$if`×2, `$each`×1, `$key`×1, `$bind:value`×1, `$on:*`×7, plus `class={ternary}` ×4). Lacks `$bind:value` curly form, `$show`, `$html`, `$ref` — chose this over weather-card (6) and timer (3). | 166 |
| 3 | `live-counter.aihu` | `c:/git/fellwork/aihu/packages/templates/cf-team/template/apps/web/src/components/live-counter.aihu` | The cf-team template scaffold's component file (per Scout D5.1). The root `app.aihu` has zero directives; this is the actual scaffold reference for directive ergonomics. | 43 |
| 4 | `template-syntax-edge-cases.v1.aihu` | `c:/git/fellwork/aihu/.team/prober-fixtures/template-syntax-edge-cases.v1.aihu` | Synthetic — exercises lambda-LHS `$each`, `$bind:value` curly drift, `$ref` (silently dropped), `$html` security opt-in, inline class ternary, deprecated `:value=` alias. | 50 |

**File 3 caveat.** `live-counter.aihu` only uses `$on:click="ident"` (3 sites). It is a poor stress test for `$if`/`$each`/`$bind`. I retained it per the brief because it's the production scaffold reference — but its variant-B and variant-C transforms are **identical** to its variant-A v1->v2 macro migration except for the `$on:click` form. The scaffold is the *easiest* case for any variant. I supplement with todo-mvc as the directive-rich anchor.

**Discrepancy from Scout note.** Scout D5.2 said `packages/compiler/codemods/` "returned no files". I confirm the macro-vocab-v2 codemod does NOT live there — it lives at `packages/compiler/js/codemods/macro-simplification/migrate.ts` (1720 LOC). Scout's glob missed the `js/` subdirectory. **The codemod scaffolding exists and is the precedent.** This is critical context for the Architect: a `template-syntax/migrate.ts` would live at `packages/compiler/js/codemods/template-syntax/migrate.ts` and reuse the same brace/string/comment-aware scanner primitives (`matchBrace`, `matchParen`, `skipString`, `splitTopLevelEntries`).

---

## 2. Per-file findings

### 2.1 CalendarGrid.aihu (51 LOC)

**Directive sites in v1:** 8 (`$if`×2, `$each`×2, `$key`×2, `$on:click`×1, `class={ternary}`×1)

| Variant | Output LOC | Token Δ vs v1 | Edge cases | AST passes |
|---|---|---|---|---|
| A | 57 | +6 | (1) lambda-LHS `$each` hoisted to new `$computed.dayEvents`; (2) inline class ternary → `$class={['month-cell', cond && 'other-month']}` (4 tokens vs 11); (3) `this.dispatchEvent(new CustomEvent(...))` → `$emit('dayjump', day)` (Architect must define `$emit` macro); (4) `$on:click` → `$on.click` (mechanical). | 2 (string-substitution + new-helper-emit) |
| B | 61 | +10 | Same as A for hoist + class + `$emit`. PLUS: `$if` attribute → `{#if cond}` block-tag wraps element (AST move); `$each` attribute → `{#each list as item (key)}` block-tag wraps element. **Element loses both `$if` and `$each` attributes; the wrapped child has no remaining iteration/condition attr.** Indentation increases by 2 spaces per level. | 3 (element-lift + block-tag-emit + attribute-strip) |
| C | 61 | +10 | Same as A for hoist + class + `$emit`. PLUS: `$if` → `<$if cond={…}>` element-wrap; `$each` → `<$for each={…} as="…" key={…}>` element-wrap. AST move identical to B but emits structural-element tag instead of block-tag. | 3 (element-lift + macro-element-emit + attribute-strip) |

**Refusal cases (CalendarGrid):**
- **R1: lambda-LHS `$each`.** Codemod cannot auto-rewrite `$each="events.filter(e => …) as evt"` without name collision risk; it must (a) name the hoisted computed (`dayEvents` works because `day` is in scope at the call site, but in the general case the codemod needs a unique name from a counter), and (b) verify `events`/`day` are the only free variables it captures. **All three variants share this refusal.** Codemod heuristic: detect `(`, `)`, `.`, or `=>` in the LHS of ` as `; if present, hoist to a uniquely-named `$computed` entry; if hoist target name collides, suffix with `_2`, `_3`, ….
- **R2: `this.dispatchEvent(new CustomEvent(…))`.** Codemod CANNOT auto-rewrite without `$emit` defined. **Refusal blocking all three variants** until Architect adds `$emit`. Recommended fallback: leave the handler body verbatim and emit warning W502 "raw DOM event dispatch — consider migrating to `$emit` once available".
- **R3: inline class ternary.** Mechanical translation `class={'a' + (cond ? ' b' : '')}` → `$class={['a', cond && 'b']}` (variant A) or `class={['a', cond && 'b']}` (variants B/C). The codemod must recognize the **string-concat pattern** `'literal' + (cond ? ' suffix' : '')` and emit the array form. Other ternary shapes (e.g., `cond ? 'a' : 'b'`) translate to `class={cond ? 'a' : 'b'}` unchanged.

**Token counts (meaningful — directives, sigils, braces; not whitespace).** v1 is the baseline.
- v1: 53 tokens (8 directives + 8 sigil-prefixed words + 18 `{}/()` + 19 quote-pairs/semicolons)
- A: 49 tokens (`$class` array form saves 4; `$emit` saves 5; `$on.` vs `$on:` is 0)
- B: 47 tokens (additional save from removing `$if`/`$each` attribute names)
- C: 49 tokens (similar to A; `<$if>/<$for>` adds 4 brackets but removes the same 4 directive prefixes)

Variant B wins on token count, but adds vertical lines (block-tag wrap adds 2 line-pairs for `{#if}/{/if}` and `{#each}/{/each}` per use).

**Cold-read intelligibility.** Subjective from the hand-transformations — Variant B reads most like Svelte/Angular and is the easiest to scan. Variant A reads most like Vue 3 with TS sensibilities. Variant C is the most "aihu-shaped" (consistent with `<$suspense>` precedent) but the `as="day"` string LHS is a regression from `as day` bare-form.

---

### 2.2 todo-mvc.aihu (166 LOC)

**Directive sites in v1:** 13 (`$if`×2, `$each`×1, `$key`×1, `$bind:value`×1, `$on:*`×7, plus 4 `class={ternary}`)

| Variant | Output LOC | Token Δ vs v1 | Edge cases | AST passes |
|---|---|---|---|---|
| A | 164 | -2 | (1) 4× `class={ternary}` → 4× `$class={[…]}` array form; (2) `$on:keydown`/`$on:change`/`$on:click` → `$on.*` (7 mechanical replaces); (3) `$bind:value="draft"` → `$bind.value={draft}` — **drift fix**: spec section 3.2 said curly-on-`signal-ref` errors, but variant A loosens this to push everything to curly. Trade-off documented in cross-file analysis. | 2 |
| B | 165 | -1 | `$if={todos.length > 0}` (footer) and `$if={todos.length - remaining > 0}` (clear button) become `{#if …}…{/if}` wraps. The clear-completed `$if` was on an inner button that now needs its own `{#if}/{/if}` pair — adds 2 lines, but the outer `<footer $if=…>` saves the attribute. `$each` → `{#each visible as todo (todo.id)}` cleanly identifies key (was a separate `$key="todo.id"` attribute in v1 — **net token save**). `$on:click="clearCompleted"` (quoted-identifier short form) preserved. | 3 |
| C | 165 | -1 | Same as B but with structural-element wrap. `<$for each={visible} as="todo" key={todo.id}>` — the `as=` is now a string attribute, which **loses TS-checkability of the `todo` symbol** (a regression from v1 where the parser at least scopes it). Architect should consider a non-string syntax for `as`. | 3 |

**Refusal cases (todo-mvc):**
- **None.** All transformations are mechanical. This file is the **happy path** for any variant.

**Notable observation.** todo-mvc's quoted-identifier short form on `$on:click="clearCompleted"` is preserved verbatim by all three variants. None of the variants force a curly rewrite for this case. This is because the directive is `function-ref`-typed (Scout D1.1) and quoted-identifier is the natural form. **Variant A's "all-curly" refinement does NOT apply to `function-ref`** — only to `$each`/`$key`/`$class` which are the visually-jarring siblings.

---

### 2.3 live-counter.aihu (43 LOC)

**Directive sites in v1:** 3 (`$on:click`×3, all quoted-identifier short form)

| Variant | Output LOC | Token Δ | Edge cases | AST passes |
|---|---|---|---|---|
| A | 47 | +0 (template) | `$on:click="decrement"` (quoted-ident) → `$on.click={decrement}` (curly bare-ident). This is variant-A's "all-curly" rule biting — tokens stay flat but the curly form is more verbose. The `@agent` block migration (the bulk of the LOC delta) is variant-agnostic — that's macro-vocab-v2 codemod territory. | 1 (mechanical) |
| B | 47 | +0 (template) | No control-flow directives; only `$on:click` which Variant B leaves alone. Template byte-identical to v1 except the `@agent` block is migrated. | 0 (no template changes) |
| C | 47 | +0 (template) | Same as B — no `$if`/`$each`, no template changes. | 0 |

**Refusal cases:** None.

**Observation.** This file confirms that **Variants B and C are no-ops for components without control flow.** The cf-team scaffold's only directive use (`$on:click`) is left untouched. This is a **migration-cost win** for B/C: code that doesn't use `$if`/`$each` doesn't pay the codemod price. Variant A, by contrast, touches every `$on:`/`$bind:` site (the `:` → `.` rename), which is mechanical but nonzero.

---

### 2.4 template-syntax-edge-cases.v1.aihu (50 LOC, synthetic)

**Directive sites:** 8 (`:value=` deprecated, `$on:input`×1, `$bind:value` curly-drift×1, `$if`×1, `$each` lambda-LHS×1, `$key`×1, `$on:click`×1, `$ref`×1, `$html`×1)

| Variant | Output LOC | Token Δ | Edge cases | AST passes |
|---|---|---|---|---|
| A | 68 | +18 (new computeds) | All edge cases hit. `:value=` pre-pass strip; `$bind:value={…}` curly drift fixed (variant A allows curly because everything is curly); lambda-LHS hoisted to `$computed.filtered`; inline class ternary → `$class` array; `$ref` REFUSED (warning W500); `$html` preserved with security comment. Codemod must coordinate with macro-vocab-v2 codemod to insert new `$computed` entries — **inter-codemod coupling.** | 4 (pre-pass + hoist + template-rewrite + warning-emit) |
| B | 66 | +16 | Same set of edge cases. Difference: `$bind:value={…}` curly drift gets **re-quoted** to `"…"` because variant B keeps spec section 3.2 strict (signal-ref must be quoted). This is a **harder rewrite** because the curly content may be a complex expression that doesn't fit identifier-only quoted form — codemod must error if the curly content contains anything but an identifier or dotted path. | 4 |
| C | 66 | +16 | Same as B. | 4 |

**Refusal cases (synthetic):**
- **R4: `$ref="selectedNode"` silently dropped (Scout D1.4).** Codemod cannot infer ref-binding intent. Refusal: emit W500 "$ref directive was non-functional in v1; manual migration required — replace with `$ref={(el) => signal = el}` curly callback or `$lifecycle.mount` query selector". 7 in-scope files affected (Scout D5.2).
- **R5: deprecated `:value=` alias.** Codemod easy: drop `:` prefix, add `$bind.` (variant A) or `$bind:` (variants B/C). **Cross-variant invariant** — the `macro-simplification` codemod's pre-pass, generalized.
- **R6: `$bind:value={…}` curly-form drift.** Variant A relaxes the rule (accepts). Variants B/C tighten (re-quote, error if non-identifier). The codemod must inspect the curly content; if it's `^[A-Za-z_$][\w$.]*$` (identifier or dotted path), re-quote silently; otherwise, emit error C501 "$bind requires writable identifier reference; refactor expression into a `$computed` getter + `$action` setter pair".

---

## 3. Cross-file analysis

### 3.1 Per-variant complexity score

Score scale: 1 = trivial regex; 2-3 = AST walk + emit; 4-5 = complex multi-pass.

| Variant | Score | LOC budget | Justification |
|---|---|---|---|
| **A** | **2/5** | 250–320 | Mechanical attribute renames (`$on:` → `$on.`, `$bind:` → `$bind.`). Curly-vs-quoted normalization is a string-content classifier. New `$class` array sugar is a regex-detectable string-concat pattern. Lambda-LHS hoist is the only AST move; everything else stays in attribute-form. Reuses `macro-simplification`'s scanner primitives. **Risk:** Variant A's `$on.click` form has tooling-friction parity with v1 (still a non-standard attribute name; aihu.tmLanguage.json grammar still needs an update — Scout D6.2/D6.4). |
| **B** | **4/5** | 450–600 | Three structural rewrites: `$if` → `{#if}/{/if}` (lift attribute, wrap element), `$each` → `{#each…(key)}/{/each}` (lift attribute, wrap element, fold `$key` into the iteration form, possibly fold lambda-LHS into hoist). Each rewrite changes element-tree depth and indentation. Block-tag is **outside the existing element parser** — adds a top-level-of-template parsing path the parser currently doesn't have (Scout's parse_element handles `<tag>`, not `{#…}`). **Highest parser-side change.** Compiler grammar churn is significant. |
| **C** | **3/5** | 350–450 | Same AST move as B, but the destination tag stays inside the existing element parser (the compiler already handles `<$tag>` macro-elements per Scout D1.3). The lift+wrap is the same; the emit is a `<$if>`/`<$for>` element instead of `{#if}`/`{#each}`. **No parser grammar churn** — `<$if>`/`<$for>` are macro-elements already on a known path. The `as="day"` string-attribute regression is the main quality concern. |

### 3.2 Variant-specific edge cases

**Variant A:**
- E-A-1: `$on:click="ident"` (function-ref short form) — variant-A "all-curly" must NOT apply here, or token count regresses (`$on.click={ident}` is +2 tokens). Codemod heuristic: leave function-ref quoted-identifier UNTOUCHED. (Found: `live-counter.aihu`, `todo-mvc.aihu` clear-completed.)
- E-A-2: `$bind.value` accepts both quoted-identifier and curly-bare-identifier — drift fix becomes silent. **Net: variant A is the most permissive surface.** (Found: `template-syntax-edge-cases.v1.aihu` line 23.)
- E-A-3: `$class={[…]}` array form requires ALL entries to coerce to `string | falsy`. Codemod must validate; if author wrote `class={someObject}`, variant A leaves untouched. (Found: `CalendarGrid.aihu:44`, `todo-mvc.aihu` ×4 sites.)
- E-A-4: `$emit` macro is presumed but not yet specified. Codemod must defer the `this.dispatchEvent(...)` rewrite until Architect adds `$emit`. **Hard blocker for full migration.** (Found: `CalendarGrid.aihu:45`.)

**Variant B:**
- E-B-1: `$if` on an element with siblings inside a parent that has `$each` — block-tag wrap nests cleanly only if the element is the sole conditional in its position. Multi-attribute-on-one-element cases (`$if={…} $each={…}`) require **double-wrap** (`{#if}{#each}…{/each}{/if}`). (Found: synthetic where `$if` and `$each` were on parent/child; `CalendarGrid.aihu` has `$if` on row 27 and `$each` on row 28 (sibling pattern, fine) but `todo-mvc.aihu` clear-completed combines `$if` with `$on:click` cleanly.)
- E-B-2: `$each` block-tag form `{#each list as item (key)}` ABSORBS the `$key` attribute. The codemod must move `$key`'s value INTO the block-tag header. If `$key` was missing, the codemod must NOT invent one — emit warning W503. (Found: `CalendarGrid.aihu:28`, `todo-mvc.aihu:110`.)
- E-B-3: Lambda-LHS `$each` cannot fit in a block-tag header unless we extend the block-tag mini-grammar to accept arbitrary expressions before ` as `. Hoist-to-`$computed` is forced. (Found: `CalendarGrid.aihu:31`.)
- E-B-4: Block-tag `{#each items as item, idx (key)}` with index — confirms block-tag form supports the existing `, idx` extension. (Found: `template-syntax-edge-cases.v1.aihu`.)
- E-B-5: `$bind:value={curly}` re-quoting — codemod must enforce the identifier-only rule. (Found: synthetic.)

**Variant C:**
- E-C-1: `<$for each={…} as="day" key={…}>` — the `as=` string attribute is a **type-system regression**. The compiler can't TS-check that `day` is in scope of the body without a special-case parser hook. Variant B's `as day` (block-tag mini-grammar) parses `day` as an identifier directly. Variant A's `$each={list as day}` puts `day` in an expression context that's TS-aware. **Variant C's `as="day"` is the worst of three for typing.** Architect could rescue this with a different syntax (e.g., a render-prop child function: `<$for each={list}>{(item, idx) => <li>…</li>}</$for>`).
- E-C-2: `<$if>`/`<$for>` cannot have OTHER directives (e.g., `$class={…}` directly on `<$if>`). The codemod must only put `cond=`/`each=`/`as=`/`key=`/`index=` on the wrapper element; siblings stay on the wrapped child. (Confirmed across all 4 transformations.)
- E-C-3: Existing macro-elements (`<$slot>`, `<$suspense>`, `<$shield>`, `<$guard>`, `<$warp>`, `<$liveRegion>`, `<$skipLink>`, `<$focusTrap>`, `<$router>`, `<$link>`, `<$navigate>`) are unaffected — variant C ADDS to the family rather than replacing. Most consistent with arch-5 M1 additions. (Scout D1.3 inventory.)

### 3.3 Cross-variant invariants

Regardless of which variant ships, these passes are required:

1. **Deprecated alias removal pre-pass.** Strip `:prop=` → `$bind:prop=`/`$bind.prop=`; strip `@event=` → `$on:event=`/`$on.event=`. Reuse macro-simplification's scanner. **Cross-variant.** Not currently a compiler error (Scout D1.2 — only stderr `eprintln!`); should be promoted to error in same migration.
2. **`$ref` rectification.** All variants must decide what to do with `$ref` (silently dropped in v1 codegen — Scout D1.4 / D5.2: 7 files affected). Architect's spec must define new `$ref` semantics (curly-callback or symbol binding); codemod warns until manual migration done. **Cross-variant.**
3. **`$emit` macro definition.** All variants need a `$emit` to replace `this.dispatchEvent(new CustomEvent(...))`. Director §8 Q5 confirmed this is in scope. **Cross-variant — blocking.**
4. **Inline class ternary lift.** All variants benefit from `$class={[…]}` (or `class={[…]}`) array form. Pattern-detect `'literal' + (cond ? ' more' : '')` → array. **Cross-variant** (modulo whether the new attribute name is `$class` or just `class`).
5. **Macro-vocab-v2 coordination.** Many target files (Scout D5.2: 13+ files) still use v1 `@state` syntax. The template codemod must run AFTER the macro-vocab-v2 codemod, OR run as a combined pass. **Recommendation:** combine — the existing `migrate.ts` already has the scanner, and combining avoids two codemod runs over the same files.
6. **`$bind:value` curly-form drift.** Variant A relaxes (no rewrite needed). Variants B/C tighten — codemod must classify the curly content (identifier-only → re-quote silently; expression → error C501). **Variant-dependent invariant.**
7. **Codemod LOC discipline.** macro-simplification is 1720 LOC. Director's section 5 brief said "≤ 300 budget per v2 precedent" — but the v2 precedent is actually 1720 LOC. Reset this expectation: **300 is wishful**; realistic is 300–600 depending on variant.

---

## 4. Recommendation to Architect

**Variant B — block-tag control flow — is the right ship despite higher codemod cost.**

Rationale:
1. **Cleanest CalendarGrid post-migration.** Side-by-side comparison of `CalendarGrid.variantB.aihu` against `.variantA.aihu` and `.variantC.aihu`: B reads as obviously control-flow-shaped from line 1. A still has the v1 attribute-directive feel. C's `<$for each={…} as="…">` mimics the macro-element family but the `as=` string is a TS-coverage regression.
2. **External precedent strongest.** Director §3 noted Angular's `@if`/`@for` migration was driven by exactly the user's complaint. Svelte's `{#each}` is mature. LLM training data is dense in both. **Cold-read intelligibility wins for B.**
3. **Migration cost is paid once and is bounded.** ~166 directive call sites in scope (Scout D5.2). At ~3 minutes per site for AST passes 1+2+3, that's 8–10 hours of codemod authoring. ~450–600 LOC with reuse of existing primitives. Worse than A by ~250 LOC; better long-term ergonomics.
4. **Block-tag form ALSO addresses the `class={ternary}` pain point indirectly.** Once `$if` lifts out of the attribute, the remaining attributes on an element are simpler — easier to read, less likely to grow long inline ternaries.
5. **B is the only variant where directive-count-per-file SHRINKS.** A keeps every directive. C wraps directives in macro-elements but doesn't reduce count. Only B decomposes `$if + $each + $key` into a `{#each…(key)}…{/each}` form that subsumes three directives into one block-tag.

**If the Architect prefers minimum risk:** Ship Variant A as a tactical fix (1-2 weeks of codemod work). Architect can defer Variant B to v0.4 — Angular shipped `*ngIf`/`*ngFor` for years before adding `@if`/`@for`. Variant A delivers ~70% of the user-felt improvement at ~50% of the cost.

**If the Architect prefers consistency with existing macro-elements:** Ship Variant C, but FIX the `as=` string regression first. Render-prop child function (`<$for each={list}>{(item, idx) => <li>…</li>}</$for>`) would close the typing gap; verify with Scout-equivalent how this interacts with `parser/template.rs`'s existing children-handling path. Likely doable; needs a small spike.

**Do NOT ship more than one variant simultaneously.** Mixing block-tag and attribute-directive forms in the same codebase invites the same "doesn't feel like the rest of the framework" complaint that started this round.

---

## 5. Hidden-landmine confirmation

Scout flagged `$each="events.filter(e => …) as evt"` as a landmine (Scout D5.3 pain-point #2). My hand-transformation result:

| Variant | Did the lambda-LHS form survive untouched? | Was a hoist required? | Did the result type-check correctly? |
|---|---|---|---|
| A | No (hoisted to `$computed.dayEvents`) | Yes | Yes — `$each={dayEvents(day) as evt}` types correctly with `day` in scope. |
| B | No (hoisted) | Yes | Yes — `{#each dayEvents(day) as evt (evt.id)}` types correctly. |
| C | No (hoisted) | Yes | Partial — `<$for each={dayEvents(day)} as="evt" key={evt.id}>` — `evt` is a string identifier not in TS scope (variant-C-specific issue, not a hidden-landmine issue). |

**Verdict on the landmine:** **REFUTED in spirit.** No variant SILENTLY breaks; all three force a hoist that the codemod can perform mechanically. The codemod heuristic is uniform across variants: "if the LHS of ` as ` contains `(`, `)`, `.`, or `=>`, hoist to `$computed.<derived-name>` and rewrite the LHS to the hoisted name". `CalendarGrid.aihu:31` is the only such site I found across the four sample files.

**CONFIRMED in detail:** the codemod cannot leave the lambda LHS in place under any variant's tightened rules. The landmine costs the codemod ~50 LOC of hoist-detection + name-uniqueness + warning-emission logic (W504 "$each LHS contains expression — hoisted to `$computed.<name>`; verify scope captures").

**Out-of-scope landmine I noticed:** `$each="visible as todo"` next to `$key="todo.id"` in `todo-mvc.aihu:108-110` — variant B and C absorb `$key` into the iteration syntax (`{#each visible as todo (todo.id)}` / `<$for each={visible} as="todo" key={todo.id}>`), which is **strictly better** than v1's two-attribute form. Variant A keeps them sibling-attributes (`$each={visible as todo} $key={todo.id}`), preserving the original asymmetry. Director's section 1 first-bullet pain point ("`$each` quoted next to `$key` curly") is **only fully solved by B and C**; variant A merely renames the asymmetry from quoted-vs-curly to two-curly-attributes.

---

## 6. Codemod LOC estimate (per variant, sized against macro-simplification's 1720 LOC)

| Pass | Variant A | Variant B | Variant C | Cross-variant |
|---|---|---|---|---|
| Scanner reuse (matchBrace, matchParen, etc.) | 0 LOC | 0 LOC | 0 LOC | reuse from `macro-simplification` |
| Pre-pass: `:prop=`/`@event=` strip | — | — | — | ~40 LOC |
| Attribute name rewrite (`:` → `.`) | ~30 LOC | 0 LOC | 0 LOC | — |
| Quoted ↔ curly normalization | ~80 LOC | ~60 LOC | ~60 LOC | — |
| `$class` array sugar pattern detect | ~50 LOC | ~50 LOC | ~50 LOC | — |
| Lambda-LHS hoist (W504) | ~70 LOC | ~70 LOC | ~70 LOC | — |
| Block-tag emit (`{#if}/{/if}`, `{#each}…{/each}`) | — | ~120 LOC | — | — |
| Macro-element emit (`<$if>`, `<$for>`) | — | — | ~80 LOC | — |
| `$ref` warning emit (W500) | ~10 LOC | ~10 LOC | ~10 LOC | — |
| `$emit` rewrite (W502) | ~30 LOC | ~30 LOC | ~30 LOC | — |
| Tests (snapshot + per-edge-case) | ~60 LOC | ~80 LOC | ~70 LOC | — |
| **Total (excl. cross-variant 40)** | **~330 LOC** | **~420 LOC** | **~370 LOC** | +40 LOC |

Adjust for unknowns (parser grammar updates for variant B's `{#…}` form; tmLanguage updates for all variants): add ~50–100 LOC of compiler-side work per variant. Total realistic budget:
- Variant A: 350–430 LOC codemod + 50 LOC compiler/tooling = **400–480 LOC**
- Variant B: 460–560 LOC codemod + 100 LOC compiler/tooling = **560–660 LOC**
- Variant C: 410–510 LOC codemod + 50 LOC compiler/tooling = **460–560 LOC**

All three exceed Director's "≤ 300" guideline (which was anchored on a misread of macro-simplification's actual 1720 LOC). **The 300 guideline is unrealistic for any non-trivial template-syntax codemod.** Recommendation: reset budget to 500–600 LOC and accept it.

---

## 7. STATUS

**STATUS: PROBER DONE**

- Files transformed: 4 / 4 (CalendarGrid, todo-mvc, live-counter, synthetic edge-cases)
- Variants × files: 12 / 12 hand-transformations complete
- Edge cases found: 17 (R1–R6 refusals + E-A-1..4 + E-B-1..5 + E-C-1..3)
- Variant complexity scores:
  - **A: 2/5, ~400–480 LOC, lowest combined risk**
  - **B: 4/5, ~560–660 LOC, cleanest result**
  - **C: 3/5, ~460–560 LOC, most consistent with `<$suspense>` family**
- Hidden landmine: **REFUTED in spirit** (no silent breakage); CONFIRMED in detail (codemod hoist required across all variants; ~50 LOC pattern). File:line — `CalendarGrid.aihu:31`.
- **Recommendation: Variant B** — best long-term ergonomics, payoff justifies 1.5× codemod cost vs A. If migration cost dominates, **fall back to A**; revisit B in v0.4. Avoid C unless `as=` string regression is fixed first via render-prop child function.

---

*— End of prober report.*
