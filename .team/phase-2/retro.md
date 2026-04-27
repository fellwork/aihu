# Phase 2 Retrospective — `@scribe/signals`

**Author:** Historian
**Date:** 2026-04-26
**Branch:** `plan-a-phase-2`
**PR:** `fellwork/scribe#2` (just opened)

This retro reflects on **how Phase 2 worked**, not what it shipped. Every claim is grounded in a Phase 2 artifact. No blame, no new feature work, no edits to the source artifacts.

---

## What worked

### The Scout → Architect → Builder → Verifier dependency chain caught real issues at each gate

- **Scout caught two showstoppers before the Architect ever opened a file.** `scout-report.md` §1.1 reproduced the Moon 2.x `type:` rejection (`config::parse::failed`) by literally running `moon project signals`, and §1.0 reproduced TS5097 by running `tsc --noEmit` against the existing scaffold. Both were structural blockers the plan didn't anticipate. Scout also flagged that `.size-limit.json` had four stale rows that would fail-by-file-not-found, and that the CI workflow had three commented-out lines no plan task explicitly addressed (Task 11.5 didn't exist yet). The Architect inherited all of this as concrete, line-cited evidence — no excavation required.
- **Architect resolved every Scout-flagged risk in the spec.** `spec-signals.md` §3.1–§3.4 directly addresses R-T1 (Moon `layer: library`), R-T2 (`allowImportingTsExtensions`), R-S1 (size budget cushion), and the missing CI re-enable step (new Task 11.5). No risk drifted to Builder unmediated. Spec §6 (Deviations) has 12 numbered entries each tracing back to a Scout finding or a Team Lead decision — full provenance.
- **Verifier independently re-ran every gate and reproduced spec-internal trouble.** `verification-report.md` §2 runs ten gates with fresh evidence (not just trusting Builder's manifest), and §3 walks 45 spec rows line-by-line in a compliance matrix. It was Verifier's matrix-walk that surfaced Finding 3 (`ComputedOptions.equals` accepted but unused at runtime) by noticing that spec §1.3 prose describes runtime cascade-suppression while Deviation 8 said "for API symmetry" — a contradiction nobody else caught.

### The "interrogate before spawn" gate kept Phase 2 inside its frame

Per the role briefs cited in earlier reports: at the start of Phase 2, the Team Lead nearly recommended a stub package, then re-read the plan and found the explicit "no source code yet" boundary at plan line 509. Scout's report (§1) takes that boundary as given and audits the actual scaffold-as-shipped, not a plan-of-record version. Without the re-read, Phase 1 would have shipped Phase 2 work and Phase 2's TDD scaffold would have had nothing to do.

### Decision 2B authority let the Architect override the plan with rationale

`spec-signals.md` §6 lists 12 deviations from the plan. The two highest-impact are:

- **Deviation 1 (`batch()` ships in Phase 2)** — plan §542 explicitly deferred batching to Phase 3+; Architect overrode with rationale that "arbor needs it on day one" and verified the size budget tolerated ~80–120 B gz. Verifier confirmed the post-batch dist landed at 629 B gz (38% headroom). This unblocked arbor before Phase 3 spawned.
- **Deviation 7 (`flags: number` bitfield)** — plan implied separate booleans on the Subscriber type; Architect packed them into a 4-bit field for ~30 B gz savings. Verifier `verification-report.md` row 36 confirms the bits are exactly `0x1/0x2/0x4/0x8` and the encapsulation holds.

Without 2B authority, both decisions would have escalated to the Team Lead and added round-trips. With it, the Architect documented the rationale (§7 "Open questions for the Team Lead — None") and let the Builder consume immediately.

### The Verifier's independent gate-rerun caught the spec inconsistency

`verification-report.md` Finding 3 (initially LOW) is the canonical example of why Verifier-code earns its keep: spec §1.3 prose said "`equals` … suppresses needless downstream re-runs" while Deviation 8 said `ComputedOptions.equals` exists "for API symmetry" — accepted by type only, not wired to runtime. The Builder shipped the type-only version because it matched Deviation 8 literally; Verifier matrix-walked spec prose against implementation and surfaced the contradiction. The Team Lead adjudicated in favor of the §1.3 prose, the Builder pivoted (commit `8d535a8`), and the re-audit (verification-report.md §6) re-checked 51 rows and resolved Finding 3 without collateral damage.

### TDD-per-task with size-budget verification kept the package on budget

`build-manifest.md` shows the size cumulative across tasks: 108 B (scaffold) → 251 B (signal) → 336 B (effect) → 419 B (computed) → 451 B (state) → 466 B (cycle+props) → 629 B (batch) → 698 B (final, with equals wired). Every commit ran `bun run size` against the 1024 B budget — the Builder caught budget pressure incrementally, never at the end. Final headroom: 326 B (32%). Compare to the alternative where size-limit runs only at the end: any over-budget finding would have required surgery across multiple primitives.

### Verifier confirmed encapsulation made it through the bundler

`verification-report.md` Gate 3 confirms `dist/index.js` exports exactly `{ $state, SignalCircularError, SignalError, batch, computed, effect, signal }` — `Subscriber`, `setCurrentObserver`, `peekCurrentObserver`, `getBatchDepth`, `enterBatch`, `exitBatch`, `drainBatch`, and the flag constants are all module-private in the bundled IIFE. Scout R-A3 explicitly worried about this leaking; the `/** @internal */` JSDoc + the `index.ts` allowlist (not blocklist) approach held.

---

## What didn't work

### Spec internal inconsistency between §1.3 prose and Deviation 8

What happened: spec §1.3 prose described runtime cascade-suppression; Deviation 8 in the same spec said the field exists "for API symmetry." Builder followed Deviation 8 (the more specific guidance), Verifier caught the contradiction at gate-walk time as Finding 3, Team Lead adjudicated, Builder pivoted with commit `8d535a8`, +69 B gz, four new tests, no schema change.

Cost: one round-trip through Verifier (the re-audit was ~15 min), one extra Builder commit, one spec edit (Deviation 8 rationale updated to "wired through to runtime cascade-suppression — see §1.3 for behavior"). Recoverable, but the contradiction should not have shipped.

Systemic root cause: the spec had no self-consistency review pass. Deviations were authored separately from the prose body, and nobody re-read prose against deviations before declaring the spec final. The Architect did exercise §7 ("Open questions") but the questions were about *new* decisions, not consistency between *existing* paragraphs.

### Team Lead's brief to Builder on the equals follow-up gave wrong implementation specifics

What happened: when adjudicating Finding 3, the Team Lead's brief to the Builder suggested "Option X: set self STALE on notify; cascade on next read" — an implementation that doesn't work in scribe's forward-subscription model. `verification-report.md` §6 ("The Builder's design pivot") explicitly diagnoses this: "Team Lead's Option X … doesn't work in this forward-subscription model: `computed.notify()` propagates only by calling `sub.notify()` on each forward subscriber — there is no separate 'I am stale, please ask me again later' channel."

Cost: the Builder noticed the mismatch only by *writing* the code (manifest §Task 12: "Implementation chose Option X (re-think when STALE cascades) over Option Y (version counters) per brief recommendation"). The pivot landed correctly because the Builder reasoned through the four scenarios (`verification-report.md` §6 traces them: lazy preservation, linear chain, cycle, diamond) — but the brief misled before that reasoning happened. Near-miss, not a hit.

Systemic root cause: the Team Lead's brief specified an implementation, not an intent + constraint. The teammate doing the work has more current knowledge of the codebase than the brief author. When the brief specifies *how*, it preempts the teammate's own (better-grounded) judgment.

### CI workflow only triggers on `main` push/PR — phase-2 pushes get no CI feedback until PR opens

What happened: `verification-report.md` Finding 4 documents that `.github/workflows/plan-a.yml` triggers on `push: [main]` and `pull_request: [main]` only. The Builder's local pre-flight on Windows was the only signal until PR-opening time. Builder caught a CRLF line-ending artifact via `bunx biome check --write` (manifest note 4) — that artifact would have surfaced on Ubuntu CI too late if it had survived the local fix.

Cost: real risk of an Ubuntu/Windows divergence shipping unverified. Phase 1 hit this once already (per `scout-report.md` §1.4: typecheck/build were commented because they hadn't been wired). Phase 2 hit it again at the end (push to phase-2 branch → no CI → only the PR run will be the first remote signal).

Systemic root cause: the workflow's trigger list is over-narrow. Branch pushes for phase work should run the same gate suite. This is a one-line CI fix nobody owns yet.

### Plan was written before Scout's prior-art survey; some prescriptions were stale

What happened: plan §542 (no batching), plan §602 (`type: library`), plan code samples using `.ts` import extensions throughout — all stale by the time Phase 2 started. Scout had to flag each (`scout-report.md` §2.3 items 5, 6; §2.2 R-T2). Architect carried the corrections forward (`spec-signals.md` §3.1, §3.2, Deviation 1).

Cost: every staleness item required two edits — one in code, one in the plan — to keep future readers from re-introducing the bug (Scout flagged this for plan §602 explicitly). The Architect did the dual edits; the Builder consumed only the spec.

Systemic root cause: the plan was authored on 2026-04-24, two days before Phase 2 spawned. Two days is enough for tooling drift (Moon 2.2.3 was current; the plan was written against an unspecified version) and enough for the Architect's prior-art survey (Solid, Vue, Preact, alien, S.js — `scout-report.md` §3) to flip a Phase 2 design call (batching).

### Moon 2.x migration was scaffold debt Phase 1 didn't catch

What happened: `builder-blockers.md` §1 documents that even after applying spec §3.1's `type: library` → `layer: library` fix, `moon run signals:typecheck` failed with `Unknown task typecheck for project signals`. Cause: Moon 2.x looks for `.moon/tasks/` (directory), not `.moon/tasks.yml` (single file). Then a follow-on: Moon 2.x's default Windows shell can't resolve `tsc`/`rolldown` from `node_modules/.bin` without `bunx` prefix.

Cost: out-of-spec scaffold work in Task 6 (Builder's call). Verifier independently reproduced the issue (`verification-report.md` Gate 9 — temporarily reverted the directory move and confirmed `Unknown task typecheck`) and confirmed-keep. Cost was time, not regression — but Phase 1's "typecheck/build commented out" hid it.

Systemic root cause: Phase 1 scaffolded Moon 1.x shape and let `typecheck`/`build` stay commented in CI, so the v1→v2 mismatch never surfaced. Phase 2's job included un-commenting those lines (Task 11.5), which is the exact moment when scaffolding debt becomes scaffolding emergency. CI gates that are commented out aren't gates.

---

## Per-role observations

### Scout

- **Earned its keep?** Yes, decisively.
- **Concrete value:** running `moon project signals` and `tsc --noEmit` against the existing scaffold turned plan-prescription into reproducible-blocker. Scout `scout-report.md` §1.0 + §1.1 are prescriptive *because* they're cited at the bash output level. The Architect inherited a do-list, not a discover-list.
- **Sharpening for Phase 3:** Scout's prior-art survey (§3) gave the Architect five comparison points but didn't include any direct *reading* of competitor source files. Phase 3 (`@scribe/arbor`) prior art is harder (DOM diffing, scope disposal, mount/unmount) — Scout should plan to read at least one comparable lib's source (`@vue/runtime-dom`, `solid-js/web`) end-to-end, not just docs.

### Architect

- **Earned its keep?** Yes — produced a binding spec the Builder consumed without follow-up questions until Verifier caught the Finding 3 contradiction.
- **Concrete value:** the §6 Deviations table is the design-decision audit log. Every override of the plan is numbered, sourced (Scout R-#, Decision #, "Architect (Decision 2B)"), and rationalized. When the Verifier re-audited, this table was the single document needed to confirm "is this divergence authorized?"
- **Sharpening for Phase 3:** add a self-consistency review pass. Re-read prose against the deviations table before declaring spec final. The Finding 3 contradiction (§1.3 prose vs. Deviation 8) would have surfaced at desk time, not at Verifier time.

### Builder

- **Earned its keep?** Yes — eight primary commits + three follow-ups, every gate green at every step, spec compliance 51/51 rows after re-audit.
- **Concrete value:** the manifest's "Verification" section per task gives Verifier evidence to compare against. Builder also caught real ground truth the spec couldn't predict — `builder-blockers.md` §1 (Moon directory layout, `bunx` prefix) was scaffold work outside spec but flagged with rationale and confirmed-kept by Verifier.
- **Sharpening for Phase 3:** when a brief from Team Lead specifies an implementation that doesn't match the codebase, push back *before* writing the code, not after. The equals follow-up (`build-manifest.md` Task 12 note: "Implementation chose Option X … per brief recommendation") chose the brief's preferred mechanism even though it required a structural pivot to make work. A 5-minute "this doesn't fit our forward-subscription model — proposing Option Z instead" would have closed the loop earlier.

### Verifier-code

- **Earned its keep?** Yes — caught the spec contradiction nobody else did, ran the cycle paths via direct `bun -e` script, empirically tested the Moon migration claim by reverting and reproducing.
- **Concrete value:** Gate 9 (out-of-spec change audit) is the canonical "trust but verify" — Builder's `.moon/tasks/` directory move was outside frozen spec, Verifier reverted it, ran `moon run signals:typecheck`, got the error, restored, ran again, got success. Reproducible empirical confirmation, ~5 minutes.
- **Sharpening for Phase 3:** the spec compliance matrix (§3) is gold; sustain it. For `arbor`, where behavior is more emergent (DOM diff fan-out, scope teardown ordering), add a "behavioral matrix" that walks each spec example end-to-end as a runtime check, not just a code-citation check.

### DX Verifier

- **Earned its keep?** Yes — produced a Vue-persona consumption test that surfaced the README gap as the dominant friction (`dx-report.md` §4 Friction #1, severity HIGH) and proposed the actual README starter that became commit `cada859`.
- **Concrete value:** §3 dimension scoring (1–5 across 10 axes) externalizes design quality into something the Architect can reason against without arguing about feel. Total 34/50 with #7, #8, #10 all in the 2-range tells the Team Lead exactly where to invest in v0+1 (devtools, docs, error UX).
- **Sharpening for Phase 3:** §6 ("What I didn't get to") is honest — DX didn't run any code, only read source. For arbor, where DX-of-mounting is mostly behavioral (does the demo Hello-World actually re-render?), DX should run scratch scripts end-to-end. The role's value compounds when scoring is grounded in failed/successful runtime experiments, not just type-shape inspection.

### Team Lead

- **Earned its keep?** Yes — the "interrogate before spawn" gate kept Phase 2 inside frame, the Decision 2B delegation enabled Architect speed, and the Finding 3 adjudication was the right call.
- **Concrete value:** the pre-spawn re-read of plan line 509 (per role briefs cited above) avoided the worst Phase 1/2 boundary violation. Without it, the team would have shipped a stub package and the spec would have had nothing to bind.
- **Sharpening for Phase 3:** when briefing teammates on a design pivot, give the *intent* and the *constraint*, not the *implementation*. The equals follow-up brief specified "Option X: set self STALE on notify" — implementation specifics that didn't match the codebase. Trust the teammate's hands-on knowledge of what the code can do.

---

## Surprises

### Builder's "eager recompute when subs > 0" pivot during the equals wiring

Not predicted by any prior artifact. `verification-report.md` §6 lays out the structural fact: scribe's forward-subscription model has no "I am stale, please ask me again later" channel. The Team Lead's brief (Option X) assumed a pull-based model; the Builder discovered by writing the code that the only correct hookup is "recompute eagerly when subs exist, stay lazy when no one's listening." This is a *structural* fact about the codebase that the spec didn't capture — surfaced only at hands-on-keyboard time. Verifier confirmed correctness across four scenarios (lazy preservation, linear chain, cycle, diamond) and the design held.

### Moon 2.x migration was scaffold debt invisible until Phase 2 turned on the lights

`builder-blockers.md` §1 documents two layers of Moon 1→2 mismatch: per-package `type:` field (Scout caught this) AND `.moon/tasks.yml` single-file vs. `.moon/tasks/` directory AND default Windows shell PATH gaps. The deeper two surfaced only when Builder un-commented `bun run typecheck` / `bun run build` to make CI work. Phase 1's "typecheck/build commented out for now" hid all of it.

### The cycle error class doubles as a batch-overflow indicator

Per Team Lead adjudication B-A (referenced in `build-manifest.md` Task 11.4): the batch drain's 100-iteration overflow throws `SignalCircularError`, not a separate error class. Initially this looked like type-conflation; in practice Verifier confirmed (`verification-report.md` Gate 10) it's clean: the overflow case *is* a real cycle (an effect indirectly writing to its own dep through the batch queue), and surfacing it as the same error class means consumer code only handles one cycle type. Saved an error class; collapsed two failure modes into one well-named one.

### `core.autocrlf` artifact normalization required a one-shot `biome check --write`

`build-manifest.md` Task 6 notes the Phase 1 scaffold had CRLF line endings on Windows checkouts, requiring a one-time normalization. Not a Phase 2 design problem; a Windows-host scaffold problem inherited from Phase 1. The fix is forward-portable: `.gitattributes` with `* text=auto eol=lf` would prevent it. No one owns that follow-up yet.

---

## Phase 3 risks already visible

These are surfaced by Phase 2 evidence, not invented for the retro:

- **`arbor` will need `untrack` / `peek` (deferred per spec §2.5)** — `dx-report.md` Friction #5 (LOW) and `verification-report.md` §6 ("Concern for Phase 3 (arbor): One mild concern") both flag it. Spec §2.5 says: "If arbor (Phase 3) needs `untrack(fn)`, it should be added to `signals` then as a public helper that wraps `setCurrentObserver(null)`." When arbor's Scout runs, `untrack` will likely be the first new public surface request. Add it as a public helper when the consumer arrives.
- **`MountScope.dispose()` composing with effect disposal** — Scout `scout-report.md` R-C3 flagged this: Phase 2's `effect()` returns a single `Dispose` fn; arbor's `MountScope` needs scope-collector semantics. Phase 2 didn't paint into a corner (the disposable returned from `effect()` is the right primitive), but arbor's job is to wrap it.
- **Wide fan-out on the eager-when-observed `computed` model** — `verification-report.md` §6 ("Concern for Phase 3 (arbor)") notes: "For pathological fan-out (one signal feeding 1000 cheap computeds, each subscribed by an effect), the equal-recompute cost is paid even when the result is suppressed." Unlikely to bite v0 (arbor's graphs are shallow, dozens of nodes per route) but worth profiling. Log it in arbor's perf notes.
- **Moon 2.x migration + `bunx` prefixes are now the working setup** — future packages inherit a working scaffold, but `.prototools` Node version is 20.18.0 and Rolldown wants 20.19+ (`builder-blockers.md` "Caveats noted but not blocking"). Not blocking; bump in a follow-up before Phase 3 spawns.
- **CI workflow trigger list is over-narrow** — `verification-report.md` Finding 4 documents that pushes to phase branches don't run CI. Phase 1 hit this once, Phase 2 hit it again. Phase 3 will hit it without a fix. One-line CI change: add the phase branches to the trigger list (or `**` and rely on `paths`).
- **Spec-to-runtime-prose contradictions are an Architect-time bug class** — Finding 3 was the canonical example. Phase 3's spec will be larger (DOM ops, mount scope, lifecycle) and has more surface for a §X.Y prose / Deviation table mismatch. Add the self-consistency review pass before spawn.
