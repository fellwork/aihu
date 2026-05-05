# Director Note — v1 Plan Reconciliation (Session Start)

**Date:** 2026-05-02
**Trigger:** User-queued planning session post data-fix close ("When do we go back to the planning for improving the aihu plan in comparison to the vertical slice plan")
**Mode:** 2 (planning-heavy; output is Markdown roadmap, not feature code)
**Iteration budget:** ≤ 5 rounds
**Constraints:** Selective lean (Vite is dev/build-only); v3 dep-free thesis (Learning #49); Nuxt/Next parity is the substance bar
**Main HEAD at start:** `7fa0957` (post-server-native + arbor externalization fix)

---

## TL;DR

We are converting `.team/v1/plan-v1-roadmap.md` (working scratch on feature branches) into the authoritative roadmap that lives next to `plan-a-ts-runtime.md` in `docs/superpowers/plans/`, then auditing it against Nuxt/Next baseline and slotting the genuinely-missing categories (layouts, middleware, auto-imports, i18n, SSG, asset/image/CSS pipeline, devtools, plugin/module system) across **v1.1 / v1.5 / v2 / v3** under the v3 dep-free thesis as a hard constraint. Output is **a single `framework-roadmap.md` plus one specialized companion (`plan-v1.5-assets.md`)** because `@aihu/assets` is the heaviest unique-to-framework lift and warrants its own design track. `@aihu/assets` lands in **v1.5** (post-v1 ship) split across `@aihu/image`, `@aihu/fonts`, `@aihu/css-pipeline`. Magna gets the **v2 `@aihu/magna` package**; v1 `@aihu/data` stays fetcher-shape with raw fetch (no GraphQL client deps). The session can run autonomously after Round 2 with surface conditions enumerated below.

---

## State at session start (load-bearing)

The state file (`state-plan-a.md`) is one merge cycle behind reality. Verified facts on `main = 7fa0957`:

- **All 8 in-flight v1 feature branches have merged.** PRs #18 (scoped-styles), #20 (slots), #21 (router), #23 (agent-service), #24 (HMR), #25 (hydration), #26 (islands), #27 (server-native) are all on main. The only remaining remote feature branch is `feat/arbor-n2-dev-gate` (already merged at `e94d7b1`). `git ls-remote origin` confirms zero `feat/v1-*` branches alive.
- **Packages on main:** `agent`, `agent-readiness`, `arbor`, `compiler`, `context`, `data`, `runtime`, `server`, `signals`. Notably already shipped: `@aihu/context`, `@aihu/data`, `@aihu/server` (with rust napi-rs SSR core + 3-state loader, PR #27).
- **Recent work since data-fix close:** Track D server-native shipped (`0af3ccb`); arbor externalization fix + 176 B Compressor recovery shipped (`e94d7b1`). The "dormant arbor externalization defect" item from state-plan-a.md is **CLOSED**.

This rewrites Decision 6 substantially: most "schedule the merge order for `feat/v1-*` branches" work in the original brief is moot. The roadmap reconciliation can focus on **what's still missing vs. Nuxt/Next** rather than **what to ship next from the v1 plan**.

---

## Decision 1 — Authority migration (RATIFIED: MIGRATE)

**Choice:** Migrate `.team/v1/plan-v1-roadmap.md` → `docs/superpowers/plans/2026-05-02-aihu-v1-framework.md` with rewrites for Nuxt/Next parity audit + Learning #49 constraints. Keep `.team/v1/` as implementation working scratch (build manifests, director notes, retros). Migrate `spec-v1-architecture-ratified.md` → `docs/superpowers/specs/2026-05-02-aihu-v1-framework-architecture.md`.

**Rationale:**
- The plan currently lives only on feature branches — most of which are now deleted. Authority gap is structural: even merged work has no canonical reference doc on `main`.
- Plan-a's pattern (plan + spec + state + learnings) is well-understood; mirroring it for v1 reduces cognitive load.
- The plan needs substantial rewrite anyway (mark shipped items, add gap items, apply Learning #49) — bundle the migration with the rewrite.

**Builder scope (Round 4 conditional):** Two file moves with rewrites + reference updates in:
- `state-plan-a.md` "Durable references" section
- `docs/superpowers/plans/2026-04-24-aihu-v0-plan-a-ts-runtime.md` staleness banner (point forward to v1 plan)
- `CLAUDE.md` if any v1 reference needs adding

This is a small Builder dispatch (~50 lines of doc edits), not a full feature build.

---

## Decision 2 — Roadmap document shape (RATIFIED: SINGLE + ONE COMPANION)

**Choice:** Single `2026-05-02-aihu-v1-framework.md` covers v1 / v1.5 / v2 / v3. One companion: `2026-05-02-aihu-v1.5-assets-package.md` for `@aihu/assets` design (deferred to its own design session).

**Rationale:**
- Single doc keeps the "one trajectory readers follow" coherence the user-facing plan-a achieves.
- `@aihu/assets` is genuinely the largest novel design surface (Sharp-at-build-time, font subsetting, critical-CSS extraction, postcss orchestration without runtime deps); breaking it out lets the main roadmap stay focused on framework features without burying the assets section in design depth.
- Three+ docs would fragment authority (the `.team/v1/spec-v1-architecture-ratified.md` is already an example of split docs creating "where do I look" friction).

**Document structure (skeleton for Architect):**
```
# aihu v1+ framework roadmap
## v1 (already shipped — receipt section)
## v1.1 (small carry-overs: error boundaries, TS template type-check)
## v1.5 (assets pipeline + DX hardening)
## v2 (layouts, middleware, plugin system, magna integration, i18n, SSG, devtools)
## v3 (dep-free cutover + adapter-zero stack)
## Cross-cutting: Learning #49 dep-budget table per package
## Out-of-scope: items deferred indefinitely (named with rationale)
```

---

## Decision 3 — `@aihu/assets` scope (RATIFIED: v1.5, three sub-packages)

**Choice:** Split into `@aihu/image`, `@aihu/fonts`, `@aihu/css-pipeline`. All target **v1.5** (first post-v1 milestone). Not in v1 scope.

**Rationale:**
- "Nuxt/Next parity out of the box" is the user's bar, but v1 is close enough to ship without assets if v1 gets cut at the right line. v1 already has: SSR streaming, hydration, islands, router, scoped styles, HMR, error boundaries (via PR #25 + downstream). That's enough for the consumer who says "I want a real framework today" with a "v1.5 brings asset optimization" commitment.
- Putting assets *in* v1 risks the v1 cutover never happening (per state-plan-a.md item 7.1, v1 cutover is gated on Phases 1–5). The user explicitly authorized "shipping the v1 cutover unblocks consumers" thinking via the data-fix session staleness banner work.
- Three sub-packages because the concerns are genuinely separable:
  - `@aihu/image`: build-time Sharp wrapper + responsive `<aihu-image>` component (zero runtime deps).
  - `@aihu/fonts`: subsetting + preload directives + CSS `@font-face` codegen (build-time fontkit; runtime is just generated CSS).
  - `@aihu/css-pipeline`: PostCSS/Tailwind orchestration via the compiler; emits flat CSS (no runtime PostCSS, no Tailwind runtime). Vite calls into the compiler, not the other way around.
- Splitting means each package has its own size-limit gate, its own learnings, its own roll-forward path. `@aihu/css-pipeline` may even be compiler-internal rather than a published package; the v1.5 spec session decides.

**Companion doc** (`plan-v1.5-assets-package.md`) names these sub-packages, sketches dep-tree (build-only Sharp/fontkit/postcss are fine; runtime imports = `@aihu/*` only), and sets aside the design session for after v1 cutover. This roadmap does NOT design `@aihu/assets`; it scopes and slots it.

---

## Decision 4 — Magna integration line (RATIFIED: v1 raw-fetch, v2 `@aihu/magna` package)

**Choice:**
- v1 `@aihu/data` stays fetcher-shape — the user supplies `fetcher: (key) => Promise<T>`. `@aihu/data` is local-only / cache-only / SSR-rehydration-aware. **Zero magna coupling.**
- v2 introduces `@aihu/magna` package. Layer over `@aihu/data` that does GraphQL serialization manually (raw fetch + JSON.parse + a tiny query string builder, ≤300 B gz target). No Apollo, no urql, no graphql-js, no graphql-request. Hand-rolled `gql\`...\`` template literal that does string interpolation only (no AST parsing — just preserves the query text and a parameters object).

**Rationale:**
- Learning #49 forbids GraphQL client deps. Hand-rolling a minimal protocol layer for magna is feasible because magna is the canonical backend (Learning #17) — we control both ends, so we don't need full GraphQL spec compliance.
- v1 `@aihu/data` already shipped (PR #21 era; `packages/data/` exists with 711 B / 750 B headroom). Adding magna integration to it now would force a size-budget reopening and tangle two concerns. Cleaner to leave v1 data alone and add the magna layer as a separate v2 package.
- "Raw fetch in `@aihu/data` + magna-shaped fetcher in user code" is the v1 escape hatch — users who want magna can write `fetcher: (key) => fetch('/graphql', { body: gqlString }).then(r => r.json())` themselves. We document the pattern but don't bundle it.

**v3 thesis check:** `@aihu/magna` runtime imports = `@aihu/data` + `@aihu/signals` only. Build-time can use `@aihu/compiler` for query validation if we choose. PASS.

---

## Decision 5 — Surface conditions for autonomous operation

The user has been alternating between in-conversation and autonomous mode (last autonomous-mode session ran A → C → F successfully under Director chain; data-fix session was orchestrated. Both had clean track records — 0 forced-surface fires in autonomous-mode; 0 in data-fix). This session can run autonomous after Round 2 (Architect draft) lands. **Mandatory surface to user before proceeding** if any of:

1. **Architect picks an architectural direction that is user-reserved (Learning #41 territory).** Specifically:
   - Public API shape of `@aihu/router` (route-tree representation, dynamic-segment syntax, middleware signature)
   - Public API shape of `@aihu/data` v2+ extensions (resource graph topology — same Learning #41 hazard)
   - Plugin/module system surface (`defineNuxtModule`-equivalent shape)
   - Layout system shape (file-based vs component-composition vs both)
2. **Any roadmap item that requires a new npm runtime dep before v3.** Hard stop. The Architect must either rewrite the entry to be hand-rolled or surface for v3-thesis exemption.
3. **Any decision that contradicts plan-a.md or the v0 vertical-slice spec without explicit user authorization.** Specifically, anything that retroactively changes v0 invariants (signals semantics, arbor mount lifecycle, scope-collector) is OUT.
4. **Any decision that re-opens a closed v0 size budget** (signals 1970 B, arbor 2200 B, runtime 1024 B, agent 200 B, data 750 B, context 300 B). The roadmap may *reserve* future bytes for v1.1+ work but cannot retroactively raise v0 limits.
5. **More than one new package per phase.** v1.5 already has `@aihu/image` + `@aihu/fonts` (+ possibly `@aihu/css-pipeline`); v2 has `@aihu/magna` + layouts + middleware + plugin-system. Each new package adds release/test/size-budget overhead — surface if any phase grows past 2 net-new packages without a clear reason.

**5-round ceiling.** Token cap **250 K**. If Architect's draft (R2) exceeds 60 K tokens of roadmap text, surface — that's a sign we're designing rather than scoping.

---

## Decision 6 — Rounds and roster

Adjusted from the original brief now that all v1 feature branches are merged (so "merge order" is no longer a planning input):

**Round 1 — Scout (read-heavy, 1 dispatch):**
- Read: `state-plan-a.md` (already current as of this note); `.team/v1/plan-v1-roadmap.md`; `.team/v1/spec-v1-architecture-ratified.md`; `.team/v1/director-notes/dx-phase2-session-001.md`; learnings #15, #16, #17, #41, #42, #46, #48, #49.
- Read: Nuxt 3 architecture overview + Next.js App Router architecture overview (web fetch — light skim, ~500 words each).
- Read: current `packages/*/package.json` and `*/src/index.ts` to confirm v1-shipped surface.
- Produce: `.team/v1-reconciliation/scout-report.md`. Format:
  - Section A: "v1-shipped inventory" — table of every v1 plan item × shipped-yes/no × commit ref.
  - Section B: "Nuxt/Next gap matrix" — for each of {layouts, middleware, plugin-system, auto-imports, image-opt, font-opt, i18n, SSG, devtools, css-pipeline-beyond-scoped, error-boundaries, ts-template-typecheck}, three columns: nuxt-equiv, next-equiv, aihu-status (v1-shipped / v1.1-pending / not-yet-scoped).
  - Section C: "v3 dep-free thesis audit" — for each shipped v1 package, list its current runtime deps from `package.json`. Flag anything non-`@aihu/*`.

**Round 2 — Architect (drafts the roadmap, 1 dispatch):**
- Reads Scout report.
- Drafts `docs/superpowers/plans/2026-05-02-aihu-v1-framework.md` per Decision 2 skeleton.
- Drafts `docs/superpowers/plans/2026-05-02-aihu-v1.5-assets-package.md` (companion).
- Each phase entry must include: dep-budget line ("runtime imports: ONLY `@aihu/*`" or "runtime dep: X — JUSTIFY"); size-budget reservation (or "TBD at design session"); maps to user-confirmed gap-list category.
- Surfaces a curated list of decisions that need user input before R3 (e.g., "router middleware signature: option A, B, or C — recommend B").

**Round 3 — Director re-engage (this director, 1 dispatch):**
- Reads Architect draft.
- Adjudicates Architect-flagged decisions: ratify in-place if Director-authority, surface curated list to user if user-authority.
- Produces `.team/v1-reconciliation/director-note-mid-session.md` with the user-surface block at top.

**Round 4 — Builder (CONDITIONAL on Decision 1):**
- Moves `.team/v1/plan-v1-roadmap.md` → `docs/superpowers/plans/2026-05-02-aihu-v1-framework.md` with content rewrites from Architect draft.
- Moves `.team/v1/spec-v1-architecture-ratified.md` → `docs/superpowers/specs/2026-05-02-aihu-v1-framework-architecture.md`.
- Updates `state-plan-a.md` "Durable references" section.
- Updates plan-a staleness banner to point forward to v1 plan as next-canonical.
- Acceptance: file moves visible, references resolve, no in-tree broken markdown links.

**Round 5 — Historian (close):**
- Retro at `.team/v1-reconciliation/retro.md`.
- Learnings (likely): "Authority migration timing — migrate working docs at decision boundaries, not at branch merges" + whatever surfaces during R2-R3.
- Update `state-plan-a.md` to point at the v1 plan as canonical.
- Update `MEMORY.md` to add a v1 plan reconciliation entry.

**No Builder/Verifier code-cycle.** No bench gate. No size-limit gate. The R4 Builder is doc-moves only.

---

## Decision 7 — Out of scope for this session

Explicit. Do not:

1. **Implement any v1 framework feature.** No `feat/v1-*` Builder dispatch. (Moot anyway — all merged.)
2. **Write `@aihu/assets` design.** That's a follow-up v1.5 design session with its own Mode 2 dispatch.
3. **Write `@aihu/magna` design.** That's a v2 milestone session.
4. **Resolve build-path consistency item #1** (the moon vs package-script size-measurement discrepancy from Learning #47). Still deferred.
5. **Touch arbor's just-merged Compressor work** (`e94d7b1`). Gate is green.
6. **Re-open any v0 size budget.** signals 1970 B, arbor 2200 B, runtime 1024 B, agent 200 B, data 750 B, context 300 B. Reserve future bytes for v1.1+ via *new* packages, not by raising v0 budgets.
7. **Decide GHA re-enablement timing for v1 cutover.** That's a Phase 7.1 cutover-session decision; this roadmap names the gate but doesn't schedule it.
8. **Audit v1 test coverage gaps.** Roadmap names "v1.1 includes test-gap closeout" if Scout finds gaps; doesn't enumerate them.
9. **Pick magna's GraphQL feature subset** (e.g., subscriptions, persisted queries). v2 design session decides.
10. **Investigate any open MEDIUM items** from state-plan-a.md (build-path consistency, signals deep-prop gap residual). Track-B / Round N+4 territory.

---

## Refined briefs (ready for dispatch)

### Round 1 — Scout

**Goal:** Produce a single artifact, `.team/v1-reconciliation/scout-report.md`, that gives Architect everything needed to draft the v1+v2+v3 roadmap.

**Read list (priority order):**
1. `state-plan-a.md` — current state. Note this Director-note has already validated it against `main = 7fa0957`; trust the Director-note for "what's actually on main."
2. `.team/v1/plan-v1-roadmap.md` — the existing plan. Source of truth for "what was designed."
3. `.team/v1/spec-v1-architecture-ratified.md` — the architecture spec.
4. `.team/v1/director-notes/dx-phase2-session-001.md` — DX Phase 2 brief (TTHW measurement, scoped styles, TODO-004).
5. `.team/learnings.md` entries #15 (agent-first MCP), #16 (Tier-3 hooks paid for in v0), #17 (magna canonical), #41 (topology-blind), #42 (size-budget split feature/debt), #46 (lattice re-entrancy), #48 (rolldown external), #49 (v3 dep-free thesis).
6. `docs/superpowers/specs/2026-04-23-aihu-v0-vertical-slice-design.md` — v0 vertical-slice (the original thesis).
7. `docs/superpowers/plans/2026-04-24-aihu-v0-plan-a-ts-runtime.md` — v0 plan (carries staleness banner).
8. Each v1 package: `packages/{context,data,server,router?,arbor,runtime,agent,agent-readiness,signals,compiler}/package.json` + `src/index.ts` first 60 lines. Note: there is no `packages/router/` on main yet — the v1-router PR (#21) merged but the package home should be confirmed; if it landed inside `@aihu/server`, document that.
9. **Web fetch:** Nuxt 3 architecture overview (light skim — ~500 words). Focus: layouts, middleware, plugins, auto-imports, image module, fonts module.
10. **Web fetch:** Next.js App Router architecture overview (~500 words). Focus: layouts, middleware, route handlers, image, fonts, plugins.

**Produce:** `scout-report.md` with three sections:

- **Section A — v1 inventory.** Table: plan item (1.1–7.1) × shipped/pending × commit ref × notes. The Director-note already gave the merged list (#18, #20, #21, #23, #24, #25, #26, #27 + downstream); confirm by `git log --oneline main | grep -i merge`. Flag any plan item that has NO matching merge commit.

- **Section B — Nuxt/Next gap matrix.** Rows: `layouts`, `nested-layouts`, `middleware`, `plugin-system`, `module-system`, `auto-imports`, `image-optimization`, `font-optimization`, `critical-css`, `i18n`, `ssg`, `devtools`, `css-pipeline-postcss`, `css-pipeline-tailwind`, `error-boundaries`, `ts-template-typecheck`, `streaming-actions`, `route-handlers-non-page`. Columns: `nuxt-equiv`, `next-equiv`, `aihu-v1-shipped`, `aihu-planned-where`, `gap-status`. `gap-status` is one of: `closed`, `v1-pending` (was-planned-not-shipped), `v1.1-candidate` (small lift), `v1.5-candidate` (assets-class), `v2-candidate` (architectural), `out-of-scope-v3` (won't-do).

- **Section C — v3 dep-free thesis audit.** For each on-main package, paste its `dependencies` and `peerDependencies` from `package.json`. Flag: any non-`@aihu/*` runtime dep. Include `compiler` (Rust) — even though it's not a runtime concern, note its build-time deps for the orchestration story.

**Out of scope for Scout:** Do not draft the roadmap. Do not propose phases or sequencing. Do not pick between Nuxt-style and Next-style for any pattern. **You are gathering, not deciding.**

**Token budget:** ~25 K. If you need more, surface why before continuing.

---

### Round 2 — Architect

**Goal:** Draft `docs/superpowers/plans/2026-05-02-aihu-v1-framework.md` (main roadmap) and `docs/superpowers/plans/2026-05-02-aihu-v1.5-assets-package.md` (companion). Place drafts at `.team/v1-reconciliation/draft-plan-v1-framework.md` and `.team/v1-reconciliation/draft-plan-v1.5-assets.md` — Builder R4 moves them into `docs/superpowers/plans/` after Director adjudication.

**Inputs:**
- Scout's `scout-report.md`.
- This director-note (Decisions 1–7 are RATIFIED; do not relitigate).

**Roadmap structure (mandatory):**

1. **`# aihu v1+ framework roadmap`**
2. **`## v1 — shipped (receipt)`** — table from Scout Section A, marked all shipped. Include current package sizes vs budgets (from state-plan-a.md). Note: this section is read-only acknowledgment; no design.
3. **`## v1.1 — small carry-overs`** — items from Scout that are `v1.1-candidate`. Each entry: scope, package(s), dep-budget line, size-budget reservation, acceptance criteria. Likely contents: error boundaries (if not already in v1; Scout confirms), TS template type-check (compiler C-6), agent-readiness `getAllAgentMetadata()` polish, doc/example completion, v1 cutover prep (Phase 7.1).
4. **`## v1.5 — assets pipeline + DX hardening`** — points at companion doc for `@aihu/{image,fonts,css-pipeline}`. Lists v1.5 non-assets items (HMR client aihu-native if not done, devtools v1, plugin-system v0 if appropriate).
5. **`## v2 — framework parity`** — layouts (file + component), middleware, full plugin/module system, auto-imports (compiler-driven), i18n, SSG, devtools v2, `@aihu/magna`, route handlers (non-page), error-boundary v2.
6. **`## v3 — dep-free cutover`** — the audit pass. For every package, `npm ls --production` shows ONLY `@aihu/*`. Lists each currently non-`@aihu/*` dep and its replacement plan. Names the v3 release gate criteria.
7. **`## Cross-cutting — Learning #49 dep-budget table`** — one row per package, columns: current-runtime-deps, v1-end-state, v2-end-state, v3-end-state.
8. **`## Out of scope`** — items deferred indefinitely (e.g., GraphQL schema federation, full vue-tsc-style type-check, native mobile output). Each with rationale.

**Per-entry minimum content (every roadmap item):**
- Package(s) affected
- Runtime dep declaration: `runtime imports: ONLY @aihu/*` OR `runtime dep: X — JUSTIFY: <reason>` (the JUSTIFY case must surface to Director; do not silently approve a non-`@aihu/*` runtime dep)
- Size-budget reservation (bytes gz, or "TBD at design session" if pre-design)
- Maps-to-gap-category from Scout Section B
- Brief scope (3–5 bullets)
- Acceptance criteria sketch (2–3 bullets)
- Dependencies on other roadmap items (referenced by section number)

**Companion doc (`draft-plan-v1.5-assets.md`):** Names `@aihu/image`, `@aihu/fonts`, `@aihu/css-pipeline`. For each: build-time dep tree (Sharp, fontkit, postcss are FINE — build-time only), runtime dep tree (must be `@aihu/*` only), API surface sketch, integration with compiler. **Do not design.** Just scope.

**Architect-flagged decisions to surface to Director (R3):** A list at end of draft. Format: `{decision-id}: {choice options}: {Architect's recommendation + rationale}`. Examples likely: router middleware signature; layout file convention (`layouts/default.aihu` vs `<layout>` template element); plugin-system shape (Vite-plugin-style vs Nuxt-module-style); auto-imports mechanism (compiler scan vs explicit import map).

**Out of scope for Architect:**
- Do not design `@aihu/assets` internals.
- Do not pick router middleware signature — surface to Director (Learning #41 territory; user-reserved).
- Do not enumerate per-test or per-bench acceptance criteria for items more than 1 phase out.
- Do not design `@aihu/magna` GraphQL protocol details.

**Token budget:** ~50 K. Surface if exceeded.

---

### Round 3+ — conditional

**R3 (Director re-engage):** ALWAYS runs after R2 lands. Reads Architect draft + flagged decisions. Adjudicates Director-authority items in-place. Surfaces user-authority items to user via `.team/v1-reconciliation/director-note-mid-session.md`.

**R4 (Builder, conditional on Decision 1 = MIGRATE):** Runs after user clears the R3 surface. Moves files, updates references, updates staleness banners. Acceptance: doc moves complete, no broken in-tree markdown links, `state-plan-a.md` Durable References updated.

**R5 (Historian):** Retro + learnings + state update + MEMORY.md update. Always runs.

---

## Notes for the Architect (load-bearing reminders)

- Selective lean: Vite is dev/build-only. Anything Vite-orchestrated at runtime needs to migrate to compiler-orchestrated by v3. Examples: HMR client (currently Vite — must be aihu-native by v3), islands deferred-hydration loader (currently in compiler-emitted code — confirm Scout finds it dep-free), CSS pipeline.
- Magna canonical (Learning #17): when v2 designs `@aihu/magna`, the runtime is ours-end-to-end. We do not need full GraphQL spec compliance — we need aihu ↔ magna correctness.
- Tier-3 hooks already paid for (Learning #16): devtools should consume telemetry hooks already in v0; no new instrumentation pass for devtools v1.
- Topology-blind (Learning #41): public APIs must not commit users to deep-vs-wide tradeoffs. router/data/middleware all need topology-blind shapes.
- Size-budget split (Learning #42): when adding to existing packages, distinguish feature-bytes from accepted-debt. Don't gate new features on someone else's overage.

---

## Iteration tracking

- R1 (Scout): not yet dispatched
- R2 (Architect): not yet dispatched
- R3 (Director): not yet dispatched
- R4 (Builder): conditional
- R5 (Historian): not yet dispatched

**Token spend (Director session-start, this note):** ~9 K.
