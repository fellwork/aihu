# Phase 3 Launch Brief — Parallel Spec Authoring

**Status:** Self-contained brief for the next session's Team Lead. Read this cold; it tells you everything to spawn the right team.
**Author:** Phase 2 Team Lead (handoff)
**Date:** 2026-04-26
**Branch this brief lives on:** `main` after PR #4 merges; ride along as `chore/phase-3-launch-brief`.
**Predecessor PRs:**
- #1 Phase 1 (scaffolding) — merged
- #2 Phase 2 (`@aihu/signals`) — merged
- #3 Phase 3 prep (`chore/phase-3-prep`) — merged before this brief

---

## Why this session exists

Phase 2 shipped `@aihu/signals` cleanly: 36 tests, 698 B / 1024 B size budget, 51/51 spec rows verified. The four remaining packages (`arbor`, `runtime`, `agent`, integration) need to ship next. The user asked: *"Can we get started on multiple areas of the roadmap now?"*

The answer is **partially**. Building can't all be parallel — `runtime` consumes `arbor`, `integration` consumes everything. But **planning can be parallel.** Three Architects can each write a spec for one of {`arbor`, `runtime`, `agent`} concurrently, sharing only the v0 spec and the now-shipped `@aihu/signals` API as common context. They produce three spec documents that the *next* session's Builders can implement.

This session's deliverable: **three locked specs, one per package.** No code is written this session.

---

## Repos in scope (read-only for this session)

```
- fellwork/aihu (read-only):
    local: c:/git/fellwork/aihu
    branch: main (current)
    purpose: source-of-truth spec, plan, learnings, signals API
- fellwork/api (read-only, optional):
    local: c:/git/fellwork/api
    purpose: cross-reference Rust workspace conventions only
```

No write repos. Architects produce markdown files only, committed to `c:/git/fellwork/aihu/.team/phase-3/`, `.team/phase-4/`, `.team/phase-5/`. Branch: spawn one branch per package spec to keep diff hygiene clean (see §Spawn instructions).

---

## Source-of-truth docs (every Architect reads these)

1. **v0 spec** — `c:/git/fellwork/aihu/docs/superpowers/specs/2026-04-23-aihu-v0-vertical-slice-design.md`. The contract for all four packages. Sections 6 (arbor model), 7 (runtime API), 8 (agent metadata), 9 (integration tests) are the package-specific ones.
2. **Implementation plan** — `c:/git/fellwork/aihu/docs/superpowers/plans/2026-04-24-aihu-v0-plan-a-ts-runtime.md`. Phase 3 is tasks 12–19 (`arbor`), Phase 4 is 20–22 (`runtime`), Phase 5 is 23–24 (`agent`), Phase 6 is 25–27 (integration). Apply Learning #6 — call out staleness.
3. **`@aihu/signals` shipped API** — `c:/git/fellwork/aihu/packages/signals/`. Read `src/index.ts`, `dist/index.d.ts`, `README.md`. The API surface is locked; specs that need to extend it (e.g. `untrack`, `peek`, scope-collected dispose) must spell out the addition explicitly with rationale.
4. **Phase 2 team artifacts** — `c:/git/fellwork/aihu/.team/phase-2/`. The retro (`retro.md`) lists Phase 3 risks already visible. The verification report has the Verifier's "concern for Phase 3" notes. Read them.
5. **Project-portable learnings** — `c:/git/fellwork/aihu/.team/learnings.md`. **Mandatory.** Every Architect must apply Learnings #1, #2, #3, #6 explicitly — those four were the most expensive misses in Phase 2 and they are the ones most likely to recur in spec authoring.

---

## Roster — three parallel Architects + light Team Lead orchestration

This session does NOT spawn Scout, Builder, or Verifier. Reasons:

- **Scout** — the v0 spec, the plan, the Phase 2 artifacts, and the shipped signals API together cover what Scout would produce. A new Scout would mostly summarize existing artifacts.
- **Builder** — no code this session.
- **Verifier** — no implementation to verify. The next session's Builder will be verified by a future Verifier.

Three Architects, each working on a different package spec. They run in parallel because each writes a different file and consumes the same shared context. They peer-message via the orchestration plan §6 lane (`Architect → Architect`) when one's API surface affects another (e.g. `arbor` exports a `MountScope` that `runtime` consumes — both need to agree).

| Role | Output | Time budget |
|---|---|---|
| Team Lead (you, the next session) | Spawn 3 Architects, surface taste decisions to the user, commit/push each spec | ~15 min orchestration + decision time |
| Architect A — `arbor` | `c:/git/fellwork/aihu/.team/phase-3/spec-arbor.md` | ~75 min wall-clock |
| Architect B — `runtime` | `c:/git/fellwork/aihu/.team/phase-4/spec-runtime.md` | ~45 min wall-clock |
| Architect C — `agent` | `c:/git/fellwork/aihu/.team/phase-5/spec-agent.md` | ~30 min wall-clock |

Each Architect operates with **Decision 2B authority** as in Phase 2 — they may override the plan with written rationale. The Team Lead surfaces only **genuine taste decisions** to the user; mechanical decisions stay with the Architect.

---

## Spawn instructions for the next Team Lead

### Step 0 — Read first (10 min)

Before spawning anything, read in order:
1. This brief
2. `.team/learnings.md` (especially #1, #2, #3, #6)
3. `.team/phase-2/retro.md` (the "Phase 3 risks already visible" section)
4. v0 spec sections 6, 7, 8, 9
5. Phase 2 spec (`.team/phase-2/spec-signals.md`) — to see what an Architect output looks like in this project's conventions

### Step 1 — Branch hygiene (2 min)

Create one branch per spec so each spec lands as its own PR (or a single combined PR; user's call):
```
git checkout main && git pull
git checkout -b spec/phase-3-arbor
git checkout -b spec/phase-4-runtime  # from main
git checkout -b spec/phase-5-agent    # from main
```

Or one combined branch if the user prefers:
```
git checkout -b spec/phases-3-4-5
```

Default to **one combined branch** unless user requests otherwise. Specs are small (<2000 lines combined); one PR is cleaner reviewer-wise. Phase 2 had the team artifacts ride along in the package PR — same pattern.

### Step 2 — Adjudicate three pre-spawn calls with the user

Before any Architect spawns, surface these three calls to the user. They affect all three Architects' briefs and would otherwise cascade through the specs. Don't spawn before getting answers.

**Call 1 — `untrack` / `peek` API.** Phase 2 deferred per spec §2.5 ("add when arbor needs it"). Verifier-code's Phase 3 concern (lazy fan-out under wide observed graphs) and Builder's eager-recompute pivot both make this likely to surface. Three options:
- **A.** Architect A (`arbor`) decides — and if it decides yes, the API is added in a Phase 3 PR that touches `@aihu/signals`. Adds to the v0 surface.
- **B.** Pre-decide: ship `untrack` in `@aihu/signals` proactively as a Phase 3 prep task. ~30 B gz, simple. Lets `arbor` consume it on day one.
- **C.** Force `arbor` to live without it. Painful — `MountScope.dispose()` walks the tree and reads-without-tracking is a primitive need.

Recommendation: **B**. Pay 30 B now, save Architect A from designing around an absent primitive.

**Call 2 — `MountScope` lifecycle vs. `effect` dispose.** Spec §6.3 says `MountScope.dispose()` must compose with effect disposal. Phase 2's `effect()` returns a single dispose fn — no scope concept. Two ways to compose:
- **A.** `arbor` adds a scope-collector that wraps `effect()`. Effects created during a mount are gathered; `MountScope.dispose()` calls them all. No change to `@aihu/signals`.
- **B.** `@aihu/signals` exports a public `runInScope(scope, fn)` that effects auto-register with. Heavier touch; couples `signals` to a `scope` concept earlier than necessary.

Recommendation: **A**. Keeps `@aihu/signals` minimal; `arbor` owns lifecycle.

**Call 3 — Single combined PR for all three specs, or three separate PRs.** Already addressed in Step 1 default — but confirm with the user, as it affects how Architect outputs get committed.

Recommendation: **single combined PR**.

### Step 3 — Spawn three Architects in parallel (single message, three Agent tool uses)

Spawn all three simultaneously. They have NO dependencies on each other; only on the source-of-truth docs (which are read-only and the same). Per orchestration plan §6, peer-to-peer messaging between Architects is allowed if one's spec impacts another — but in practice for Phases 3–5 the boundaries are clean enough that peer messaging is rare.

#### Architect A — `arbor` (Phase 3)

**Goal:** Produce `.team/phase-3/spec-arbor.md` covering the persistent reactive tree: `Branch`, `Leaf`, `mount(target, branch): MountScope`, `MountScope.dispose()`, structural-update primitives. Implements v0 spec §6 (arbor rendering model). Consumes `@aihu/signals` (and per Call 2 may extend it).

**Reference Phase 2's spec format** (`.team/phase-2/spec-signals.md`): 7 sections (Public API, Internal architecture, Tooling, Test plan, File-level change list, Deviations from plan, Open questions for Team Lead).

**Decisions inherited from this brief:**
- Call 1 outcome (untrack/peek decision)
- Call 2 outcome (MountScope/effect composition)
- Call 3 outcome (PR strategy)

**Apply learnings explicitly:**
- Learning #1 — re-read v0 spec §6 and plan tasks 12–19 end to end
- Learning #2 — final pre-publish step: walk prose against deviations table
- Learning #6 — flag plan staleness; the plan is 4 days old by the time this Architect spawns
- Phase 2 retro's "wide fan-out concern" — your spec must address arbor's `computed` consumption pattern explicitly

**Time budget:** 75 min wall-clock. **Token ceiling:** 100k input.

#### Architect B — `runtime` (Phase 4)

**Goal:** Produce `.team/phase-4/spec-runtime.md` covering `defineElement(name, options)` and the Web Components wiring. Implements v0 spec §7. Consumes both `@aihu/signals` and `@aihu/arbor`.

**Critical constraint.** The `arbor` API surface is being designed *concurrently* by Architect A. Architect B's spec must:
1. Anchor against the *current* arbor public API in v0 spec §6 (not Architect A's in-flight spec).
2. List, in §7 ("Open questions"), every assumption it made about arbor that Architect A might invalidate.
3. NOT peer-message Architect A unless a question genuinely cannot be answered without it. The Team Lead reconciles in Step 4.

**Same format and learnings as Architect A.**

**Time budget:** 45 min wall-clock.

#### Architect C — `agent` (Phase 5)

**Goal:** Produce `.team/phase-5/spec-agent.md` for `@aihu/agent`. Implements v0 spec §8 — static metadata accessor only in v0 (no MCP server). Independent of arbor and runtime; this is the smallest package.

**Same format and learnings.** This Architect is small enough that you may consider running it sequentially before A and B if context is tight — it can finish in 30 min and the others won't depend on it.

**Time budget:** 30 min wall-clock.

### Step 4 — Reconcile cross-package assumptions (10 min)

After all three specs land, walk Architect B's "Open questions" list against Architect A's actual `spec-arbor.md`. For each question:
- If A answered it the way B assumed → no action.
- If A answered it differently → flag to user as a **Reconciliation call**. The user picks A's or B's framing; whichever isn't picked rewrites that spec section.

Most assumptions should hold. The likely friction points:
- Arbor's `MountScope` API shape (does it expose effect-collection publicly, or only via internal lifecycle?)
- Arbor's structural-update primitives (`when`, `each` are stubbed in v0 — what type signature does runtime see?)
- Whether `defineElement` can mount detached `Branch` nodes or only fresh ones

### Step 5 — Commit, push, open PR

```
git add .team/phase-3/ .team/phase-4/ .team/phase-5/ .team/phase-3-launch.md
git commit -m "docs(phase-3-5): three parallel specs for arbor, runtime, agent"
git push -u origin <spec-branch>
gh pr create ...
```

PR description should: list the three specs, summarize each in one sentence, link the Phase 2 artifacts, list any Reconciliation calls the user adjudicated.

### Step 6 — Hand off to next session

Once specs merge, the *next* session is the Phase 3 Builder team — Pattern C, scoped to `arbor` only. Phase 4 (runtime) and Phase 5 (agent) wait their turn (or Phase 5 may run in parallel with Phase 3 since `agent` is independent — that decision belongs to the next session's Team Lead, not this one).

Update `.team/learnings.md` if any of this session's work surfaces new project-portable rules. The Historian role isn't separately spawned for this session because the deliverable is text-only and the retro is just whatever crosses the line into Learning territory — the Team Lead writes those entries directly.

---

## Hard stops for this session (orchestration plan §6)

- An Architect requests information beyond the source-of-truth docs → escalate to user, don't speculate.
- An Architect spends >120% of its time budget → pause, reassess scope.
- Reconciliation in Step 4 surfaces a fundamental incompatibility (e.g. v0 spec §6 and §7 contradict each other in a way Phase 2 already shipped around) → stop, flag to user, do not paper over.
- An Architect proposes adding to `@aihu/signals` beyond Call 1's authorization → stop, surface as a **new** Team Lead call.

---

## What this session does NOT do

- Write any TypeScript code (Builders' job, next session)
- Run any test (no implementation to test)
- Open any PR with code changes (specs only)
- Spawn Phase 6 (integration) Architect — Phase 6 spec depends on all three above being final and gets its own session
- Modify the v0 spec or the plan (Architects edit the plan only for staleness fixes per Learning #6, not to change scope)

---

## Token and wall-clock ceilings

- Total session token budget: 350k input across all Architects + Team Lead orchestration.
- Wall-clock estimate: 90 min if Architects truly run in parallel; 150 min if serialized.
- If you blow the wall-clock budget by >50%, stop at the next Architect boundary and write a continuation note.

---

## Final checklist before spawning

- [ ] Read this brief end to end
- [ ] Read `.team/learnings.md`
- [ ] Read `.team/phase-2/retro.md` "Phase 3 risks already visible" section
- [ ] User has answered Call 1 (untrack/peek), Call 2 (MountScope), Call 3 (PR strategy)
- [ ] Branch hygiene set up (one combined or three separate)
- [ ] Three Architect prompts drafted, ready to send in a single parallel message

When all six are checked, spawn. Good luck.
