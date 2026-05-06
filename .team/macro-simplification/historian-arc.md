# Historian arc · macro-simplification · 2026-05-05

**Author:** Historian · **Covers:** rounds 001–006 · **Topic:** `topic:macro-simplification`

This document records the *story of how the decision was made* — the pivots, rejected paths,
and surprises. The Synthesizer handles what was built; this file handles why.

---

## 1 — Problem statement

The aihu macro grammar treated every declaration as a free-standing statement, forcing
identifiers to be re-typed once to declare, once to expose, and once to describe. Across
the 10 example files audited in round 001, 58% of lines in `@agent` blocks were pure
name-re-references carrying no new information. In `examples/color-theme/color-theme.aihu`
— the user's own cited evidence — 8 names each appeared 3 times (declaration in `@state`,
bare re-statement in `@agent`, and `$describe` row in `@agent`), making 12 of 17 `@agent`
lines redundant. The user diagnosed it precisely: "we don't have the structure for it to
be built into one object or Array."

---

## 2 — Options evaluated

| Option | Core idea | Why accepted / rejected | Verdict |
|---|---|---|---|
| **Option 1 — Light-touch** (Clojure-style) | Inline positional docstring + 1–3 inline-attribute kvs per declaration. `@agent` shrinks to `$scope`/`$rate-limit` only. | Aesthetic anchor from Clojure `(defn foo "doc" ...)`. Shallowest cold-read curve. Smallest parser delta (+110 LOC). Does not collapse the *within-block* `$action`/`$action`/`$action` keyword repetition. | Rejected — fails the user's "one object or Array" criterion; per-line keyword repetition survives |
| **Option 2 — Attribute-prefix** (Rust-style) | Bracketed `#[expose, describe("...")]` prefix above each declaration. `@agent` dissolves entirely. | Familiar from Rust `#[serde(...)]`. Largest parser growth (+180 LOC). Requires learning a new bracket form. Does not collapse per-keyword invocation count. | Rejected — same within-block repetition problem; heavier new syntax surface |
| **Option 3 — Tagged-object** (Pydantic-style) | Wrapper-type metadata: `Action<(h: number) => void, "doc">`. `@agent` dissolves. | Inspired by Pydantic `Annotated[T, Field(...)]`. Densest cold-read (requires reading wrapper generics as metadata). Largest parser growth (+220 LOC). | Rejected — steepest AC-2 risk; wrapper generics are counter-intuitive as metadata |
| **Option 4 — Object-literal collection-form** (user-proposed) | Each macro keyword appears **once** in `@state`, taking a single object whose keys are the names and whose values are per-name metadata objects. `@agent` shrinks to a vestigial 4-line block for `$scope`/`$rate-limit`. | User proposed after reviewing Options 1–3 and observing they all preserved within-block keyword repetition. Strongest AC-4 invocation reduction (22 → 6 invocations in color-theme). AC-5 estimate was the smallest (~150 LOC). Parser was estimated to *shrink* (~−80 LOC). | **Accepted** — only option that collapsed N macro lines to 1 collection block |

---

## 3 — Key pivots

### 3.1 — Why Option 4 beat Options 1–3: the AC-4 invocation collapse

Options 1, 2, and 3 all achieved AC-1 (each identifier appears once across blocks) — they
correctly eliminated the cross-block re-declarations. What they missed was the
*within-block* dimension the user had named from the start: "`$action` or `$computed`"
repeated N times for N entries. The evaluation table makes this concrete:

| File: color-theme.aihu | Today | Option 1 | Option 2 | Option 3 | Option 4 |
|---|---:|---:|---:|---:|---:|
| Total `$<keyword>` invocations | 22 | ~14 | ~8 | ~14 | **6** |
| `$action` invocations | 8 | 4 | 4 | 4 | **1** |
| `$computed` invocations | 3 | 3 | 3 | 3 | **1** |
| `$describe` invocations | 8 | 0 | 0 | 0 | **0** |

Only Option 4 reached the user's literal request for "one object or Array." Every name
becomes a key in a collection; the macro keyword fires exactly once per kind. This is also
why the `@agent` block shrinkage under Option 4 is maximal: per-name metadata migrates into
`@state` collection entries, leaving `@agent` with only block-level cross-cutting macros
(`$scope`, `$rate-limit`).

### 3.2 — Pattern-E (spec / parser / examples three-way drift) and resolution

Scout's round-002 audit surfaced that three corpora disagreed on what valid syntax looked
like:

- The **spec** described a form (e.g., `$expose name1, name2, name3` as a comma-list, no
  `: Type` required) that the **parser** had never implemented.
- The **parser** required `$expose name: Type` (mandatory type annotation) and had no `$action`
  arm in `agent_macros.rs` at all, meaning bare `$action setHue` in `@agent` silently
  dropped.
- The **examples** agreed with the spec form, not the parser, meaning every `@agent` block
  in the example corpus would fail compilation if fed to the actual compiler.

Director-note-002 §3 faced three resolution paths and chose **Option B**: let each round-004
redesign option own its corpus-reconciliation posture rather than surfacing to the user in
the abstract. Every option was required to include a Pattern-E reconciliation paragraph
stating which corpus it treated as source of truth. Under Option 4, the path was **path (a)
— supersede both spec and examples** with the new collection-form. The B6.4 migration
became the reconciliation event: codemod sweeps all 28 `.aihu` files, parser update accepts
only the new form (hard-cut, no grandfather), and all three corpora converge on collection-form
simultaneously.

The spec was declared canonical for forward intent; the parser's strict-form-only behavior
was treated as latent drift, not the source of truth for the design.

### 3.3 — Branch durability problem and isolated worktrees

`plan/macro-simplification` was force-reset to `origin/main` twice during rounds 005–005.5.
The branch holding all design documents disappeared from the local repo between sessions.
Recovery was possible only because a local tag (`macro-simp-r005-recovery`) had been pushed
at `0066b85`, allowing the branch to be reconstructed by overlaying the BLOCKER resolution
commit (`3b73b10`).

The operational fix established in director-note-003 §5.3 was to route all build commits
through `feat/macro-simp-b6.X` branches via PR-create flow rather than pushing directly to
`plan/*`. The `plan/*` branch's push hook (`bun check:ci`) was failing on unrelated
pre-existing checks, making direct push unreliable. The `feat/*` branches had different hook
gates and had proven stable across the cli-templates B1.X PRs (#80, #83, #84, #86, #87).
The design documents on `plan/*` were therefore preserved as read-only artifacts while build
artifacts landed on isolated `feat/*` branches and merged to `main` through CI. The
`macro-simp-r005-recovery` tag stayed pinned for the duration of round 006 as insurance.

### 3.4 — Anonymous `$effect` BLOCKER (Q.B-1) and resolution

The codemod dryrun (round 005.5) surfaced a single BLOCKER: D.4 had specified `$effect` as
"object-keyed named entries" — the same collection form as `$action`. But `todo-mvc.aihu`
(Scout's second worst offender) contained `$effect(() => { persist(state) })` — an
anonymous bare callback with no name. Under D.4, the codemod would have to *invent* a name
for it, which violated the fundamental "no synthesis" reverse-direction audit principle
baked into AC-5.

The dryrun classified this as a BLOCKER and offered four resolution paths. The Director
chose **(a): allow anonymous `$effect` as a parallel to `$lifecycle.mount`/`$lifecycle.dispose`**
— bare callback form when anonymous, object-keyed form only when a name and metadata are
present. This unified all "side-effect callback at a framework hook point" macros under one
rule: bare when anonymous or unnamed-without-metadata; object-keyed wrapped form when
named-with-metadata. The carve-out required in D.3 for `$lifecycle` was no longer a
special-case exception but the emergent rule for the whole family. The closed list of
always-bare-when-anonymous macros became: `$lifecycle.mount`, `$lifecycle.dispose`,
`$beforeNavigate`, `$afterNavigate`, and (anonymous) `$effect`.

---

## 4 — Surprises and estimate misses

### 4.1 — Parser LOC: estimated −80, actual +819

Architect-evaluator-4 §4.5 estimated a net parser shrink of approximately −80 LOC across
`state_macros.rs`, `agent_macros.rs`, and `types.rs`, on the reasoning that delegating the
collection-form's object-literal parsing to the JS object parser would eliminate the
per-keyword custom match arms. The actual B6.3 implementation added +819 LOC net.

The gap traces to one assumption that did not hold: there was no pre-existing JS
object-literal sub-grammar in the Rust parser that B6.3 could leverage. The architect's
sketch assumed `parseAihu` would naturally handle the `{ key: { value: ... } }` nesting
once the outer `$keyword: { ... }` frame was recognized. In practice the Rust parser had
no reusable "parse JS object literal" primitive — the existing per-keyword arms each had
bespoke brace-and-paren-balancing logic that had to be generalized, not deleted, when
adapting to the collection-form. The new `parse_object_collection` helper and its
`CollectionKind` enum added more infrastructure than the removed per-keyword arms saved.

**Lesson extracted:** LOC estimates for parser work that claims "delegate to existing
machinery" need to verify whether that machinery exists in the *current* parser before
using it as a cost reduction. The −80 estimate was correct in the abstract (given a JS
object parser already present) and wrong in practice (it was not).

### 4.2 — Codemod LOC: director budget ≤200, actual 1719

Director-note-003 §2.2 set a codemod acceptance criterion of ≤200 LOC for `src/migrate.ts`
(with a 50-line buffer over the architect's 150 LOC estimate). The actual implementation
reached 1719 LOC across source and tests.

The architect's 150 LOC estimate accounted for the three-phase algorithm (sidecar build,
state-block walk, collection emit) at ~150 LOC of TypeScript. What it did not account for:

- The 7 MECHANICAL paper-cuts surfaced by the dryrun (line-width arithmetic for the
  inline/multi-line formatting decision, comment-attachment logic to preserve leading
  doc comments, multi-line type-literal flattening before rewrap, TS-widening-aware
  type-drop heuristic) each required non-trivial implementation.
- The idempotency check — the codemod needed to detect already-migrated files to prevent
  double-transformation — required re-parsing the output and comparing structural
  fingerprints, a feature not in the original sketch.
- The 4 golden-fixture test suite (per director-note-003 AC #3) and the corpus-sample
  test suite (B6.5) together pushed the test footprint well past the ≤200 LOC
  source-only bound.

The lesson is that codemod LOC estimates based on algorithm sketches systematically
under-count formatting logic, idempotency, and test infrastructure — all of which scale
with the number of source forms the codemod must handle, not with the conceptual simplicity
of the transformation.

### 4.3 — `emit.rs:310` silent `unwrap_or_default()`

During B6.3 parser work, a silent `unwrap_or_default()` was discovered at `emit.rs:310` in
the agent metadata codegen path. This call would silently emit an empty string for any
`AgentMacroDecl::Describe` variant whose `name` field was `None` — effectively dropping the
description from the generated metadata without any compiler warning or error. Under the
pre-Option-4 parser, `Describe` had no name field at all (confirmed by Scout's validator
census in §3), so `unwrap_or_default()` was always returning the empty string for every
`$describe` row.

Without the B6.3 test that verified C440 fires on old-form syntax (AC criterion #7 of
director-note-003 §2.3), this bug would have allowed old-spec `$describe` lines to pass
through the new parser silently rather than triggering the migration prompt. The B6.3 test
suite requirement was the detection mechanism; finding the bug was a secondary outcome of
writing the required regression test.

---

## 5 — Design decisions locked (D.1–D.7 + Q.B-1, Q.B-2)

| Decision | One-line statement | Why |
|---|---|---|
| **D.1** — Type drop unless required | `type:` field omitted when TS 5.x can infer from `default:` (for `$prop`) or `value:` return (for `$computed`/`$action`) | Removes the most common cause of artificial verbosity in the old spec; escape-hatch `type:` field preserved for uninferable cases |
| **D.2** — Bare function is implicit handler | `$action name(args) { body }` bare form remains valid; object-keyed form only required when other metadata (`describe:`, `expose:`) is present | Preserves zero-cost path for private actions; forces no ceremony when none is needed |
| **D.3** — `$lifecycle` always bare | `$lifecycle.mount(() => ...)` and `$lifecycle.dispose(() => ...)` never take an object-keyed form | Lifecycle hooks are singletons with no agent-exposable name; no metadata-bag form is ever meaningful |
| **D.4** — `$effect` named entries; anonymous bare | `$effect` in object-keyed form when named with metadata; bare callback when anonymous | Unified with Q.B-1 resolution — anonymous effects behave like `$lifecycle`, named effects behave like `$action` |
| **D.5** — `$computed` value is thunk | `value: () => expr` (arrow thunk) is the canonical form; the old `= expr` assignment form is codemod-migrated | Thunk makes the reactive re-evaluation intent explicit to a cold reader; wrapping is done by codemod, not the human |
| **D.6** — Collection-form is canonical | `$prop: { name: { ... } }` outer-keyed form is the only accepted form in the v2 parser; the old per-line form (`$prop name: Type = default`) triggers C440 | Hard-cut grandfather: no parallel grammar arm; cleanliness over backward-compat given pre-v1.0 status |
| **D.7** — Formatting: inline when ≤80 chars, multi-line otherwise | Single-key metadata objects that fit on one line are inline; complex or wide entries are multi-line | Makes the common case (one or two keys) visually compact; multi-line handling done by codemod, not developer |
| **Q.B-1** — Anonymous `$effect` allowed bare | Resolution: option (a). Anonymous `$effect(() => {...})` passes through unchanged; no name synthesis | Preserves "no synthesis" reverse-direction audit principle; unifies all framework-hook callback macros under one rule |
| **Q.B-2** — AC-6 wording split | Resolution: option (a). "Byte-identical" for `@state`-side lowering only; "semantically equivalent, per-name reshape allowed" for `@agent` metadata payload | The `@agent` payload reshape is the *purpose* of Option 4; holding AC-6 strictly against it would prohibit the entire design |

---

## 6 — Lessons for next time

- **Parser LOC estimates need infrastructure verification first.** Before writing "delegate
  to existing machinery," check that the machinery exists in the current implementation.
  The −80 LOC parser estimate was based on an assumption (pre-existing JS object-literal
  sub-grammar) that was not true. Spend one session read-through the parser before estimating.

- **Codemod LOC estimates need to account for sub-grammar infrastructure cost.** A
  three-phase algorithm sketch at ~150 LOC does not capture formatting logic, idempotency
  detection, or test infrastructure. For codemods that handle multiple source forms, estimate
  (N forms × ~20 LOC formatting) + (~100 LOC idempotency) + (4× source LOC for tests) as
  a baseline, then adjust down only with evidence.

- **Force a pre-build codemod dryrun against real corpus files before committing to LOC
  estimates.** The round-005.5 dryrun surfaced the BLOCKER (anonymous `$effect`) and 7
  MECHANICAL paper-cuts in ~346 LOC of audited source. Running it earlier — before the
  director finalized LOC bounds — would have produced more accurate constraints.

- **Branch durability requires explicit protection for design-document branches.** Design
  branches (`plan/*`) and build branches (`feat/*`) have different stability requirements.
  Tag key design-state commits explicitly (the `macro-simp-r005-recovery` tag saved the
  project); don't rely on branch refs alone for multi-session work.

- **"No synthesis" as a codemod principle is load-bearing, not advisory.** The reverse-
  direction audit (AFTER introduces no name/key/description not in BEFORE) was the
  mechanism that caught the anonymous `$effect` BLOCKER before it was baked into the
  codemod implementation. Establish this as an explicit acceptance criterion in the brief,
  not just a verification step, so the codemod author cannot drift past it silently.

---

*This arc covers topic rounds 001–006. Follow-on work (v0.2.1 codemod CLI wrapper,
pretty-printer integration, deletion of old spec, Pattern-E LSP tooling per arch-4 §OQ-DX-03)
belongs to a new topic. See director-note-003 §6 for the Historian's follow-on docket.*
