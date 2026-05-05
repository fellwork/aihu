# Topic summary · macro-simplification · v1 (round 003 genesis)

**Topic:** `topic:macro-simplification` · **Track:** `track:macro-simplification` ·
**Branch:** `plan/macro-simplification` · **Round:** 003 (Synthesizer) ·
**Mode:** 2 (design exploration, doc-only) · **Iteration:** 2 of 5 max ·
**Author:** Synthesizer ·
**Inputs consolidated:** `director-note-001.md` (961 lines), `scout-report.md`
(423 lines), `architect-frameworks.md` (~1,290 lines), `architect-languages.md`
(~1,035 lines), `director-note-002.md` (~559 lines). Total source corpus
~4,268 lines. This summary is the queryable seed for round 004+.

---

## §1 — Topic at a glance

The user's complaint: aihu's macro grammar forces each named entity (e.g.
`setHue`) through up to **three syntactic sites** — declaration in `@state`,
re-mention as bare `$action setHue` in `@agent`, and metadata as `$describe
setHue "..."` in `@agent`. The Director-1 audit verdicts the complaint as
**strongly on-thesis** — a structural defect, not a stylistic preference. The
research rounds (001-S Scout + 001-A1 Architect-frameworks + 001-A2
Architect-languages) confirm aihu-today is structurally equivalent to the
Elm/Roc "types are the only metadata" anti-pattern, while 6 of 7 component
frameworks and 5 of 7 language patterns surveyed have collapsed exactly this
duplication via declaration-site annotation. We are at round 003 of a planned
6-round sequence; round 004 (Architect-design, 3 redesign options) is next.

## §2 — Acceptance bar (AC-1..AC-6, lifted verbatim from director-note-001 §3)

| ID | Criterion | Current-state numerator (where Scout measured) |
|---|---|---|
| **AC-1** | Each `$prop`/`$computed`/`$action`/`$expose`/`$describe` target identifier appears in source exactly **once** unless overriding default behavior. Check: `grep -c '\bsetHue\b' file.aihu` = 1. | `setHue` appears **3 times** in `examples/color-theme/color-theme.aihu` today (Director-1 §1, Scout §6). |
| **AC-2** | Cold-read intelligibility — a developer with no aihu knowledge can guess the role of any single macro line, given only the line and its surrounding block label. Check: Architect-design includes per-option naive-reader prediction. | Today's `$describe foo "..."` rows pass; bare `$action setHue` lines without context **fail** (Director-1 §3). |
| **AC-3** | `examples/color-theme/color-theme.aihu`'s `@agent` block ≤ **5 lines** (60% reduction; soft target 70%+). Check: `awk '/^@agent/,/^}/' \| wc -l`. | Today: **17 lines** (Director-1 §1, Scout §2 Pattern A — 76% redundant). |
| **AC-4** | Distinct macro-name count ≤ **39** (target ≤ 35). Check: count unique-name macros across 4 blocks. | Today: 39 (per `spec-macro-vocabulary.md` §1). |
| **AC-5** | Codemod-expressible: deterministic AST transform from old to new syntax in **≤ 300 LOC**, no human judgment calls. Check: per-option pseudocode sketch. | Not applicable to baseline — measured on round-004 options. |
| **AC-6** | No public API change to `@aihu/agent`, `@aihu/agent-readiness`, `@aihu/runtime`, `@aihu/arbor`. Source-syntax redesign only; runtime lowering byte-identical. Check: per-option lowering shape inspection. | Today: 206/206 agent-readiness tests passing (`state-agent-readiness.md`). |

## §3 — Priority macros (final, post round-002)

Per Director-2 §5 priority refresh. **`$expose` (in `@state`) deprioritized
from MEDIUM to LOW** because Scout §1 found zero corpus uses (every `$expose`
line in audited corpus is inside `@agent`). All other Director-1 priorities
unchanged.

| Macro | Block | Priority | One-line duplication note |
|---|---|---|---|
| `$prop` | `@state` | **HIGH** | Keyword re-typed per declaration; cross-block re-ref via `@agent $expose`. |
| `$computed` | `@state` | **HIGH** | Keyword re-typed per derivation (user-cited). |
| `$action` (declaration) | `@state` | **HIGH** | Keyword re-typed per decl; each name appears up to 3× via `@agent` re-listing + `$describe` (user-cited). |
| `$expose` (in `@agent`) | `@agent` | **HIGH** | Comma-list of names already declared in `@state`. |
| `$expose.write` | `@agent` | **HIGH** | Same shape, writable variant. Zero corpus usage but spec-canonical. |
| `$action` (bare-name in `@agent`) | `@agent` | **HIGH** | Bare-name re-statement — the line form the user explicitly called out. |
| `$describe` | `@agent` | **HIGH** | `$describe name "..."` re-types name a third time (user-cited). |
| `$resource` | `@state` | **MEDIUM** | Same shape as `$prop`, benefits incidentally. |
| `$expose` (in `@state`) | `@state` | **LOW** | **Deprioritized round-002:** zero corpus uses; wait for adoption signal. |
| 31 others (template attrs, style scoping, lifecycle singletons, zero-usage `$shared`/`$cookie`/`$server`/`$watch`) | various | **LOW / N-A** | Out of redesign scope. |

## §4 — Current-state baseline

From Scout §7 census (43 `.aihu` files audited: 19 examples + 21 bench + 3 docs):

- **Total macro occurrences corpus-wide:** 245 (74 `@state`, 104 `@template`, 12 `@style`, 55 `@agent`, plus cross-block).
- **Files with `@agent` block:** 10 (8 in examples + 2 in bench).
- **`@agent` block redundancy:** 55 of 85 lines (65%) are pure name re-references across the 8 example `@agent` blocks (Scout §2 Pattern A).
- **Worst-offender files** (top 3 by `@agent` redundancy %, Scout §6):
  1. `examples/color-theme/color-theme.aihu` — 17 LOC, 13 redundant (**76%**).
  2. `examples/todo-mvc/todo-mvc.aihu` — 12 LOC, 8 redundant (**67%**).
  2. `examples/live-counter/live-counter.aihu` (tied) — 12 LOC, 8 redundant (**67%**).
- **5 duplication patterns catalogued** (Scout §2): A) cross-block name re-statement; B) within-block keyword repetition; C) sidecar metadata keyed by name string; D) comma-list of pure names; E) example-corpus-drifts-from-spec (the headline finding — see §8 below).
- **Validator behavior:** parser does **not** validate cross-block name references in any block today (Scout §3, 11 validator sites cited). Redesign with declaration-site annotation incidentally tightens semantics from "silently broken" to "syntactically impossible to be broken" — see Scout §3 detail.

## §5 — Convergent signals across comparative research

The two Architect reports independently surface three doubled findings.
Architect-design (round 004) should weight these heavily.

### §5.1 — Docstring-above-declaration is universal

**Architect-A §10.3 ("JSDoc-as-docstring") — 7 of 7 frameworks surveyed use
JSDoc** (Svelte, Vue, SolidJS, Lit, Marko, Astro, Qwik). All seven place the
docstring *immediately above* the declaration; none use a sidecar block.

**Architect-B §11.2 ("first string literal positioned right after a name is
the docstring") — 5 of 7 language patterns** make the same move: Python `def
foo(): """doc"""`, Clojure `(defn foo "doc" ...)`, Rust `///` (sugar for
`#[doc=...]`), Kotlin KDoc, plus JSDoc itself. Architect-B §11 calls this
"the killer ergonomic detail" and "the most ergonomic description-attachment
in any language surveyed."

**This is doubled signal at the strongest possible level.** Whatever round-004
options propose, they need an answer to "where does the docstring live."

### §5.2 — Attribute / annotation prefix is the collapsing mechanism

**Architect-A §10.1 ("decorator-as-metadata-bag")** — Lit `@property({type,
attribute, reflect}) name = v` shows a single annotation token attached to a
declaration carrying a bag of named metadata fields. The decorator IS the
declaration IS the public-surface registration; no second site needed.

**Architect-B §11.1 ("Rust attribute prefix")** — Rust `#[serde(rename=...,
default, skip_serializing_if=...)] name: String` is the same shape from the
language side. Architect-B explicitly notes "Aihu's parser is itself written
in Rust — the proc-macro discipline is native to the team."

**Both reports flag the *literal* TS-decorator syntax as non-translating** but
the *idea* (metadata bag at declaration site) as the right shape. Architect-A
§11.1 + Architect-B §12.1 both name TS runtime decorator metadata
(`Reflect.metadata`) as bottom-3 — see §6 below.

### §5.3 — Negative example: type-only metadata = aihu-today

**Architect-B §12.3 (Elm/Roc "types are the only metadata")** is the
language-side parallel of aihu's current grammar: every cross-cutting concern
must be re-expressed as a separate type or function declaration, with names
restated in each. **Architect-B explicitly concludes Elm/Roc "is the pattern
aihu *currently has*, and is the pattern the user is complaining about."**

This is the meta-finding: **the redesign has a clear precedent for what NOT
to ratify.** Any option that preserves cross-block name re-statement is
ratifying the Elm/Roc model — which both Architect reports independently
flagged as the bottom of the design space.

## §6 — The constraint surface

Hard constraints any round-004 option must satisfy. Lifted from Scout §5
(do-not-break list of 16 items) and Director-2 §9 anti-drift (11 guardrails).
Every round-004 option MUST satisfy these; failure to do so bounces the
option back into the round.

### Block-level

1. **4-block grammar preserved** (`@template` / `@state` / `@style` / `@agent`).
   Closed by `spec-block-structure.md:19` (Scout §5 item 2). One narrow
   exception: dissolving `@agent`-as-block via declaration-site annotation
   IS permitted iff AC-6 holds (Director-2 §9.2).
2. **Each block name MAY appear at most once per file** (Scout §5 item 3) —
   no `@agent.public` + `@agent.internal` split.
3. **No new blocks** (`@registry`, `@manifest`, `@interface`) — Scout §5 item 2.

### Macro-level

4. **Vocabulary closed at 39 macro forms** — redesign options that *remove*
   macros are in scope; options that *add* require RFC + version bump (Scout
   §5 item 4).
5. **`$` prefix is the discriminator** — must be preserved or have documented
   equivalence path (Scout §5 item 6).
6. **Plugin-namespaced macros (`@plugin.macro`)** are the documented
   extension mechanism — redesign cannot conflict (Scout §5 item 5).

### Runtime / package

7. **AC-6: no public package API change** to `@aihu/agent`, `@aihu/server`,
   `MountScope.agent`, `defineExpose`, `registerAgentMetadata`, `AgentMetadata`
   field set (Scout §5 items 7–10).
8. **No new `@aihu/*` packages** (Director-2 §9.5).
9. **No `aihu.config.ts` shape changes** (Director-2 §9.6).

### Parser / source

10. **`packages/compiler/src/`** is read-only through round 005; round 004
    produces sketch + LOC estimate only (Scout §5 item 11).
11. **Bench fixtures `bench/compiler-conformance/`** are golden regression
    inputs; redesign that requires editing them is a v1.x compiler change,
    costed in round 006+ (Scout §5 item 14).
12. **Bare untyped `name: Type = default` form** (32 corpus occurrences) —
    don't silently break; Director-2 §7 confirms round 004 may ignore it.

### Process

13. **AC-5: codemod ≤ 300 LOC** with no human judgment calls on the 10 audited
    examples (Director-1 §3 AC-5).
14. **No decorator-class syntax** — Architect-A §11.1 + Architect-B §12.1
    independently flagged as bottom-3 (Director-2 §9.9).
15. **3 options, not 2 or 4** — Director-2 §4 fixed the count after convergent
    signals narrowed the design space.
16. **Pattern-E reconciliation per option required** — no deferral to round
    005 (Director-2 §9.11; see §8 below).
17. **RFC #56 (live-binding)** is currently held; redesign must not contradict
    or pre-empt its syntax decisions (Scout §5 item 16).

## §7 — Open questions for Architect-design (round 004)

Director-2 §4 item 7 mandates every round-004 option answer three convergent-
signal questions explicitly. Restated here so round 004 reads them first:

- **Q-DOC** — How does this option handle the docstring/JSDoc question? Choose
  one and justify: (a) silent-attach (preceding doc-comment captured
  automatically), (b) explicit `@describe(...)` attribute, (c) first-string-
  after-name positional (Clojure/Python style), or (d) option-author's-choice
  with explicit reasoning. **Convergent signal:** §5.1 above; 7/7 frameworks +
  5/7 languages converge on docstring-above-declaration.
- **Q-EXPOSE** — Does `$expose` / `$expose.write` survive as a separate
  macro, fold into a declaration-site flag, or both? If both, what's the
  precedence? **Convergent signal:** §5.2 above; declaration-site annotation
  is the universal collapsing mechanism.
- **Q-AGENT** — Does the `@agent` block survive as a separate block, shrink
  to cross-cutting-only (`$scope` / `$rate-limit`), or dissolve entirely?
  Director-2 §9.2 leaves dissolution open per AC-6 preservation; this is a
  real choice the option must own.

### Additional questions surfaced by either Architect (not preempting design)

- **Architect-B §14 AC-awareness flag:** AC-2 (cold-read) gets harder as the
  metadata stack grows. Pydantic `Annotated[T, Field(...)]` densest;
  Clojure docstring-after-name lightest. Round-004 options should mitigate by
  reserving heavy forms for declarations with 3+ aspects.
- **Architect-A §10.2 (Vue `defineExpose`):** the comma-list form is
  acceptable *if it is the ONLY re-mention* — the duplication isn't `$expose`
  itself, it's `$expose` + bare-name `$action` + `$describe` rows together.

### Coverage gap (Synthesizer note)

No coverage gaps detected between Architect-A and Architect-B. The reports
converge on §5.1–§5.3; no contradictions found. Director-2 §1 confirms.

## §8 — Pattern-E (drift) handling

Scout §2 Pattern E surfaced a three-way drift between corpora. Director-2 §3
chose **Option B: each round-004 option must include a Pattern-E reconciliation
paragraph** stating which corpus is the source of truth and what the migration
path is for the other two. Director-2 §9.11 anti-drifts deferral to round 005.

### The three corpora in conflict

| Corpus | Form used | Defensible as source of truth? |
|---|---|---|
| **Example files** (`examples/*.aihu`) | Spec-form: `$expose hue, sat, ...`, `$action setHue`, `$describe hue "..."` | **Yes if** redesign supersedes; spec ratified 2026-05-02 names this as canonical. Used by humans/AI tooling browsing the public examples corpus. |
| **Bench fixtures** (`bench/compiler-conformance/blocks/agent-basic.aihu`) | Un-macroed form: `input name: string`, `action greet()` | **Yes if** redesign treats bench as compiler ground-truth; these are the golden regression inputs the compiler test suite actually runs (`packages/compiler/tests/sfc_conformance.rs:438–453`). |
| **Parser** (`agent_macros.rs:32–96`) | Strict spec subset: `$expose count: number` (single name + `:Type`), `$describe "string only"` (no name field), bare `$action <name>` silently dropped | **Defensible as today's-shipping-reality** but stricter than spec and silently-broken on 3 of 4 in-scope `@agent` macro forms. Has 11 validator-sites that don't cross-check name references (Scout §3). |

### Implication

The drift's resolution is **downstream of the design choice**, not a separate
question (Director-2 §3). Architect-design options have two viable paths
(Scout §2 Pattern E):

(a) **Supersede both spec and examples** with new declaration-site form —
parser jumps from current strict-form straight to redesigned form, codemod
converts both spec-form examples and parser-form bench fixtures.

(b) **Ratify spec form, bring parser up to spec first**, then redesign on top
— wedge change before redesign, parser passes through spec form first.

Either path is internally consistent; they have different round-006+
implementation costs. **Each round-004 option MUST name its path explicitly**
(Director-2 §4 item 8). The user picks Pattern-E posture implicitly when
picking an option in round 005 — the router-round will surface this.

## §9 — Round sequence + state

Per Director-1 §5 and Director-2 §7. Iteration counter: **2 of 5 max**.

| Round | Status | Output |
|---|---|---|
| **001** governance | DONE | `director-note-001.md` (961 lines) — scope set, AC-1..AC-6, 8 HIGH-priority macros, 6 anti-drift guardrails. |
| **002** parallel research | DONE | Scout report (423 lines, 5 patterns + Pattern E discovery), Architect-A frameworks (~1,290 lines, 7 frameworks), Architect-B languages (~1,035 lines, 7 patterns). All 3 STATUS: DONE; Director-2 §1 verdicted all PASS. |
| **003** synthesis (current) | IN PROGRESS | This file: `topic-summary.md` (genesis). Director-2 §2 routes Synthesizer here; output is queryable seed for round 004+. |
| **004** substantive design | PLANNED | Architect-design produces 3 redesign options (light-touch / attribute-prefix / tagged-object — Director-2 §4) per 10 mandatory deliverable fields. Length budget 1,500–2,500 lines. |
| **005** user picks | PLANNED | Surface to user with the 3 options. User picks one; implicitly picks Pattern-E reconciliation posture. |
| **006+** build | DEFERRED | New topic (`topic:macro-redesign-build`), fresh branch (`feat/macro-redesign-*`). Includes Pattern-E parser fix per round 005's pick. |

**Iteration cadence:** Round 003 + 004 + 005 = 3 more Mode-2 rounds before
build kicks off in a separate topic. Net 5 Mode-2 ping-pong rounds for this
topic — right at budget; no slack for reopens. **Discipline is required.**

**Surface conditions for round 003:** none met. Director-2 §8 confirmed —
all substance decisions in round 002–003 are Director/Synthesizer-owned;
user surface defers to round 005. AGENTS.db `agents_search` ×3 returned 0
prior records on macro-design (Scout §4, Director-2 §1), confirming clean
slate.

---

*Substance-only. AGENTS.db write of this summary (kind: research-report,
topic: macro-simplification, round: 3), branch management, Architect-design
dispatch in round 004, PR mechanics belong to the Team Lead.*
