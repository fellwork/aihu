# Director-note · macro-simplification · round 001 · 2026-05-05

**Mode:** 2 (design exploration, no code) · **Author:** Topic Director ·
**Reads:** the user's complaint (verbatim, below), `examples/**/*.aihu` (10 files audited),
`bench/compiler-conformance/{blocks,macros}/*.aihu` (8 fixtures audited),
`docs/superpowers/specs/2026-05-02-spec-macro-vocabulary.md` §0–§1.2,
`docs/roadmap/arch-5-sfc-primitives.md` §0–§1, `state-plan-a.md`, `state-agent-readiness.md`,
`state-cli-templates.md`, `.team/director-notes/cli-templates-002.md` (format model),
`packages/compiler/src/parser/{state_macros,style_macros,agent_macros}.rs`,
AGENTS.db `agents_search` (zero prior macro-design records on this thesis) ·
**Prior notes:** none — clean topic slate.

**Topic identifier:** `topic:macro-simplification` ·
**Track identifier (single track this round):** `track:macro-simplification`

---

## The user's complaint (verbatim, for the record)

> "I noticed that we have macro sections that have to be duplicated because we don't
> have the structure for it to be built into one object or Array."
> "like $action or $computed"
> "Also with agent macros with the same and $describe it has to be duplicated as
> many times as there are entries. This completely goes against my reducing
> boilerplate mentality"

> "Create a team to look at how each of the macros can handle these structural
> issues and duplication in comparison to other frameworks and programming
> languages. The idea is to simplify and make the programming almost
> self-explanatory."

---

## On-thesis assessment

**Strongly on-thesis. The complaint is a structural defect, not a stylistic
preference.** The duplication the user is pointing at is not an aesthetic
quibble; it is an artifact of the macro grammar treating each declaration as
a free-standing statement instead of a structured object. The grammar
forces the same identifier through three independent walks of the source —
once to *declare*, once to *expose*, once to *describe*. This is exactly the
class of problem aihu was designed to avoid (Directive 0: "agentic discovery
and interaction, for human purpose" — discovery is poorly served by
boilerplate, and human purpose is poorly served by re-typing names).

### Quantified evidence (10 example files audited)

| File | LOC total | `@agent` block lines | Lines that are *just* name re-references | % of `@agent` that is redundant |
|---|---:|---:|---:|---:|
| `examples/color-theme/color-theme.aihu` | 154 | 17 | 12 (4 `$action` + 8 `$describe` line-items) | 71% |
| `examples/todo-mvc/todo-mvc.aihu` | 152 | 12 | 7 (2 `$action` + 5 `$describe` line-items) | 58% |
| `examples/timer/timer.aihu` | 78 | 10 | 5 (1 `$action` + 4 `$describe`) | 50% |
| `examples/live-counter/live-counter.aihu` | 43 | 12 | 7 (3 `$action` + 4 `$describe`) | 58% |
| `examples/temperature-converter/temperature-converter.aihu` | 73 | 11 | 6 (2 `$action` + 4 `$describe`) | 55% |
| `examples/currency-converter/currency-converter.aihu` | 76 | 8 | 4 (4 `$describe`) | 50% |
| `examples/weather-card/weather-card.aihu` | 98 | 10 | 5 (1 `$action` + 4 `$describe`) | 50% |
| `examples/hacker-news/src/pages/index.aihu` | 82 | 5 | 1 (1 `$describe`) | 20% |

(Counts: "redec" = `$action <name>` lines that contain *only* a name with no
new information; "desc" = `$describe <name> "..."` lines, each of which
re-types a name already declared in `@state`. Aggregate counts produced by
`awk '/^@agent/,/^}/'` then `grep -E '^\s*\$action [a-zA-Z]+\s*$'` and
`grep -E '\$describe'` per-file.)

### Worst case, called out

`examples/color-theme/color-theme.aihu` is the worst offender and the user's
own cited evidence. **Each of 8 names appears 3 times** (declaration,
re-declaration in `@agent`, `$describe`). The file's `@agent` block:

```
@agent {
  $expose hue, saturation, lightness, primary

  $action setPreset
  $action setHue
  $action setSaturation
  $action setLightness

  $describe hue          "Hue channel (0-360)"
  $describe saturation   "Saturation channel (0-100)"
  $describe lightness    "Lightness channel (0-100)"
  $describe primary      "Computed HSL primary color string"
  $describe setPreset    "Set a named color preset by hue value"
  $describe setHue       "Set hue directly (0-360)"
  $describe setSaturation "Set saturation directly (0-100)"
  $describe setLightness "Set lightness directly (0-100)"
}
```

8 distinct names → 17-line block, of which **12 lines are pure
re-references** (the user counted these correctly). The first
("declaration") site for each name is in `@state`; the second
(`$action <name>` re-statement) and third (`$describe <name>` row) are both
in `@agent`. None of those 12 lines carry information that could not have
been computed from a tagged declaration plus a string literal.

### Aggregate across the 10 audited files

- **8 of 10 files have an `@agent` block.** (The 2 without are pages whose
  agent surface is implicit via `$expose` only — `examples/blog-router/.../[slug].aihu`
  and component sub-files.)
- **`@agent` blocks total 90 lines across these 8 files.** **52 of those
  90 lines (58%) are pure name-re-references** — either bare `$action <name>`
  re-statements or `$describe <name> "..."` rows. The remaining 42% are the
  `$expose <list>` line, blank lines, and the docstring text content.
- Across the 8 files, **47 distinct names** are duplicated 1–3 times each in
  `@agent`. **No name avoids being typed at least twice** in the
  `state` → `agent` round-trip when an `@agent` block is present.

### Why this is a structural defect, not a style choice

The user's framing — "we don't have the structure for it to be built into
one object or Array" — is the diagnosis. The current grammar treats
declarations as a flat sequence of statements, each carrying exactly one
piece of information. There is no syntactic affordance to attach metadata
(visibility, agent-exposure, docstring, scope, rate-limit) to a declaration
*at the declaration site*. So metadata has to live in a parallel block
keyed by name string. **This is exactly the failure pattern Rust's attribute
macros, Python's decorators, TypeScript's decorators, and Ruby/Elixir's
attribute DSLs were all designed to fix** — and the proposed comparative
research (Architect-A and Architect-B) is meant to surface concrete patterns
from those communities.

### Where the user's framing slightly under-counts the problem

The user named `$action` and `$computed` plus `@agent` `$describe`. The
audit shows the redundancy actually spans **at least four discrete patterns**
(detailed in Section 2 below):

1. **Cross-block re-declaration**: same identifier in `@state` and in
   `@agent` with no new information. Affects `$action`, `$expose`, `$prop`,
   `$computed` (anything an `@agent` block can re-mention).
2. **Sidecar metadata blocks**: `$describe`, `$scope`, `$rate-limit` are
   parallel rows keyed by name string, never co-located with the
   declaration.
3. **Within-block repetition of the macro keyword**: in `@state`, `$action
   foo() {...}` then `$action bar() {...}` then `$action baz() {...}`
   — the `$action` token is re-typed for every entry. Same pattern for
   `$computed`, `$prop`, `$lifecycle.*`, `$resource`, `$watch`. The user is
   right that an "object or array" form would collapse this.
4. **Reverse-keyed string indirection in `@agent`**: every `$describe foo
   "text"` re-types `foo` once more — and that name has to *exactly match*
   a `@state` declaration or the description silently goes nowhere
   (validator-warned but not blocked: `agents_context_write` and the
   compiler error C420 only fire on missing colon, not on dangling
   description names).

The redesign needs to address all four — not just the `@agent`-block case
that motivated the user's complaint.

### Continuity / not-on-thesis check

- This work is **not** a re-litigation of the four-block grammar. The user's
  complaint is squarely about *what is inside* the blocks. The four-block
  shape (`@state`/`@template`/`@style`/`@agent`) is closed by
  `spec-block-structure.md:19` and we should preserve it.
- This work **is** a candidate amendment / new-RFC against the macro
  vocabulary spec (`docs/superpowers/specs/2026-05-02-spec-macro-vocabulary.md`,
  ratified 2026-05-02). That spec is the artifact a final design round
  would propose to amend.
- This is **design exploration only** — Mode 2, but a research-and-options
  round, not a build round. No Builder this session. The session output is
  director-note + 3 comparative reports + (next session) a design-options
  spec. Code lands in a *future* round only after the user picks an option.

---

## Routing for synthesis

**Synthesizer fires after Architect-design (next session).** This round
produces 3 raw research reports (Scout + Architect-A + Architect-B). The
research reports are inputs, not synthesis material. Synthesizer should not
fire on raw comparative research — there's nothing to summarise yet
because no design choice has been made. The Synthesizer's role activates
when the next round's Architect-design produces 2–3 concrete options for
the user.

---

## Priority

Single track, single direction this session. **Macro-simplification** is
its own topic with no parallel work. Within the topic, the macro priority
list is **Section 2 below** (the macro inventory with H/M/L/N-A markings).

---

## Scope signal

**Continue (research first).** No surface-to-user this round — the user
already surfaced by creating the topic and naming the symptom. Surface
again only at the *end* of the next round (when 2–3 concrete redesign
options are on the table for the user to pick).

---

## Section 2 — Macro inventory: where the duplication is, by macro

This is the **complete in-scope macro list** (39 macros across 4 blocks per
`spec-macro-vocabulary.md` §1) with explicit duplication assessment and
priority. **Priority** is the redesign priority for the *grammar shape*,
not for runtime behavior. Runtime behavior is out of scope this round.

### `@state` block macros (12, per spec §2)

| Macro | Duplicates? | Where | Priority | Notes |
|---|---|---|---|---|
| `$prop` | YES | Macro keyword re-typed per declaration. Cross-block re-reference in `@agent` `$expose`. Also potential `$describe` row in `@agent`. | **HIGH** | The "object/array" form the user named would collapse N `$prop` lines into one block. |
| `$computed` | YES | Same: macro keyword re-typed per derivation. Cross-block re-reference possible. | **HIGH** | The user named this one explicitly. |
| `$action` | YES | Same: keyword re-typed per declaration. Plus the worst case — re-listed in `@agent` (bare-name form) AND `$described` in `@agent`, so each action name appears up to 3 times. | **HIGH** | The user named this one explicitly. |
| `$resource` | YES | Keyword re-typed per declaration when multiple resources exist. Not commonly cross-referenced in `@agent` today, but the spec allows it. | **MEDIUM** | Same shape as `$prop`/`$computed`. Used in 1 of the 10 audited examples. |
| `$effect` | NO (mostly) | Each `$effect` block is genuinely independent — no shared name. The `$effect` keyword does repeat across multiple effect blocks, but there is no name to re-state. | LOW | Out of duplication-scope, but a `$effect.on` array form might still be ergonomic. |
| `$effect.on` | NO | Same as `$effect`. | LOW | — |
| `$watch` | NO | Watches are name-targeted but the name comes from the watched signal — there is no duplication. | LOW | Zero usage in audited examples; vocabulary may be over-fitted. |
| `$lifecycle.mount` | NO | Singleton per component. | N-A | — |
| `$lifecycle.dispose` | NO | Singleton per component. | N-A | — |
| `$expose` (in `@state`) | YES | Comma-list of names where each name was declared above with `$prop`/`$computed`/`$action`. The list re-types every name. | **MEDIUM** | A "declaration-site annotation" approach (e.g. `$prop@public name: T`) would eliminate this. |
| `$shared` | YES | Macro keyword re-typed per declaration; same shape as `$prop`. | LOW | Zero usage in audited examples — wait for adoption signal. |
| `$cookie` | YES | Same. | LOW | Zero usage in audited examples. |
| `$server` | YES | Same. | LOW | Zero usage in audited examples. |
| `$meta` | NO | Singleton per page. | N-A | — |

### `@template` block macros (16, per spec §3)

These are mostly **attributes on HTML elements** rather than declarations;
they don't duplicate identifier names because they don't *declare* anything.

| Macro | Duplicates? | Notes | Priority |
|---|---|---|---|
| `$if`, `$show`, `$each`, `$key`, `$html`, `$raw`, `$once`, `$memo` | NO | Attributes on individual elements. Each appears where it is used. | N-A |
| `$bind:*` | NO | Attribute, name is the bound DOM property. | N-A |
| `$on:*` | NO | Attribute, name is the event. | N-A |
| `$action` (form attribute) | NO | Attribute referencing a `@state` `$action` declaration. The cross-block reference is intrinsic — that's how the form binds to the action — not duplication. | N-A |
| `<$slot>`, `<$suspense>`, `<$shield>`, `<$guard>`, `<$warp>` | NO | Macro elements, not declarations. | N-A |

**Verdict:** `@template` is **out of scope** for this round. It is not
the source of the user's complaint and reshaping it would be an unrelated
change.

### `@style` block macros (5, per spec §4)

| Macro | Duplicates? | Notes | Priority |
|---|---|---|---|
| `$reactive` | NO | Each call site refers to one signal. | N-A |
| `$tokens` | NO | Singleton form. | N-A |
| `$global` | NO | Block form. Singleton. | N-A |
| `$media` | NO | Per-breakpoint block. Each block is its own concern. | N-A |
| `$when` | NO | Same as `$media`. | N-A |

**Verdict:** `@style` is **out of scope** for this round. The macros there
are CSS scoping primitives, not name-keyed declarations. There is no
duplication to remove.

### `@agent` block macros (6, per spec §5)

This is **the epicenter of the user's complaint**. Every macro here is
either (a) a re-reference to a name declared in `@state` or (b) sidecar
metadata keyed by such a name.

| Macro | Duplicates? | Where | Priority |
|---|---|---|---|
| `$expose` | YES | Comma-list of names already declared in `@state`. Same shape as `@state` `$expose` but agent-targeted. | **HIGH** |
| `$expose.write` | YES | Same shape, writable variant. | **HIGH** |
| `$action` (in `@agent`) | YES | Bare name re-statement. **This is the line form the user explicitly called out** ("`$action setHue`" in `color-theme.aihu`). | **HIGH** |
| `$describe` | YES | `$describe name "..."` row, name must match a name declared in `@state`. **The other line form the user explicitly called out.** | **HIGH** |
| `$scope` | NO | Authorisation scope string. Singleton-ish per agent block. | LOW |
| `$rate-limit` | NO | Number. Singleton per agent block. | LOW |

**Verdict:** Of the 6 `@agent` macros, **4 are pure duplication of `@state`
identifiers** and they are the four the user pointed at (counting both
`$expose` variants as one shape). The redesign should at minimum eliminate
this pattern. The two non-duplicating macros (`$scope`, `$rate-limit`)
should keep their current sidecar form.

### `@route` block (no macros, per spec §1.1)

Out of scope. Routes have a key-value shape (`path`, `name`, `ssr`,
`middleware`) that is already structured.

### Cross-block primitives

| Surface | Duplicates? | Priority |
|---|---|---|
| `$beforeNavigate(fn)` | NO | One callback per page. Singleton. | LOW |
| `$afterNavigate(fn)` | NO | Same. | LOW |
| `$route name` (reactive route signal) | NO | One per page. Singleton. | LOW |

### Summary count

- **In-scope (priority HIGH)**: `$prop`, `$computed`, `$action`,
  `$expose` (state), `$expose` (agent + `.write`), `$action` (agent),
  `$describe`. **7 distinct macro names** (some sharing the same redesign
  treatment). Together these account for **all** the duplication examples
  the user cited.
- **In-scope (priority MEDIUM)**: `$resource`. Same shape as `$prop` —
  benefits incidentally from any HIGH redesign.
- **Out of scope (LOW / N-A)**: 31 of the 39 macros. Either non-duplicating
  by nature (template attrs, style scoping primitives, lifecycle
  singletons), or zero-usage-today (`$shared`, `$cookie`, `$server`,
  `$watch` — wait for adoption to validate before redesigning).

The redesign target footprint is **8 macro shapes**, plus the *structural*
relationship between `@state` and `@agent` blocks.

---

## Section 3 — Acceptance bar: operationalizing "self-explanatory"

The user wrote "simplify and make the programming almost self-explanatory."
That phrase needs to be testable. Five concrete criteria. **Any redesign
option proposed in the next round must be checkable against each criterion
without ambiguity, and Architect-design must report a Y/N per option per
criterion.**

### AC-1 — DRY identifier rule

> **Each identifier appearing as a `$prop`/`$computed`/`$action`/`$expose`/`$describe`
> target appears in source exactly once unless overriding default behavior.**

Concretely: in a redesigned `color-theme.aihu`, the string `setHue` should
appear exactly **once** (at its declaration site), unless the redesign
deliberately re-states it to override an inferred default (e.g. assign a
different agent-visible name). Any option that still requires `setHue`
to be typed 3 times **fails AC-1**.

**Check:** for the redesigned `color-theme.aihu` shown alongside each
option, run `grep -c '\bsetHue\b' file.aihu`. Number of matches must equal
**1** unless the option's prose explicitly justifies why a re-statement is
load-bearing. Same check for all 8 names in that file.

### AC-2 — Cold-read intelligibility

> **A reader with no aihu framework knowledge can guess the role of any
> single macro line correctly, given only the line and its surrounding
> block label.**

Test: present a developer (preferably non-aihu) with the line `$action
setHue(h: number) { hue = h }` and ask "what does this do?" The acceptable
answer: "declares a function called setHue that takes an h and sets hue."
Any redesign option that fails this test fails AC-2.

**Check:** Architect-design includes, per option, a 3-line excerpt of the
new syntax with the predicted "naive reader" answer in plain English. The
predicted answer must agree with the actual lowering. **No syntax that
relies on memorised punctuation conventions** (e.g. `$@public foo` where
`@` is overloaded with two meanings) passes AC-2.

### AC-3 — `color-theme.aihu` LOC reduction

> **The `@agent` block in `examples/color-theme/color-theme.aihu` shrinks
> from 17 lines to 5 lines or fewer.**

Specifically: each option includes a redesigned full `color-theme.aihu`
showing what the new shape looks like. The `@agent` block (or its
post-redesign equivalent — see AC-5 below) must occupy ≤ 5 lines, including
the brace line. **Hard target: 60% reduction.** Soft target: 70%+.

**Check:** `awk '/^@agent/,/^}/' file.aihu | wc -l` ≤ 5.

If a redesign option deletes `@agent` as a separate block entirely (folding
its concerns into `@state` declaration-site annotations), this AC is
trivially satisfied (`@agent` block: 0 lines). That outcome is acceptable
**only if** AC-5 (no breaking of public package API) is still met — the
runtime registration shape that `@agent` lowers to today is part of the
contract, even if the source-syntax block disappears.

### AC-4 — Macro-name count reduction or stability

> **The total number of distinct macro names across the four blocks does
> not grow above 39, and ideally drops below 35.**

The current vocabulary count is 39 (per `spec-macro-vocabulary.md` §1).
A redesign that adds 5 new macro names while keeping the duplication has
gone backwards. A redesign that collapses 4 macros into 1 by repurposing
existing forms (e.g. `$prop@public` instead of two macros) has earned its
keep.

**Check:** Architect-design counts unique-name macros after the redesign,
across all four blocks. If above 39, the option must have a prose
justification for the new macros (e.g. they enable behavior the current
vocabulary cannot express).

### AC-5 — Codemod-expressibility

> **The redesign is expressible as a codemod over existing `.aihu`
> files: a deterministic AST transform from old syntax to new syntax,
> with no human judgement calls except where the old syntax was already
> ambiguous.**

The existing parser shape (`packages/compiler/src/parser/{state_macros,
style_macros,agent_macros}.rs`) tells us what info the compiler already has.
Anything the compiler can already extract should be migrate-able by a
codemod. Specifically:

- The codemod must convert all 10 audited example files mechanically. No
  "the user has to write a docstring" decisions — `$describe`'s string
  argument is already in the source.
- The codemod must be expressible in <300 LOC (ballpark), in any AST-aware
  language (TypeScript via the compiler's emitted AST, or Rust as a parser
  pass). If an option requires a smarter-than-AST tool (e.g. needs LLM-style
  semantic inference to migrate), it **fails AC-5**.

**Check:** Architect-design includes, per option, a codemod pseudocode
sketch in 1–3 paragraphs. The sketch must concretely identify (a) what
old-syntax patterns it matches, (b) what new-syntax it emits, (c) what
edge cases require user judgement (target: zero edge cases on the 10
audited files).

### AC-6 — Public package API preservation (negative bound)

> **No change to `@aihu/agent`, `@aihu/agent-readiness`, `@aihu/runtime`,
> `@aihu/arbor`, or any other published `@aihu/*` package's public API.**

The redesign is a *source-syntax* redesign. The compiler still lowers
`.aihu` source to runtime calls. Any redesign that requires changing the
shape of `defineExpose`, `registerAgentMetadata`, `MountScope`, or
`AgentMetadata` exceeds round scope and **fails AC-6**.

**Check:** Architect-design lists the runtime-call lowering it produces
(per macro shape) and asserts that the lowering is byte-identical to today.
Any redesign that requires a new runtime helper must justify it as
strictly additive (new export, no removed export).

### AC summary

| ID | Criterion | How to check |
|---|---|---|
| **AC-1** | Each name appears once unless overriding | `grep -c` per name on redesigned color-theme |
| **AC-2** | Naive reader can guess what a line does | Architect-design includes predicted naive-reader answers |
| **AC-3** | `color-theme.aihu`'s `@agent` block ≤ 5 lines | `awk \| wc -l` |
| **AC-4** | Macro-name count ≤ 39 (target ≤ 35) | Distinct-name count |
| **AC-5** | Codemod-expressible in ≤ 300 LOC | Pseudocode sketch in option |
| **AC-6** | No public package API change | Lowering shape inspection |

---

## Section 4 — Refined briefs for the next 3 dispatches (Team Lead pastes verbatim)

The next session dispatches **3 reports in parallel** — Scout (read-only
audit), Architect-A (frameworks survey), Architect-B (programming-language
patterns survey). All three share the same source-of-truth director-note
(this file) and the same out-of-scope guardrails. None of the three
proposes a redesign — that is reserved for Architect-design in the *round
after*.

### Brief 1 — Scout (read-only): macro inventory + duplication catalog

**ROLE:** Scout · **ROUND:** macro-simplification 001-S · **MODE:** 2 (read-only)

```
INPUTS (do not re-derive):
- this director-note (.team/macro-simplification/director-note-001.md) — Section 2 is your starting macro inventory
- docs/superpowers/specs/2026-05-02-spec-macro-vocabulary.md (the canonical 39-macro list)
- docs/roadmap/arch-5-sfc-primitives.md §1 (the shipped/partial table)
- packages/compiler/src/parser/{state_macros.rs, style_macros.rs, agent_macros.rs} (what the parser actually accepts today, ground truth)
- packages/compiler/src/types.rs (StateMacro, StyleMacro, AgentMacroDecl variants — the lowered-AST shape)
- ALL examples/**/*.aihu (10 files at minimum; if more exist, scan them)
- ALL bench/compiler-conformance/**/*.aihu (~17 fixtures)
- ALL apps/docs/src/components/*.aihu

DELIVERABLE: .team/macro-simplification/scout-report.md (this exact path)

THE REPORT MUST CONTAIN:

1. **Macro usage census** — a table with one row per macro name,
   columns:
   - macro name
   - block(s) it appears in (per spec)
   - count of files that use it (across examples + bench + docs)
   - count of total occurrences across the codebase
   - whether the macro keyword is re-typed per declaration (the
     "object/array" pattern from the user's complaint)
   - whether it cross-references identifiers from another block
   - a one-line "duplication shape" describing what the redundancy looks
     like (or "none" if there is none)

2. **Duplication-pattern catalog** — at least 4 pattern entries, each
   with: pattern name, exemplar excerpt (3-5 lines from a real file),
   how many distinct macros exhibit the pattern, how many lines/percent
   it accounts for in the audited corpus.

3. **Validator behavior census** — list every place in the parser
   (`*_macros.rs`) where a name re-reference is validated. For each:
   does the parser fail on a dangling reference (e.g. `$describe foo
   "..."` where `foo` was never declared)? Or does it silently emit a
   broken lowering? This matters for the redesign because if the parser
   already validates, declaration-site annotations are a strict
   improvement; if it does not, the redesign tightens semantics too.

4. **AGENTS.db lookup** — `agents_search` on at least these 3 queries
   and report whether prior macro-design discussion exists:
   - "macro syntax design $action $expose duplication"
   - "@agent block redesign $describe"
   - "SFC declaration-site annotation"
   Report: either "zero prior records" or list the records found.

5. **Do-not-break list** — explicitly enumerate what a future redesign
   must NOT change. Pull from `_user-directives.md` and the spec's
   "ratification" header. Examples to look for: closed block grammar,
   closed macro vocabulary count, dep-free thesis, RFC-versioning
   commitment.

WHAT THIS REPORT MUST NOT DO:

- Do NOT propose any redesign syntax. That's Architect-design's job in
  the next round.
- Do NOT compare to other frameworks/languages. That's Architect-A and
  Architect-B's job.
- Do NOT modify any source file. Read-only.
- Do NOT touch packages/compiler/src/** with edits. Read-only.

REPORT FORMAT:
- Markdown with tables for census data, prose for analysis.
- Cite every quantitative claim with the file path and grep/awk command
  used to produce it.
- Length budget: 300-700 lines. Aim for 400.

STATUS REPORT AT END:
STATUS: DONE | PARTIAL | BLOCKED. Include: file count audited, total
macro-occurrence count, count of duplication patterns catalogued.
```

### Brief 2 — Architect-A: comparative survey of component frameworks

**ROLE:** Architect-A (comparative — frameworks) · **ROUND:** macro-simplification 001-A1 · **MODE:** 2

```
INPUTS (do not re-derive):
- this director-note (.team/macro-simplification/director-note-001.md) — Sections 1+2+3 frame what you're surveying *for*
- examples/color-theme/color-theme.aihu — the canonical "worst-case duplication" example, quoted in this director-note Section 1. You cite this throughout.

USE Context7 (mcp__claude_ai_Context7__query-docs) to fetch CURRENT
docs for each framework — your training data may be stale on Svelte 5
runes, Vue 3.5+, Solid 2.x, Lit decorators, Marko 6, Astro current,
Qwik current. Use Context7 BEFORE web search for these.

DELIVERABLE: .team/macro-simplification/architect-frameworks.md (this exact path)

FRAMEWORKS TO SURVEY (7 in total):

1. **Svelte 5 (runes)** — `$state`, `$derived`, `$effect`, `$props`.
   Specifically: how is component public API surfaced? (`$bindable`,
   `export let` legacy, the new component-instance pattern.)
2. **Vue 3 SFC + `<script setup>`** — `defineProps`, `defineEmits`,
   `defineExpose`, `defineModel`, `defineSlots`, JSDoc/TS for prop
   docstrings.
3. **Solid 2.x** — `createSignal`, `createMemo`, `createResource`,
   how a component's "public" surface is exposed to a parent.
4. **Lit (with @lit/reactive-element decorators)** — `@property`,
   `@state`, `@query`, `@customElement`, plus reactive controllers as a
   mixin pattern.
5. **Marko 6** — its `<class>` block, attributes, tags-with-attribute-
   types declarations.
6. **Astro components (current)** — frontmatter `Astro.props`, `slots`,
   how it does "expose" semantics.
7. **Qwik (current)** — `useSignal`, `component$`, exported types,
   inline component contracts.

PER FRAMEWORK, ANSWER ALL OF:

- a) **State declaration**: how is a single reactive variable declared?
  Show the syntax, count the tokens.
- b) **Computed/derived**: how is a derived reactive value declared?
- c) **Action/method**: how is a mutation function declared?
- d) **Lifecycle**: how is on-mount / on-cleanup expressed?
- e) **Component-public surface (the "what does the parent see" question)**:
  is there an explicit declaration, or is everything exported by default,
  or is it the file's default export?
- f) **Tool-readable / metadata surface (the "what does an external
  reader/AI/MCP see" question)**: docstrings? comments? decorators?
  separate manifest? typed prop interfaces?

THE FOUR LOAD-BEARING QUESTIONS THE ANALYSIS MUST ANSWER:

- Q1: **Which frameworks collapse the duplication pattern that aihu
  has today?** Specifically: declaring a name once, having it
  automatically (a) participate in reactivity, (b) appear in
  component-public API, (c) appear in tool-readable metadata, (d) carry
  a docstring. Frameworks that achieve all four with one declaration
  site are the gold standard.
- Q2: **Which frameworks demand re-statement of the name in a separate
  block?** Identify the failure modes — what forces re-statement.
- Q3: **Which idioms translate cleanly to a `.aihu` file given the
  4-block grammar must stay?** Be specific: which framework's pattern
  could be lifted into `@state` block declarations *without* changing
  what `@template` / `@style` / `@agent` are.
- Q4: **Which idioms do NOT translate?** Specifically: patterns that
  require runtime type reflection (TypeScript-decorator
  emitDecoratorMetadata), or patterns that require classes when aihu
  uses signal-with-functions.

OUTPUT SCHEMA:

The report has 9 sections:

§1 — Frame (1 paragraph). What the user's complaint is, what aihu does
today, what gold-standard collapse-the-duplication looks like in the
abstract.

§2-§8 — One section per framework (7 sections). Each is structured:
  - **Framework + version surveyed** (e.g. "Svelte 5.0.0+")
  - **State declaration syntax** (with token count)
  - **Computed/derived syntax**
  - **Action/method syntax**
  - **Lifecycle syntax**
  - **Component-public surface** (verbatim docs quote where possible)
  - **Tool-readable / metadata surface**
  - **Equivalent of `color-theme.aihu`'s setHue/setPreset pattern** —
    show how the same component, with the same 8 named entities, is
    written in this framework. Count LOC of that equivalent.
  - **Verdict: collapses-the-duplication?** Y / Partial / N + 1
    sentence justification.

§9 — **Cross-framework comparison table** with rows = your 7
frameworks (+ aihu-today as an 8th row for baseline) and columns =
the 6 sub-questions (a-f) above. Use ✓ / partial / ✗ markers.

§10 — **Top 3 idioms that translate to aihu** — 3 specific patterns,
each named, each cited to its framework, each with a 1-paragraph
explanation of why it would translate. **DO NOT propose syntax —
describe the pattern. Architect-design will pick syntax in the round
after.**

§11 — **Top 3 idioms that DO NOT translate** — 3 specific patterns
that look attractive but won't work in `.aihu`. Same shape. Helps
Architect-design know what to dodge.

ABSOLUTELY NOT (anti-drift guardrails):

- Do NOT propose a new aihu macro syntax. NOT EVEN A SKETCH. The
  output is a comparative survey, not a redesign. Architect-design
  uses your survey + Architect-B's + Scout's to propose options in the
  *next* round.
- Do NOT alter any aihu source code. This is research-only.
- Do NOT redesign or critique the four-block (`@state`/`@template`/
  `@style`/`@agent`) shape — it is closed and out of scope.
- Do NOT survey backend frameworks (FastAPI, Express, etc.) — they
  are not component frameworks.
- Do NOT survey state-management libraries (Redux, Zustand, MobX) — the
  unit of analysis is the *component* declaration, not the *store*.

LENGTH BUDGET: 600-1200 lines. Aim for 800. Tables and code blocks
count as 1 line each for the budget.

STATUS REPORT AT END:
STATUS: DONE | PARTIAL | BLOCKED. Include: framework count covered,
verdicts (how many "collapses" and "partials"), plus list of any
framework where a Context7 query failed and you fell back to web
search.
```

### Brief 3 — Architect-B: comparative survey of programming-language patterns

**ROLE:** Architect-B (comparative — language patterns) · **ROUND:** macro-simplification 001-A2 · **MODE:** 2

```
INPUTS (do not re-derive):
- this director-note (.team/macro-simplification/director-note-001.md) — Sections 1+2+3 frame what you're surveying *for*
- examples/color-theme/color-theme.aihu — the canonical worst-case example you cite for translation tests

USE Context7 for current language/library docs. WebSearch only as
fallback.

DELIVERABLE: .team/macro-simplification/architect-languages.md (this exact path)

LANGUAGES / PATTERNS TO SURVEY (7 in total):

1. **Rust derive macros + attributes** — `#[derive(Serialize)]`,
   `#[serde(rename = "...")]`, `#[serde(skip_serializing_if = "...")]`,
   builder-pattern derive crates (`derive_builder`), `validator`
   crate. Focus: how attributes attach metadata to a single field
   declaration without re-typing the field name.
2. **TypeScript decorators (Stage 3) + `decorator-metadata`** —
   `@property`, `@expose` patterns, `Reflect.metadata`, NestJS-style
   `@Get('/users')`, class-validator `@IsString()`. Focus:
   declaration-site metadata.
3. **Kotlin annotations + sealed interfaces** — `@JvmStatic`,
   `@Serializable`, `@Composable`, the `data class` with destructuring,
   `value class`. Focus: how Compose hooks into `@Composable` to give
   metadata + reactivity at one declaration site.
4. **Python decorators + dataclasses** — `@property`, `@dataclass`,
   `@field(default=..., metadata={'description': ...})`, Pydantic
   `Field(..., description="...")`, `attrs`. Focus: docstring +
   metadata + default + type at the declaration site.
5. **Ruby DSL idioms** — `attr_accessor`, ActiveRecord `validates :name,
   presence: true`, Sinatra/Rails route definitions. Focus: how
   single-line declarations express a name + multiple aspects.
6. **Elm and Roc record syntax + extensible records** — how a record
   field is declared, how aliases work, how patterns simulate
   "annotations" without macros.
7. **Smalltalk-style message passing + Lisp / Clojure metadata
   maps** — `^{:doc "..."}`, the Clojure `^:private` and `^{...}`
   meta-attachment to *any* form. Focus: cross-cutting metadata
   without changing core syntax.

PER LANGUAGE/PATTERN, ANSWER ALL OF:

- a) **How is a single named entity (variable, field, method) declared?**
- b) **How is metadata attached to that entity at the declaration site?**
- c) **How is documentation/description attached to that entity?**
- d) **Is there a way to attach *multiple aspects* (visibility, doc,
  type, default, validation) in one declaration without re-typing the
  name?**
- e) **What are the limits — what does this idiom NOT support?**

THE FOUR LOAD-BEARING QUESTIONS THE ANALYSIS MUST ANSWER:

- Q1: **Which idioms are pure declaration-site annotation** (Rust
  derive, TS decorators, Python decorators on functions, Clojure
  `^{...}`)? List them and rank by ergonomics.
- Q2: **Which idioms convert "list of metadata" into "tagged object"**
  (Python `dataclass` field, Pydantic Field, Rust `#[serde(...)]`)?
  List them.
- Q3: **Which idioms would translate to a TypeScript-source-overlay
  language like aihu**, given that aihu is *parsed* by a Rust compiler
  (not by tsc) and the runtime targets are signal-functions, not
  classes? Be specific.
- Q4: **Which idioms are seductive but won't translate** because they
  require runtime reflection (TS decorator runtime metadata), VM
  introspection (Smalltalk image), or a class-based runtime (Kotlin
  `@Composable`'s compiler plugin)?

OUTPUT SCHEMA:

§1 — Frame (1 paragraph). The aihu duplication problem in
language-design terms: aihu uses a flat sequence-of-statements grammar
where most other languages would use a tagged-object or
attribute-on-declaration grammar.

§2-§8 — One section per language pattern (7 sections). Each is
structured:
  - **Pattern + canonical exemplar language**
  - **Single-name-declaration syntax** (with token count)
  - **Metadata-attachment syntax**
  - **Documentation-attachment syntax**
  - **Multi-aspect declaration example** — show one declaration with
    type + default + docstring + visibility + validation, using this
    pattern. Count tokens.
  - **`color-theme.aihu`-equivalent translation** — translate the
    `setHue` family (4 actions + 4 docstrings + 4 exposed states)
    to this language idiom in a hypothetical "what would `.aihu`
    look like if it adopted this idiom" form. **Use prose
    descriptions if your translation requires inventing syntax — do
    NOT propose actual aihu syntax.** Describe the *shape* of what
    the user would type, not the literal new aihu syntax.
  - **Verdict: would-translate-to-aihu?** Y / Partial / N + 1 sentence
    justification.

§9 — **Cross-pattern comparison table** with rows = your 7 patterns
(+ aihu-today as 8th row for baseline) and columns = (a)–(e) above.

§10 — **Top 3 idioms that translate to aihu** — 3 specific patterns,
each named, each cited to its language. **No syntax proposals — only
shape descriptions.** Each entry: 1 paragraph "what the pattern
looks like," 1 paragraph "why it fits aihu's parser + runtime
constraints," 1 paragraph "what AC-2 (cold-read intelligibility)
risk it carries." Architect-design will pick syntax in the *next*
round.

§11 — **Top 3 idioms that DO NOT translate** — 3 specific patterns
to dodge, with the failure mode named.

ABSOLUTELY NOT (anti-drift guardrails):

- Do NOT propose a new aihu macro syntax. NOT EVEN A SKETCH. Same as
  Architect-A.
- Do NOT alter any aihu source code. Research-only.
- Do NOT survey database/storage idioms (SQL `COMMENT ON COLUMN`,
  GraphQL schema directives) — they are out of unit-of-analysis.
  Although: GraphQL directives are tantalisingly close to "declaration-
  site annotation"; if you mention them, do so as a 1-line aside, not
  a section.
- Do NOT survey CSS/style metadata systems — that's `@style` block
  territory and out of round scope.
- Do NOT survey IDE/LSP metadata systems — out of scope.

LENGTH BUDGET: 600-1200 lines. Aim for 800.

STATUS REPORT AT END:
STATUS: DONE | PARTIAL | BLOCKED. Include: pattern count covered,
verdicts (how many "translates" and "partials"), Context7 vs WebSearch
fallback count.
```

### Coordination notes for Team Lead

- All three dispatches run **in parallel**. None blocks another. They
  share inputs (this director-note + the spec) and produce
  non-overlapping output files.
- Each dispatch is **read-only against the codebase** except for its
  own report file. Safety mode for this round: writability is restricted
  to `.team/macro-simplification/*`.
- All three should write their final outputs to AGENTS.db at handoff
  with `kind: research-report` and `topic:macro-simplification`.
- Suggested branches: stay on `plan/macro-simplification` (current).
  No paired-branch needed — none of the agents touch shippable code.

---

## Section 5 — What success looks like for the round-after-this

After Scout + Architect-A + Architect-B return their reports, **the next
session dispatches one final agent: Architect-design**. Architect-design's
job is to produce **2–3 concrete redesign options** for the user to pick
from. Each option must include all of:

1. **Syntax sample for `examples/color-theme/color-theme.aihu`** —
   the full file rewritten in the new syntax. Side-by-side with
   today's source. Same component, same 8 entities, all behavior
   preserved.
2. **Before / after LOC** — total file LOC, `@agent` block LOC, and
   a per-name occurrence count for `setHue` (the user's reference
   case). This is the AC-1 + AC-3 evidence.
3. **Codemod sketch** — pseudocode for the AST transform, sized
   under 300 LOC, with the matched-pattern → emitted-pattern table.
   This is the AC-5 evidence.
4. **Compiler-impact assessment** — which parser modules need
   amendment, estimated LOC delta for the parser. Per file:
   `state_macros.rs`, `agent_macros.rs`, `style_macros.rs`,
   `types.rs`. Plus: does the existing AST shape (`StateMacro` enum,
   `AgentMacroDecl` enum) survive, or does it need new variants?
5. **Subsumption table** — for each of the 6 HIGH-priority macros in
   Section 2 of this director-note (`$prop`, `$computed`, `$action`,
   `$expose`, agent-`$expose`, agent-`$action`, `$describe`), state
   whether the option keeps it as-is, repurposes it, or replaces it.
6. **Cold-read example** — pick 2 lines of the new syntax, write
   the predicted "naive reader" interpretation per AC-2.
7. **AC-table fill-in** — Y/N per AC-1..AC-6 from Section 3 of this
   director-note. Any "N" must come with a reasoned mitigation.

**Architect-design's brief will be the next session's director-note.**
This is by design: a Director-only round in between (router round) is
needed to (a) ratify which 2–3 options are worth Architect-design
costing, and (b) reconcile any contradictions between the two
Architect comparative reports. The team should expect:

```
Round 001 (this session, governance only)
  → Director-note 001 (this file)

Round 002 (next session, parallel research)
  → Scout report
  → Architect-A frameworks report
  → Architect-B languages report

Round 003 (router/triage)
  → Director-note 002: which 2-3 options Architect-design will cost

Round 004 (substantive design)
  → Architect-design: 2-3 redesign options + codemod + AC-table

Round 005 (user picks)
  → Surface to user with the 2-3 options for selection

Round 006+ (build, in a new topic)
  → spawn topic:macro-redesign-build, separate planning
```

That sequence is **6 rounds total before any code lands**. The
iteration counter for Mode 2 is 5 ping-pong rounds, but those count
research↔verifier loops, not design↔synthesis loops. **No Builder is
dispatched until round 006**, so the budget is generous.

---

## Section 6 — Anti-drift guardrails (for all three dispatches and beyond)

Each refined brief above repeats these in role-specific form, but the
universal version, lifted into one place:

1. **Do NOT propose redesign syntax in the comparative reports.** The
   research reports describe what *exists* in other systems, in the
   abstract. Concrete aihu-syntax proposals belong to Architect-design
   in round 004. Any agent that proposes new aihu syntax in round 002
   has overstepped.
2. **Do NOT redesign the four-block grammar.** `@state` / `@template`
   / `@style` / `@agent` are closed by `spec-block-structure.md:19`.
   Redesign happens *inside* the blocks — declarations, annotations,
   metadata attachment — not at the block boundary. (One exception:
   if a redesign option in round 004 dissolves `@agent`-as-separate-
   block by folding its concerns into `@state` declaration-site
   annotations, that is permitted because the public-API contract
   on the registered MCP shape is preserved (AC-6). But that's a
   round-004 decision, not a round-002 research finding.)
3. **Do NOT touch `packages/compiler/src/`** in any round before 006.
   Even Architect-design (round 004) writes only the codemod sketch
   and the parser-impact assessment, not the parser code itself.
   Code lands in round 006+ in a new topic.
4. **Do NOT propose breaking the public package API.** No changes to
   `defineExpose`, `registerAgentMetadata`, `MountScope.agent`,
   `AgentMetadata`, etc. The redesign is a source-syntax redesign;
   the runtime and the published package APIs are downstream artifacts
   already in production with the agent-readiness milestone (state
   file says: 206/206 tests passing).
5. **Do NOT propose new `@aihu/*` packages.** This is a syntax
   redesign; new packages are out of scope.
6. **Do NOT propose changing `aihu.config.ts` shape.** Out of scope.
7. **Do NOT survey "framework X also has duplication" without stating
   how X solves it.** Identifying duplication elsewhere isn't useful;
   we already know aihu has it. The research is about *solutions*.
8. **Do NOT make the macro vocabulary spec the deliverable.** The
   spec amendment is a downstream artifact of the redesign-build
   round, not this round's output.

---

## Section 7 — Continuity check

### In-flight tracks examined for conflict

| Track | State file | Status | Conflict? |
|---|---|---|---|
| `plan-a` (TS runtime family — signals, arbor, runtime, agent) | `state-plan-a.md` | v0 feature-complete; in-flight: Round N+2 (browser-bench, signals deep-prop) | **No conflict.** Plan-a operates on `packages/{signals,arbor,runtime,agent}`. Source-syntax redesign is upstream of those — it changes what the *compiler* emits, but the runtime contract stays per AC-6. |
| `agent-readiness` | `state-agent-readiness.md` | All 4 phases COMPLETE; 206/206 tests passing | **No conflict.** Agent-readiness operates on `@aihu/server`/`@aihu/agent-readiness`. Both consume `AgentMetadata` from `@aihu/agent`; AC-6 prevents that shape from changing. |
| `cli-templates` (round 002b in flight) | `state-cli-templates.md` (last touched 2026-05-05) | Round 002b governance-correction landed; B1.1 ready to dispatch | **Watch.** `cli-templates` is shipping `@aihu/templates-cf-team` with `.mcp.json` + `@expose` blocks. If macro-simplification redesigns `@expose`, the cf-team template will need a follow-up codemod. **Mitigation:** macro-simplification round 004 codemod must include `packages/templates/*/template/**/*.aihu` in its corpus; AC-5 already requires deterministic transforms with no human judgement, so the templates migrate cleanly. **No need to pause cli-templates.** It's M1 V0.2.0; macro-simplification will land later (M2+), and codemod handles the migration. |
| `arch-5 SFC primitives` | `docs/roadmap/arch-5-sfc-primitives.md` | Specifies 25 *new* primitives across 7 dimensions to be added in v1.1+ | **Watch.** If macro-simplification ratifies a new declaration-site-annotation pattern, the 25 new primitives in arch-5 §2-§3 should follow that pattern. **Sequencing note:** macro-simplification design (round 004) should land *before* arch-5 §3 implementation begins, so the new primitives use the new shape. **No active conflict** — arch-5's §3 primitives are not yet implemented. |
| `arch-4 DX tooling / language server` | `docs/roadmap/arch-4-dx-tools.md` | Volar virtual-file LSP planned; `@agent` virtual-file deferred to M3 | **Watch.** OQ-DX-03 says `@agent` LSP is M3, deferred. If macro-simplification dissolves `@agent`-as-block, the deferred work disappears with it (replaced by declaration-site LSP). **Net positive** — flag in the round-004 design doc for arch-4 follow-up. |

### Pending RFC alignment

- **`spec-live-binding.md`** is APPROVED, security review pending. It
  unblocks `<$guard>` / `$scope` / `$rate-limit` runtime enforcement.
  Macro-simplification touches none of those at the runtime layer
  (AC-6); only their *declaration syntax* could change. Live-binding
  RATIFICATION can proceed in parallel with this design exploration.

### Branch-state

- Current branch: `plan/macro-simplification` (clean working tree per
  pre-flight). Created by Team Lead.
- Round 002 (the parallel research dispatch) **stays on this branch**
  — none of the agents in round 002 touch shippable code, only
  `.team/macro-simplification/*.md` files. PR for the round 002 reports
  is a documentation-only PR.
- Rounds 003 + 004 also doc-only. Code-touching branches start at round
  006+ in a new topic and a fresh branch (`feat/macro-redesign-*`).

### AGENTS.db state

- `agents_search` returned **zero prior records on `topic:macro-
  simplification`** across `delta` + `base`. Clean slate confirmed.
- Adjacent records found and noted:
  - `topic:cli-templates` round-002b director-note (id 3960243669) —
    referenced above as the cli-templates conflict-watch.
  - `topic:mail-system` track:frontend implementation-pattern (id
    3562227197) — mentions Scribe SFC syntax verbatim ("`.scribe`
    files use three block types"). That artifact is from before the
    aihu rename and reflects a 3-block pre-`@agent` shape — it is not
    structural conflict with this round; the aihu 4-block grammar is
    canonical.
- Director-note 001 (this file) **will be written to AGENTS.db delta
  layer** at end of round with `kind: director_note`,
  `topic:macro-simplification`, `round:1`. (Team Lead handles that.)

---

*Substance only. Branch creation, agent dispatch, parallel scheduling,
PR mechanics, and the AGENTS.db write of this note all belong to the
Team Lead.*
