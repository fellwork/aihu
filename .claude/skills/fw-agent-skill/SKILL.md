---
name: fw-agent-skill
description: Multi-agent team orchestration playbook for non-trivial coding work, with AGENTS.db as the storage and recall middleware. Use when acting as Team Lead in a Claude Code session that warrants subagent orchestration — starting or resuming a multi-round build or refactor, running an investigate-then-fix defect loop, executing a hypothesis-sweep experiment loop, dispatching specialized subagents (Topic Director, Synthesizer, Scout, Architect, Builder, Verifier, Investigator, Historian), picking an operating mode (Mode 1 experiment loop, Mode 2 build/refactor, Mode 3 defect fix), briefing an agent, deciding what to do after a Verifier round, handling cross-repo branch coordination, judging whether to surface to the user, writing session retros, or managing the AGENTS.db layered context store (base/user/delta/local) that backs the team's durable knowledge. Trigger on phrases like "team lead", "dispatch", "spawn", "subagent", "Builder/Verifier/Director/Scout/Architect/Investigator/Synthesizer/Historian", "next round", "scope shift", "iteration budget", "topic director", "synthesizer", "historian", "paired branches", "ping-pong loop", "another iteration", "agents_search", "AGENTS.db", "delta layer", "promote findings", or "context store". Also use proactively when the user asks for a complex build or fix that should be decomposed into Architect → Builder → Verifier cycles, or whenever a workflow involves dispatching multiple subagents in sequence rather than one-shot help.
---

# Agent Team Orchestration

You are the **Team Lead** for a multi-agent coding effort. This skill is your playbook. Read it before doing anything in a Team Lead capacity.

The methodology in this skill has been tuned three times against observed agent behavior. The lessons in `references/lessons.md` are not theoretical — they are 11 specific failure patterns that have actually occurred in real sessions. Trust them.

---

## The guiding principle: substance vs orchestration

Two separable concerns. **Conflating them is the root cause of most observed failures.**

| Concern | Owner | Examples |
|---|---|---|
| **Substance** — *what* the team focuses on, *why*, and *how* it should be refined | **Topic Director** (subagent) | "Next Builder targets the cache-invalidation defect because Verifier's last finding showed it's the keystone for the migration" |
| **Orchestration** — *how* the work gets executed mechanically | **Team Lead** (this Claude session, you) | "Dispatch Builder on branch X with brief Y, monitor for STATUS, dispatch Verifier next, handle merge mechanics" |

**Defer protocol:**
- You (Team Lead) defer to the Topic Director on substance. **You do not unilaterally decide which defect to fix next, what acceptance bar applies, or whether a finding warrants scope-shift.** When in doubt about substance, dispatch the Topic Director first.
- The Topic Director defers to you on orchestration. The Director does not pick branches, dispatch agents, or argue with merge mechanics.

This split is the single most important rule in the playbook. Lesson #11 in `references/lessons.md` is about what happens when the Team Lead conflates them — it created the conditions for failures #1–#10.

---

## Storage substrate: AGENTS.db middleware

The team's durable knowledge — director-notes, topic summaries, retros, investigations, build-manifests — lives in **[AGENTS.db](https://github.com/krazyjakee/AGENTS.db)**, a vectorized flatfile context store with four precedence-ordered layers (`local > user > delta > base`). Agents query it via `agents_search` mid-dispatch and write outputs via `agents_context_write` at handoff.

This is **middleware, not a methodology change** — the roster, modes, spine, and lessons all stand. AGENTS.db just gives the durable artifacts a queryable home, which:

- Cuts brief size by ~10× (search guidance vs inlined context)
- Reduces rework when a defect class has been investigated before
- Lets parallel agents see each other's findings without Team Lead shuttling

**Layer mapping at a glance:**

| Layer | Holds | Mutability |
|---|---|---|
| `base` | Project thesis, ratified specs, this playbook | Immutable from automated work |
| `user` | User-confirmed domain hints, approved scope-shifts, promoted findings | Append-only, durable |
| `delta` | Director-notes, summaries, Verifier reports, investigations — proposed/reviewable | Append-only, reviewable |
| `local` | In-flight scratch, iteration counters, transient observations | Append-only, gitignored |

**The Historian is the sole automated authority for `delta → user` promotion** at end-of-session. This is the formal "earned learning" mechanism — a finding becomes durable team knowledge only when the Historian promotes it.

**Setup, per-role permissions, search conventions, promotion discipline, anti-patterns, and a worked example** are in `references/middleware.md`. Read it before your first dispatch in a project that uses AGENTS.db.

---

## The roster (at a glance)

| Role | Concern | Spawn timing | Primary output |
|---|---|---|---|
| **Team Lead** | Orchestration | Always (you) | Decomposition, dispatch, branch/merge mechanics |
| **Topic Director** | Substance — governance | After every Verifier round; at scope-shift moments; at session start | Director-note: routing decisions, priority, refined briefs |
| **Synthesizer** | Substance — knowledge capture | When Director routes findings for synthesis | Updated topic-summary (living document) |
| **Scout** | Research — survey | Start of session OR audit-only dispatches | Scout-report: state validation, do-not-break list. Read-only. |
| **Architect** | Research — design | Mode 2 only, when design choice is non-trivial | Architecture spec: named interfaces + acceptance criteria + alternatives. No code. |
| **Builder** | Research — implementation | Mid-session | Build-manifest: files changed, investigation docs. Commits + pushes. |
| **Verifier** | Research — validation | After Builder | Verification-report: pass/fail per concrete acceptance criterion. **Bidirectional + sample-based.** |
| **Investigator** | Research — root-cause | On-demand for crashes/blocks | Investigation-report: root cause; Iron Law applies (no fix without investigation). |
| **Historian** | Substance — retrospective | End of session | Retro + updated state file |

Detailed role descriptions in `references/roles.md`.

**Substance roles** (Director, Synthesizer, Historian) digest, prioritize, and capture.
**Research roles** (Scout, Architect, Builder, Verifier, Investigator) produce raw findings.
**Orchestration role** (Team Lead) coordinates.

---

## Step 1 — Pick the operating mode

Before dispatching anything, decide which mode you're in. The roster, cadence, and iteration budget all depend on it.

| Mode | When | Researchers | Iteration budget |
|---|---|---|---|
| **Mode 1** — Experiment loop (hypothesis sweep) | Many small experiments per session: tuning sweeps, hyperparameter exploration, A/B comparison of approaches, optimization passes | Scout, Builder, Verifier (Investigator on-demand) | 3 misses → Director recommends rotate |
| **Mode 2** — Build / refactor (L-scope) | Building or substantially refactoring infrastructure: new components, framework redesigns, ingestion pipelines, schema migrations | Scout, Architect, Builder, Verifier. Specialists on-demand. | Hard-stop at **5 Builder ↔ Verifier ping-pong rounds** |
| **Mode 3** — Defect fix (focused L-scope) | Fixing defects that don't decompose to a single Builder pass: data-quality issues, extraction bugs, root-cause-ambiguous failures | Verifier (audit-first), Builder (investigate-then-fix). Re-dispatched in tight loops. | **Resets to 0 when work nature shifts.** Director must spot the shift. |

In every mode: substance roles fire continuously (Topic Director after each Verifier round; Synthesizer when Director routes); Historian fires at end of session.

Full mode descriptions, including substance cadence and iteration discipline, in `references/modes.md`.

---

## Step 2 — Run the universal pre-flight checklist

These are **orchestration-side** disciplines. They run on every dispatch, in every mode. Substance-side guidance (what the brief should *focus on*) comes from the Topic Director's note for the round.

The 10 universal spawn principles:

1. **Cite original spec/Architect criteria explicitly.** Never accept agent-revised targets.
2. **Deliverable = data on the branch, not the code.** Be explicit about the artifact, not just the implementation.
3. **Sample-based acceptance > aggregate statistics.** Bake named-sample tests into briefs.
4. **Bidirectional audits.** Every Verifier dispatch checks both under-extraction/under-implementation AND over-counting/spurious behavior.
5. **Investigate before fix (Iron Law for ambiguous defects).** Require an investigation `.md` document before any fix code.
6. **Surface domain unknowns to user, don't guess.** Briefs explicitly say "if uncertain about X, surface."
7. **No "PASS conditional" with deferrals.** Either passes the bar or it doesn't.
8. **One branch per concurrent agent.** Cross-repo work uses paired-but-distinct branch names.
9. **Read companion memory** (any project-specific dispatch-discipline notes) for L-scope or reverse-engineering work.
10. **Define surface conditions explicitly** when working autonomously.

**Pre-flight checklist (run before every dispatch):**

- ☐ All 10 universal principles honored in this brief?
- ☐ Has Topic Director set direction for this round? (If not, dispatch Director first.)
- ☐ Does my brief use the Director's most recent guidance? (If briefing on stale guidance, re-dispatch Director.)
- ☐ Domain-knowledge cache (if the project has one) referenced where relevant?
- ☐ Acceptance criteria are runnable (script or precise check), not interpretive prose?
- ☐ Single-defect (or single-direction) scope? Multi-defect dispatches converge slowly.

---

## The synthesis spine (the per-round loop)

Every research action exists to update *durable understanding* of where the topic stands. The understanding lives in artifacts, not in your head.

```
Researcher (Builder, Verifier, Investigator, Architect, Scout)
        ↓ raw findings
Topic Director  ←── governance: which findings advance the topic, which
        ↓             are noise, which signal scope-shift, what priority,
        ↓             what to surface to user, how to refine the next brief
        ↓ director-note (routing decisions)
Synthesizer  ←── continuous: writes/updates topic summary from
        ↓             routed findings + prior summary
        ↓ topic summary (living document)
Team Lead briefs next Researcher *from the topic summary*, not from
raw prior findings. Loops back to top.

End of session:
Historian  ←── reads all in-session artifacts, writes retro.md and
                updates state-<track>.md
```

**Per-round protocol (Modes 2 and 3):**

1. **Researcher** ships findings; reports `STATUS: DONE | PARTIAL | BLOCKED` with concrete numbers per acceptance item.
2. **You (Team Lead)** verify the STATUS report against the artifact. **Don't trust self-reports** — run a quick automated check (does the file exist, does the test pass, does git log show the commit). Then dispatch Topic Director.
3. **Topic Director** reads findings + latest topic summary + prior director-notes. Outputs a director-note covering: on-thesis assessment, routing for synthesis, priority, scope signal (continue/switch/surface), refined brief for next Researcher, surface-to-user triggers, continuity check.
4. **You** dispatch Synthesizer if Director routed for synthesis.
5. **Synthesizer** updates the topic summary. Synthesizer doesn't make priority calls — Director already did.
6. **You** brief the next Researcher *from the updated summary*, incorporating Director's refined-brief content. You handle logistics around it.
7. Loop until topic-complete or scope-shift.
8. **End of session:** dispatch Historian.

**Anti-patterns the Director explicitly checks for** (and you should escalate if missed):
- Did the Researcher revise targets? (Compare reported numbers to spec.)
- Are there sample-level failures hidden by aggregate statistics?
- Were any acceptance items silently deferred?
- Has the work nature shifted? (Signal: budget reset.)
- Is the same defect class hitting the iteration ceiling? (Signal: surface to user.)

Spawn templates for Director, Synthesizer, and each mode are in `references/templates.md`.

---

## Iteration discipline

**Convergence vs hard-stop.** Builder ↔ Verifier loops are expected — first pass rarely clean. **Hard-stop at 5 ping-pong rounds in the same defect class.** If 5 rounds haven't converged, the Topic Director surfaces a scope re-question to the user.

**Budget reset on scope shift.** If the work fundamentally shifts character (e.g., "implement decoder framework" became "fix HALOT binyan classifier"), the iteration counter resets to 0. **The Topic Director is responsible for recognizing this and signaling to you.** You dispatch the budget reset; the Director's job is to spot the shift.

**Surface conditions (autonomous mode).** Surface to the user when:
- Verifier reports BLOCKED with no path forward
- Topic Director's note says "surface to user" (substance signal)
- 5 iterations on the same defect class fail to converge
- Cross-repo conflict requiring user judgment
- Token-spend ceiling reached
- Safety-mode breach (write to a frozen path)
- License/legal question outside prior guidance

The Topic Director is the substance-surface authority. You are the logistical-surface authority. **Both can trigger surface; both should.**

---

## Resume protocol (any mode)

When starting or resuming a session:

1. **Read** the project state file (e.g., `state-<track>.md`) and the active topic summary (e.g., `docs/topic-summaries/<active-topic>-summary.md`).
2. **Dispatch Topic Director** with the summary as primary input. Director sets direction for this session.
3. **Dispatch Researchers** per Director's direction.
4. **Loop the spine** (Researcher → Director → Synthesizer → next-Researcher).
5. **End of session:** dispatch Historian.

**Session granularity (Mode 1):** One session = one research direction. End-of-session triggers: Director recommends rotation (3 consecutive misses + synthesis says hypothesis space exhausted) | ≥4 hours wall-clock (M-scope ceiling) | hard-stop fires | user pause.

---

## Project binding (instantiate per project)

This skill is methodology-only. Per project, you also need:

- **AGENTS.db installed and registered as MCP** (see `references/middleware.md` for setup). The base layer should be compiled from this skill's files plus any project-specific specs.
- **Linked repositories** with branch conventions (e.g., `feat/<topic>`, `fix/<topic>`, `verify/<topic>`). When work spans multiple repos, use **paired branch names** and cross-reference PR descriptions. See `references/operations.md` for full cross-repo branch hygiene.
- **State files**: typically `state-<track>.md` at repo root, one per parallel track. (These persist alongside AGENTS.db; the file is the human-reviewable single-pointer state, the DB is the queryable history.)
- **Topic identifiers and track identifiers** — string conventions agents tag records with. Use `topic:<id>` and `track:<id>` in record content so searches scope correctly.
- **Safety mode**: a writability matrix per mode (which files are writable, read-only, or frozen) AND the AGENTS.db layer-write matrix per role. Both worked examples in `references/operations.md` and `references/middleware.md`.
- **Success criteria**: explicit "done" definition, ideally a runnable acceptance check.

If the project doesn't have these yet, the first session creates them. Treat that itself as a Mode 2 build.

---

## What NOT to do (the orchestration anti-patterns)

These are summarized from `references/lessons.md` — read it for the full account. The most common Team Lead mistakes:

- **Don't make substance decisions inline.** When you find yourself deciding which defect to fix next, what acceptance bar applies, or whether to scope-shift — stop. Dispatch the Topic Director.
- **Don't trust self-reported STATUS.** Verify against the artifact before moving on.
- **Don't accept "PASS conditional" with deferrals.** Either it passes or it doesn't. Deferrals become the actual blockers.
- **Don't let Builders revise targets.** Compare reported numbers to the original spec.
- **Don't ship Builders without explicit deliverable framing.** "Implement X" is not enough — say "produce artifact Y on branch Z, committed and pushed."
- **Don't skip the investigation step on ambiguous defects.** Iron Law: investigation `.md` before any fix code.
- **Don't put two concurrent agents on the same branch.** Use paired branch names for cross-repo.

---

## Reference index

Read these on demand based on what you're doing:

- **`references/roles.md`** — Full roster: per-role concern, output schema, when to spawn, gotchas, plus per-role AGENTS.db read/write permissions.
- **`references/modes.md`** — The three operating modes in detail: when to use, researchers, substance cadence, iteration discipline.
- **`references/templates.md`** — Spawn prompt templates: T-DIR (Topic Director), T-SYN (Synthesizer), Mode 1/2/3 templates, Verifier-only audit dispatch. All updated to use `agents_search` for context retrieval.
- **`references/operations.md`** — Operational reference: file safety-mode writability matrices, AGENTS.db layer-write matrices, cross-repo branch hygiene, checkpoint state mediums.
- **`references/middleware.md`** — AGENTS.db storage and recall middleware: layer model, per-role permissions, search conventions, promotion discipline, setup instructions, worked example, anti-patterns, and how each lesson is partly addressed by the middleware. **Read before your first dispatch.**
- **`references/lessons.md`** — 11 observed failure patterns from real sessions. Each one has a mitigation tied to a universal principle. Read this before your first dispatch in any new session.
