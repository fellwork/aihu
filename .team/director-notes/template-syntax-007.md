# Director Note — topic:aihu-template-syntax track:userland-dx — Round 7 (V2 PASS Routing + B3 Brief Refinement)

**Mode:** 2 (build/refactor — second post-Builder governance round)
**Iteration counter:** 2 of 5 (Builder ↔ Verifier round 2 closed clean in one pass; banking budget for B3-B5)
**Date:** 2026-05-06
**Author:** Director
**Tags:** `topic:aihu-template-syntax track:userland-dx round:7 v2-pass-routing-b3-refinement`

**STATUS:** R7 ROUTED — V2 PASS confirmed (12/12 ACs); merge `feat/template-syntax-v2-b2` → `feat/template-syntax-v2` via fast-forward (preserves 3 phase-commits as bisectable units); Surface 1 (R4 typed-conv at `$bind` site) folded into B3 compiler emit; Surface 2 (Q3 async-batched-writes) documented as v0.5+ watched assumption; B3 brief refined as the largest round (~1090-1390 LOC src+tests = Variant B template syntax + colon→dot transition + 640-700 LOC codemod + body-call migration + R4 typed-conv + sidecar `.aihu.ts`); Synthesizer routed for r7 patch.

---

## §1 — V2 PASS routing decision

### V2 PASS clean — no scope shift, on-thesis

V2 returned **PASS 12/12** on all B2 acceptance items (R2 + R3 + R4 + Q3 + Q4). Builder's manifest is accurate to diff (verified: 3 phase-commits at `dbf34a2`, `c1d1337`, `124adda`; file deltas match named tests; +20 cargo tests + 11 bun tests; 35 B size headroom matches Builder claim verbatim). Zero over-implementation (Variant B template, $aria/$controller/$context, codemod, sidecar all untouched per Verifier diff scan). Two open questions are honest substance for r7 governance, not spec gaps. R1 cross-round preservation: 11 R1 ACs unchanged (V1 PASS still holds; 23/23 define-component.test.ts).

**Iteration counter:** **2 of 5.** Two consecutive one-pass closes (V1 PASS at iteration 1; V2 PASS at iteration 2). **Banking budget for B3-B5.** No drift. No surface-to-user trigger. On-thesis.

### Merge decision: fast-forward `-b2` → parent (already done; confirm)

Per Director r6 §1 precedent: fast-forward (NOT squash) — preserves the 3 B2 phase-commits as individually reviewable + bisectable units (`feat: r2-r4-q3-q4 platform integration sugar` + `test: acceptance tests + fixtures` + `docs: build manifest`). **Team Lead executes:**

```bash
git checkout feat/template-syntax-v2
git merge --ff-only feat/template-syntax-v2-b2
git push origin feat/template-syntax-v2
# (defer -b2 sub-branch deletion until B3 lands clean)
```

If fast-forward fails (parent advanced unexpectedly), surface to Director — do NOT silently rebase or merge-commit.

**Eventual main merge** stays per r5 §5: one squash commit `feat: template-syntax-v2 (Variant B + R1-R7)` after B5 lands. Decision unchanged.

### B3 builds off post-B2 parent

Post-merge, parent `feat/template-syntax-v2` contains R1 + R2 + R3 + R4 + Q3 + Q4 all committed. B3 builds off this state.

**Critical surface verified during r7 read.** B2's R4 added write-back to the **existing `$bind:value` colon-form** — it did NOT add `$bind.value` dot-form. Verified via grep: `packages/compiler/tests/macro_attrs.rs` test fixtures still use `$bind:value="…"` and `$on:click="…"` quoted-identifier and curly forms throughout (B2 added new tests USING colon-form). The Variant B spec (Architect doc §3.B.5) requires `$on.click` and `$bind.value` dot-forms.

**Implication for B3:** B3 must handle the **complete colon→dot transition globally** — both compiler emit additions (parse and lower the dot-form) AND the codemod migration of all colon-form usages in the corpus. This is NOT a "add Variant B template syntax with no $on/$bind conflict" round; it is "add Variant B template syntax + globally migrate the attribute namespace separator from `:` to `.` for `$on` and `$bind`." Scope is correctly captured in r6 §3-equivalent's r5 estimate (560 LOC codemod + body-call grew to 640-700) — the colon→dot transition is included in that 640-700 estimate per r6 §2.Q2 + r5 §5 B3 description ("`$on.click` rename"). r7 confirms the brief encompasses this work.

---

## §2 — Adjudicate B2's 2 surface items

### Surface 1 — R4 typed-conversion at `$bind` site

**Builder's report.** `$bind.value={signal}` write-back is always-string. `setName(e.target.value)` stores `'5'` not `5` for numeric signals. Director r6 §3.R4 spec text said "two-way write confirmation only" — typed conversion was not in the literal AC bar. Verifier called this out as honest substance for r7, not a spec-gap-skipped silently.

**Three options:**

a. **Defer to v0.4 follow-up.** Document as known-issue; userland workaround = explicit `Number(e.target.value)` in handler. Cost: numeric-signal users hit the gotcha; framework documentation must call this out at every example involving numeric-bound forms.

b. **Bundle into B3.** B3 already handles the body-call-syntax migration via codemod and the colon→dot template-syntax migration; type-conversion at bind site is a parallel correctness fix. Add to B3 brief. Cost: B3 LOC grows by ~20-40 LOC compiler emit + ~50 LOC tests.

c. **Add a B2.1 round** (separate Builder dispatch). Cost: pushes 5-round ceiling concerns; lessons advise against re-cut at this point unless necessary.

#### Decide: Option (b) — bundle into B3

**Defense:**

1. **Mirror R1's `_convert` direction.** R1 already implements typed-conversion at the **read** side (attribute-string → typed signal value via the prop's declared type or `converter:` override). The bind-write is the symmetric **write** side: typed signal value reads from `e.target.value` (always string) and must convert via the same machinery. Symmetry argues for the same emit pipeline. The `_convert` helper is already in scope; the B3 emit-change is "call the convert helper before invoking the setter."

2. **R1 + R4 together form the durable invariant.** "A typed prop signal stays typed across both attribute-set and bind-input pathways." Shipping R4-without-typed-conv is a half-finished invariant that documentation must apologize for at every numeric-form example. Shipping the full invariant in v0.3 is the right discipline.

3. **B3 already touches `emit.rs` for colon→dot migration + template-syntax additions.** The R4 typed-conv emit-change adds ~20-40 LOC to a file B3 is already modifying. Marginal cost is low; coupling gain is high (one B3 emit-pass review covers all the bind-related changes, vs splitting attention).

4. **Codemod LOC unchanged.** This is compiler-emit work, not codemod work — no impact on the 640-700 LOC codemod budget.

5. **5-round ceiling preserved.** Option (c)'s B2.1 round busts the budget without load-bearing reason. Option (a) defers a correctness gap that documentation cannot adequately paper over.

**Mechanic.** Mirror R1's `_convert` at the `$bind.value` write site. When emitting the auto-write-back listener (per B2's emit.rs:2299-2358 path), check if the bound signal has a declared `_convert` (R1 machinery: prop's `attribute:`/`reflect:`/`converter:` keys). If yes, emit `setter(_convert(e.target.value))`; if no, emit current `setter(e.target.value)` for back-compat. **Builder picks final implementation detail; AC outcome is "numeric signal gets number, not string, on bind-input."** Adds AC #11 to B3 (§3 below).

**If you reject (b).** Defense for (a) — "v0.4 deferral" — is defensible only if numeric-bound signals are rare in v0.3 userland. They are not (forms with quantity inputs, day pickers, age fields, port numbers). Reject (a). Defense for (c) — "B2.1 round" — would split a small bind-site emit-change off into its own round, which is process noise; reject (c).

**Stick with (b). B3 absorbs typed-conv at bind site as AC #11.**

### Surface 2 — Q3 single-boolean assumption (async batched writes)

**Builder's report.** `_isInternalAttrChange` is host-wide single boolean — correct for synchronous attribute-change bursts (current platform contract per WHATWG `attributeChangedCallback` spec). If async batched attribute writes ever land (hypothetical future platform feature; **no current WHATWG proposal exists**), assumption needs re-verification.

**This is a future-proofing concern, not a current bug.** Verifier confirmed: 4 bind-reflect.test.ts cases prove no infinite loop, no double-fire on the actual platform contract today.

#### Decide: document as a watched assumption; no code change in v0.3

**Defense:**

1. **No current platform proposal to track.** WHATWG has not floated async-batched attributeChangedCallback. ChromeStatus, MDN, WICG repos all silent. Building defensive code for a hypothetical future is YAGNI of the worst kind — adds complexity that may never pay rent and may be wrong relative to the actual proposal when it lands.

2. **Lit's precedent stands.** Builder picked `_isInternalAttrChange` boolean per Lit's `_isReflecting` precedent verbatim. Lit ships this in production at scale; the platform contract has not changed under them. Aihu inherits the same guarantee.

3. **Reverification trigger is well-defined.** When (if) WHATWG ratifies an async-batched-attribute-write proposal, **r-stage governance for that round revisits this assumption.** Add to v0.5+ watched-items list — alongside Trusted Types CSP integration, DSD, $form, LSP. **No silent assumption; explicit watch.**

4. **Spirit-of-AC was met.** Director r6 §2.Q3 explicitly allowed Builder to pick the data structure (boolean vs Set vs other). Builder picked boolean and surfaced the synchronous-only caveat honestly. This is exactly how Director governance is supposed to work.

**Documentation actions for v0.3 ship:**
- Master audit doc §3.Q3 row: append "Assumes synchronous-per-attribute platform contract (WHATWG today). Async-batched-write proposal would require re-verification — tracked as v0.5+ watched item."
- Topic_summary: add to durably-true facts (per §4 Synthesizer instructions below).
- v0.5+ deferred items list (Architect spec §12 or topic_summary "open items"): "Q3 reflect-loop guard async-batch reverify (watched; no current WHATWG proposal)."

**No code change. No new test. No B3 scope addition.**

**If you disagree.** Alternative would be to defensively use a `Set<string>` instead of a boolean, hedging against the future async-batched case. Reject: speculative complexity; the actual future API may not match the Set assumption either; Lit's precedent is the right anchor.

**Stick with documented-watch. Surface 2 closes informationally.**

---

## §3 — Refined B3 brief (the largest round)

**Branch:** `feat/template-syntax-v2-b3` off `feat/template-syntax-v2` (post -b2 fast-forward merge).

**Scope:** Variant B template syntax (block-tag control flow + dot-form `$on`/`$bind` + class-array + `{@html}` + `$emit`) + global colon→dot transition + R4 typed-conv at $bind site + sidecar `.aihu.ts` for type-safety + 640-700 LOC codemod migrating both userland template-syntax forms AND body-call-syntax + applied to in-aihu-repo corpus (62 .aihu files).

**Estimated total LOC:** ~1090-1390 LOC src+tests. **The largest round.**

### §3.A — Compiler-side (parser + codegen + runtime support)

#### B3.1 Variant B template syntax — block-tag control flow

- `{#if cond}…{/if}` parsing + lowering
- `{#each items as item (key)}…{/each}` parsing + lowering (note: spec §3.B uses `{#for}` per Architect's text; **canonical token: `{#each}`** per Sample-catalog use AND Svelte training-data alignment AND Prober report — Builder uses `{#each}`, NOT `{#for}`; if Builder finds spec-doc text uses `{#for}`, file the inconsistency and align to `{#each}`)
- `{:else if}` and `{:else}` block syntax (in-block sibling form per spec §3.B.1)
- `{:empty}` for iteration fallback per spec §3.B.1
- **Existing `$if`/`$each`/`$key` attribute directives MUST STILL work in this round.** Codemod migrates corpus; compiler accepts both during the transition window. (Mechanic: parser branches on opening token — `{#…}` block-tag goes to the new lowering path; `$if`/`$each` attribute-directive stays on the v1 path. Both lower to the same `createIfBoundary` / `each` runtime calls per spec §3.B.4 + §8.)
- Lowering preserves Scout D2 reactivity: emits same `_applyAttrs` + `mountEffect` shape; no VDOM step.

#### B3.2 Attribute-form changes (the global colon→dot transition)

- `$on:click` → `$on.click` (parser additionally accepts the dot-form as canonical; v1 colon-form still parses with deprecation warning W202).
- `$bind:value` → `$bind.value` (parser additionally accepts the dot-form; v1 colon-form still parses with W202).
- `class={[a, b, c && 'd']}` array form support (lowering joins truthy strings with spaces; mirrors Solid/clsx idiom per spec §3.B.5).
- `{@html expr}` Svelte-style for raw HTML (renamed from v1 `$html`); preserves existing security posture (escape-by-default elsewhere; raw-HTML opt-in named distinctly per spec §6).

**Surfacing reminder: B2 added the **existing colon-form** write-back. B3 must keep colon-form working AND add dot-form parsing+emit, with codemod migrating the corpus.**

#### B3.3 `$emit.<name>(payload)` — declared via `$event` collection in `@state` v2

```aihu
@state {
  $event: dayjump { payload: { day: Date } }
}
@template {
  <button $on.click={() => $emit.dayjump({ day })}>...</button>
}
```

Lowers to `this.dispatchEvent(new CustomEvent('dayjump', { detail: payload, bubbles: true, composed: false, cancelable: true }))`. Type-check the payload via `$event` declaration. Compiler resolves `$emit.<name>` against the `$event` collection at compile time; missing names error with **C501** (spec §5.b reserved). Bubbles/composed defaults per spec §5.a (`bubbles?: boolean = true`, `composed?: boolean = false`).

#### B3.4 Listening side — `$on.<custom-event>={handler}`

Listens for both DOM events AND component events through one syntax. Compiler distinguishes at type-resolution time: if `<Tag>` declares `<event-name>` in its `$event` collection, the listener gets the typed payload; otherwise treats as a DOM event. (Per spec §5.c.)

#### B3.5 R4 typed-conversion at `$bind.value` write site (per §2 Surface 1 decision option b)

- When `$bind.value={mySignal}` writes back, use the signal's declared type (from R1's `$prop` `attribute:`/`reflect:`/`converter:` keys) to convert string input → typed value.
- Mirror R1's `_convert` logic at the bind write site.
- ~20-40 LOC compiler emit + ~50 LOC tests.

#### B3.6 Sidecar `.aihu.ts` for type-safety (Architect spec §7 path (i))

- Compiler emits per-SFC sidecar containing `@state` declarations in scope + every `@template` curly expression as a typed body statement.
- `tsc --noEmit` over `**/*.aihu.ts` in CI.
- Closes Scout D4's ~0% TS-coverage baseline.
- ~80-150 LOC compiler emit + CI script update.
- **Decision: roll into B3.** Surface trigger: if sidecar emit reveals existing TS pipeline can't ingest the per-SFC sidecar without significant build-config change (bundler-resolution issue, etc.), surface for sidecar-as-B3.1 split. Otherwise rolled into B3.

### §3.B — Codemod-side (the 640-700 LOC migration)

#### B3.7 Codemod path

`packages/compiler/js/codemods/template-syntax/migrate.ts` (per Scout's correction — `js/` subdirectory). Error code **C500** reserved per spec §6 + §9.

#### B3.8 Codemod transformations

1. v1 `$if`/`$each`/`$key` → Variant B `{#if}`/`{#each}`/`(key)` (block-tag wrap; AST-aware element-lift)
2. v1 `$on:click` → `$on.click` (colon → dot rename across all `$on:` usages)
3. v1 `$bind:value` → `$bind.value` (colon → dot rename across all `$bind:` usages)
4. v1 `class={'a' + (cond ? ' b' : '')}` → `class={['a', cond && 'b']}` (clsx-shaped array form; conservative pattern-match)
5. v1 `$html={expr}` → `{@html expr}` (rename + form change)
6. v1 `this.dispatchEvent(new CustomEvent('foo', { detail, bubbles, composed }))` inside `@template` event handlers → `$emit.foo(detail)` IF the SFC has a `$event: foo` declaration; ELSE emit warning W502 and leave as-is for userland.
7. **Body-call-syntax migration** (per Director r6 §2.Q2): `propName.x` → `propName().x` in `@template` body when `propName` is a `$prop` in scope. AST-aware scope tracking required. Adds ~80-150 LOC.

#### B3.9 Apply codemod to in-aihu-repo corpus

- 62 `.aihu` files per Scout D5
- Run codemod, commit migrated corpus as **separate commits per migration phase** (recommended: one commit per transformation type for bisectability — i.e., (a) `$on:`→`$on.`, (b) `$bind:`→`$bind.`, (c) `$if`+`$each`+`$key`→ block-tags, (d) class-array, (e) `$html`→`{@html}`, (f) `dispatchEvent`→`$emit`, (g) body-call-syntax). Builder's call on phasing; recommended for review-friendliness. Single commit acceptable if Builder finds phasing inflates B3 LOC count.
- Existing fixtures + examples + cf-team scaffold all migrate.
- Each codemod-migrated file's `cargo check` and `bun test` pass.

#### B3.10 Codemod test corpus

- Prober fixtures at `.team/prober-fixtures/` (13 files) round-trip green.
- One synthetic edge-case file with `$each="x.filter(p => p && q.r) as item"` — round-trips correctly to `{#each x.filter(p => p && q.r) as item}` (no hoist-to-`$computed` required for Variant B per Prober §5; the lambda-LHS fits inline because block-tag header accepts any expression before ` as `).
- Idempotency: running codemod twice produces identical output.

#### B3.11 Codemod CLI

`aihu codemod template-syntax <glob>` subcommand per r3 §5 default (vs standalone `npx`).

#### B3.12 C500 error code

Clear diagnostic when v1 syntax encountered post-codemod (for userland not yet migrated). Diagnostic points at codemod helper command in the error hint.

### §3.C — Acceptance criteria (Builder will run; Verifier will check)

1. **`cargo check --workspace` passes.**
2. **`cargo test -p aihu-compiler` passes** (existing 323+ + new B3 tests; estimate +40-60 new tests).
3. **`bun run typecheck` passes.**
4. **`bun run test` passes** (existing 834+ + new B3 tests; estimate +30-50 new tests).
5. **`{#if}/{#each}/{:else if}/{:else}/{:empty}` Variant B syntax works on a fresh fixture.**
6. **`$on.click` + `$bind.value` dot-form parses and emits correctly** (B2 added colon-form emit; B3 must add dot-form emit AND keep colon-form working with W202 deprecation warning during the transition).
7. **`class={[…]}` array form lowers correctly** (truthy entries joined with spaces; falsy entries skipped).
8. **`{@html expr}` Svelte-style works**; preserves escape-by-default elsewhere; v1 `$html=` continues to work with W202 (codemod migrates).
9. **`$emit.<name>(payload)` works with typed payload via `$event` collection;** missing-name errors C501.
10. **Listener `$on.<custom-event>={handler}`** receives the typed payload from a sibling component's `$emit`.
11. **R4 typed-conversion at `$bind.value` write site:** numeric signal gets number, not string, when input value changes (asserts with `signal(0)` declared; `<input $bind.value={count}>`; user types '5'; signal reads `5` not `'5'`).
12. **Sidecar `.aihu.ts` emitted for every SFC;** tsc covers template expressions (per spec §11.c: numeric vs Date type mismatch surfaces tsc error in sidecar).
13. **Codemod round-trips all 13 prober-fixture files** green.
14. **Codemod migrates 62 in-aihu-repo `.aihu` files;** corpus rebuilds clean (`cargo check` + `bun test` pass on migrated corpus).
15. **Codemod is idempotent** (run twice = identical output).
16. **C500 error code fires on remaining v1 syntax** that the codemod refused (e.g., complex `$ref` patterns; document the refusal cases).
17. **All pre-push hooks** (Biome CI + typecheck + test + build + size + size-rows) pass.

### §3.D — B3 size budget

| Component | Src LOC | Test LOC |
|---|---|---|
| Variant B template syntax (parser + codegen + runtime) | ~250-300 | ~200 |
| Colon→dot dot-form parsing + emit | (within above) | (within above) |
| R4 typed-conv at $bind site | ~20-40 | ~50 |
| Sidecar `.aihu.ts` emit | ~80-150 | ~50 |
| Codemod (incl body-call migration) | ~640-700 | ~150-200 |
| **Total** | **~990-1190** | **~450-500** |
| **Combined** | **~1440-1690** | |

**Adjusted estimate per task brief: ~1090-1390 LOC src+tests.** This is genuinely the largest round; ceilings:

- **Per-round playbook ceiling: ≤500 LOC src+tests** is the standard. B3 is well over. **Conscious decision: B3 is the load-bearing build round; the codemod is partition-able from src; the size is justified by the migration-window contract (one codemod, atomic).**
- **Surface trigger:** if B3 exceeds **1500 LOC src+tests** OR Builder reports inability to merge body-call-migration into the codemod cleanly (e.g., scope-tracking turns into a research project handling destructuring/alias-rename/dynamic-property-access), **surface for B3a/B3b re-cut.** Cut plan:
  - **B3a** = compiler-side (Variant B template syntax + colon→dot emit + R4 typed-conv + sidecar emit) — ~430-540 LOC src + ~300 LOC tests
  - **B3b** = codemod (template-syntax migration + body-call migration + corpus apply) — ~640-700 LOC src + ~150-200 LOC tests
  - This split keeps each round under the playbook ceiling (~700 LOC src+tests max per round) and keeps the merge order clean (B3a lands first; B3b runs against B3a-merged parent).

### §3.E — Branch convention

`feat/template-syntax-v2-b3` off post-B2 parent. Single branch unless re-cut signaled. PR into `feat/template-syntax-v2` parent at completion. Per-phase commits within the branch are encouraged (compiler emit changes, then runtime, then codemod, then corpus migration) — bisectability matters for a round this large.

If B3a/B3b split triggered: `feat/template-syntax-v2-b3a` first, then `feat/template-syntax-v2-b3b` off post-B3a parent. PRs into parent in order.

---

## §4 — Synthesizer routing decision

V2 closed clean; iteration 2 of 5 banked. R2/R3/R4/Q3/Q4 are durable knowledge (the four-callback `$lifecycle`, the `$show`→hidden lowering, the `$bind` write-back, the Q3 reflect-loop guard, the Q4 C446 collision check are now ratified in code, not just spec). Surface 1 → bundled into B3 (substantive); Surface 2 → documented as v0.5+ watched assumption (informational).

**Route Synthesizer.** Specific instructions:

### File: `c:\git\fellwork\aihu\docs\topic-summaries\template-syntax-summary.md`

1. **Update "Round 4 + Round 5 user-directed scope adjustments" section.** Add a new sub-section near the top of that section (chronologically AFTER the r6 sub-section) titled **"Round 7 governance: B2 PASS + B3 brief refined."**

   Content:
   - V2 verifier returned PASS 12/12 on R2 ($lifecycle four-callback) + R3 ($show→hidden) + R4 ($bind write-back) + Q3 (reflect-loop guard) + Q4 (C446 collision check).
   - Iteration counter 2/5 banked. Director merge decision: fast-forward `feat/template-syntax-v2-b2` → `feat/template-syntax-v2`.
   - Surface 1 outcome: R4 typed-conv at $bind write site → **bundled into B3 compiler emit** (~20-40 LOC + ~50 LOC tests; mirrors R1's `_convert` direction).
   - Surface 2 outcome: Q3 async-batched-attribute-write reverify trigger → **documented as v0.5+ watched assumption** (no current WHATWG proposal; Lit precedent stands).
   - B3 = **the largest round**: Variant B template syntax + global colon→dot transition + 640-700 LOC codemod (incl body-call migration) + R4 typed-conv + sidecar `.aihu.ts`; **~1090-1390 LOC src+tests**; **surface trigger at 1500 LOC for B3a/B3b re-cut.**

2. **Add to durably-true facts:**
   - "B2 closed clean (V2 PASS 12/12); iteration 2 of 5 banked. R2/R3/R4/Q3/Q4 ratified in code on parent at HEAD post-merge. Surface 1 (R4 typed-conv) folds into B3. Surface 2 (Q3 async-batched-writes) documented as v0.5+ watched assumption."

3. **Add to open items (closed):**
   - "Surface 1: R4 typed-conv at $bind site → folded into B3 (~20-40 LOC compiler emit)."
   - "Surface 2: Q3 async-batched-attribute-write reverify trigger → documented v0.5+ watch (no current WHATWG proposal)."

4. **Add B3 brief summary to open items (active):**
   - "B3 = Variant B syntax + colon→dot transition + codemod (640-700 LOC) + R4 typed-conv + sidecar `.aihu.ts`; ~1090-1390 LOC src+tests; surface trigger at 1500 LOC for B3a/B3b re-cut."

5. **Update gate question:**
   - Replace prior r6 wording with: **"Auto-spine continues; B3 the largest round; surface conditions per r6 §6 + r7 §6 watched."**

6. **Add to v0.5+ deferred items / watched-assumptions list:**
   - "Q3 reflect-loop guard async-batch reverify (watched; no current WHATWG proposal)."

7. **Preserve all earlier rounds verbatim.** No deletion of r1-r6 content; only addition under r7.

8. **Citation:** cite this director-note (r7) record id (returned in AGENTS.delta.db write companion below) as the corrective record for the topic_summary patch.

---

## §5 — Iteration discipline + continuity check

### Counter status

**2 of 5.** Two consecutive Builder ↔ Verifier rounds closed clean in one pass. **Banking budget for B3-B5.** B3 is the load-bearing test of whether the build phase will close in 5 rounds — at ~1090-1390 LOC src+tests, B3 is genuinely the largest round and most likely to surface re-cut conditions.

### Continuity check

**r6/r7 governance pattern is clean:** build → verify → governance → next-build. No drift. Pattern matches Director playbook (Mode 2 build/refactor with V-PASS routing). No analysis-paralysis concerns.

### Anti-pattern checks (per playbook)

- **Builder revised targets?** No. V2 confirmed AC bar without target-shift; Builder's manifest and r6 §3 brief agreed on R2/R3/R4/Q3/Q4 verbatim.
- **Sample failures hidden by aggregate?** No. V2 named every test case (`r2_ac1_all_four_callbacks_fire_at_correct_moments`, `r3_ac1_macro_show_emits_toggle_hidden_attribute`, `r4_ac1_bind_value_to_signal_emits_oninput_writeback`, `q3_cross_component_bind_reflect_terminates`, `q4_collision_two_explicit_attributes`, etc.) with sample evidence per AC.
- **Acceptance items silently deferred?** No. Open questions surfaced honestly. Builder explicitly noted both Surface 1 (typed-conv) and Surface 2 (async-batch) as r7-governance items, NOT silent skips.
- **Work nature shifted?** No. Still Mode 2 build, R-progression. R1 → R2/R3/R4 → R5/R6/R7 (B4/B5) is on plan.
- **Same-defect-class iteration ceiling?** N/A — one-pass close on B2; no iteration on the same defect class.
- **Iteration-counter trajectory?** 1/5 → 2/5 in two rounds (strict one-pass-per-Builder). At this trajectory, B3-B5 has 3 rounds of budget for 3 Builder dispatches — exactly on plan.

### Surface to user?

**No.** Auto-mode continues per user's "go, auto mode" directive. Surface 1 (typed-conv → B3) and Surface 2 (async-batch → v0.5+ watch) are adjudicated by Director defaults with sound reasoning. User can override at any future surface but doesn't gate Builder progress.

---

## §6 — Surface conditions watch (extends r6 §6)

Carry forward r6 §6 (B2 NEEDS_FIX with reflect-loop unresolved; B3 codemod scope past 800 LOC; B4 $aria size budget breach; B5 combined LOC > 600; same-defect-class iteration > 1; v0.4 deferral pulled into RATIFY-now; cumulative iteration 5/5 with B5 still open) and ADD:

8. **B3 NEEDS_FIX with codemod scope creep past 1500 LOC.** Surface for re-cut (B3a/B3b split per §3.D plan). The 800 LOC threshold from r6 §6 #2 is **superseded** by this 1500 LOC threshold — r6's threshold was based on the 640-700 codemod-only estimate; r7's threshold accounts for the full B3 scope (compiler emit + codemod + corpus + sidecar + R4 typed-conv). Re-cut path: B3a (compiler+sidecar+R4-conv) + B3b (codemod+corpus+body-call).

9. **B3 typed-conv at $bind site needs deeper signal-system rework than ~40 LOC compiler emit.** If Builder reports the `_convert` helper is not directly reachable at the bind-emit site (e.g., requires plumbing through new emit-state fields, or the signal-map doesn't carry converter-fn references at emit time), surface — this would be a R1-machinery gap that may need a small B2.1-equivalent pre-pass round. Hypothetical; not expected.

10. **Sidecar `.aihu.ts` discovery reveals existing TS pipeline can't ingest per-SFC sidecar without significant build-config change.** Surface for sidecar-as-B3.1 split. (E.g., bundler-resolution rules need updating to discover `*.aihu.ts` sidecars adjacent to `*.aihu` source; tsconfig changes; moon-graph changes.) If the discovery cost is small (one-line tsconfig include), no surface needed; Builder lands inline.

11. **Codemod corpus migration breaks an in-aihu-repo `.aihu` file beyond mechanical fixup.** If applying the codemod to a fixture/example results in `cargo check` failing in a way that's not addressable by a follow-up codemod tweak (i.e., the source file requires hand-rewriting beyond what the codemod automates), surface — may signal a Variant B template-syntax design gap that the spec missed. Hypothetical; Prober's hand-transformations covered the known edge cases.

12. **Body-call-syntax migration scope-tracking AST is materially harder than estimated.** If Builder reports per-prop scope tracking requires handling destructuring, alias-renames, or dynamic property access at depth (`{ ...props }` spread, `const { propName: alias } = props()`, `props['dynamic']`), the body-call migration becomes a research project. Surface for B3 → B3a/B3b split with the body-call migration moved entirely to B3b's codemod scope.

**During r8+ governance rounds, surface if:**

13. User pulls a v0.4 deferral (D1 DSD, D5 $form, D6 LSP) into RATIFY-now mid-build (i.e., between B3 and B4). Triggers re-cut consideration; may bust 5-round Builder ceiling.

14. Cumulative iteration counter reaches 4/5 with B5 still open. Director re-justifies depth or admits discipline trip.

---

*End of round 7 director-note. Team Lead executes -b2 → parent fast-forward merge, dispatches Synthesizer per §4, dispatches B3 per §3 brief. STATUS line + AGENTS.delta.db record below in companion outputs.*
