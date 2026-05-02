# Director Validation — Architect R2.1 Roadmap

**Date:** 2026-05-01
**Author:** Topic Director
**Branch:** investigate/v1-reconciliation HEAD 65c0dd4

## Summary

VALIDATE-WITH-NOTES. The Architect's R2.1 roadmap honors all locked decisions, applies constraints correctly (Learning #49/#16/#41 + 3.46 kB ceiling), and is internally coherent. Two minor notes for Builder R4 to address inline during the migration to `docs/superpowers/plans/`: (1) v0.6 is dense and may need a slip-tolerance note; (2) `<$warp>` is described as a new compiler-emitted helper but its arbor reuse path is less concrete than `<$shield>`'s — Builder should add a one-line cite.

## Check 1 — Locked decisions present

| Locked decision | Cited at | Match? |
|---|---|---|
| Q3:A file-based layouts | v0.6.8 + §"Locked spec-quartet decisions" + Decisions table | yes |
| Q5:B path convention `/server/_actions/` | v0.6.6 + §"Spec quartet contradictions found" + Decisions table; explicit reconcile note for Scout R2.5's prior Option-A misread | yes |
| Q6:A middleware provisional | §"Locked spec-quartet decisions" + v0.7.3 + Decisions table | yes |
| Q8 collapse — ratify Plugin Contract Spec; migrate to `docs/superpowers/specs/` | v1.0.6 + Decisions table; v0.2.1 ships `@scribe/plugin` package | yes |
| Q10:D compiler-lowered Shield + reuse arbor ErrorHandler; `createShieldBoundary`; ~5-15 B | v0.5.3 explicitly names the helper, cites Q10:D, ~5-15 B framework cost, ErrorHandler reuse | yes |
| Q6 router middleware Option 1 (isomorphic); +256 B router raise | v0.7.1 + §"Locked spec-quartet decisions" + Decisions table; raise sequenced explicitly into v0.7 | yes |
| Interpretation A full syntax migration | TL;DR + Decisions table; parser rewrite via dual-grammar v0.2 → v1.0 cutover | yes |
| Milestone shape 0.2→0.9→1.0 | Section "Milestone sequencing" + Decisions table | yes |
| docs/site/ Markdown | v0.9.1 — handrolled Markdown static site | yes |
| Naming Scheme A on Plugin Contract internals only | §"Naming Scheme A application" + v0.7.4 — scope explicitly narrowed; cross-package collisions absorbed inside Plugin Contract pass | yes (with caveat — see Check 3) |

All ten locked decisions present and correctly applied.

## Check 2 — Constraint adherence

- **Learning #49 (v3 dep-free):** PASS. §"Per-version dep envelope" table shows zero non-`@scribe/*` runtime deps across all packages at every version. Native addons stay under `@scribe/*`. Vite stays peer-optional / build-time. Explicitly stated: "No package carries any non-`@scribe/*` runtime dep at any version."
- **Learning #16 (Tier-3 hooks paid for in v0):** PASS. v1.0.5 names the check; no milestone proposes breaking subscription identity, telemetry no-op-default, or Branch/Leaf hidden-class shape. v0.2.3 arbor recovery is byte-level only (Compressor pass), not shape-changing.
- **Learning #41 (topology-blind):** PASS. Q6 Option 1 explicitly topology-blind per Director Q6 research §"Magna integration angle"; roadmap inherits. No feature requires consumer-graph topology.
- **3.46 kB browser-bundle ceiling:** PASS with discipline. Net deltas tracked: arbor recovers 15 B + ≥30 B headroom (v0.2.3); router +256 B raise (v0.7.1, Director-authorized); Shield ~5-15 B paid in user-emitted SFC JS not runtime; runtime tight 7 B headroom for v0.4.9 — surfaced as a trigger condition. Sum stays under ceiling.
- **No "PASS conditional" deferrals:** PASS. v1.0 cutover names every gate (CI on, branch protection, release pipeline, dep-free hard gate, dual-grammar removal). Asset packages explicitly DEFERRED to v1.x post-cutover with named follow-up session — not conditional on undefined trigger.

## Check 3 — Internal coherence

- **v0.6 coupling (`@route` + build-target + layouts):** dense but coherent. Investigator's 1-2 days for build-target plumbing + 2-4 days for `@route` parser/codegen/router-consume + layouts (Q3:A) = ~5-9 days. Realistic for one milestone IF v0.6 ships sequentially internal to its scope. Architect explicitly couples them per Investigator finding. **NOTE:** v0.6 is the densest milestone — Builder R4 should add a slip-tolerance line ("if v0.6 slips, both `@route` semantics and build-target slip together — no partial landing").
- **v0.5 five boundary macro elements:** `<$slot>` reuses `arbor.slot()` (PR #20); `<$suspense>` reuses `arbor.mount` + resource graph; `<$shield>` reuses arbor `ErrorHandler` per Q10:D; `<$guard>` is a wrapper around `arbor.when`-style gate; `<$warp>` is a teleport using `arbor.mount` against a target node. All five lower to existing arbor primitives. **Minor NOTE:** `<$warp>`'s "uses `arbor.mount` against the target node" is the least-cited reuse path; Builder should add a one-line precedent or call out as a v0.5 risk (potential new arbor surface if mount cannot accept arbitrary host node).
- **v0.7 cross-package rename within user-narrowed scope:** PASS. §"Naming Scheme A application" stays inside Plugin Contract internals + cross-package collisions documented as absorbed by the Plugin Contract pass. Architect-leaning rename of `@scribe/server.createRouter → createRequestRouter` is a *cross-package collision resolution* the user implicitly enabled by ratifying Q8 collapse (Plugin Contract Spec must disambiguate). The package-scope moves at v1.0.9 (`@scribe/data → @scribe-plugin/data`, `@scribe/agent-readiness → @scribe-plugin/agent-readiness`) ARE package-level renames but are explicitly named in the user's locked Naming Scheme A ratification. `viteRouterPlugin → viteRouterIntegration` and `agentReadiness → viteAgentReadinessIntegration` are export renames, not package renames. **Architect did NOT overstep.** The scope reading is defensible.
- **v1.0 cutover removes dual-grammar v0.2 stub:** Migration path present. v0.8 ships `@scribe/cli` with `npx scribe migrate` auto-conversion tool. v1.0.7 explicitly names the migration tool; deprecation warnings begin v0.3.4 (banner on HTML-tag form). 18+ months runway from v0.2 to v1.0 cutover. PASS.
- **v0.9 docs build pipeline:** v0.9.1 explicitly says "handrolled" static site generator (rationale: SSG is itself v1.0 surface and must not depend on under-test code). 12+ pages enumerated. Runnable; not ambiguous. PASS.

## Check 4 — Surface trigger audit

| Trigger | Tripped? | Note |
|---|---|---|
| 1. User-reserved authority beyond locked | NO | All proposals trace to locked decisions or explicit Architect-leaning recommendations marked as such |
| 2. Spec quartet internal contradictions | NO | Architect §"Spec quartet contradictions found (none beyond reconciliation)" — sigil mismatches and path-convention reconciliation are all adaptation-feasible |
| 3. Test count drop | N/A | Planning doc |
| 4. Size-limit breach without recovery | NO | v0.7 +256 B raise authorized; v0.4.9 surfaced as conditional trigger with documented recovery path (Compressor) |
| 5. Force-push or destructive ops | N/A | Planning doc |
| 6. 5-round ceiling | NO | R3 (this) within budget; R4 (Builder) and R5 (Historian) remain |
| 7. Token ceiling 350K | NO | Architect reports ~12K spend |
| 8. New npm runtime dep | NO | Per-version dep envelope table confirms zero non-`@scribe/*` runtime deps at any version |
| 9. Spec quartet incompatibility w/ shipped feature | NO | All shipped primitives reused; sigil renames at compiler emit layer only |
| 10. `@scribe/cli` design beyond "scaffold from template" | NO | v0.8 scopes to `app`, `page`, `component`, `plugin` scaffolds + `migrate` (the latter is justified by v1.0.7 dual-grammar removal) |

Zero surface conditions tripped.

## Check 5 — Migration realism

PASS. Existing v0.1.x consumer migration path: v0.2 dual-grammar stub accepts existing `<script setup>` / `<template>` / `<style>` / `<agent>` form unchanged; v0.3 begins preferring `@blockname { }` with deprecation banners (warn-only); v0.4 deprecates Vue-shape `:attr` / `@event`; v0.8 ships `npx scribe migrate` auto-converter; v1.0.7-8 hard-removes the alias paths. Runway is 6+ months across v0.2→v1.0. The dual-grammar stub is the load-bearing mechanism — without it, every v0.1.x consumer breaks at v0.2. Roadmap explicitly preserves it. Deprecation warning policy is implicit (v0.3.4 banner; v0.4 `:attr`/`@event` warnings; no spec text yet — Builder R4 to add a one-line "deprecation policy: warn from v0.3, remove v1.0" to the migration section if missing in target plan home).

## Final verdict

**VALIDATE-WITH-NOTES.** Route to Builder R4 for migration to `docs/superpowers/plans/` with the inline notes below. No re-draft needed.

## Notes for Builder R4 (address inline during migration)

1. **v0.6 slip-tolerance line.** Add one-line note that v0.6's three coupled items (`@route`, build-target, layouts) ship together or slip together — no partial landing. This is implicit in §"Risks" item 2 but worth surfacing inside the v0.6 milestone body itself.
2. **`<$warp>` arbor-reuse cite.** v0.5.5 says "uses `arbor.mount` against the target node" but doesn't cite that arbor.mount currently accepts an arbitrary host. Add one-line cite OR flag as "v0.5 risk: may require minor arbor surface extension; if so, factor into v0.2.3 headroom budget."
3. **Deprecation policy explicit.** Add one-line "deprecation policy: warn from v0.3 (HTML-tag form) / v0.4 (`:attr`/`@event`); auto-migration tool v0.8; hard-removal v1.0.7-8" to the migration narrative or cutover section so the policy isn't scattered across milestone descriptions.
4. **Spec text reconciliation tracking.** §"Spec quartet contradictions found" notes Amendment 02 path-prefix needs single-line spec edit at v1.0.6 migration; ensure that diff is enumerated as a v1.0.6 sub-task in the migrated plan, not lost in prose.
5. **v0.4.9 surface trigger details.** Runtime 7 B headroom vs `onMount`/`onCleanup` ~30-50 B is tight; current text says "raise per Learning #42 split" but doesn't pre-authorize. Confirm with Builder whether this requires a Director surface BEFORE v0.4 ships, or whether the Compressor pass is a soft-gate that auto-resolves.
6. **Naming Scheme A scope clarity.** §"Naming Scheme A application" mixes plugin-internals (kept-as-is per user narrowing) with cross-package collision resolution (renames). Builder should add a one-line preamble making clear that the cross-package renames (createRequestRouter, viteRouterIntegration, viteAgentReadinessIntegration) are *consequences of* Plugin Contract Spec ratification, not a broadening of the user's narrowed scope.
