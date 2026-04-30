# Scribe team learnings — project-portable

> **Scope:** This file loads at the start of every future scribe session, not just Phase 3. Each entry is a rule grounded in a specific Phase 2 moment that motivated it. Updated by Historian after each phase retro.

---

## 1. Re-read the plan before spawning a team

**Why.** At the start of Phase 2 the Team Lead almost recommended adding a stub package, which would have smuggled Phase 2 work into Phase 1's frozen scope. Re-reading the plan caught the explicit "no source code yet" boundary at line 509. Without that re-read, Phase 1 would have shipped Phase 2 work and Phase 2's TDD scaffold would have had nothing to do.

**How to apply.** Before spawning any team for any phase, re-read the plan section the team will execute, end to end. The plan was written when context was richer; trust it until evidence says otherwise. Look specifically for boundary statements ("no X yet", "deferred to Phase Y") that mark scope edges.

---

## 2. Spec authors must run a self-consistency review pass before declaring a spec final

**Why.** `ComputedOptions.equals` in spec §1.3 prose ("`equals` … suppresses needless downstream re-runs") contradicted Deviation 8 in the same document ("for API symmetry"). The Builder followed Deviation 8, the Verifier caught the contradiction at gate-walk time as Finding 3, the Team Lead adjudicated, the Builder pivoted with one extra commit (+69 B gz, four new tests). Recoverable, but the contradiction should not have shipped.

**How to apply.** Architect's last step before publishing a spec: re-read the prose body against the deviations table line-by-line. For any field/feature mentioned in both, confirm the deviation rationale matches the prose semantics. If they disagree, fix one and reconcile.

---

## 3. Briefs to teammates give intent and constraint, not implementation specifics

**Why.** The Team Lead's brief to the Builder for the equals follow-up suggested "Option X: set self STALE on notify; cascade on next read" — an implementation that doesn't work in scribe's forward-subscription model (`computed.notify()` propagates only by calling `sub.notify()` on each forward subscriber; there's no separate stale-then-pull channel). The Builder caught it only by writing the code. Near-miss.

**How to apply.** When briefing a teammate on a design pivot, specify (a) the intent — what the code should *do* — and (b) the constraint — what it must not break. Do not specify the mechanism unless you have just-in-time codebase knowledge equal to the teammate's. Trust the teammate's hands-on judgment to choose Option X vs. Option Y vs. Option Z.

---

## 4. Run reproductions, not assertions, when scouting

**Why.** Scout's `scout-report.md` §1.1 didn't say "Moon 2.x rejects `type:`" — it ran `moon project signals` and pasted the actual error output. §1.0 didn't say "TS5097 will fire" — it ran `tsc --noEmit` against the existing scaffold and got the error. The Architect inherited blockers as reproducible facts, not predictions. Every Architect decision in §3 of the spec traces back to a Scout-line reproduction.

**How to apply.** When Scout investigates the in-repo state, run the failing command and paste the output. "Will fail" assertions cost a Verifier round-trip if wrong; reproductions don't. The Architect should be able to re-run the same command and confirm without re-discovering.

---

## 5. CI gates that are commented out aren't gates

**Why.** Phase 1 scaffolded `typecheck`/`build`/`size` as commented lines in CI ("re-enabled in Phase 2 alongside @scribe/signals"). That hid the Moon 1→2 directory-layout mismatch and the `bunx` PATH gap until Phase 2's Task 11.5 un-commented them — at which point both surfaced as build-time emergencies (`builder-blockers.md` §1). The same workflow today only triggers on `main` push/PR, so phase-branch pushes get no CI signal — Phase 1 hit this once, Phase 2 hit it again, Phase 3 will hit it next.

**How to apply.** Two rules, both enforceable: (a) when scaffolding tooling, prove the gate works *now* on a representative file even if there's nothing real to check yet — a `placeholder.ts` is enough. (b) When configuring CI triggers, include the phase branches, not just `main`. If you need to defer a gate, either don't add it, or add it green-but-meaningful — not green-because-skipped.

**Amendment (Phase 3 retro, 2026-04-28).** "Commented out" is just one shape of this bug class. Two more shapes surfaced:

- **Triggers that don't reach the right branches.** Phase 2.5's PR #6 merged with red CI on `main` because the workflow only ran on `main` push/PR — the phase branch never fired CI, the bug landed on `main`, and `main`'s next push (Phase 3 PR #7) was the first time anyone saw red. Fix: include `phase-*/**` and any other working-branch glob in the workflow `on:` clause. Audit branch protection on `main` so a red required check is *un-mergeable*, not "merge anyway."
- **Local PASS that depends on stale `dist` artifacts.** `bench-signals:typecheck` passed locally because `packages/signals/dist` was already built from a prior dev run; in CI's clean checkout it failed (TS2307 — `@scribe/signals` resolves through `package.json` exports to `./dist/index.d.ts`). The Verifier ran every gate locally and reported PASS without a clean-state run. Fix: every Verifier brief includes `bun run clean && bun run <gate>` (or equivalent dist-purge) for any gate whose inputs include build outputs.

The unifying rule: **a gate is only as strong as the environment it runs in, and the environment must match CI.** Commented gates, mis-triggered gates, and stale-artifact gates are all the same failure mode.

---

## 6. Plans drift between authoring and execution; flag stale prescriptions in Scout

**Why.** Plan §542 ("no batching API in Phase 2") and plan §602 (`type: library`) were written 2 days before Phase 2 spawned. By spawn time, both were stale: Architect overrode the batching call with rationale (Decision 1 — arbor needs it on day one), Moon 2.x rejected the `type:` field. Scout's prior-art survey (`scout-report.md` §3) compared five competitor libs the plan didn't reference. Every staleness item required dual edits — code AND plan — to prevent re-introduction.

**How to apply.** Scout's report should include a "plan staleness" section that calls out: (a) any tooling-version assumptions the plan made that no longer hold, (b) any design prescriptions the prior-art survey now contradicts. Architect carries those forward and edits *both* the spec and the plan, never just one.

**Amendment (Phase 3 retro, 2026-04-28).** Specs drift the same way plans do, on a shorter timescale. The Phase 3 spec §3.4 noted `.prototools` pinned `node = "20.18.0"` and authorized a bump in Task 12; the Builder's Task 12 inspection found `.prototools` already at `node = "22.12.0"` — bumped between spec authoring and Phase 3 spawn. The spec was outdated at spawn time, not at execution time.

Apply the same staleness check to specs:

- **Team Lead pre-spawn read includes a "spec vs current state" diff** for any version pins, dependency lists, or environment claims the spec makes. Anything the spec asserts about the repo's current state should be confirmed before Builder spawn.
- **Builder's first action on any task that references repo state re-confirms the assumption** and notes the result in the build manifest (e.g. "spec said X, current state is Y, no action needed" or "X is now Z, deviation logged").
- **Architects run a freshness check before publishing.** Re-read every "current repo state" claim in the spec against `git log --since=<spec-start-date>` and update.

The pattern: any document making claims about the repo's *current* state has a half-life. Plans drift in days, specs drift in hours, briefs drift in minutes. Reconcile against reality at every handoff.

---

## 7. Verifier's spec compliance matrix is not optional — it catches what the gate-runner doesn't

**Why.** `verification-report.md` Gate 1 (test suite green) wouldn't have caught the `ComputedOptions.equals` runtime/spec contradiction — the tests passed because no test exercised cascade-suppression. The matrix-walk in §3 (45 spec rows, each cited to file:line) is what surfaced Finding 3. Tests prove implementation matches itself; the matrix proves implementation matches spec.

**How to apply.** Every Verifier audit ends with a numbered spec-compliance matrix: each binding line in the spec → file:line in the implementation → PASS/FAIL. For specs with prose semantics (not just type signatures), include behavioral rows that walk the example end-to-end. Scrolling the table is the audit's truth-source.

---

## 8. When spec authorizes out-of-frozen-scope work, document rationale and have Verifier confirm-keep

**Why.** Builder's Moon 2.x migration (`.moon/tasks.yml` → `.moon/tasks/tasks.yml` + `bunx` prefix) was outside spec §3 but documented in `builder-blockers.md` §1 with full rationale. Verifier reproduced the necessity (Gate 9: temporarily reverted the directory move and re-ran `moon run signals:typecheck` → got `Unknown task typecheck`, restored, ran again → success). Confirm-keep with empirical evidence.

**How to apply.** Builders may exceed frozen scope when a tooling/scaffold blocker is in front of them, *if* they (a) write a builder-blocker note with the symptom, root cause, fix, and verification, and (b) trust the Verifier to either confirm-keep or flag for revert. Builders never "silently expand scope" — the blocker note is the contract.

---

## 9. Trust hands-on-keyboard discoveries over advance-of-time predictions

**Why.** The Builder's "eager recompute when subs > 0" pivot during the equals wiring (`build-manifest.md` Task 12) is a structural fact about scribe's forward-subscription model that no prior artifact captured. The spec couldn't have predicted it; only writing the code surfaced it. Verifier traced four scenarios (`verification-report.md` §6: lazy preservation, linear chain, cycle, diamond) and confirmed correctness.

**How to apply.** When a teammate at the keyboard discovers that the briefed approach doesn't fit the codebase, document the discovery in the manifest (or blocker note) with the structural reason, and let the implementation deviate. Don't force the brief through. Verifier will trace correctness; that's their job. Predictions made before keyboard time should always defer to facts discovered at keyboard time.

---

## 10. Runtime packages are in-house; the 4 KB budget is the enforcement mechanism

**Why.** The Phase 3 spec session surfaced "should we vendor alien-signals?" as a real question. Answer: no, and the reason isn't NIH — it's that scribe's thesis (signals → resumability → MCP-observable state → AI profile-guided optimization) requires *evolving* the primitive, not consuming it. Vendoring alien means forking alien for every thesis feature. Building it ourselves means every feature is just a feature. The 4 KB total bundle budget (v0 spec §6.6) makes the constraint structural, not preferential.

**How to apply.** Three rules:
- Code that **must evolve to deliver the thesis** (signals, arbor, hydration, MCP-shaped agent surface) is in-house. No exceptions; vendoring is forking.
- Code that **is commodity and not on the thesis path** (build tools, test runners, YAML parsers, Rust crates the compiler uses) is vendored ruthlessly.
- Code that **is a published protocol with a reference SDK** (MCP, GraphQL, etc.) uses the reference SDK at integration boundaries — but adapter layers in front of it must be ours so we can shape the agent ergonomics.

When in doubt, ask: "would vendoring this prevent us from shipping a thesis feature?" If yes, build in-house. If no, vendor.

---

## 11. Every runtime PR drops bench receipts; we beat SOTA on a named axis or we don't ship

**Why.** "We're fast" is a vibe. The Phase 2 spec promised a bench gate (v0 spec §11.2 lists one) but it was loose. The Phase 3 spec session locked an aggressive R&D performance posture (Learning #10's companion): scribe is positioned as runtime-reactivity research, not just an app framework. That commitment requires CI-enforced numbers, not aspirational ones.

**How to apply.** The Phase 2.5 bench-spike brief (`.team/phase-2-5-bench-spike.md`) operationalizes this. After the bench harness lands:
- Every runtime PR runs `bench/<package>/RESULTS.md` regression checks. Regression ≥10% on `p50` of any workload fails CI.
- Every PR claiming "this makes runtime faster" must drop bench receipts in the PR description, and update `RESULTS.md` and `CHANGELOG.md` in the bench directory.
- Performance is measured against the state of the art in the same release — alien-signals, Solid, Vue's `@vue/reactivity`, Preact signals. If we are not competitive on at least one axis (size, speed-on-real-workload, capability), the package ISN'T done.
- "Real workload" includes wide-fanout (Phase 2 retro's canonical concern) and arbor-shaped DOM updates. Synthetic micro-bench alone is necessary but not sufficient.

Override path: PR commit message containing `[bench-bump]` lets a regressing change land when correctness requires it. Justify in the PR description.

---

## 12. Functional components are the user-facing model; the compiler emits classes

**Why.** Phase 3 spec session pivot (User decision, 2026-04-26): user-facing component model is functional (`defineComponent(setup)`), separated by concerns, type-safe end-to-end. But v0 spec §7.2 locks the compiler to emit `class extends HTMLElement` (Custom Elements API requires a constructor). This means scribe has a **two-layer authoring model** (spec-arbor.md §0):

1. **Compiler-emission layer** — Rust compiler reads `.scribe` SFCs, emits classes calling arbor primitives directly. Minimal-byte. Never calls `defineComponent`.
2. **Hand-author layer** — humans write `defineComponent(setup)` for tests, examples, hand-authored components. Functional. Internally produces a class consumable by `defineElement`.

The two layers interoperate: both produce `class extends HTMLElement` registered via `defineElement`.

**How to apply.** When designing any user-facing API in scribe, ask: "is this what users *write*, or what the compiler *emits*?" If it's user-written, it must be functional, type-safe, and ergonomic. If it's compiler-emitted, it must be byte-minimal and direct. Don't conflate the two layers — `defineElement(name, Ctor)` is for the compiler; `defineComponent(setup)` is for humans.

**Concrete v0 mapping:**
- `@scribe/arbor` exports primitives (`branch`, `leaf`, `mount`, `MountScope`) that the compiler emits direct calls to. No functional wrapper.
- `@scribe/runtime` exports `defineElement(name, Ctor)` for compiler use AND `defineComponent(setup)` for hand-authoring.
- `.scribe` SFC files are the dominant user-facing surface; hand-authored components are a secondary surface for tests/examples/escape-hatch usage.

---

## 13. Module sizing rule: 150-line cap, one concern per file, named by concern

**Why.** Phase 3 spec session decision (2026-04-26): scribe's source code must be deterministically navigable by both human readers and AI agents. "Where does X live?" must have exactly one answer findable from filename alone — no grep. Empirical grounding (alien-signals, @preact/signals-core, @vue/reactivity, lit-html, solid-js): the median module size in well-architected small TS frameworks is 80–150 lines; outliers above 200 are reliably the hardest files for first-time readers to navigate.

**How to apply.** Every TypeScript module in scribe runtime packages:
- **≤ 150 source lines** (excluding blank lines and standalone JSDoc blocks). Aim for 80–120; allow up to 150 before splitting becomes mandatory.
- **One concern per file.** A module that defines both `signal()` and `computed()` is two concerns; split.
- **Named by the concern, not the type.** `effect.ts`, not `functions.ts`. `cycle.ts`, not `helpers.ts`. `branch.ts`, not `nodes.ts`.
- **Public re-exports live in `index.ts` only.** No module re-exports its siblings. Internal symbols are `/** @internal */` and never appear in `index.ts`.

Phase 2's `@scribe/signals` shipped before this rule landed; it should be refactored to comply when a small refactor PR makes sense (probably alongside the Phase 2.5 bench-spike, since the bench harness already touches signals' internals).

---

## 14. Specs from prior sessions can drift between authoring and execution; new sessions must reconcile

**Why.** Phase 3 spec session: three Architects spawned in parallel produced specs that subtly disagreed on `host` parameter typing (`Element` vs `ShadowRoot`), `MountScope` shape, `mount()` re-mount semantics, and `defineElement` call shape. Architect B's spec listed 10 open questions (Q1–Q10) about Architect A's surface; reconciliation was the Team Lead's job and required 30 minutes of cross-spec walking after both landed. The friction was inherent — each Architect operated in isolation per the parallel-spawn brief.

**How to apply.** When parallel sub-agents produce specs that consume each other's APIs (one spec's runtime imports another spec's primitives):
- Each spec authors a §7 "Open Questions" list of every assumption they made about siblings' APIs.
- The Team Lead post-spawn walks every "Open Question" against the actual produced sibling spec. Each question gets one of: (a) "A answered B's way → no action," (b) "A answered differently → user picks one and the other rewrites," (c) "A didn't answer → escalate to user."
- The Team Lead's cross-walk takes ~10 min per pair of specs in scribe-sized packages. Budget it.

Don't try to prevent the friction by pre-coordinating Architects. Pre-coordination via shared brief is brittle (drift); cross-walk reconciliation via Open Questions is robust (drift surfaces explicitly).

---

## 15. AI-first means in-tree binding, not MCP-only

**Why.** Phase 3 spec session decision (2026-04-26): the user named the load-bearing AI principle and contrasted it with MCP-server-only architectures. The truth source for agent capabilities is `<agent>` blocks in `.scribe` SFCs (already in v0 spec §9), not external MCP server registries. MCP is one *adapter* of the in-process binding layer, not the foundation. This solves three concrete MCP criticisms: (1) agents forget tools they haven't used; (2) responses are opaque snapshots, not subscribable handles; (3) JSON-RPC tax for in-process work.

**How to apply.** Three rules:
- **The in-tree primitive ships first; the MCP adapter ships second.** Sub-project #7's brief is reframed: build the binding layer that addresses signals by path identity (arbor §2.7), then expose it over MCP for cross-process agents.
- **Agents need a live data feed, not a JSON snapshot.** Where a tool returns a value, prefer returning a subscribable handle (the signal itself, addressed by path key from arbor §2.7). Static-snapshot tools are for stateless lookups only.
- **The build-time capability manifest is a single artifact.** The compiler emits one `dist/agent-manifest.json` describing the whole app's agent surface — the registry that `@scribe/agent` aggregates per-component is the runtime-side complement, not the only source.

This direction reshapes sub-project #7 from "MCP server" to "binding layer + MCP adapter + manifest aggregation."

---

## 16. v0 sets up Tier 3 hooks even when v0 doesn't consume them; retrofit cost is prohibitive

**Why.** Phase 3 spec session decision (2026-04-26): aggressive R&D performance posture means v0 must not paint into a corner that prevents Tier 3 wins (resumable hydration, AI PGO, MCP-observable state). Three Tier 3 hooks are mandatory in v0 even with no v0 consumer:
- **Subscription identity (arbor §2.7)** — every `_mountEffect` carries a stable path key. Sub-project #6 (resumable hydration) maps serialized graphs to live subscriptions via these keys; sub-project #7 (agent binding layer) addresses signals by path. Without this, both are blocked.
- **Telemetry hooks (arbor §2.8)** — `_observeMount` is a no-op in production, dev-mode replaces it. Sub-project #10 (AI PGO) consumes the events. Tree-shaking eliminates production cost.
- **Hidden-class shape locking (arbor §2.9)** — `Branch` and `Leaf` always have the same fields (nulls for absent). V8 inline-cache friendly. ~30% faster on V8.

Total v0 cost: ~25 B gz + minor Builder discipline.

**How to apply.** When designing any v0 surface for a thesis-feature stack (arbor, signals, future runtime packages):
- Identify which sub-projects depend on what hooks (resumability, PGO, MCP, etc.).
- Cost the hook implementation in v0. If under ~50 B gz total, ship it now.
- Retrofit cost dominates: subscription identity added in v1 means re-walking every mounted tree, which is expensive and error-prone. Hidden-class shape locking added in v1 means rewriting every node constructor.
- Document the v0 hook with a "v0 commitment" note: "Builder ships this even with no consumer; sub-project #X consumes."

---

## 17. Magna is the canonical scribe backend; integration is research-led, not bolted on

**Why.** Phase 3 spec session reveal (2026-04-26): scribe is being designed alongside fellwork/magna (a fast Rust GraphQL-from-Postgres engine, dual-licensed MIT/Apache, technical-preview status). Magna runs server-side; scribe's runtime is browser-side. They are designed to be used *together* as a high-performance stack — not "scribe with optional magna integration."

**How to apply.** Five integration angles to research and ship over time (none gating Phase 3):
- **High-performance data:** zero-copy from magna's GraphQL response buffer into signal-bound state.
- **Hydration coupling:** magna's deterministic responses + arbor's subscription identity (§2.7) = signal-graph resumability. Path keys on the JS side map to magna query identities.
- **Schema introspection:** magna auto-generates GraphQL schemas from Postgres; scribe can derive TypeScript types from that schema at build time.
- **Agent work:** unified capability manifest (Learning #15) = `<agent>` blocks per-component + magna introspection schema-wide. Agents loading the manifest get the complete picture.
- **Build-time tooling:** Rust scribe-compiler can validate `.scribe` queries against magna's schema at compile time, surfacing diagnostics in the Vite overlay.

**Sub-project #4 (data layer) is "magna integration with a clean escape hatch for non-magna backends" — not "generic data adapters."** Tight integration is the canonical path; users who want REST or tRPC can use scribe but won't get the resumability/manifest/build-time wins.

**The bench-spike (`.team/phase-2-5-bench-spike.md`) ships two tracks: vanilla scribe vs SOTA JS, and scribe+magna end-to-end.** The two-track posture operationalizes "magna is canonical" without making magna a hard dep for non-data-app uses of scribe.

---

## 18. Self-contained launch briefs survive session boundaries; one-line task pointers don't

**Why.** Phase 3 launch brief (`.team/phase-3-launch.md`) was readable cold by a fresh session two days after authoring. Phases 1 and 2 of the original implementation plan had no equivalent — they were one-line items on a long list. The launch brief format makes a session resumable; the line-item format makes a session re-spawnable from scratch.

**How to apply.** Every multi-step session that won't be done in-conversation needs a self-contained brief in `.team/<descriptive-name>.md`:
- Why this session exists (what problem it solves)
- Source-of-truth docs (every reader must read)
- Decisions inherited from prior sessions
- Roster (who does what)
- Step-by-step spawn instructions
- Hard stops
- What this session does NOT do
- Token / wall-clock ceilings
- Final pre-spawn checklist

The Phase 3 launch brief and the Phase 2.5 bench-spike brief are the templates. New sessions follow the template.

When the work is small enough to fit in one conversation (a Builder shipping a single feature), no brief is needed. When the work spans agents (Architect → Builder → Verifier) or sessions (this conversation → next conversation), a brief is the contract.

---

## 19. Pattern B with batched Builder spawns is the M-scope default for scribe

**Why.** Phase 3 (`@scribe/arbor` orchestration, 2026-04-28) ran nomos v3.0 Pattern B with 5 sequential Builder spawns of 1–3 tasks each, deliberately calibrated to the prior session's 600s no-progress watchdog. Result: no Builder stalled, the longest spawn (batch 4: mount + dispose) clocked ~1072s of agent runtime distributed across many sub-actions, and atomic per-task commits meant any single batch failure would have cost minutes rather than hours. The alternative — one mega-spawn of "implement all of arbor" — would have been watchdog bait, with the entire context of a half-finished package lost on a single timeout.

**How to apply.** For any nomos M-scope or larger session in scribe:

- **Batch Builder spawns at 1–3 tasks per spawn.** A "task" is a unit defined in the spec's task list (e.g. spec §4 Task 13). 1 task per spawn for any task involving a non-trivial design decision; 2–3 tasks per spawn when the tasks are tightly coupled and share context.
- **Atomic per-task commits, never batched.** Each spec-task gets exactly one commit (plus follow-up SHA-backfill commits per Learning #20). The Builder lands the commit before moving to the next task within the batch.
- **Per-instance amend ban.** No Builder instance amends a commit from a prior instance. Use SHA-backfill commits instead.
- **Sequential, not parallel, within a single Builder agent.** Parallel Builder spawns are reserved for non-overlapping packages/files (the cellx + arbor pattern in Phase 3) — never for tasks within the same package.

The watchdog is a feature, not a bug: it forces sessions into resumable units. Pattern B + batching is how you stay below the watchdog without losing context.

---

## 20. SHA-backfill commits are the right answer when subagents can't amend

**Why.** Phase 3 enforced a per-instance amend ban — no Builder instance amends a commit from a prior instance. This collided with the build manifest's design: each task entry lists the SHA of the commit that landed the task, and the spec required entries written *during* the task (not retro-filled at end of phase). Solution: when a manifest entry needed the SHA of a just-created commit, the Builder created a follow-up `docs(phase-3): backfill <task> SHA in build manifest` commit. Five such backfill commits in the final history. Total cost: 5 extra commits. Total benefit: every `HEAD~N` checkout has a manifest matching the actual code at that revision; rollback is well-defined; per-task atomicity preserved.

**How to apply.** When a spec or process requires a document to reference a SHA that doesn't exist until *after* the document is written:

- **Write the document with a placeholder SHA** (`<TBD>` or the committed file's pre-commit hash from `git hash-object`).
- **Land the document commit first** so the work commit's tree is clean.
- **Land the work commit.** Now the work-commit SHA exists.
- **Land a `docs: backfill <work> SHA` commit** that updates the placeholder to the real SHA.

Three commits per task, but every revision is internally consistent. Cheaper than amend-related history rewrites, atomic, and reviewable. Use this pattern any time subagents are forbidden from amending and a doc needs to reference a not-yet-existent SHA.

---

## 21. Builder Option A — defer dependency-coupled tests to the dependency-landing batch

**Why.** Phase 3 spec §4 Tasks 13/14/15 each listed unit tests that required `mount()` (Task 16) to exist. The Builder's choices were: (a) write stub tests now, replace later (high churn, easy to forget the replacement); (b) skip the tests entirely and add a TODO (coverage gap risk); (c) Option A — write the directly-testable subset of each task's tests now, fold mount-coupled tests into `mount.test.ts` when mount lands. Option A shipped: the Verifier's 71-row spec-compliance matrix mapped every spec test to its actual location and confirmed 100% coverage with zero gaps. The "test relocation" deviation was logged in the build manifest.

**How to apply.** When a spec lists tests that require not-yet-built dependencies:

- **Name the pattern explicitly in the spec or Team Lead brief.** "Builder Option A — write the directly-testable subset for this task now; fold dependency-coupled tests into the dependency's test file when it lands. Document the relocation in the build manifest."
- **Builder logs the relocation as a deviation in the build manifest** with the source-task ID, target-test-file, and reason. Format: `Task N test #M relocated to <file>.test.ts because <dependency> not yet built at Task N execution time.`
- **Verifier's compliance matrix follows the relocation.** Each spec-listed test gets one row, citing the actual file:line where the test lives — not where the spec said it would live.

Option A beats stub-and-replace because there's never a wrong test in the tree; it beats skip-and-TODO because there's never a coverage gap. The cost is one deviation row per relocated test — cheap.

---

## 22. Spec tree-shake claims must be verified with a real bundle before publishing

**Why.** Phase 3 spec §2.8 promised telemetry hooks would have "production cost is **zero bytes**" because Rolldown would tree-shake the no-op `_observeMount` calls. Reality after build: ~100–150 B of telemetry remained in the production bundle. Two root causes the spec author missed: (1) `Date.now()` is not pure from a tree-shake perspective — Rolldown can't prove the call is side-effect-free without explicit annotation; (2) `_observeMount` is `export let` (mutable binding visible to external consumers via `_setMountObserver`), so its call sites can't be statically eliminated even when the default is a no-op. The spec correctly placed a `bun run size` gate to catch this (§2.8) — but the headroom was 43%, so the deviation was accepted as "v1 fix" instead of "land the fix now." Investigation later showed the fix is one line (`output.minify: true` in `rolldown.config.ts`), recovering ~80 B with no source change.

**How to apply.** When a spec makes a tree-shake or dead-code-elimination claim:

- **Run a real bundle before publishing the spec.** Stub the API, build it with the production config, inspect the output. "I expect Rolldown to eliminate this" is a hypothesis; a passing `bun run size` against a stub is a contract.
- **Annotate side-effect-free calls Rolldown can't prove.** `Date.now()`, `performance.now()`, and any external call need `/* @__PURE__ */` (or equivalent) at every call site, or the bundler keeps the call.
- **Avoid `export let` for tree-shake-sensitive symbols.** Mutable bindings defeat dead-code elimination because external code may swap the value at runtime. If you need a swap-out hook for testing/dev, gate it behind `__DEV__` or a build flag instead.
- **The headroom-to-budget ratio shapes adjudication.** With 43% headroom, ~120 B of bloat is "land it later"; with 5% headroom the same bloat is HIGH severity. Specs with tight budgets get tighter tree-shake gates.
- **Where v0 has slack, prefer "land the fix now" over "v1 cleanup."** A v1 cleanup is a debt that drags forward; a 5-minute fix during the original spawn is free.

The pattern: every byte claim is empirical. Specs that hand-wave bundle behavior are specs that miss budgets six months in.

---

## 23. JSDOM environment gaps block solid-js and @vue/runtime-dom

**Why.** Round N+1 bench/arbor harness: solid-js/web's `render()` calls browser-only APIs and throws "Client-only API called on the server side" in JSDOM. `@vue/runtime-dom` throws `SVGElement is not defined` at module load time. Both errors surface before any bench iteration. JSDOM's DOM implementation is incomplete relative to browser APIs that these libraries assume are present.

**How to apply.** Any bench harness that runs under Bun/JSDOM must pre-qualify each competitor before including it in results tables. Competitors that throw at module load or first render should be marked ERROR and documented with the exact error string (as in `bench/arbor/RESULTS.md`). A real-browser runner (Playwright or browser-native Bun) is required before solid-js and @vue/runtime-dom can contribute to arbor comparisons. Deferred to Round N+2. Don't block the harness on fixing JSDOM — the gap is in the environment, not the harness.

---

## 24. `textContent` vs `nodeValue` performance gap in JSDOM

**Why.** Round N+1 `update-1-of-10k-leaves` result: scribe 25 ns p50 vs vanilla 3.1 µs (122× faster). Root cause: `element.textContent = v` is a multi-step DOM operation — JSDOM walks the child list, removes existing text nodes, and creates new ones. `textNode.nodeValue = v` is a direct property set on the already-existing text node. Arbor's `leaf(signal)` uses `nodeValue` internally via `materialize.ts`. The vanilla comparator used `textContent` on the element parent, not `nodeValue` on a pre-created text node.

**How to apply.** When designing DOM-binding benchmarks, distinguish between the bind target (`element.textContent` vs `textNode.nodeValue`) and the signal system. A "text update" benchmark that measures `textContent` is benchmarking DOM surgery, not signal dispatch. Always pre-create text nodes and use `nodeValue` for reactive-text benchmarks. The 122× gap is real but environment-specific — the ratio will be smaller in a real browser where `textContent` has a faster implementation. Document the bind target in HARNESS.md so readers know what axis is being measured.

---

## 25. Memory bench under V8/Bun: GC timing noise dominates small graphs

**Why.** Round N+1 signals memory runner: `buildHeapDelta` is zero or near-zero for all small-graph workloads (cellx, batched-writes-100, dynamic-deps, creation-1to1000). The `--expose-gc` protocol calls `gc()` before each measurement, but V8's young-gen GC runs between object allocations during the build phase itself — by the time the post-build heap snapshot runs, prior-iteration objects have already been collected. Only `wide-fanout-100` (1 signal → 100 computeds → 100 effects, N=1000 graphs) produces a stable signal: 38.82 KB/graph build delta, 100% residual, consistent across runs.

**How to apply.** For reliable memory measurement: (a) use large N for large graphs; (b) or use an aggressive quiesce protocol — `gc({ execution: 'async', flavor: 'last-resort' })` plus a delay after each phase before snapshotting. The current protocol is correct for wide-fanout-shaped workloads and should be documented as such. Don't treat zero `buildHeapDelta` as "uses no memory" — treat it as "below GC-quiesce resolution." Add a note in HARNESS.md that zero values are GC-noise artifacts, not measurements. Round N+2 can improve the protocol if memory comparisons become load-bearing.

---

## 26. scribe is tuned for shallow diamond propagation; deep-chain is the gap

**Why.** Round N+1 `deep-propagation-100` (100-deep linear chain `src → c0 → c1 → … → c99 → effect`): scribe 4.0 µs vs alien-signals 2.4 µs (1.65× slower). But `dynamic-deps` (1 computed reads 5 of 50 signals, rotating fan-in/fan-out): scribe 742 ns vs alien 1.21 µs (scribe wins 1.6×). The structural reason: scribe's forward-subscription model re-wires the subscription set on every dependency rotation — which is exactly what `dynamic-deps` exercises. Alien-signals' push-pull with version counters handles long chains more efficiently by short-circuiting at version equality; scribe must propagate through each node in the chain.

**How to apply.** Scribe's performance posture: wins on dynamic-dependency graphs (fast re-subscription), shallow diamonds (low per-hop overhead), and batched writes (batch coalescing). Loses on deep linear chains (propagation path is long, no version-equality short-circuit). The cellx win is a shallow-diamond shape (5-deep); the deep-chain gap is the natural counterpart. Document this as a design-point trade-off in RESULTS.md and the v0+1 signals work brief. When optimizing signals in v0+1, deep-chain propagation is the named axis to close — investigate alien-signals' version-counter approach as a candidate.

---

## 27. krausest-in-JSDOM: vanilla wins on 1k-cycle because it skips signals entirely

**Why.** Round N+1 `krausest-1k-cycle` (1k-row table, full mount+update cycle): vanilla 16.1 ms, scribe 20.9 ms (~30% overhead), preact 19.7 ms (near-tie). Vanilla builds the table with direct `createElement` + `textContent`, no reactive layer — zero subscription bookkeeping. Scribe mounts 2k signals (1 per text cell, 2 cells × 1k rows) plus 2k `_mountEffect` subscriptions. The overhead is the cost of wiring a reactive graph over the entire mounted tree.

**How to apply.** The 30% overhead vs. vanilla is the "you're paying for reactivity you're not using on mount" cost. The payoff is visible in `update-1-of-10k-leaves`: when you update 1 of those 2k signals, scribe pays 25 ns while vanilla pays 3.1 µs (vanilla must re-walk the DOM). The two numbers together define scribe's design point: moderate mount overhead, wins hugely on targeted updates. Any PR that worsens the krausest overhead beyond 40% vs vanilla should be scrutinized — that's the acceptable-overhead ceiling. The current 30% is within budget.
