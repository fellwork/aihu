# Director Note — topic:aihu-template-syntax track:userland-dx — Round 6 (V1 PASS Routing + Q1-Q4 Adjudication)

**Mode:** 2 (build/refactor — first post-Builder governance round)
**Iteration counter:** 1 of 5 (Builder ↔ Verifier round 1 closed clean in one pass; banking budget for B2-B5)
**Date:** 2026-05-06
**Author:** Director
**Tags:** `topic:aihu-template-syntax track:userland-dx round:6 v1-pass-routing`

**STATUS:** R6 ROUTED — V1 PASS confirmed (11/11 ACs); merge `feat/template-syntax-v2-b1` → `feat/template-syntax-v2` via fast-forward; Q1-Q4 adjudicated (lazy-attach for runtime budget; codemod owns body-call migration; reflect-loop guard + collision compile-error fold into B2); B2 brief refined with R2/R3/R4 + Q3 + Q4 (~150-220 LOC est.); Synthesizer routed for topic_summary patch.

---

## §1 — V1 PASS routing decision

### V1 PASS clean — no scope shift, on-thesis

V1 returned **PASS 11/11** on all R1 acceptance items. Builder's manifest is accurate to diff (verified diff scope, file deltas, test counts). Zero over-implementation. All four open questions are honest substance (Q1, Q2, Q4) or appropriately out-of-scope (Q3, deferred to B2/R4 territory per Director r5 §5). The 30 B size-limit headroom is the tightest constraint going into R5/R6/R7 — Q1 below.

**Iteration counter:** **1 of 5.** B1 closed in one Builder ↔ Verifier round. **Banking budget for B2-B5.** No drift. No surface-to-user trigger. On-thesis.

### Merge decision: fast-forward `-b1` → parent now

Per Director r5 §5 branch convention: "PR each into the parent feature branch; final merge of `feat/template-syntax-v2` to main as one Variant-B-as-shipped commit." This applies to the **eventual main merge** — but `-b1` → parent is a sub-branch decision left to r6.

**Decide: merge `feat/template-syntax-v2-b1` → `feat/template-syntax-v2` NOW, fast-forward.**

Rationale:

1. **B2 will conflict with -b1 if dispatched off pre-R1 parent.** R2/R3/R4 touch the same files R1 touched: `state_macros.rs` (parser additions for `$lifecycle.adopt` + `$lifecycle.attributeChange`; new `$show` and `$bind` rules), `emit.rs` (lifecycle dispatcher emit; $show → hidden lowering; $bind write-side verification). Basing -b2 off pre-R1 parent invites mechanical conflicts at the eventual main merge — better to absorb R1 into the parent now and let B2 build cleanly on top.

2. **R1 is durable.** V1 PASS ratified the bug-fix + Lit-style optional keys. The risk of needing to revert R1 in isolation (which is what holding -b1 in a sub-branch buys) is essentially zero — if anything, B2-B5 will reveal incremental fixes to extend, not back out.

3. **Per-phase commits are reviewable individually.** The 4 R1 commits Builder produced (`runtime-fix` / `compiler-emit` / `size-bump` / manifest-implied) are each individually reviewable and bisectable. **Fast-forward preserves them.** A squash would collapse these into a single opaque "R1" commit; the commit history loses the per-phase logical structure Builder intentionally surfaced.

**Mechanic: fast-forward, NOT squash.** Team Lead executes:

```bash
git checkout feat/template-syntax-v2
git merge --ff-only feat/template-syntax-v2-b1
git push origin feat/template-syntax-v2
# (optional: delete -b1 sub-branch local + remote — defer until B2 lands clean)
```

If fast-forward fails (parent advanced unexpectedly), surface to Director — do NOT silently rebase or merge-commit. Per Director r5 §5, each Builder PR-into-parent commit lineage stays linear.

**Eventual main merge** stays per r5 §5: one squash commit `feat: template-syntax-v2 (Variant B + R1-R7)` after B5 lands. That decision is unchanged.

---

## §2 — Adjudicate the 4 open questions

### Q1 — Runtime size budget (LOAD-BEARING for R5/R6/R7)

**Context recap.** B1 added ~620 B gzipped; size-limit bumped 2100 → 2750 B; **30 B headroom remaining.** Combined R5+R6+R7 estimate (per Director r5 §3 + §4): ~210-330 LOC compiler+runtime; of which ~150-250 LOC lands in `@aihu/runtime`. **Estimated additional gzipped runtime size: 1.5-2 KB.** The 30 B headroom is fictional — the 2750 B ceiling cannot accommodate R5/R6/R7 without action.

**Three options Verifier + Auditor A flagged:**

a. **Accept platform-fix cost.** Bump runtime size limit per round. Simplest. Cost: aihu's "tiny runtime" marketing position erodes (~5 KB gzipped after R5/R6/R7).

b. **Lazy-attach.** Only attach $prop / $aria / $controller / $context machinery if the SFC declares those collections. Compiler emits per-SFC import; tree-shaking removes unused. Cost: complexity in import/emit; harder to get right than (a) but preserves the per-SFC size guarantee.

c. **Sub-export the props machinery.** Make `@aihu/runtime/forms`, `@aihu/runtime/aria`, `@aihu/runtime/context`, `@aihu/runtime/controller` independently importable. Tree-shaking via package.json `exports`. Cost: more public surface; need a compatibility story for full-runtime imports.

### Decide: Option (b) — lazy-attach + per-feature size sub-budgets

**Defense:**

1. **Honest marketing position.** Aihu can market: **"5 KB runtime if you use everything; ~2.7 KB for legacy SFCs that don't opt into v2 collections."** This is more honest than (a) ("we got bigger") and more discoverable than (c) (which makes users learn `@aihu/runtime/aria` as a separate import path). Per-SFC size depends on declarations — predictable, dev-tool-inspectable via the `bun run size-rows` already in pre-push.

2. **Tree-shaking already works for unused exports.** What lazy-attach adds is the **conditional emission** of the import + the wiring code at compile time. Compiler already does per-SFC code generation; this is a natural extension. The compiler scans the SFC's `@state` block for collection-form macros; if `$aria` is absent, no `@aihu/runtime/aria` import is emitted; the runtime side stays untouched.

3. **Architectural alignment with R1's choices.** R1 already conditionally emits options-form `defineComponent` only when `$prop` entries exist (per B1 manifest §Decisions:1, "compile-side switches function-form to options-form when $prop entries exist"). Extending that pattern to R5/R6/R7 is natural — each collection's machinery is opt-in by declaration. (b) is a generalization of what B1 already does for $prop.

4. **Preserves option (a) as fallback.** If lazy-attach for a specific collection turns out genuinely unworkable (e.g., R5's `attachInternals()` cache MUST live on the base wrapper class for $form sharing in v0.4), Builder surfaces the mechanic and we adjust the per-feature budget upward — but the default direction is opt-in.

5. **(c) is worse than (b) for userland UX.** Sub-exports require users to learn `@aihu/runtime/aria` as a distinct import. Lazy-attach is invisible — users write `$aria: { ... }` and the compiler does the right thing. (c) is the path of "make users carry the cognitive load"; (b) is "make the compiler carry the cognitive load."

### Per-feature size sub-budgets

| Round | Feature | Compiler+runtime LOC | Size budget (gzipped, lazy-attached) |
|---|---|---|---|
| R5 | $aria + ElementInternals + auto-keyboard + default-tabindex | ~80-120 LOC | **≤ 600 B** |
| R6 | $controller registry + lifecycle dispatcher | ~60-100 LOC | **≤ 400 B** |
| R7 | $context provide/consume + WICG ContextRequestEvent + signal plumbing | ~70-110 LOC | **≤ 600 B** |
| **Sum** | combined R5+R6+R7 if all opted-in | ~210-330 LOC | **≤ 1.6 KB additional** |

**Default-attach baseline (`@aihu/runtime` core)** stays at ~2.75 KB — that's the size for SFCs that use `$prop`/`$computed`/`$action`/`$resource`/`$effect`/`$lifecycle`/`$event` (the v1 collections + R1 options-form $prop) but NOT $aria/$controller/$context. **Headline: legacy SFCs see no size regression from R5-R7.**

### B4 + B5 brief impact

B4 brief MUST include: **"Lazy-attached: $aria machinery is conditionally imported. SFCs without `$aria` collection see no `@aihu/runtime/aria` import in their compiled output. Size budget: $aria-specific machinery ≤ 600 B gzipped (independently size-limited)."**

B5 brief MUST include the equivalent for R6 (≤ 400 B) and R7 (≤ 600 B).

**Verification mechanic:** introduce a `bun run size-by-feature` script (B4 territory) that synthesizes a minimal SFC per feature and measures the delta from the baseline. CI flags regressions per-feature.

### If you reject (b)

Defense for (a) — accept platform-fix cost — would need to argue the marketing position can survive a "5 KB runtime" without erosion. I don't think it can: the "tiny runtime" positioning is one of the three load-bearing wedge claims (per topic_summary's durably-true facts, alongside Web-Components-native + agent-readable). Lazy-attach preserves the wedge.

Defense for (c) — sub-exports — requires a worked-out userland migration story for SFCs that already import the full runtime. Possible but introduces a deprecation path that costs more than (b)'s invisible-to-userland mechanic.

**Stick with (b). B4 + B5 briefs absorb the per-feature budget acceptance criteria.**

---

### Q2 — Body-call-syntax migration (`mockForecasts[location]` → `mockForecasts[location()]`)

**Context recap.** R1 makes props signals; old userland body code that accesses props as bare values (`comment.by`, `mockForecasts[location]`) becomes broken at runtime post-R1 (must be `comment().by`, `mockForecasts[location()]`). Verifier confirmed real per spot-check on 4 of the 13 $prop-using example .aihu files. **This is a CORRECTNESS issue post-R1 merge, not a sugar issue.**

**Three options:**

a. **B3 codemod territory.** Expand the 560 LOC template-syntax codemod to also rewrite body-call sites. AST awareness of $prop names + scope tracking required.

b. **B2 (small-additive round).** Add the body-call migration to B2 (CORRECTNESS issue, not syntax change).

c. **Stay manual + warn.** Compiler emits a warning; userland fixes manually.

### Decide: Option (a) — bundle into B3 codemod

**Defense:**

1. **Mechanical AST rewriting is exactly what codemods are for.** The body-call migration walks the SFC body AST, identifies $prop-name references in expression position (where they were bare-value before R1), and rewrites them to call-form. Scope-tracking ensures we don't rewrite shadowed names. This is bog-standard codemod work.

2. **One codemod run for userland.** Userland runs the B3 codemod once. It migrates Variant B template syntax (`{#if}` etc.), $on.click rename, class array form lift, AND the body-call migration. Atomic — userland doesn't run two codemods or piecewise-fix.

3. **Keeps B2 lean.** B2 was sized ~80-130 LOC (R2+R3+R4); folding body-call migration into B2 (option b) would push it to ~200-280 LOC AND would require duplicating AST/scope-tracking machinery that B3 already needs. Cleaner to land it in B3.

4. **Spec-of-AC matches Builder's literal-AC reading.** Verifier called out: "the spec language was 'typecheck and build'; the spirit-of-AC migration cost is honestly surfaced as Builder open question #2." Spirit-of-AC says: post-merge, examples should run, not just compile. The codemod is the right place to carry that load — it's the gap-bridge between literal-build and runtime-correctness for the migration window.

5. **Compatibility window.** Once `feat/template-syntax-v2-b1` merges to parent and (eventually) main, in-tree examples using bare-value $prop access emit broken JS. **The compatibility window starts at -b1 merge and closes at B3 codemod ship.** During this window, in-repo examples (Comment.aihu, [slug].aihu, agent-panel.aihu, macro-test.aihu) emit runtime-broken JS. **This is acceptable** — these are example/dev SFCs, not shipped product surface. The B3 codemod runs as part of the shippable v0.3 release.

### B3 codemod budget update

B3 codemod LOC budget grows from **560 LOC → ~640-700 LOC** to absorb the body-call migration AST work. Still well under any practical ceiling. **Director r6 default: revisit budget cap if Builder reports surface complexity beyond 700 LOC.** If body-call migration's scope-tracking turns into a research project (e.g., handling destructuring, alias renames, dynamic property access), Builder surfaces and we re-evaluate.

### Surface-condition trigger

If B3 Verifier reports the body-call codemod work pushes B3 src+codemod past **800 LOC**, surface to user for B3 → B3a/B3b re-cut decision (per Director r5 §5 escape hatch — split into `B3a` parser+codegen and `B3b` codemod+sidecar+body-call-migration).

### If you reject (a)

(b) trades B2 lean-ness for atomicity. Defensible if Director optimizes for "users migrate ASAP" rather than "users run one codemod." Reject because B3 will ship the codemod anyway; making users run two codemods (one for body-call now, one for template syntax later) is worse UX than one codemod.

(c) compiler-warn-only is the worst option. Noisy build output for the entire B2-B3 window; risk of users ignoring the warning; manual migration is error-prone. Reject.

**Stick with (a). B3 codemod brief absorbs the body-call migration work; B3 LOC budget grows to ~640-700.**

---

### Q3 — $bind two-way + reflect interaction (B2 territory)

**Context recap.** Builder surfaced: when `$prop x: { value: 0, reflect: true }` AND a child uses `$bind:value="x"`, the bind write triggers reflect → attribute-set → attributeChangedCallback → potentially infinite loop or stale-write race.

This is squarely R4 (the $bind write-side verify item) and B2's responsibility per Director r5 §5.

### Refine B2 brief — explicit AC for reflect-loop guard

B2 R4 acceptance criterion gains an explicit clause:

**"`$bind.value` write-through correctly composes with `$prop x: { reflect: true }`. No infinite loop. No stale writes. No double-fire. Test fixture: child component uses `$bind:value="parentProp"` where parent declares `$prop parentProp: { value: 0, reflect: true }`; the bind write must propagate to parent's signal, which reflects to attribute, which the child's attributeChangedCallback observes — but the cycle terminates at the first round-trip without re-firing the bind write."**

### Guard mechanism (Director default)

The B1 reflect re-entrancy guard already uses a per-instance `Set<string>` (per V1 verifier report, finding 5; B1 manifest §Decisions:5). That guard prevents the parent's own `setAttribute` → attributeChangedCallback → `.set` → setAttribute cycle.

The $bind cycle is **across components**: child writes parent prop → parent reflects to attribute → child's attributeChangedCallback (if child observes the same attribute name) fires. Within a single component, B1's guard handles it. Across components, the natural termination is: child's attributeChangedCallback writes through `_convert` → `ps.set(...)`. If the new value equals the current value (which it will, since the bind originated this update), `ps.set` short-circuits. **Builder verifies this short-circuit holds.** If it doesn't, the guard mechanism is: **add an `_isInternalAttrChange` flag on the host that skips reflect during attributeChangedCallback** (set in `attributeChangedCallback` entry, cleared in `finally`).

Alternative guard: **dirty-check via signal equality.** `ps.set(newValue)` should be a no-op if `newValue === current`. B1's `_convert` returns a new instance for objects (via JSON.parse) — for non-primitive props, the equality check fails and the cycle continues. Builder must address this: either (a) skip reflect when attributeChangedCallback caused the update (the `_isInternalAttrChange` flag); or (b) document that `$bind:value` on object-typed reflected props is a runtime warning + degrade gracefully.

**Director r6 default: option (a) — `_isInternalAttrChange` flag.** Simpler; covers all prop types uniformly. Builder owns the implementation detail; B2 brief specifies the AC outcome (no infinite loop) without prescribing the exact guard data structure (Builder picks).

### B2 brief AC text

"R4 (write-side verify + reflect interaction): `$bind.value={signal}` two-way write path writes back to the signal on input events. When the bound signal is a $prop with `reflect: true`, the write composes correctly: bind write → signal.set → attribute reflection → child observes via attributeChangedCallback → cycle terminates without infinite loop or stale writes. Test fixture exists in `packages/runtime/tests/bind-reflect.test.ts`."

---

### Q4 — observedAttributes precedence on name collision

**Context recap.** When `$prop x: { attribute: 'data-x' }` AND another $prop or directive references attribute name `'data-x'`, what's the precedence? Or when two $props produce the same kebab-case (e.g., `xY` and `x-y`)?

Currently per V1 verifier (finding from open-Q assessment): "legacy `attrs` path takes precedence in `attributeChangedCallback`; both fire" (`define-component.ts:214` runs first; `:218-225` runs second). **This is implementation-detail leakage** — userland shouldn't have to reason about which dispatcher fires first.

### Decide: compile-time error on collision

**Compile-time error.** When the compiler detects two $prop declarations (or one $prop + one explicit `attrs:` entry) that map to the same observed-attribute name, **emit a clear diagnostic and fail compilation.** No runtime ambiguity.

### Diagnostic specification

Error code: `C446` (next available after C445 from R1).

Error message format:

```
error[C446]: $prop attribute name collision

  --> path/to/component.aihu:LINE:COL
   |
LINE | $prop xY: { value: 0 }
   |       ^^ attribute name 'x-y' (auto-kebabbed from 'xY')
LINE | $prop x_y: { value: 0 }
   |       ^^^ attribute name 'x-y' (auto-kebabbed from 'x_y')
   |
   = note: both props map to the same observed attribute 'x-y'
   = help: specify `attribute:` explicitly on at least one prop to disambiguate
   = help: example: `$prop xY: { attribute: 'data-x-y', value: 0 }`
```

Edge cases the parser-validator must handle:

- Two props with explicit `attribute:` set to the same string.
- One prop with explicit `attribute:`, another with auto-kebabbed name colliding.
- Two props with different camelCase names auto-kebabbing to the same string.
- Prop with `attribute: false` (no attribute observed) does NOT collide with anything.
- Legacy `attrs:` entry colliding with a $prop's auto-kebabbed or explicit attribute.

### B2 brief — fold Q4 in

B2 brief gains acceptance criterion:

**"Q4 (observedAttributes name-collision compile-time error): The parser/validator detects when two `$prop` declarations map to the same observed attribute name (via auto-kebab-case or explicit `attribute:` key) and emits a `C446` compile error. The error names both colliding props and the conflicting attribute name. Suggests fix in error message: `specify attribute: explicitly on one of the two`. Test fixtures cover four collision cases (auto-auto, auto-explicit, explicit-explicit, attrs-prop)."**

LOC estimate: ~15-25 LOC validator + ~30-50 LOC tests. Folds cleanly into B2.

---

## §3 — Refined B2 brief

**Branch:** `feat/template-syntax-v2-b2` off `feat/template-syntax-v2` (post -b1 fast-forward merge).

**Scope:** R2 ($lifecycle four-callback extension) + R3 ($show → hidden) + R4 ($bind write-side verify) + Q3 ($bind + reflect guard) + Q4 (observedAttributes collision compile-error).

**LOC estimate:** ~150-220 LOC src + ~150-200 LOC tests (was ~80-130 src in r5 §5; addition of Q3 fixture work + Q4 validator pushes higher).

### R2 — `$lifecycle` four-callback extension

**Acceptance criteria:**

1. `$lifecycle.mount`, `$lifecycle.dispose`, `$lifecycle.adopt`, `$lifecycle.attributeChange` all callable from the SFC's `@state` block.
2. **Lowering:**
   - `connectedCallback` → calls `$lifecycle.mount(ctx)` after R1's $prop init phase + before any controller mount (per R6 declaration order, future-proofing).
   - `disconnectedCallback` → calls `$lifecycle.dispose(ctx)` AFTER any controller `dispose` (LIFO).
   - `adoptedCallback` → calls `$lifecycle.adopt(ctx)`.
   - `attributeChangedCallback` → calls `$lifecycle.attributeChange(name, oldValue, newValue, ctx)` AFTER R1's $prop attributeChanged dispatch (so authors see the post-converted signal value, not the raw attribute).
3. The `attributeChange` callback receives `(name: string, oldValue: string | null, newValue: string | null, ctx: SetupContext)` per platform contract + ctx for signal access.
4. Existing `$lifecycle: { mount, dispose }` userland keeps working (back-compat — only `adopt` and `attributeChange` are new optional keys).
5. Empty `$lifecycle: {}` is parse warning per macro-vocab-v2 §2.1.
6. Tests: 4 callbacks fire in expected order; back-compat with mount-only and mount+dispose userland; back-compat with R1's $prop attributeChange dispatch (both fire — $prop's first, then $lifecycle.attributeChange).

### R3 — `$show` → `hidden` attribute

**Acceptance criteria:**

1. `$show={cond}` lowers to setting/unsetting the `hidden` attribute on the element (NOT `display: none` style).
2. **Reactive:** cond signal updates flip the `hidden` attribute fine-grained via `mountEffect` — same path as `class={signal}` per Scout D2.
3. Document in spec: `hidden` attribute respects user CSS `[hidden] { display: none !important }` global declaration; Shadow DOM components can override via `:host([hidden]) { display: ... }`.
4. Compiler emits warning if `$show` and `style="display: ..."` are used on the same element (style precedence may surprise authors). Warning code: `W201` (next available).
5. Tests: $show toggles `hidden` attribute; reactive cond updates flip attribute; CSS override case (host with `:host([hidden]) { display: flex }`) works as expected.

### R4 — `$bind` write-side verify + Q3 reflect interaction

**Acceptance criteria:**

1. **Write-side confirm or fix:** `$bind.value={signal}` two-way write path actually writes back to the signal on input/change events. Verify by code-path read first (Builder reports finding); if missing, implement.
2. **Q3 reflect-loop guard:** `$bind.value` + `$prop x: { reflect: true }` composition has guard against infinite loop / stale write race. Guard mechanism: Director default is `_isInternalAttrChange` flag on the host (set in attributeChangedCallback entry, cleared in finally; reflect path skips when flag set). Builder picks final implementation; AC outcome is "no infinite loop, no stale writes, no double-fire."
3. **Test fixture:** `packages/runtime/tests/bind-reflect.test.ts` — child component with `$bind:value` on parent's `$prop` where parent has `reflect: true`. Sequence: parent input → child reads → child writes → parent reflects → child observes attribute change → cycle terminates. Verify: signal value updates exactly once per source-of-truth change; attribute value matches signal value at quiescence; no double-firing of attributeChangedCallback within a single update cycle.
4. Document in spec: `$bind.value` works correctly with `reflect: true`; bidirectional flow is supported.

### Q4 — observedAttributes name collision (compile-time error)

**Acceptance criteria:**

1. Compile-time error code `C446` if two $props map to the same attribute name.
2. Error message names both props AND the conflicting attribute name.
3. Suggests fix: `specify attribute: explicitly on one of the two`.
4. Detection in `state_macros.rs` parser/validator (alongside R1's C445 attribute:false+reflect:true validator).
5. Tests: four collision cases cover auto-auto, auto-explicit, explicit-explicit, attrs-prop. Each test uses `compile_full` and asserts CompileError with code `C446`.

### Per-round discipline

- LOC budget: ≤ 500 src+tests per playbook ceiling. B2 estimate ~300-420 LOC total — well within bound.
- Builder produces `.team/build-manifests/r2-r3-r4-q3-q4-002.md` with per-AC named-sample evidence (same pattern as B1's manifest).
- Surfaced open questions (if any) honestly listed for r7 governance.
- Branch pushed to `origin/feat/template-syntax-v2-b2`; PR into `feat/template-syntax-v2`.

---

## §4 — Synthesizer routing decision

**Route Synthesizer.** V1 closed clean; iteration 1 of 5 banked. R1 is durable knowledge (the bug-fix + Lit-style optional keys are now ratified in code, not just spec). Q1 (lazy-attach) is a substantive architectural decision that should land in the topic_summary.

### Synthesizer instructions

File: `c:\git\fellwork\aihu\docs\topic-summaries\template-syntax-summary.md`

1. **New sub-section under "Round 4 + Round 5 user-directed scope adjustments":** add **"Round 6 governance: B1 PASS + Q1 lazy-attach decision."**

   Content:
   - V1 verifier returned PASS 11/11 on R1 ($prop reactivity fix + Lit-style optional keys).
   - Iteration counter 1/5 banked. Director merge decision: fast-forward `feat/template-syntax-v2-b1` → `feat/template-syntax-v2`.
   - Q1 architectural decision: **lazy-attach** is the runtime-size strategy for R5/R6/R7. Per-feature size budgets: $aria ≤ 600 B, $controller ≤ 400 B, $context ≤ 600 B, all gzipped, all lazy-attached. Marketing position: "5 KB runtime if you use everything; ~2.7 KB for legacy SFCs."
   - Q2 outcome: body-call-syntax migration folds into B3 codemod (~640-700 LOC budget; up from 560).
   - Q3 outcome: $bind + reflect interaction guard → B2/R4 territory; `_isInternalAttrChange` flag is Director default mechanic.
   - Q4 outcome: observedAttributes name collision → compile-time error `C446`; B2 brief absorbs the validator.

2. **Add to durably-true facts:**
   - "B1 closed clean (V1 PASS 11/11); iteration 1/5 banked; lazy-attach architectural decision ratified for R5/R6/R7."
   - "Per-feature gzipped size budgets: $aria ≤ 600 B, $controller ≤ 400 B, $context ≤ 600 B (lazy-attached). `@aihu/runtime` core baseline: ~2.75 KB."
   - "Aihu marketing position: '5 KB runtime if you use everything; ~2.7 KB for legacy SFCs.'"

3. **Add to open items:**
   - "B3 codemod scope expanded to include body-call-syntax migration (~640-700 LOC budget; previously 560)."
   - "Surface trigger: if B3 codemod scope explodes past 800 LOC, re-cut B3 → B3a/B3b."

4. **Update gate question:**
   - Replace prior "Ratify R1-R7, dispatch B1 — yes/no?" with: **"B2 dispatchable; user gate cleared post-go-auto-mode; auto-spine continues."**
   - Note: Q1 lazy-attach is a Director-default with sound architectural reasoning; user can still override but doesn't gate Builder progress in auto mode.

5. **Add Q3 + Q4 outcomes to spec-section text noted earlier** (R4 spec section gains reflect-loop guard sub-section; new "C446 collision diagnostic" sub-section under R1's $prop spec text or under a fresh "Diagnostics" anchor).

6. **Preserve all earlier rounds verbatim.** No deletion of r1-r5 content; only addition under r6.

7. **Citation:** cite this director-note (r6) record id (returned in AGENTS.delta.db write companion below) as the corrective-record for the topic_summary patch.

---

## §5 — Iteration discipline + continuity check

### Counter status

**1 of 5.** Builder ↔ Verifier round 1 closed clean in one pass. Banking budget for B2-B5. No iteration concerns.

### Continuity check

**r6 is the first post-Builder governance round.** The pattern is clean: build → verify → governance → next-build. Pattern matches Director playbook (Mode 2 build/refactor with V1 PASS routing). No drift.

### Anti-pattern checks (per playbook)

- **Builder revised targets?** No — Verifier confirmed AC bar met without target-shift. The Builder's manifest and the brief's AC list agreed verbatim.
- **Sample failures hidden by aggregate?** No — V1 named every test case (`R1-AC5: setAttribute → ctx.props.<name>() updates the signal` etc.) with sample evidence per AC. No "823/828 pass" hand-wave; specific test names attached to specific ACs.
- **Acceptance items silently deferred?** No — open questions surfaced honestly. Builder explicitly noted Q2 (body-call migration) is a "spirit-of-AC" gap and called it out for Director adjudication.
- **Work nature shifted?** No — still Mode 2 build, R1 → R2/R3/R4 progression. No pivot to research or governance-only work.
- **Same defect class iteration ceiling?** N/A — one-pass close on R1; no iteration on the same defect class.

### Surface to user?

**No.** Auto-mode continues per user "go, auto mode" directive. Q1 lazy-attach is a Director-default with sound architectural reasoning; user can still override at any future surface, but doesn't gate Builder progress.

---

## §6 — Surface conditions watch

**During B2 + B3 + B4 + B5 execution, surface to user if:**

1. **B2 Verifier reports NEEDS_FIX with reflect-loop unresolved** (Q3 guard mechanism doesn't terminate cycle, OR has new failure mode like double-fire). Surface — Q3 may need re-architecture (e.g., `_isInternalAttrChange` flag isn't the right primitive; signal-equality short-circuit isn't preserving correctness).

2. **B3 codemod scope explodes past 800 LOC after body-call addition.** Surface for B3 → B3a/B3b re-cut consideration. Threshold 800 LOC is the pragmatic cap; codemod LOC is mostly AST-rewrite scaffolding, so going above signals scope creep.

3. **B4 runtime size budget at $aria boundary exceeds 600 B gzipped.** Surface — lazy-attach (b) may be unworkable for $aria specifically (e.g., `attachInternals()` cache forces base-class wiring that can't be lazy-attached). Director r7 considers per-feature sub-export fallback or budget revision.

4. **Combined B5 LOC + tests exceeds 600 LOC** (R6 + R7 round). Per Director r5 §5, this triggers B5 → B5a/B5b split (R6 separate from R7). Surface for governance call.

5. **Any Builder ↔ Verifier round produces same-defect-class iteration with NEEDS_FIX > 1.** Builder fixed reflect re-entrancy via Set<string> in B1; if a future round revisits reflect-loop logic > once, Director surfaces — this is the "same defect class iteration ceiling" red-flag.

**During r7+ governance rounds, surface if:**

6. User pulls a v0.4 deferral (D1 DSD, D5 $form, D6 LSP) into RATIFY-now. Triggers re-cut consideration; may bust 5-round Builder ceiling.

7. Cumulative iteration counter approaches 5/5 with B5 still open. Director re-justifies depth or admits discipline trip.

---

*End of round 6 director-note. Team Lead executes -b1 → parent fast-forward merge, dispatches Synthesizer per §4, dispatches B2 per §3 brief. STATUS line + AGENTS.delta.db record below in companion outputs.*
