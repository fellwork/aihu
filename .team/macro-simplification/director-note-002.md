# Director-note · macro-simplification · round 002 · 2026-05-05

**Mode:** 2 (design exploration, governance only — no code) · **Author:** Topic Director ·
**Reads:** `director-note-001.md` (full, all 7 sections), `scout-report.md` (full, 423 lines incl. Q1–Q3),
`architect-frameworks.md` (full, ~1290 lines incl. §10 Top-3 translates + §11 Top-3 doesn't),
`architect-languages.md` (full, ~1035 lines incl. §11 Top-3 translates + §12 Top-3 doesn't),
`state-cli-templates.md` (continuity refresh — `@expose` blocks + cf-team B1.x in flight),
`state-plan-a.md` / `state-agent-readiness.md` (continuity refresh — runtime contracts shipped) ·
AGENTS.db `agents_search` ×3 (no new macro-design records since round 001) ·
**Prior notes:** `director-note-001.md` (this topic, round 001).

**Topic identifier:** `topic:macro-simplification` ·
**Track identifier (single track):** `track:macro-simplification` ·
**Round counter (Mode 2 ping-pong, max 5):** **2** of 5.

---

## §1 — STATUS-verification audit (per researcher)

The three round-002 reports each declared `STATUS: DONE`. I spot-checked each
artifact against its brief. **All three audits pass.** Two carry-overs are
flagged as "must close before round 003"; the rest are "acceptable carry-over."

### Scout (claimed: DONE — 43 files audited, 245 macro occurrences, 5 patterns)

**Verdict: PASS — scope substantially exceeded the brief.**

| Brief item | Claimed | Spot-check | Verdict |
|---|---|---|---|
| 1. Macro usage census, all 39 macros | 17 `@state` + 18 `@template` + 5 `@style` + 6 `@agent` + 3 cross-block = covered | Tables in §1 enumerate all 39 + the 3 routing-spec additions noted at line 45 ("Spec §2 lists 12 macros but the table on §1 line 36 enumerates 14 names"). Bare-untyped form added as a 17th `@state` row. **Coverage complete; spec-vs-table-count drift footnoted, not papered over.** | ✓ |
| 2. Duplication-pattern catalog ≥4 patterns | 5 patterns (4 from Director §1 + 1 audit-surfaced "Pattern E") | Patterns A–E each have name, exemplar, affected-macro list, quantified incidence. **Pattern E is the headline finding** — its discovery was scope-creep that I bless. | ✓ (exceeds) |
| 3. Validator-behavior census | "no parser validates cross-block name references in any block today" | Table in §3 lists 11 validator sites with file:line citations to `agent_macros.rs:32–47`, `state_macros.rs:124–137`, etc. Verdict supported. | ✓ |
| 4. AGENTS.db lookup | "0 prior macro-design records" across 3 queries | I re-ran `agents_search` ×3 (above); confirmed: top hits are `cli-templates` + `mail-system`, none discussing aihu macro-grammar redesign. **Match.** | ✓ |
| 5. Do-not-break list | 16 hard constraints across 5 governance sources | Constraints 1–16 cited to `_user-directives.md`, `spec-block-structure.md:19`, `spec-macro-vocabulary.md §0`, `state-agent-readiness.md`, Director-note §6. **Constraint 14–16 (bench fixtures, bare-untyped, RFC #56 hold) are net-new from this audit — appropriate scope-expansion.** | ✓ |

**No gaps that block round 003.** Three open questions Q1–Q3 in §8 are
addressed in §3 of this note.

**Carry-over (acceptable to round 003):** none. Scout's report is
self-contained.

### Architect-A (claimed: DONE — 7 frameworks, 5 fully collapse, 1 partial, 1 N/A)

**Verdict: PASS — coverage complete and Context7-cited throughout.**

| Brief item | Claimed | Spot-check | Verdict |
|---|---|---|---|
| 1. 7 frameworks at current-version | Svelte 5.36.x, Vue 3.5.x+3.6.0-beta, Solid 2.x, Lit 3.x, Marko 6, Astro 5.x, Qwik 1.x | Each section opens with version + source. Context7 query trace cited in §12 (no WebSearch fallback). **All 7 covered.** | ✓ |
| 2. 6 sub-questions per framework (a–f) | All 6 answered for each of 7 | §2-§8 each contain a-h (h is verdict). Token counts present where the brief asked for them. | ✓ |
| 3. `color-theme.aihu` translation per framework | All 7 | Verified — 7 distinct rewrites; Astro footnotes that interactive logic delegates to a Svelte island, which is faithful to Astro's actual posture. | ✓ |
| 4. Cross-framework comparison table | 7 frameworks + aihu-baseline | §9 has 8 rows, 7 columns. ✓ / partial / ✗ markers used as briefed. | ✓ |
| 5. Top-3 translates / Top-3 doesn't | §10 + §11 | §10: decorator-as-metadata-bag, single-call exposure list, JSDoc-as-docstring. §11: TS decorator runtime, closed-by-default Vue, tuple-destructured signals. **No syntax proposals for aihu** — anti-drift §6.1 honored. | ✓ |
| 6. Anti-drift compliance | declared in §12 | I re-checked: zero new aihu syntax sketched, no edits to `packages/compiler/src/`, four-block grammar untouched. | ✓ |

**No gaps.** Cross-track note in §12 to Architect-B (decorator-as-metadata-bag
parallel) is exactly the convergence signal §1 of this note flags as load-bearing.

### Architect-B (claimed: DONE — 7 patterns, 3 Y, 3 Partial, 1 N)

**Verdict: PASS — strongest individual contribution this round, in my read.**

| Brief item | Claimed | Spot-check | Verdict |
|---|---|---|---|
| 1. 7 language patterns | Rust attrs, TS decorators, Kotlin annotations, Python/Pydantic, Ruby DSL, Elm/Roc, Clojure metadata | §2-§8 each cover one. Sources list at §"Sources" lists 14 primary URLs. | ✓ |
| 2. 5 sub-questions (a–e) per pattern | All 5 answered for each | Confirmed. | ✓ |
| 3. Multi-aspect stress-test | §9 table | Token-count comparison of email-with-validation declaration across 7 patterns. Pydantic + Clojure called as winners. | ✓ |
| 4. Top-3 translates / Top-3 doesn't | §11 + §12 | §11: Rust `#[attr]` prefix, Clojure first-string-after-name, Pydantic `Annotated[T, Field()]`. §12: TS `Reflect.metadata`, Kotlin `@Composable` plugin, Elm/Roc "types are the only metadata." **No syntax proposals — pattern shapes only.** | ✓ |
| 5. AC-awareness section | §14 | Per-AC qualitative read across the 7 patterns. **Useful for Architect-design (round 004); does not preempt design choices.** | ✓ |
| 6. Anti-drift compliance | implicit | Re-checked: no new aihu syntax, no decorator-class proposal, GraphQL aside is one section as briefed. | ✓ |

**No gaps.** §10 cross-pattern table includes aihu-today as the 8th row;
exactly mirrors Architect-A §9. Symmetry is intentional and correct.

### Convergent signal across A + B (the doubled finding)

Both reports independently land on:

1. **Docstring-above-declaration as universal.** Architect-A §10.3 names JSDoc
   as the single most universal pattern (7/7 frameworks). Architect-B §11.2
   names "first string literal after name" as the killer ergonomic across
   Python, Clojure, Rust `///` sugar, Kotlin KDoc. **This is doubled signal.**
2. **Attribute/annotation prefix as the collapsing mechanism.** Architect-A
   §10.1 (decorator-as-metadata-bag from Lit) maps directly onto Architect-B
   §11.1 (Rust `#[attr(...)]` prefix). Both flag the *literal* TS-decorator
   syntax as non-translating but the *idea* as the right shape.
3. **Negative example: type-only metadata.** Architect-B §12.3 (Elm/Roc) is
   the language-side parallel of Architect-A's "current aihu posture" — both
   reports independently identify aihu-today as structurally equivalent to
   the Elm/Roc "metadata is forbidden" model, which is exactly the model
   the user's complaint says is wrong.

**Implication for routing:** Architect-design (round 004) gets a *strongly
constrained* design space — convergent signals narrow rather than widen the
option set. **Three options is correct; not 2, not 4.** Justification in §4 below.

---

## §2 — Routing for synthesis: should the Synthesizer fire next?

**Decision: YES, fire the Synthesizer in round 003 (the next round).**

Three reports + a scope-shift discovery (Pattern E) clearly meets fw-agent-skill
"new substantive findings worth folding into a topic summary." The topic has no
prior summary — this would be the genesis `topic-summary.md`. Without it,
Architect-design enters round 004 having to re-parse 3,000+ lines across four
files. With it, Architect-design enters with a 200–400 line summary that
encodes the convergent signal and the constraint surface.

### Brief for Synthesizer (round 003)

**Inputs to read (in order, with line ranges):**

1. `c:\git\fellwork\aihu\.team\macro-simplification\director-note-001.md` — full (961 lines). Especially §2 (39-macro inventory + priority), §3 (AC-1..AC-6), §6 (anti-drift).
2. `c:\git\fellwork\aihu\.team\macro-simplification\scout-report.md` — full (423 lines). Especially §2 Pattern E (the spec/parser/example three-way drift), §5 do-not-break list (16 items), §8 open questions Q1–Q3.
3. `c:\git\fellwork\aihu\.team\macro-simplification\architect-frameworks.md` — full (~1290 lines). Especially §9 cross-framework table, §10 Top-3 translates, §11 Top-3 doesn't.
4. `c:\git\fellwork\aihu\.team\macro-simplification\architect-languages.md` — full (~1035 lines). Especially §10 cross-pattern table, §11 Top-3 translates, §12 Top-3 doesn't.
5. `c:\git\fellwork\aihu\.team\macro-simplification\director-note-002.md` — this file. Especially §3 (scope-shift call) and §4 (refined Architect-design brief).

**Output path:** `c:\git\fellwork\aihu\.team\macro-simplification\topic-summary.md` (genesis topic-summary; living document).

**Required structure (this is a NEW topic — Synthesizer should follow this scaffold rather than improvising):**

```
# Topic summary · macro-simplification · v1 (round 003)

## §1 — One-paragraph statement of the user's complaint
## §2 — One-paragraph statement of the structural diagnosis
## §3 — Quantified evidence at a glance (table: 1 row per audited file, key columns from Scout §1 + director-note-001 §1)
## §4 — Macro inventory verdict (39 macros, by priority — HIGH/MEDIUM/LOW/N-A)
## §5 — Convergent signals across frameworks + languages (with citations)
   §5.1 — Docstring-above-declaration (7/7 frameworks, 5/7 languages, "doubled signal")
   §5.2 — Attribute/annotation prefix as the collapsing mechanism
   §5.3 — Negative example: aihu-today ≅ Elm/Roc "types-only" anti-pattern
## §6 — Constraint surface for Architect-design (round 004)
   §6.1 — AC-1..AC-6 verbatim (lift from director-note-001 §3)
   §6.2 — Do-not-break list (16 items, lift from Scout §5 — verbatim)
   §6.3 — Pattern-anti-pattern register (Top-3 translates + Top-3 doesn't, both reports — synthesized into ONE list of "design dos and don'ts")
## §7 — Open questions resolved by round 002
   (Director-2 §3 scope-shift call goes here once round-003 decisions are made.)
## §8 — Open questions still routed to Architect-design
   (e.g. "every option must answer the docstring question — silent attach? explicit @describe? first-string-after-name? Director recommends one per option.")
## §9 — Glossary
   (defines "declaration-site annotation," "tagged-object metadata," "sidecar block keyed by name string" so future rounds share vocabulary)
```

**What the Synthesizer must NOT do:**

- Do NOT make priority calls. Director owns priority (§5 of this note).
- Do NOT propose syntax. Architect-design owns that in round 004.
- Do NOT re-rank the 8 HIGH-priority macros from Director-1 §2. Lift them.
- Do NOT introduce new ACs. AC-1..AC-6 are closed.
- Do NOT collapse the do-not-break list. All 16 items are load-bearing; lift verbatim.
- Do NOT critique either Architect's report. They both passed audit (§1 above). Synthesizer's job is consolidation, not evaluation.
- Do NOT redesign the four-block grammar. Out of scope per anti-drift §6.2.

**Length budget:** 250–500 lines. Aim 350. The summary is a load-bearing
input to Architect-design, so density beats brevity.

**STATUS reporting:** `STATUS: DONE` + bullet of (a) input file count read,
(b) summary section count, (c) any contradictions found between Architect-A
and Architect-B (none expected; if found, flag them — do not resolve them).

---

## §3 — Scope-shift signal handling: Pattern E (spec / parser / examples three-way drift)

Scout's §2 Pattern E is a load-bearing finding. The example corpus uses a
syntax the parser does not implement (3 of 4 in-scope `@agent` macro forms
would fail compilation if examples were ever fed to the compiler). The bench
fixtures use the parser's accepted syntax. The spec sides with the examples,
making the parser the outlier. Three corpora, three different "truths."

This is a substance question because the redesign target depends on which
corpus is the source of truth. Three options:

- **Option A** — surface to user NOW, before round 003 fires.
- **Option B** — let Architect-design address it as part of each redesign option ("Option 1 reconciles X way, Option 2 reconciles Y way").
- **Option C** — defer to round 005 (the user-picks-an-option round).

### Recommendation: **Option B.** Reason in one paragraph.

The drift is not a *substance* decision the user has to make in isolation —
it is a *consequence* of which redesign option is chosen. If round-004 Option
1 chooses "supersede both spec and examples with new declaration-site form,"
the drift dissolves automatically (codemod converts both spec-form examples
and parser-form bench fixtures to the new shape, and the parser jumps from
current strict-form straight to redesigned form). If round-004 Option 2
chooses "ratify spec form, bring parser up to spec first, then redesign,"
the drift requires a wedge change before the redesign. **The drift's
resolution is downstream of the design choice, not a separate question.**
Surfacing now would force the user to make a meta-decision ("should the
spec or the parser win?") in advance of seeing what the redesign options
actually look like. That is the wrong sequencing.

### What this requires of Architect-design (lifted into §4 below)

Each option in round 004 must include a **Pattern-E reconciliation
paragraph** stating which corpus the option treats as the source of truth
and what the migration path is for the other two. AC-5 (codemod ≤300 LOC)
already requires the migration to be mechanical; Pattern-E reconciliation
is just an explicit naming of *which corpus the codemod consumes as input*.

### Carry-over to round 005 (user surface)

When Architect-design returns 3 options, the user picks not just "which
syntax do I prefer" but implicitly "which corpus-reconciliation posture do
I prefer." The router-round (round 003 Director after Synthesizer) will
restate this clearly so the user doesn't have to derive it. **No surface
needed in round 003 dispatch; Architect-design's brief already encodes it.**

### Why not Option A

Option A (surface now) would break the iteration discipline. The user already
surfaced to create this topic. Surfacing again before any options exist is
the "decide in the abstract" antipattern fw-agent-skill warns against. The
research is done; let the design land before re-surfacing.

### Why not Option C

Option C (defer to round 005) would let Architect-design hand the user
options that disagree on *which corpus is canonical* without flagging that
disagreement. The user would then have to reverse-engineer the Pattern-E
posture from each option's syntax. That is unkind. Option B forces every
option to be explicit about its posture, which makes the round-005 surface
faster and clearer.

---

## §4 — Refined brief for Architect-design (round 004, after Synthesizer)

Director-note-001 §5 set the broad shape (2–3 options + codemod + AC-table).
Round 002's research lets me refine.

### Concrete option count: **3.**

Reasoning: convergent signals from A+B narrow the design space to three
*recognisable shapes*, each with a clean precedent and a different point on
the ergonomics/expressiveness curve:

1. **The light-touch shape** (Clojure first-string-after-name + a small
   attribute vocabulary). Minimum new syntax. Each `@state` declaration
   gains an optional positional docstring and 1–3 attribute prefixes. The
   `@agent` block shrinks to truly cross-cutting metadata only (`$scope`,
   `$rate-limit`).
2. **The attribute-prefix shape** (Rust `#[attr(...)]` style, larger
   attribute vocabulary). Every aspect — agent-exposure, write permission,
   description, alias, scope — is a named attribute. Multiple attributes
   stack vertically above the declaration. `@agent` block dissolves
   entirely (or shrinks to component-level `$scope` / `$rate-limit`).
3. **The tagged-object shape** (Pydantic `Annotated[T, Field(...)]` or
   inline metadata-call). Each `@state` declaration optionally carries a
   single metadata-call argument with keyword arguments for all aspects.
   Heavier than (1), more compact than (2) for declarations with many
   aspects.

**Why not 2 options:** the convergent signal supports a "minimum / medium /
maximum syntactic intervention" gradient. Collapsing to 2 would either
eliminate the light-touch path (which is the natural starting point per
both Architect reports) or eliminate the tagged-object path (which is the
natural fallback when a declaration has 4+ aspects). Both endpoints are
research-grounded; cutting either would erase a real precedent.

**Why not 4 options:** the fourth option I considered was "decorator-class
syntax" (TS-decorator-style on a hypothetical class form). Architect-A §11.1
+ Architect-B §12.1 *both independently* flag this as bottom-3 ("doesn't
translate"). I'm explicitly **anti-drift-prohibiting** it from the round-004
brief. Any other fourth option would be a variant of one of the three above,
which adds ping-pong without adding decision-relevant variance.

### Per-option deliverable shape (verbatim brief for Architect-design)

Each of the 3 options must include all of the following. **Architect-design
must complete every field for every option; partial options will be rejected
back into the round.**

1. **Syntax sample for `examples/color-theme/color-theme.aihu`** — the full
   file rewritten in the new syntax. Side-by-side diff against today's source
   (or against the spec-form, given Pattern E — see (8) below). Same
   component, same 8 entities (`hue`, `saturation`, `lightness`, `primary`,
   `setPreset`, `setHue`, `setSaturation`, `setLightness`), all behavior
   preserved.
2. **AC-1..AC-6 self-assessment with numeric estimates.** Director-note-001
   §3 specifies exact checks per AC. Architect-design must produce, per option:
   - **AC-1:** count of `setHue` occurrences in the redesigned file (target = 1).
   - **AC-2:** 3-line excerpt + predicted naive-reader interpretation.
   - **AC-3:** `awk '/^@agent/,/^}/' file.aihu | wc -l` count (target ≤ 5).
   - **AC-4:** distinct-name macro count after redesign (target ≤ 39, ideally ≤ 35).
   - **AC-5:** codemod sketch in 1–3 paragraphs + LOC estimate (≤ 300 LOC).
   - **AC-6:** runtime-call lowering shape (must be byte-identical to today's
     `defineExpose` / `registerAgentMetadata` calls).
3. **Codemod sketch** (≤ 300 LOC). Pseudocode for the AST transform. Per
   option, must concretely identify (a) what old-syntax patterns it matches,
   (b) what new-syntax it emits, (c) what edge cases require user judgment
   (target: zero on the 10 audited example files).
4. **Compiler-impact assessment** — which parser arms in
   `packages/compiler/src/parser/{state_macros,style_macros,agent_macros}.rs`
   change. Per file: estimated LOC delta + list of new/changed/deleted match
   arms. Plus: does the existing AST shape (`StateMacro` / `AgentMacroDecl`
   enums in `types.rs`) survive, or does it need new variants?
5. **Subsumption table** — for each of the 8 HIGH-priority macros from
   Director-note-001 §2 (`$prop`, `$computed`, `$action` (decl), `$expose`
   (state), `$expose` (agent), `$expose.write`, `$action` (agent bare),
   `$describe`), state whether the option **keeps it as-is**,
   **repurposes it**, or **replaces it** (with what).
6. **Untouched-list** — explicit list of which existing macros the option
   leaves untouched. Must include at minimum the 31 LOW/N-A macros from
   Director §2 (`@template` block, `@style` block, lifecycle singletons,
   zero-usage `$shared`/`$cookie`/`$server`/`$watch`).
7. **Convergent-signal answers (mandatory).** Both Architect reports
   surfaced patterns the option MUST address explicitly:
   - **Q-DOC:** how does this option handle the docstring/JSDoc question?
     Choose one and justify: silent-attach (preceding doc-comment is captured
     automatically), explicit `@describe(...)` attribute, first-string-after-name
     positional, or option-author's-choice with explicit reasoning.
   - **Q-EXPOSE:** does `$expose`/`$expose.write` survive as a separate macro,
     fold into a declaration-site flag, or both? If both, what's the precedence?
   - **Q-AGENT:** does the `@agent` block survive as a separate block, shrink
     to cross-cutting-only (`$scope`/`$rate-limit`), or dissolve entirely?
     **(Note:** anti-drift §6.2 leaves dissolution open per AC-6 preservation;
     this is a real choice the option must own.)
8. **Pattern-E reconciliation paragraph** (per §3 of this note). Each option
   must state explicitly: which corpus does this option treat as the source
   of truth (spec, parser, or examples)? What is the migration path for the
   other two? Does the parser jump straight to the redesigned form, or does
   it pass through the spec form first?
9. **Cold-read example.** Pick 2 lines of the new syntax, write the
   predicted naive-reader interpretation per AC-2.
10. **Anti-drift declaration.** Explicit confirmation that the option:
    - does NOT introduce a 5th block (anti-drift §6.2);
    - does NOT break public package APIs (AC-6 — `defineExpose`,
      `registerAgentMetadata`, `MountScope.agent`, `AgentMetadata` field set);
    - does NOT propose decorator-class syntax (Architect-A §11.1 + Architect-B
      §12.1 both flag as non-translating);
    - does NOT touch `packages/compiler/src/` source (round-004 produces
      sketch only; code lands in round 006+);
    - does NOT propose new `@aihu/*` packages (anti-drift §6.5);
    - does NOT propose `aihu.config.ts` shape changes (anti-drift §6.6).

### Length budget for Architect-design output

**1500–2500 lines** (the codemod sketch + parser-impact + 3 full color-theme
rewrites + AC-table-3x + cold-read examples are dense). Aim 1800. This is a
significantly larger budget than the round-002 dispatches received; it
matches the deliverable scope.

### What round 004 must NOT contain (anti-drift, lifted from Director-1 §6 and refined here)

1. No 4th option. Three is final.
2. No decorator-class syntax. Both researchers flagged it as bottom-3.
3. No new blocks (`@registry`, `@manifest`, `@interface`).
4. No multiple `@agent` blocks (e.g., `@agent.public` + `@agent.internal`).
5. No edits to `packages/compiler/src/`. Sketch + LOC estimate only.
6. No `@aihu/*` package API changes.
7. No new `@aihu/*` packages.
8. No spec amendment text. The spec amendment is a downstream artifact of the
   round-006+ build round, not round 004.

---

## §5 — Priority call (refresh of Director-1 §2)

**No deprioritizations.** All 7 HIGH-priority macros from Director-1 §2
remain HIGH after research. The convergent signals reinforce, not undercut,
the original ranking.

**Two priority *clarifications* surface from Scout's audit:**

1. **`$expose` (in `@state`) drops from MEDIUM to LOW priority.** Director-1
   §2 marked it MEDIUM ("a declaration-site annotation approach would
   eliminate this"), but Scout §1 confirms **zero corpus uses** of the
   `@state`-internal `$expose` form. Every `$expose` line in the audited
   corpus is inside `@agent`. Spending design effort on the `@state`-internal
   form is unwarranted — wait for adoption. **Deprioritized to LOW; out of
   round-004 design scope.**

2. **Pattern-E parser-fix work elevated to HIGH-adjacent.** Scout §3 documents
   that the parser silently drops bare `$action <name>` lines in `@agent` and
   has no name field on `Describe`. **This is a latent bug in the published
   compiler.** It's not a round-004 design priority (round 004 is design,
   not build), but the round-004 brief now requires every option's
   Pattern-E reconciliation paragraph (§4 item 8) to explicitly state how
   the parser-fix is sequenced relative to the redesign.

**No new HIGH priorities.** Specifically, I considered elevating
"`$describe`-binding fix" (Scout's §2 Pattern E surprise — `Describe(String)`
has no name field) to its own HIGH priority. Decision: **no**. It is
*subsumed* by the round-004 redesign — every option will either eliminate
`$describe` (option 1 / option 2 likely) or reshape it (option 3) or fix the
parser as part of the lowering. There is no benefit to splitting it out.

### Updated HIGH list (7 items, unchanged from Director-1)

`$prop`, `$computed`, `$action` (declaration), `$expose` (in `@agent`),
`$expose.write`, `$action` (in `@agent`, bare-name), `$describe`.

### Updated MEDIUM list (1 item)

`$resource` — same shape as `$prop`, benefits incidentally.

### Updated LOW / out-of-scope list (now 32 of 39 macros)

All of Director-1 §2's LOW + N-A entries, plus `$expose` (state) added per
clarification (1) above.

---

## §6 — Continuity check (refresh)

Director-1 §7 surveyed 5 in-flight tracks. **Re-checking each, with focus on
whether macro-simplification design proceeds in parallel or waits:**

| Track | Last status | Conflict in round 002+? |
|---|---|---|
| `plan-a` (TS runtime family) | v0 feature-complete; Round N+2 (browser-bench, signals deep-prop) in flight | **No conflict.** Source-syntax redesign upstream of runtime per AC-6. Plan-a continues. |
| `agent-readiness` | All 4 phases COMPLETE; 206/206 tests passing | **No conflict.** AC-6 protects `AgentMetadata` shape. |
| `cli-templates` | **B1 stalled on round 1** (governance correction landed in `cli-templates-002.md`); B1.1 ready to dispatch on `feat/cli-templates-b1` (clean worktree) | **Watch-but-proceed.** The cf-team template ships `@expose` blocks in `template/` tree (per arch-6 §13 RESOLUTION). If round-004 redesigns `@expose`, the template needs a follow-up codemod. Director-1 §7 already encoded this mitigation: AC-5 codemod corpus includes `packages/templates/*/template/**/*.aihu`. **No need to pause cli-templates B1.1/.2/.3.** Macro-simplification will land later (M2+); codemod handles migration. **Re-affirmed.** |
| `arch-5 SFC primitives` (25 new primitives in v1.1+) | §3 not yet implemented | **Watch.** Sequencing note from Director-1 holds: macro-simplification design (round 004) should land *before* arch-5 §3 implementation begins. **Still on track.** |
| `arch-4 DX tooling / language server` | `@agent` LSP deferred to M3 | **Net positive.** If round 004 dissolves `@agent`-as-block, deferred LSP work disappears (replaced by declaration-site LSP). **No active conflict; flag for arch-4 follow-up after round 004.** |

**New continuity item surfaced by round 002:**

- **Pattern-E parser fix is a latent compiler bug.** It's documented in the
  Scout report and bound into the round-004 design brief (§4 item 8). It
  does NOT need to be fixed before round 004 (round 004 is design, not
  build). It DOES need to be fixed in round 006+ build, regardless of which
  option wins. **Owner: round 006+ build round (a separate topic — likely
  `topic:macro-redesign-build`).**

**Recommendation: macro-simplification proceeds in parallel with all
in-flight tracks.** No track requires a pause. cli-templates B1.1 dispatch
remains the next-up Builder action there; it is independent of this topic's
round 003.

---

## §7 — Iteration discipline

**Round counter: 2 of 5 max for Mode 2.** On track.

### Ping-pong risk assessment

Three signals could re-loop the Architects, which I want to head off now:

1. **Scout's Q1 (spec-vs-parser reconciliation posture).** Resolved by §3
   above (Option B — let Architect-design address per option). No re-loop
   needed.
2. **Scout's Q2 (bare untyped `name: Type = default` form).** This is a
   tangential concern — the corpus uses it 32 times, the spec says no. It
   is *not* on the user's complaint critical path. **Decision: round 004
   does not have to address it.** Architect-design's options can ignore the
   bare-untyped form; if a round-005 user pick eliminates `$prop` entirely
   in favor of declaration-site annotation, the bare form gets reconciled
   incidentally. If not, we file a separate RFC. **No re-loop.**
3. **Scout's Q3 (bench fixture editability).** Resolved trivially — yes,
   bench fixtures get updated in round 006+ as part of the parser change.
   This is a one-line acknowledgment, not a reopen. **No re-loop.**

### Signals of imminent ping-pong

None observed. The convergent A+B research narrows the design space; the
constraint surface (16 do-not-break items + 6 ACs) is closed; the option
count is fixed at 3; the deliverable shape is itemized. **Round 004 should
produce a substance-complete artifact in one Architect-design dispatch.**

If Architect-design returns with an option missing any of the 10 deliverable
fields in §4 above, that's a partial-completion bounce, not a substance
ping-pong. Verifier (round 005-V) catches it.

### Iteration cadence to expected exit

- Round 002 (this round): **research consolidation done.**
- Round 003: Synthesizer + Director-3 router note ("here are 3 options costed
  per the brief; user, pick one"). 1 dispatch.
- Round 004: Architect-design produces 3 full options. 1 dispatch.
- Round 005: Director-4 router note + surface-to-user (the user picks an
  option). 0 internal dispatches; user surface.
- Round 006: build round in a *new topic* (`topic:macro-redesign-build`).

**Net Mode-2 ping-pong rounds for this topic:** 5 (this round + 3 + 4 + 5).
Right at the budget; no slack for reopens. Discipline is required.

---

## §8 — Surface conditions for THIS round

Per fw-agent-skill, surface-to-user conditions are: **BLOCKED**, **scope-shift
requiring user judgment**, **hard-stop near**, **substance decision the user
owns**, etc.

### Conditions assessed right now

| Condition | Met? | Reasoning |
|---|---|---|
| **BLOCKED** by missing input | No | All 4 inputs present and complete. Three reports + Director-1 + state files. |
| **Scope-shift requiring user judgment** | No | Pattern E is a scope-shift, but §3 above resolves it as Option B (Architect-design absorbs it). User judgment not required *now*. Will surface at round 005 with the option pick. |
| **Hard-stop near** | No | Round 002 of 5; budget healthy. |
| **Substance decision the user owns** | No | All substance decisions in round 002 are Director-owned (audit verdicts, routing, brief refinement, priority). User decisions defer to round 005 (which option). |
| **Iteration counter exhausted** | No | 2 of 5. |
| **Researcher disagreement requiring arbitration** | No | A+B converge; Scout's findings extend, do not contradict. |
| **AGENTS.db contradiction with prior decisions** | No | `agents_search` ×3 returned no prior macro-design records. Clean slate confirmed. |
| **Public-API breakage detected** | No | All 3 options costed in §4 must satisfy AC-6. |

**No surface conditions met. Round 002 closes with routing intact: Synthesizer fires next.**

---

## §9 — Anti-drift guardrails (refresh, lifted from Director-1 §6 with round-002 additions)

Per Director-1 §6, plus three additions from round-002 research:

**Original 8 guardrails (lifted verbatim):**

1. Do NOT propose redesign syntax in research / synthesis rounds. Architect-design (round 004) owns syntax.
2. Do NOT redesign the four-block grammar. (One exception: dissolving `@agent`-as-block via declaration-site annotation is permitted iff AC-6 holds.)
3. Do NOT touch `packages/compiler/src/` before round 006.
4. Do NOT propose breaking the public package API.
5. Do NOT propose new `@aihu/*` packages.
6. Do NOT propose changing `aihu.config.ts` shape.
7. Do NOT survey "framework X also has duplication" without stating how X solves it.
8. Do NOT make the macro vocabulary spec the deliverable.

**New round-002 additions:**

9. **Do NOT propose decorator-class syntax in round 004.** Both Architect-A
   §11.1 and Architect-B §12.1 independently flagged this as non-translating.
   Anti-drift this option out of the design space at the brief level.
10. **Do NOT introduce a 4th redesign option in round 004.** Three is final
    (§4 above). A 4th option is either a decorator-class variant (anti-drift
    §9.9) or a near-duplicate of an existing option (no decision-relevant
    variance).
11. **Do NOT defer Pattern-E reconciliation to round 005.** Each round-004
    option must include the reconciliation paragraph explicitly (§4 item 8).
    This prevents the round-005 user-surface from having to re-derive the
    posture from each option's syntax.

---

## §10 — Section summary (for STATUS)

1. **STATUS-audit:** all three researchers PASS. No re-dispatch needed.
2. **Synthesizer routing:** YES, fire in round 003 with brief in §2 above.
   Output: `topic-summary.md` (genesis).
3. **Pattern E:** Option B (Architect-design absorbs per option). No
   surface-to-user this round.
4. **Architect-design (round 004):** 3 options, deliverable shape itemized
   in §4 (10 mandatory fields per option). Length budget 1500–2500 lines.
5. **Priority refresh:** 7 HIGH macros unchanged; `$expose` (state) drops
   to LOW (zero corpus use); no new HIGH elevations.
6. **Continuity:** all 5 in-flight tracks proceed in parallel; cli-templates
   B1.1 dispatch independent of macro-simplification round 003.
7. **Iteration discipline:** 2 of 5 ping-pong rounds used; budget tight but
   on track.
8. **Surface conditions:** none met right now. Round 002 closes clean.

---

*Substance only. AGENTS.db write of this director-note (kind: director_note,
topic: macro-simplification, round: 2), branch management, Synthesizer
dispatch, PR mechanics belong to the Team Lead.*
