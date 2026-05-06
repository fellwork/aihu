# Director-note · macro-simplification · round 006 · 2026-05-05

**Mode:** 2 (build round authorization, governance only — substance scope only;
Team Lead owns dispatch + branches + push) ·
**Author:** Topic Director ·
**Reads:** `director-note-002.md` (round 002 router, full 559 lines),
`director-note-001.md` (round 001 genesis, full 961 lines, for §3 AC-1..AC-6
verbatim and §6 anti-drift),
`topic-summary.md` (Synthesizer round 003 consolidation, 277 lines, full),
`option-4-evaluation.md` (Architect-evaluator-4 round 004b, 1,631 lines —
focused read on §4.4 codemod sketch, §4.5 compiler-impact, §4.6 subsumption,
§4.8 Pattern-E reconciliation, §C Architect's lean swing),
`codemod-dryrun.md` (Verifier round 005.5, 873 lines, full — §1 per-file
dryruns, §2 paper-cut classification 1B+7M+10J+3PF, §5 Q.B-1/Q.B-2 user
resolutions),
`examples/_shared/macro-test.aihu` (canonical locked grammar, post Q.B-1/Q.B-2
update, 137 lines),
`docs/superpowers/specs/2026-05-02-spec-macro-vocabulary.md` (existing
39-macro spec, 2,005 lines — read §0–§1.2; full reconcile is B6.1's job),
`packages/compiler/src/parser/{state_macros,agent_macros}.rs` (parser arms
that change; line counts 771 + 192),
`packages/templates/cf-team/template/apps/web/src/{agent/expose,components/live-counter}.aihu`
(continuity check; cf-team v0.2.0 just shipped with `@agent { $expose ... }`
syntax that B6.4 will migrate),
`.team/director-notes/cli-templates-005.md` (continuity refresh — v0.2.0
milestone closed, shipped reality is `@expose` block + `$describe` rows),
AGENTS.db `agents_search` ×2 (no prior records on macro-simp build round;
adjacent `cli-templates` v0.2.0 closure + two anti-pattern playbooks
relevant to dispatch hygiene). ·
**Prior notes:** `director-note-001.md` (round 001), `director-note-002.md`
(round 002).

**Topic identifier:** `topic:macro-simplification` ·
**Track identifier (single track):** `track:macro-simplification` ·
**Round counter (Mode 2 build round, max 5):** **1 of 5** for the build round.
(Cumulative round counter for the topic: 6 — rounds 001–005 closed Mode 2
exploration; round 006 opens Mode 2 BUILD.)

---

## §1 — Integration check on user resolutions (Q.B-1 + Q.B-2)

The dispatch instructs me to confirm the two BLOCKER resolutions heal the
contradictions surfaced in round 005.5. I read both the dryrun §5 question
text and the post-resolution canonical example (`examples/_shared/macro-test.aihu`,
header lines 1–26, body lines 27–136) before writing this section.

### §1.1 — Q.B-1 (a) — anonymous `$effect` healed against D.3/D.4 asymmetry

**Verdict: clean. The asymmetry is healed and the rule that emerges is
single-sentence-statable.**

**The exact rule (lift this verbatim into the round-006 spec):**

> Side-effect callbacks at framework hook points (`$lifecycle.{mount,dispose}`,
> `$beforeNavigate`, `$afterNavigate`, and `$effect`) follow the same shape
> rule: **bare function-as-value when anonymous OR when named-without-metadata;
> object-keyed wrapped form when named-with-metadata** (e.g., `on:` deps list,
> `describe:`, `expose:`).

This is the carve-out unification the dryrun PC-1.2.F surfaced. With Q.B-1 →
(a), the family of "anonymous-callback-at-a-framework-hook" macros all share
one rule. `$lifecycle` no longer needs special-case prose; the rule is the
emergent one. The macro-test.aihu header (lines 7–11, 24–26) encodes this
exactly: "anonymous bare-callback form ALSO allowed (Q.B-1 → a), parallel
to `$lifecycle`. Carve-out healed: all 'side-effect callback at a framework
hook point' (lifecycle hooks + ad-hoc effects) share the same rule."

**No new BLOCKER from this.** PC-1.2.B (the dryrun's only BLOCKER) dissolves:
the anonymous `$effect(() => { persist(state) })` form passes through unchanged,
no name synthesis required, no codemod judgment call. The reverse-direction
"no synthesis" audit principle is preserved.

**One follow-on the spec must explicitly state** (B6.1's job, not mine to
decide here): **the closed list of "always-bare-when-anonymous" macros.**
Per dryrun PC-1.1.A and the unified rule above, that list is:
`$lifecycle.mount`, `$lifecycle.dispose`, `$beforeNavigate`, `$afterNavigate`,
and (anonymous) `$effect`. Spec author should state this list verbatim so
the codemod has a closed set to pattern-match against.

### §1.2 — Q.B-2 (a) — AC-6 wording reshape preserves spirit while permitting `@agent` payload reshape

**Verdict: clean. The reshape is scoped to exactly the surface it has to be
scoped to (the entire point of Option 4); `@state`-side lowering is held to
the strict bar.**

**The exact final wording of AC-6 (lift this verbatim into B6.1's spec
revision):**

> **AC-6 (revised, post Q.B-2 → a):** **Byte-identical** for `@state`-side
> lowering — the JS calls emitted for `defineExpose`, `effect`, `computed`,
> and `lifecycle` (mount/dispose) are byte-equivalent to today's compiler
> output. **Semantically equivalent** (per-name reshape allowed) for
> `@agent` metadata payload — the runtime `registerAgentMetadata` call
> shape may shift from a flat list-of-records (`[{kind:'expose'},
> {kind:'describe'}]`) to a per-name keyed object (`[{kind:'expose',
> describe:'...'}]`), provided every name + every metadata field
> present in the BEFORE source is present in the AFTER payload.

This is exactly what the dryrun §3 AC-6 verification table (the `todo-mvc`
@agent row + `hn/index.aihu` @agent row) called out as "intentional
divergence, equivalent." The reshape is the entire point of the
simplification — collapsing N rows of `{kind:'expose'}` + `{kind:'describe'}`
into one `{kind:'expose', describe:'...'}` row. With the new wording, that
collapse is in-bounds.

**Crucially: the `@state` half stays strict.** `defineExpose({...})`,
`effect(...)`, `computed(...)`, `lifecycle.mount(...)`, `lifecycle.dispose(...)`
calls must lower byte-identically. The codemod tests (B6.2) and Verifier
sweep (B6.5) must check this strict bar on every audited file.

**No new BLOCKER from this.** Architect-evaluator-4 §4.5.4 + §4.6 already
costed the parser deltas under this exact assumption (the `AgentMacroDecl`
enum loses `Expose` and `Describe` variants; the reshape is in `types.rs`
+ the agent codegen, not in `defineExpose`).

### §1.3 — Anything else ambiguous?

I re-read `examples/_shared/macro-test.aihu` end to end against the dryrun's
4 BEFORE/AFTER blocks, plus the option-4-evaluation §4.2 color-theme
rewrite. Three small items I want spec-author B6.1 to nail down (none rise
to BLOCKER; flag for surface-back-to-user only if B6.1 finds the user
resolutions don't actually pin them):

- **(I.1) `$prop` always-wrapped vs. sugar-passthrough (PC-1.1.B, PC-1.3.A).**
  The dryrun chose path (a) — `$prop name { type: ... }` always-wrapped, no
  colon-form sugar — based on the emergent "$prop is always wrapped (no
  running code to imply)" rule and macro-test.aihu line 26. **The user has
  implicitly ratified this by not editing macro-test.aihu's prose.** Spec
  author should state path (a) explicitly with one prose sentence; no
  surface-back needed.
- **(I.2) The collection-form vs. per-line shape inside `@state`.** The
  macro-test.aihu uses `$prop: { hue: {...}, ... }` (collection-keyed:
  outer macro takes a single object whose keys are names) for `$prop` /
  `$computed` / `$action`. The dryrun §1.2 AFTER block uses `$computed
  visible { value: ... }` (per-line: outer macro takes a name then an
  object). **These are DIFFERENT SHAPES.** The macro-test.aihu form wins
  per option-4-evaluation §4.4 "each macro-keyword appears at most once in
  the AFTER file" — that's the within-block-collapse the user's complaint
  named. **Spec author B6.1 must standardize on the collection-keyed form
  (macro-test.aihu shape) and explicitly reject the per-line form** the
  dryrun rendered. The dryrun was rendered before macro-test.aihu received
  the ratification update; macro-test.aihu is now canonical. **NOT a
  BLOCKER** — the canonical example pins it — but the spec author MUST
  notice the dryrun's per-line form is now superseded.
- **(I.3) `$expose` (in `@agent`) under Q.B-1/Q.B-2 resolution.** Per
  topic-summary §6 item 1 + Architect §4.6, `$expose` and `$expose.write`
  in `@agent` are **removed entirely**; per-name `expose:` field on each
  `@state` collection entry replaces them. Macro-test.aihu's `@agent`
  block (lines 130–136) holds only `$scope` + `$rate-limit`. **Already
  internally consistent. No surface needed.**

**Net §1 verdict: CLEAN. The two user resolutions heal the BLOCKER + AC-6
ambiguity. No new BLOCKER blocks the build round.** I.1/I.2/I.3 are spec-author
notes for B6.1's prose, not substance reopens.

---

## §2 — Build sequence design (round 006)

The dispatch sketched a 5-task decomposition (B6.1–B6.5). I read the inputs;
my read agrees with the sketch with one refinement (B6.3 grandfathering
question, locked below in §2.3) and one explicit ordering note (B6.4
**must wait** for both B6.2 and B6.3 — a hard fence, not a soft preference;
this is the Pattern-E resolution moment per Architect §4.8).

**Dependency graph (one-liner):** `B6.1 → (B6.2 ∥ B6.3) → B6.4 → B6.5`.
B6.2 and B6.3 run in parallel (both depend only on B6.1's spec); B6.4 fences
behind both; B6.5 fences behind B6.4. Total **4 sequential nodes** with one
parallel pair = **5 task IDs, 4 critical-path stages.**

### §2.1 — B6.1: Spec author

| Field | Value |
|---|---|
| **Task ID** | `B6.1` |
| **Goal** | Distill all locked decisions (D.1..D.7 + Q.B-1 + Q.B-2 + the §1.1 carve-out unification rule + the §1 spec-author notes I.1/I.2/I.3) into a tight new spec. Cite `examples/_shared/macro-test.aihu` as canonical grammar example. **No code changes.** Foundation task — B6.2/B6.3/B6.4 depend on this spec. |
| **In-scope** | New file `docs/superpowers/specs/2026-05-05-spec-macro-vocabulary-v2.md`. New file content: the full v2 spec (collection-form for `$prop`/`$computed`/`$action`/`$resource` in `@state`; bare/wrapped duality for `$effect`/`$lifecycle.{mount,dispose}` per Q.B-1; `$expose`/`$expose.write`/`$describe` removed from `@agent`; `$scope`/`$rate-limit` retained; AC-6 reworded per Q.B-2). Update old spec `2026-05-02-spec-macro-vocabulary.md` with a **single header note** at the top: "**Superseded by `2026-05-05-spec-macro-vocabulary-v2.md` for v2 grammar; this doc retained for historical reference until the build round closes.**" — do NOT delete or rewrite the body of the old spec; B6.4 migration produces the actual deprecation surface. |
| **Out-of-scope** | Touching parser source, codemod source, examples, bench fixtures, runtime API. NO new ACs (AC-1..AC-6 are closed; AC-6 is reworded per Q.B-2 only). NO new macros beyond the closed-list collapse Architect §4.6 already costed. |
| **Acceptance criteria** | (1) `test -f docs/superpowers/specs/2026-05-05-spec-macro-vocabulary-v2.md && wc -l < 200 200 ≤ x ≤ 400` (length budget 200–400 lines, dense). (2) `grep -c '^## D\.' docs/superpowers/specs/2026-05-05-spec-macro-vocabulary-v2.md = 7` (one section per D.1..D.7). (3) `grep -E '^## (Q\.B-1\|Q\.B-2)' docs/superpowers/specs/2026-05-05-spec-macro-vocabulary-v2.md \| wc -l = 2` (Q.B-1 + Q.B-2 each get a section). (4) `grep -F 'examples/_shared/macro-test.aihu' docs/superpowers/specs/2026-05-05-spec-macro-vocabulary-v2.md \| wc -l ≥ 3` (canonical example cited at least 3× — at the top, in the collection-form section, and in the carve-out section). (5) `grep -F 'AC-6' docs/superpowers/specs/2026-05-05-spec-macro-vocabulary-v2.md` returns the **exact reworded text** from §1.2 of this director-note. (6) `grep -F 'always-bare-when-anonymous' docs/superpowers/specs/2026-05-05-spec-macro-vocabulary-v2.md` returns the closed list (`$lifecycle.mount`, `$lifecycle.dispose`, `$beforeNavigate`, `$afterNavigate`, `$effect`). (7) Old spec file has the supersession header note at the top: `head -10 docs/superpowers/specs/2026-05-02-spec-macro-vocabulary.md \| grep -F 'Superseded by'`. |
| **Dependencies** | None. Foundation task. |
| **Branch** | `feat/macro-simp-b6.1` (off `main`). Per universal principle #8 — one branch per Builder dispatch, PR'd to `main`. |
| **Estimated LOC + budget** | ~250–350 LOC of new spec markdown + ~5 LOC supersession note in old spec. Builder budget: **~30K tokens, ~45 min**. |
| **Risk** | **LOW.** Doc-only. The only failure mode is "spec author reads macro-test.aihu and infers a different shape than the user intended" — the §1.2 spec-author note (I.2) on collection-keyed-vs-per-line is the single thing most likely to drift; AC #5 above pins the canonical shape. |

### §2.2 — B6.2: Codemod builder

| Field | Value |
|---|---|
| **Task ID** | `B6.2` |
| **Goal** | Implement the ~150-LOC TS codemod that transforms existing `.aihu` files from old-spec/parser-strict syntax to v2 collection-form syntax per Architect §4.4 sketch. Unit-tested against the 4 dryrun-audited files as golden fixtures. **Does NOT yet run against the full corpus** — that's B6.4. |
| **In-scope** | New package or directory: `packages/compiler/codemods/macro-simplification/` (sibling to `packages/compiler/src/`; codemod is JS/TS, parser is Rust — keep separate). Files: `index.ts` (main `migrate(source: string): { rewritten, warnings }` per Architect §4.4.2), `__tests__/migrate.test.ts` (4 golden fixtures with BEFORE/AFTER), `package.json` (private workspace package, no publish), `tsconfig.json`. **Test fixtures ARE the 4 dryrun files** — paste the BEFORE blocks from `codemod-dryrun.md` §1.1.2/§1.2.2/§1.3.2/§1.4.2 as input, and the AFTER blocks (§1.1.3/§1.2.3/§1.3.3/§1.4.3) as expected output, **with the macro-test.aihu collection-keyed shape applied** (see I.2 above — the dryrun's per-line `$computed visible { value: ... }` form is superseded; the canonical form is `$computed: { visible: { value: ... }, ... }`). |
| **Out-of-scope** | Running against the full corpus (B6.4). Touching parser source (B6.3). Touching examples or bench fixtures (B6.4). Building a CLI wrapper for the codemod (deferred to v0.2.1 follow-up). Pretty-printer integration beyond what's needed to pass the 4 fixtures. |
| **Acceptance criteria** | (1) `cd packages/compiler/codemods/macro-simplification && bun install && bun test` returns exit 0. (2) `cd packages/compiler/codemods/macro-simplification && wc -l < src/migrate.ts` ≤ 200 (Architect estimated 150; 50-line buffer). (3) `bun test packages/compiler/codemods/macro-simplification/__tests__/migrate.test.ts` shows 4 passing tests, one per audited file (`hacker-news/item/[id].aihu`, `todo-mvc.aihu`, `blog-router/posts/[slug].aihu`, `hacker-news/index.aihu`). (4) Each test asserts byte-equality (or normalized whitespace equality if pretty-print uniformity is tricky — note in test that strict byte-equality is the v0.2.x goal, normalized is acceptable for v0.2.0). (5) Bidirectional check baked into tests: each test verifies (a) every name in BEFORE appears in AFTER (`forward`), (b) AFTER introduces no name, key, or describe-text not in BEFORE (`reverse`, no synthesis). (6) **No anonymous `$effect` is renamed.** Specifically: `todo-mvc.aihu`'s anon `$effect(() => { persist localStorage })` passes through unchanged — the test asserts `$effect persist` does NOT appear in AFTER. (7) Codemod emits warnings (returned from `migrate()`) for any sidecar `@agent` reference whose name doesn't appear in `@state` — but does NOT fail. (8) Unit-test coverage: `bun test --coverage` reports ≥80% line coverage on `src/migrate.ts`. |
| **Dependencies** | **B6.1.** B6.2 reads B6.1's spec to know the canonical AFTER shape (collection-keyed). Builder must read `docs/superpowers/specs/2026-05-05-spec-macro-vocabulary-v2.md` before writing the AFTER fixtures. |
| **Branch** | `feat/macro-simp-b6.2` (off `main`, paired with B6.3 on different branch — both run parallel; both PR'd independently). |
| **Estimated LOC + budget** | ~150–200 LOC source + ~250–350 LOC tests. Builder budget: **~70K tokens, ~90 min**. |
| **Risk** | **MEDIUM.** Codemod logic is mechanical per Architect §4.4 sketch, but the 7 MECHANICAL paper-cuts the dryrun catalogued (line-width math, comment attachment, multi-line type literal flattening, TS-widening-aware type-drop) all live here. Mitigation: explicitly cite codemod-dryrun §2 paper-cut table in the brief; tell Builder to handle the 7 MECHANICAL items in code and add comment-tests for each (test asserts the codemod handles `// foo` → next-decl attachment, etc.). The 10 JUDGMENT items default-pick is locked by the 4 fixtures — Builder cannot drift. |

### §2.3 — B6.3: Parser builder (with grandfathering decision PINNED)

| Field | Value |
|---|---|
| **Task ID** | `B6.3` |
| **Goal** | Modify Rust parser to accept the new collection-form. Net shrink ~80 LOC per Architect §4.5 (state_macros.rs +20 LOC range, agent_macros.rs −80 LOC, types.rs −20 LOC). |
| **In-scope** | `packages/compiler/src/parser/state_macros.rs` (collection-form arm + helper `parse_object_collection` per §4.5.1), `packages/compiler/src/parser/agent_macros.rs` (remove `expose`/`expose.write`/`describe` arms; keep `scope` + `rate-limit`), `packages/compiler/src/types.rs` (`StateMacro::Collection` variant + `CollectionKind` enum; remove `AgentMacroDecl::Expose` + `AgentMacroDecl::Describe`), `packages/compiler/src/codegen/` (lowering for the new collection form — the JS-emit half of §4.5.1's "+50 LOC for the collection emit"). Parser tests: keep + extend `state_macros.rs` tests; in `agent_macros.rs` keep `parse_scope`/`parse_rate_limit`/`parse_rate_limit_invalid` tests and **delete** the 5 tests for the removed forms. New tests for collection-form parsing + emit (~10 new tests covering `$prop`/`$computed`/`$action`/`$resource` collection parsing + emit per Architect §4.5.5). |
| **Out-of-scope** | Touching `style_macros.rs` (Architect §4.5.3 confirms 0 LOC delta). Touching `bench/compiler-conformance/` fixtures (B6.4 owns those). Touching examples (B6.4). Touching the codemod (B6.2). Touching `@aihu/agent` runtime API (AC-6 forbids; per Q.B-2 (a) the `registerAgentMetadata` payload shape may reshape but the function signature is untouched). Touching `state_macros.rs` `$watch`/`$beforeNavigate`/`$afterNavigate` arms (out of redesign scope). |
| **Grandfathering decision (LOCKED, NOT a Builder choice)** | **HARD-CUT.** The new parser accepts ONLY the v2 collection-form. The old spec form (`$prop name: Type`, `$computed name = expr`, `$action name(args) { body }` per-line) is **rejected with a compile error pointing at the codemod** (error code suggestion: `C440 — old-spec macro form rejected; run packages/compiler/codemods/macro-simplification/migrate.ts to upgrade`). **Reasoning:** (a) Architect §4.8 chose Pattern-E path (a) — supersede both spec and examples; the parser jumps straight from current strict-form to collection-form. (b) Maintaining a v1-grammar fallback in the parser doubles the per-keyword arm count and erases the −80 LOC shrink Architect §4.5 estimated. (c) The grandfather period is **B6.4 itself** — the migration runs the codemod against every `.aihu` in the repo before the parser change merges; there is no fleet of files in the wild to be backward-compat for since aihu is pre-v1.0 and shipping at 0.2.x. (d) cli-templates v0.2.0 just shipped 3 `.aihu` files in `packages/templates/cf-team/template/` using old syntax; B6.4 migrates these as part of its corpus sweep — the codemod handles them. **No grandfather warning period needed.** |
| **Acceptance criteria** | (1) `cargo check -p aihu-compiler` returns exit 0. (2) `cargo test -p aihu-compiler` returns exit 0. (3) `wc -l packages/compiler/src/parser/state_macros.rs` shows a value within 711–831 (771 ± 60 — Architect's ±40 LOC range). (4) `wc -l packages/compiler/src/parser/agent_macros.rs` ≤ 132 (192 − 60 minimum shrink, accounting for the 80-LOC delete). (5) `wc -l packages/compiler/src/types.rs` ≤ 211 (no growth). (6) Net: `(state + agent + types) <= (771 + 192 + 211) - 40 = 1134 LOC` (Architect's net −80 estimate; allow 40 LOC buffer). (7) **C440 error fires on old-spec form:** add a test that runs the parser against `$prop label: String\n$computed upper = label.toUpperCase()` (the literal content of `bench/compiler-conformance/macros/01-state-prop-computed.aihu` BEFORE migration) and asserts the parser returns `Err(CompileError { code: Some("C440"), .. })`. (8) **Collection-form parses correctly:** add a test that runs the parser against the `@state` block of `examples/_shared/macro-test.aihu` (lines 28–100) and asserts every name in `hue, saturation, lightness, primary, onPrimary, surface, setPreset, setHue, setSaturation, setLightness` lowers to a corresponding runtime call. (9) **`@agent` block with only `$scope`/`$rate-limit` parses:** add a test for `examples/_shared/macro-test.aihu` lines 130–136 — asserts both macros parse and emit byte-identical lowering to today's. |
| **Dependencies** | **B6.1.** B6.3 reads B6.1's spec to confirm the v2 collection-form grammar. |
| **Branch** | `feat/macro-simp-b6.3` (off `main`, parallel to B6.2). |
| **Estimated LOC + budget** | Net −80 LOC source per Architect (range ±60); ~150–200 LOC test additions/changes. Builder budget: **~80K tokens, ~110 min**. |
| **Risk** | **MEDIUM.** Parser surgery is the highest-skill task in this round. Mitigation: cite Architect §4.5.1–§4.5.5 verbatim in brief (function-by-function delta table is the implementation guide); explicit hard-cut grandfathering decision pinned above; require the C440 test as an AC. Fallback if Builder discovers the +20 LOC range is wrong: surface to Director (this task is the most likely to ping-pong). |

### §2.4 — B6.4: Migration builder

| Field | Value |
|---|---|
| **Task ID** | `B6.4` |
| **Goal** | Run the B6.2 codemod against every `.aihu` file in `bench/compiler-conformance/` and `examples/**` and `packages/templates/**`. Verify CI green: B6.3 parser accepts every migrated file; conformance goldens regenerate; example tests pass. **This task resolves Pattern-E** (the spec/parser/examples three-way drift Scout discovered) by making all three corpora converge on the v2 collection-form. |
| **In-scope** | Run codemod against: (a) `bench/compiler-conformance/macros/01-state-prop-computed.aihu`, `02-state-resource-effect.aihu`, `03-state-lifecycle.aihu` (3 fixtures rewritten per Architect §4.7); (b) `bench/compiler-conformance/blocks/agent-basic.aihu` (1 fixture rewritten per §4.8); (c) all 21 `.aihu` files under `examples/`; (d) all 3 `.aihu` files under `packages/templates/cf-team/template/`. **Total: ~28 files migrated.** Plus: regenerate the corresponding `.golden.js` files for the 4 conformance fixtures (run `cargo test -p aihu-compiler --test sfc_conformance -- --update-goldens` or the local equivalent — Builder reads the harness). Plus: update `legacy-snapshot.golden/` files in `packages/cli/tests/` for any shipped template files that the codemod transforms (cli-templates v0.2.0 byte-frozen the 6-file golden tree per cli-templates earned-learning `byte-frozen-legacy-snapshot-pattern`; if `expose.aihu` or `live-counter.aihu` are in that golden, the snapshot updates as a reviewable diff per the same earned-learning's discipline). |
| **Out-of-scope** | Editing the codemod itself (B6.2). Editing the parser (B6.3). Adding new examples or new bench fixtures. Editing `@template` / `@style` blocks in any file. Modifying `runtime/` or `agent/` package code. |
| **Acceptance criteria** | (1) Discover the corpus: `find examples bench/compiler-conformance packages/templates -name "*.aihu" -type f \| sort > /tmp/aihu-corpus.txt && wc -l /tmp/aihu-corpus.txt` ≥ 26. (2) Apply codemod to every file in the corpus list. (3) `cargo check -p aihu-compiler` returns exit 0. (4) `cargo test --workspace` returns exit 0 (full Rust suite green; conformance goldens regenerated and committed). (5) `bun run typecheck && bun run test` in repo root returns exit 0 (TS suite green). (6) `bun run check:ci` ideally green (may have unrelated pre-existing fails per cli-templates anti-pattern `verify-before-claim` — see §3.3 below). (7) `grep -lEr '\$expose [a-zA-Z]+,' examples bench packages/templates --include="*.aihu" \| wc -l = 0` (no comma-list `$expose` anywhere). (8) `grep -lEr '\$describe ' examples bench packages/templates --include="*.aihu" \| wc -l = 0` (no `$describe` anywhere). (9) For at least 4 named-sample files (`color-theme.aihu`, `examples/hacker-news/src/pages/item/[id].aihu`, `todo-mvc.aihu`, `examples/blog-router/src/pages/posts/[slug].aihu`), the migrated file's `@agent` block is ≤ 5 lines OR omitted (AC-3 from director-note-001 §3). (10) **No file was hand-edited beyond what the codemod produced** — every `.aihu` change in the diff is explicable as "codemod emit" (Builder commits a manifest of the codemod-input/output pairs at this stage). |
| **Dependencies** | **B6.2 AND B6.3.** Hard fence — B6.4 cannot start until both B6.2 (codemod implemented + tested) and B6.3 (parser accepts new form) are merged to `main`. |
| **Branch** | `feat/macro-simp-b6.4` (off `main` after B6.2 + B6.3 merge). |
| **Estimated LOC + budget** | ~28 `.aihu` files migrated (each gets a non-trivial diff but pure codemod-output, not hand-written) + 4 `.golden.js` regen + possibly 2–3 `legacy-snapshot.golden/` updates in cli-templates. Effective Builder LOC: **0** (no hand-coding); time-cost is in running the codemod and reconciling CI. Builder budget: **~50K tokens, ~70 min** (mostly diagnostics and CI-fix iteration). |
| **Risk** | **HIGH.** This is the round's biggest risk — if the codemod or parser fails on a corpus file outside the 4 audited samples, Builder may need to ping-pong back to B6.2 or B6.3. Mitigation: (a) the 4 audit samples covered every macro form in spec §1.1 inventory except `$shared`/`$cookie`/`$server`/`$meta`/`$watch` (per dryrun §4 "expanding the audit before resolving PC-1.2.B is wasted motion"); the unaudited files are mostly variants of the same shapes. (b) cli-templates earned-learning `byte-frozen-legacy-snapshot-pattern` (cite verbatim in brief): the legacy-snapshot golden tree pattern means cf-team template surface drift surfaces immediately as CI failure. (c) **Surface immediately if the codemod fails on any single file outside the 4 audited samples — this is a spec gap, not a codemod bug, and B6.1's spec must be revised.** (d) Per universal anti-drift, B6.4 must NOT hand-edit `.aihu` files — every transformation is codemod-driven. If the codemod gets it wrong, the fix is upstream in B6.2, not local. |

### §2.5 — B6.5: Verifier sweep

| Field | Value |
|---|---|
| **Task ID** | `B6.5` |
| **Goal** | Sample-based audit over the migrated corpus + bidirectional check (every name preserved + no synthesis). Bake in named-sample tests per universal principle #3 — each scoped to a real corpus file. |
| **In-scope** | New file `.team/macro-simplification/verifier-report-b6.5.md` documenting the sweep. **Sample-named tests** in `packages/compiler/codemods/macro-simplification/__tests__/` (or a dedicated `corpus-sample.test.ts`): per universal principle #3, name each test after the file under audit so failures point at the broken sample. Required samples: (a) `examples/color-theme/color-theme.aihu` (worst-offender per Director-1 §1, Scout §6), (b) `examples/hacker-news/src/pages/item/[id].aihu` (audit sample 1), (c) `examples/todo-mvc/todo-mvc.aihu` (audit sample 2 + heavyweight `@agent`), (d) `examples/blog-router/src/pages/posts/[slug].aihu` (audit sample 3, simple). Each test asserts: (i) AC-1 — every named identifier appears once in the migrated `@state`/`@agent`; (ii) AC-3 — `@agent` block ≤ 5 lines; (iii) bidirectional preservation — every name in BEFORE present in AFTER; (iv) bidirectional no-synthesis — no name/key/describe in AFTER not present in BEFORE; (v) AC-6 strict bar — `defineExpose`/`effect`/`computed`/`lifecycle` lowering byte-identical to today's compiler output (compute today's output by running B6.3-pre's parser on a stash-saved BEFORE; compare). |
| **Out-of-scope** | Editing source files. Editing the codemod or parser (those are upstream). Re-running B6.4's codemod sweep (already done). Adding new ACs. |
| **Acceptance criteria** | (1) `bun test packages/compiler/codemods/macro-simplification/__tests__/corpus-sample.test.ts` returns exit 0 with 4 named tests passing. (2) `.team/macro-simplification/verifier-report-b6.5.md` exists and contains a per-sample table with AC-1/AC-3/AC-6 + bidirectional findings. (3) Verifier report explicitly cites: total corpus size migrated by B6.4, sample size audited by B6.5, any per-sample anomalies, and a STATUS line (PASS / PARTIAL / BLOCKED). (4) **Verifier-style discipline (cite earned-learning `verify-before-claim-anti-pattern`):** any test failure in the report must include "verified against `main` pre-B6.4 — failure originates from this changeset" or "verified against `main` pre-B6.4 — pre-existing." Verifier MUST run that check before labeling. (5) Report ≤ 600 lines. (6) **Sample-level failures NOT hidden by aggregate** — the per-sample table must show each sample's PASS/FAIL independently (cite `cli-templates anti-pattern check` line "Sample-level failures hidden by aggregate? No"). |
| **Dependencies** | **B6.4.** B6.5 audits B6.4's output. |
| **Branch** | `feat/macro-simp-b6.5` (off `main` after B6.4 merges). |
| **Estimated LOC + budget** | ~250 LOC tests + ~400 LOC verifier report. Builder/Verifier budget: **~50K tokens, ~70 min**. |
| **Risk** | **LOW-MEDIUM.** Discovery risk: if the sample audit surfaces an anomaly the 4-file dryrun missed, Verifier's PARTIAL/BLOCKED verdict may force B6.4 (or B6.2) re-dispatch. Mitigation: the 4 chosen samples all map to dryrun-audit files (`color-theme` was the round-001 user-cited worst case but was NOT in the dryrun's 4 — the others all were); B6.5 effectively re-runs the dryrun's bidirectional check on the now-real codemod output. Most likely outcome: confirms the 4 audit findings + flags 0–1 minor JUDGMENT items. |

### §2.6 — Total round-006 effort estimate

| Task | Builder LOC (rough) | Tokens | Risk |
|---|---:|---:|---|
| B6.1 (spec) | ~250–350 LOC markdown | 30K | LOW |
| B6.2 (codemod) | ~150 src + ~250 tests = ~400 LOC | 70K | MEDIUM |
| B6.3 (parser) | net −80 LOC src + ~150 tests = ~70 LOC delta + ~150 LOC tests | 80K | MEDIUM |
| B6.4 (migration) | ~0 hand-coded LOC; 28 codemod-driven file migrations + 4–7 goldens regen | 50K | HIGH |
| B6.5 (verifier sweep) | ~250 tests + ~400 report | 50K | LOW-MEDIUM |
| **Total round** | **~1,200 LOC of human-authored code/tests/markdown across 5 PRs** | **~280K tokens** | — |

This is well-bounded. Per cli-templates earned-learning `scope-too-big-stall-r-002-re-cut-playbook` (heuristic ceiling ≤ 15 files / ≤ 500 LOC per Builder dispatch), every task is within the safe ceiling. **No task is at risk of the silent-stall failure mode** that hit cli-templates B1.

---

## §3 — Iteration discipline

**Round counter:** **1 of 5 max** for the build round. After this round closes, follow-on
work (e.g., "delete the old spec for real" once v0.3 lands, or v0.2.1
codemod packaging / pretty-printer integration) goes to a fresh topic.

### §3.1 — Stall detection

Per cli-templates earned-learning `scope-too-big-stall-r-002-re-cut-playbook`,
the silent-stall signature is: Builder creates worktree, makes zero
commits, terminates without report. **Team Lead must detect this for any
B6.X dispatch where:**

- Builder commits zero artifacts within **45 minutes** of dispatch (B6.1 / B6.4 / B6.5 estimated budgets are 45–70 min, so 45 min is the high-confidence stall signal); within **60 minutes** for B6.2 / B6.3 (longer estimated budgets).
- Worktree is clean post-dispatch (no `.git/index` changes).

**On stall detection:** Team Lead first checks Builder logs for
"surface-to-user" messages (some surface conditions in §4 below should make
the Builder ping back, not stall silently). If logs show no surface, the
re-cut playbook applies: split the failing task into sub-seams. For B6.2
that's `(a) Phase 1 sidecar build only`, `(b) Phase 2 state walk`, `(c)
Phase 3 emit + assemble`. For B6.3 that's `(a) types.rs delta`, `(b)
state_macros.rs collection-form arm`, `(c) agent_macros.rs deletion`.

### §3.2 — Most likely ping-pong points

In rough probability order:

1. **B6.4 → B6.2 ping** — codemod fails on a corpus file outside the 4 audited samples (HIGH risk per §2.4). Fix is in B6.2; Builder must surface, not patch silently.
2. **B6.3 ↔ B6.2 ping** — parser accepts something codemod doesn't emit, or emit form doesn't match parser's expectation. Mitigation: B6.1's spec is the contract; both Builders must conform to it. Detection: B6.4's CI failures will surface the mismatch immediately.
3. **B6.5 → B6.4 ping** — verifier finds a sample anomaly (LOW-MEDIUM risk per §2.5). Probability: low because the 4 dryrun samples already exercised the gnarly cases.
4. **B6.1 → user surface** — spec author finds an unaddressed corner the user resolutions don't cover (LOW risk per §1.3 — I.1/I.2/I.3 are flagged here so spec author can't drift unknowingly).

**5-iteration ping-pong rule:** if B6.X ↔ B6.Y bounces 5 times without
convergence, stop and surface to user.

### §3.3 — Verify-before-claim discipline

Cite the cli-templates earned-learning `verify-before-claim-anti-pattern` in
every dispatch. Specifically: any "pre-existing local-env issue" label
during B6.3, B6.4, or B6.5 requires Builder/Verifier to first stash
in-flight changes, re-run the failing command on `main`, and document
exact reproduction. **`bun run check:ci` is known to have unrelated
pre-existing failures** on this dev host (per dispatch's note about
plan/macro-simplification push failures); when it fails during B6.X,
Builder MUST verify-before-claim before attributing.

### §3.4 — Iteration cadence to expected exit

- Round 006a: B6.1 dispatch + close. **1 dispatch.**
- Round 006b: B6.2 + B6.3 dispatch in parallel + close. **2 parallel dispatches.**
- Round 006c: B6.4 dispatch + close. **1 dispatch.**
- Round 006d: B6.5 dispatch + close. **1 dispatch.**
- Round 006e: Synthesizer + Historian + tag (per §6 below). **2 dispatches.**

**Net Mode-2 BUILD ping-pong rounds for this topic:** 5 sub-rounds (006a..e) ≈
matching the 5-budget hard stop. Discipline required; no slack for reopens
beyond the §3.2 detection points.

---

## §4 — Surface conditions for THIS round

Cite verbatim into Team Lead's dispatch log:

| Condition | Action |
|---|---|
| **B6.1 spec-author finds an unaddressed corner case the user resolutions don't cover** | **Surface to user.** I.1/I.2/I.3 in §1 above pinned the three known corners; if a fourth surfaces, Director (me) doesn't have authority to resolve substance. |
| **B6.2 codemod fails on a corpus file outside the 4 dryrun samples** | **Surface to user (spec gap, not codemod bug).** Per §2.4 risk note. |
| **B6.3 parser change breaks the bench-conformance suite in an unexpected way** | **Surface to user.** "Unexpected" = not the explicit fixture rewrites in `bench/compiler-conformance/macros/01..03.aihu` and `blocks/agent-basic.aihu` per Architect §4.7. Those are anticipated; B6.4 owns them. Anything else surfaces. |
| **B6.4 migration finds a `.aihu` file that genuinely cannot be expressed under v2 collection-form** | **Surface to user.** This would invalidate Architect §4.7 "all 31 LOW/N-A macros stay untouched"; it's a spec gap that needs user-level reconciliation (potentially a new Q.B-3). |
| **5-iteration ping-pong fires on any Builder ↔ Verifier loop** | **Surface to user.** Per §3.2 hard rule. |
| **Any task takes 2× its estimated budget** (B6.1 > 90 min · B6.2 > 180 min · B6.3 > 220 min · B6.4 > 140 min · B6.5 > 140 min) | **Surface to user.** Budget breach is the leading indicator that the task underestimated complexity. |
| **B6.3's grandfather decision needs reopening** (e.g., a downstream dep broke that we didn't foresee) | **Surface to user.** §2.3 pinned hard-cut; re-opening that is Director-substance, not Builder-discretion. |
| **AC-6's revised wording fails on a real `@state`-side lowering** (i.e., a non-byte-identical lowering surfaces somewhere we didn't anticipate) | **Surface to user.** The "byte-identical for `@state`-side" half of Q.B-2 (a) is the strict bar; if it fails, the user must decide whether to soften further or kill the migration. |

**No surface conditions met right now.** Round 006 opens clean.

---

## §5 — Branch convention + cross-repo continuity

### §5.1 — Branches stay in `aihu` only

Re-affirmed: macro-simplification touches **`aihu` only**. **No `api` /
`magna` / `mail` work in this round.** The `apps/api` and `crates/`
references in the dispatch's repo-level CLAUDE.md are for the Rust API
project at `c:\git\fellwork\api`, not this repo. Confirm by:

- `apps/` directory in this repo is not touched (B6.1–B6.5 in-scope lists);
- Architect §4.5.3 confirms 0 LOC delta to `style_macros.rs`;
- AC-6 forbids `@aihu/agent`/`@aihu/server`/`@aihu/runtime` API changes.

### §5.2 — Branch convention per task

`feat/macro-simp-b6.X` per task per universal principle #8. The
`plan/macro-simplification` branch keeps the design docs (this director-note,
prior 001 + 002, scout/architect/synthesizer/dryrun reports, option-4
evaluation, canonical macro-test.aihu). **Build commits land on `feat/`
branches and merge via PR to `main`.** Match cli-templates B1.X PR
convention: PR-create (not direct push) for each B6.X.

### §5.3 — Branch durability operational note

The dispatch flagged that `plan/macro-simplification` got force-reset to
`origin/main` twice during rounds 005–005.5. I confirmed this on read:
the branch wasn't on the local repo when I started this dispatch
(`git branch --show-current` returned `main`). Recovery via the local tag
`macro-simp-r005-recovery` worked — I checked out the tag's commit
(`0066b85`) and overlaid `3b73b10` (the BLOCKER resolutions commit) onto a
fresh `plan/macro-simplification` branch in this session.

**Operational guidance for Team Lead, round 006:**

- Each B6.X commit goes to `feat/macro-simp-b6.X` via **PR-create flow**, not local-only branch. The `plan/*` push hook (`bun check:ci`) fails on unrelated checks per the dispatch's note; `feat/*` push has different hook gates and works for the cli-templates B1.X workflow per recent merge history (PRs #80, #83, #84, #86, #87 all closed clean via `feat/cli-templates-b1.X` branches → PR → merge).
- The local recovery tag `macro-simp-r005-recovery` should remain in place for the duration of this round in case `plan/macro-simplification` gets stomped again.
- AGENTS.db delta layer is the durable substance store. The substance of this director-note (and B6.1's spec) should be written to AGENTS.db by Team Lead at end of round per `kind: director_note` / `kind: research-report` conventions.

### §5.4 — Continuity check (refresh)

`cli-templates v0.2.0` shipped (PR #87 merged, `86c44d0`). Three cf-team
template `.aihu` files use old `@expose` block + `$describe` syntax:

```
packages/templates/cf-team/template/apps/web/src/agent/expose.aihu
packages/templates/cf-team/template/apps/web/src/components/live-counter.aihu
packages/templates/cf-team/template/apps/web/src/app.aihu
```

(grep confirmed: `expose.aihu` line 19 has `@agent { ... }`, `live-counter.aihu`
line 32 has `@agent { ... }`.) **B6.4's corpus list MUST include these
3 files.** When B6.4 migrates them, the v0.2.0 `legacy-snapshot.golden/`
buffer-equality test in `packages/cli/tests/legacy-snapshot.test.ts` may
fail (depending on whether those template files appear in the 6-file golden
tree). Per cli-templates earned-learning `byte-frozen-legacy-snapshot-pattern`,
the golden tree update is a reviewable diff — Builder commits the golden
update with a one-line changeset entry naming the BC implication.

**This is the only cross-track continuity item.** No conflict with
plan-a (TS runtime) — AC-6 protects the runtime API. No conflict with
agent-readiness (206/206 tests; AC-6 protects `AgentMetadata`). No conflict
with arch-5 SFC primitives (deferred §3 implementation will use the new
v2 grammar by default after round 006). No conflict with arch-4 LSP
(deferred `@agent` LSP work simplifies under round-006 `@agent` shrinkage).

---

## §6 — Synthesizer + Historian routing

**Synthesizer fires at end of round 006**, after B6.5 PASS — not mid-round.
Reasoning:

- B6.5 is the PASS-or-FAIL gate that determines whether the round produced
  a substance-complete artifact.
- Synthesizer's role is consolidation across the round's deliverables; the
  deliverables aren't all in until B6.5 closes.
- A mid-round Synthesizer dispatch (e.g., after B6.4 migration to consolidate
  corpus-evidence) is not warranted because B6.4 produces structural
  changes that B6.5 then validates — synthesizing before validation risks
  ratifying broken substance.

**Synthesizer scope (round 006 close):**

- Output: **`topic-summary.md` v2** (not a new file; an update to the
  existing `topic-summary.md` to reflect post-build state — round-by-round
  table extended to row 006, §4 baseline becomes "v2 collection-form
  shipped", §8 Pattern-E section moves to "RESOLVED — all three corpora
  converged on collection-form per round 006", new §10 "Round 006 build
  closure summary").
- Length budget: +100 lines beyond current 277 (target ~380).
- Brief author: Team Lead, citing this director-note §6 verbatim.

**Historian fires after Synthesizer** (parallel to the v0.2.x Synthesizer pattern from cli-templates):

- Output: `.team/retros/macro-simp-v2-retro.md` (~300–500 lines).
- Promotes earned learnings to AGENTS.db user layer: any pattern from this
  round worth carrying forward (the most likely candidates: "object-literal
  collection-form parser-shrink technique" — Architect's mechanism of leveraging
  the JS object-literal parser to cut Rust parser code; "bidirectional codemod
  audit discipline" — the dryrun's name-by-name forward + reverse table; the
  hard-cut grandfather pattern, if it works cleanly).
- Sets up follow-on docket: any v0.2.1 items (e.g., codemod CLI wrapper,
  pretty-printer integration, deletion of old spec, Pattern-E LSP tooling
  improvements per Director-2 §7 arch-4 follow-up).

**Tag push after Historian:** Team Lead pushes `macro-simp-v2-shipped` tag
on `main` HEAD-after-B6.5-merge. Optional but recommended for future
historical lookup symmetry with `cli-templates-v0.2.0` tag.

---

## §7 — Continuity check (refresh, full)

| Track | State as of round 006 dispatch | Conflict in this round? |
|---|---|---|
| `plan-a` (TS runtime family) | v0 feature-complete; ongoing N+2 (browser-bench, signals deep-prop) | **No conflict.** AC-6 (revised) protects runtime calls on the strict bar. |
| `agent-readiness` | All 4 phases COMPLETE, 206/206 tests | **No conflict.** AC-6 (revised) permits `@agent` payload reshape but not `AgentMetadata` field-set change; round 006 obeys. |
| `cli-templates` | **v0.2.0 SHIPPED 2026-05-05** (PR #87 merged). 3 `.aihu` files in `packages/templates/cf-team/template/` use old syntax. | **B6.4 migrates these.** §5.4 above. legacy-snapshot.golden update is anticipated and explicitly in B6.4's scope. |
| `arch-5 SFC primitives` | §3 (25 new primitives) NOT yet implemented | **Net positive.** New primitives will use v2 collection-form by default after round 006. |
| `arch-4 DX tooling / language server` | `@agent` LSP deferred to M3 | **Net positive.** Round 006 shrinks `@agent` to `$scope`/`$rate-limit` only, simplifying deferred LSP. |
| **NEW for round 006:** `apps/api` not in this repo | API binary lives at `c:\git\fellwork\api` per recent rename | **No conflict.** This round touches `aihu` only. |

No surface conditions from continuity.

---

## §8 — Anti-drift guardrails (build-round refresh, lifted from §6 architect-design-options.md + §6 director-note-001 + §9 director-note-002)

**Lifted verbatim from prior anti-drift, plus the 4 new round-006
build-specific items at the end:**

1. Do NOT propose redesign syntax in research / synthesis rounds. (CLOSED — round 004 done.)
2. Do NOT redesign the four-block grammar. (`@template` / `@state` / `@style` / `@agent` are closed by `spec-block-structure.md:19`. The narrow exception — dissolving `@agent`-as-block — was rejected by Q-AGENT (kept-as-shrunk) per macro-test.aihu lines 130–136.)
3. Do NOT touch `packages/compiler/src/` outside the explicit B6.3 scope. B6.1/B6.2/B6.4/B6.5 do not touch `packages/compiler/src/`.
4. Do NOT propose breaking the public package API. AC-6 (revised per Q.B-2 (a)) holds: byte-identical for `@state`-side; semantically equivalent for `@agent` payload only.
5. Do NOT propose new `@aihu/*` packages. (`packages/compiler/codemods/macro-simplification/` is a workspace-internal directory, not a published package.)
6. Do NOT propose changing `aihu.config.ts` shape. (Out of scope; round 006 doesn't touch config.)
7. (Skipped — research-only guardrail; round 006 is build.)
8. Do NOT make the macro vocabulary spec the single deliverable. (Round 006 has 5 deliverables; spec is one of them, alongside codemod + parser + migration + verify.)
9. Do NOT propose decorator-class syntax. (Closed in round 004; not re-litigated.)
10. Do NOT introduce a 4th redesign option. (Closed in round 005; user picked Option 4.)
11. Do NOT defer Pattern-E reconciliation. (B6.4 IS the reconciliation moment.)

**Round 006 build-specific additions (NEW):**

12. **Do NOT relax AC-6's revised wording during build.** The "byte-identical for `@state`-side" half is the strict bar; if a Builder finds it failing on a real lowering, surface (not soften silently).
13. **Do NOT reopen the hard-cut grandfather decision** (§2.3). If a downstream dep complains, surface to Director (and through Director to user). Builder cannot unilaterally add a backward-compat fallback parser arm.
14. **Do NOT touch `@template` / `@style` / `@route` block macros** in any B6.X task. The 31 LOW/N-A macros from Director-1 §2 are out of scope; Architect §4.7 named them as Untouched.
15. **Do NOT introduce a 5th block.** Confirmed via macro-test.aihu still showing 4 blocks (`@state` lines 28–100, `@template` lines 102–117, `@style` lines 119–128, `@agent` lines 130–136). Spec-block-structure.md:19 holds.
16. **Do NOT extend the AC-6 revised wording's `@agent` payload reshape latitude to include synthesis.** Per Q.B-1 (a) + dryrun's reverse-direction principle, no name, key, or describe-text in the AFTER payload that wasn't in the BEFORE source. The reshape is structural, not generative.
17. **Per cli-templates anti-pattern `verify-before-claim-anti-pattern`**: any "pre-existing local-env issue" claim by a Builder/Verifier must include `git stash` + `main` re-run reproduction.
18. **Per cli-templates anti-pattern `scope-too-big-stall-r-002-re-cut-playbook`**: silent stall = re-cut, not retry. Team Lead detection signals are in §3.1 above.

---

## §9 — Section summary (for STATUS)

1. **Q.B-1 + Q.B-2 integration:** CLEAN. Carve-out unification rule is statable in one sentence (§1.1). AC-6 reworded text in §1.2. Three spec-author notes (I.1/I.2/I.3) flagged for B6.1; none rise to BLOCKER.
2. **Build sequence:** 5 tasks, 4 critical-path stages, dep graph `B6.1 → (B6.2 ∥ B6.3) → B6.4 → B6.5`. B6.2 + B6.3 run parallel.
3. **Total estimated effort:** ~1,200 LOC of human-authored work + ~28 codemod-driven file migrations across 5 PRs; ~280K Builder tokens.
4. **Branch durability:** `feat/macro-simp-b6.X` per task, PR-create flow (not direct push). `macro-simp-r005-recovery` tag stays in place for the round.
5. **Continuity:** cf-team v0.2.0 shipped with 3 old-syntax `.aihu` files; B6.4 migrates them and updates the legacy-snapshot golden tree as a reviewable diff.
6. **Synthesizer:** fires at end of round 006 after B6.5 PASS. Output is `topic-summary.md` v2.
7. **Historian:** fires after Synthesizer. Output is `.team/retros/macro-simp-v2-retro.md`.
8. **Surface-to-user conditions:** none met right now. Round 006 opens clean. 7 conditions enumerated in §4 for Team Lead's dispatch log.
9. **Anti-drift:** 18 guardrails (11 lifted + 7 net-new for the build round).
10. **Iteration discipline:** 5 sub-rounds projected (006a..e); 5 of 5 budget; no slack. Stall-detection thresholds + cli-templates anti-pattern citations baked into every dispatch.

---

*Substance only. AGENTS.db write of this director-note (kind: director_note,
topic: macro-simplification, round: 6), branch creation, B6.X dispatch in
sequence, PR mechanics, push-flow choice, recovery-tag maintenance all
belong to the Team Lead.*
