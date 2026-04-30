# Roles — Full Roster

Every role has a single concern, a clear output, and a defined spawn timing. **Roles do not encroach on each other's concerns** — that's the whole point of separating them.

---

## Team Lead — orchestration

**Concern:** Orchestration only. *How* the work gets executed mechanically.

**Filled by:** This Claude session. Always present.

**Owns:**
- Decomposition of the user's intent into dispatchable pieces
- Dispatch decisions (which subagent, when, which branch)
- Branch and merge mechanics
- Verifying STATUS reports against actual artifacts (don't trust self-reports)
- Logistical surface-to-user triggers

**Does NOT own:**
- Substance decisions (which defect to fix, what acceptance bar applies, whether to scope-shift). **Defer to Topic Director.**
- Knowledge capture (don't write topic summaries inline). **Defer to Synthesizer.**
- Retrospective synthesis. **Defer to Historian.**

If you find yourself making substance calls inline, you're conflating concerns. Stop and dispatch the Topic Director.

---

## Topic Director — substance governance

**Concern:** Substance governance. Deciding what advances the topic, what's noise, what signals scope-shift, how to refine the next brief.

**Filled by:** Subagent (Sonnet-class).

**Spawn timing:** After every Verifier round; at scope-shift moments; at session start (after reading state and summary).

**Output:** Director-note at `docs/topic-director-notes/<topic>-<YYYY-MM-DD>.md`. Additive — one per round, never overwrites. Covers:
1. **On-thesis assessment** — which findings advance the topic, which are noise
2. **Routing** — which findings go to Synthesizer for summary update
3. **Priority** — HIGH / MEDIUM / LOW per finding
4. **Scope signal** — continue current direction / switch direction / surface to user
5. **Refined brief for next Researcher** — substance content of the next dispatch (acceptance criteria, named samples, defect class)
6. **Surface-to-user triggers** — any conditions met that warrant interrupt
7. **Continuity check** — drift, repeat-fixing, wrong-direction signals across recent notes

**Does NOT:**
- Dispatch agents (Team Lead's job)
- Write the topic summary itself (Synthesizer's job)
- Pick branches or argue with merge mechanics

**Anti-patterns the Director must check for** on every round:
- Did the Researcher revise targets? (Compare reported numbers to spec.)
- Are there sample-level failures hidden by aggregate statistics?
- Were any acceptance items silently deferred?
- Has the work nature shifted? (Signal: budget reset.)
- Is the same defect class hitting the iteration ceiling? (Signal: surface to user.)

The Director is the substance authority. **Take its conclusions seriously even when inconvenient.**

---

## Synthesizer — substance knowledge capture

**Concern:** Substance knowledge capture. Maintaining the living topic summary as the durable representation of where the topic stands.

**Filled by:** Subagent (Sonnet-class).

**Spawn timing:** When the Topic Director routes findings for synthesis.

**Output:** Updated `docs/topic-summaries/<topic>-summary.md`. Living document; preserves what wasn't superseded by routed findings. Schema:

```markdown
# Topic Summary — <topic>

**Last updated:** <date>
**Active rounds:** <count>

## Current understanding
What we now believe is true about the topic, in 2-3 paragraphs.

## What changed in the most recent round
- Researcher shipped X
- Verifier found Y
- Director routed Z
- Therefore we now know W

## Distance to product goal
Specifically: what we have, what's blocking, what's next.

## Open questions
For Director or for user.
```

**Does NOT:**
- Make priority calls (Director already did)
- Add findings the Director marked as noise
- Change priorities

The Synthesizer writes the prose; the Director made the calls.

---

## Scout — research survey

**Concern:** Research — survey. Validating state vs reality at session start; producing read-only audit reports.

**Filled by:** Subagent (Sonnet-class).

**Spawn timing:** Start of session; OR audit-only dispatches.

**Output:** `scout-report.md`: state validation, repo state, do-not-break list, risk register. **Read-only — never commits, never modifies files.**

A Scout's job is to bring you ground truth before any Builder gets dispatched. State files lie sometimes; the Scout catches that.

---

## Architect — research design

**Concern:** Research — design. Specifying interfaces and acceptance criteria before code is written.

**Filled by:** Subagent (Sonnet-class).

**Spawn timing:** Mode 2 only, when the design choice is non-trivial.

**Output:** `<topic>-architecture.md`: spec with named interfaces + acceptance criteria + alternatives considered. **No code.**

The Architect's deliverable is what the Builder consumes. If the Architect leaves ambiguity, the Builder will resolve it inconsistently and the Verifier will report mismatches.

---

## Builder — research implementation

**Concern:** Research — implementation. Producing the actual code/data/artifacts.

**Filled by:** Subagent (Sonnet-class).

**Spawn timing:** Mid-session, after Director has set direction (and Architect has speced, in Mode 2).

**Output:** `build-manifest.md` listing files changed, plus investigation docs for any reverse-engineering. **Commits and pushes** to the assigned branch.

**Critical Builder-side anti-patterns** (these have happened — see `lessons.md`):
- Declaring "PASS" by revising targets
- Reporting code-complete without running the artifact-producing step
- "PASS conditional" deferrals that turn out to be the actual blockers
- Adding heuristic patches without root-cause investigation (Iron Law violation)
- Hand-writing large lookup tables when the lookup is derivable

**Status report format:** `STATUS: DONE | PARTIAL | BLOCKED` with concrete numbers per acceptance item. PARTIAL must enumerate exactly what's still missing — not a hand-wave.

---

## Verifier — research validation

**Concern:** Research — validation. Auditing Builder output against spec.

**Filled by:** Subagent (Sonnet-class).

**Spawn timing:** After every Builder dispatch.

**Output:** `verification-report.md`: pass/fail per concrete acceptance criterion. Audit-only branch (`verify/<topic>` in primary repo) — does NOT modify the Builder's branch.

**Critical: every Verifier dispatch is bidirectional.**
- Under-extraction / under-implementation: did the Builder miss things the spec required?
- Over-counting / spurious behavior: did the Builder produce things the spec didn't ask for?

**Critical: every Verifier dispatch uses sample-based checks**, not just aggregate statistics. "95.6% pass rate" hid 10/12 well-known cases failing in lesson #4. Named samples come from the Director's note for the round.

**Status report format:** `PASS | NEEDS_FIX with bullet list | BLOCKED`.

---

## Investigator — research root-cause

**Concern:** Research — root-cause investigation. Understanding *why* a defect occurs before any fix is written.

**Filled by:** Subagent (Sonnet-class).

**Spawn timing:** On-demand for crashes, blocked Builders, or any defect where the cause isn't obvious.

**Output:** `investigation-report.md`: root cause with evidence (hex dumps, sample entries, traces). **Iron Law applies: no fix code in this dispatch.**

Investigation precedes fix. Lesson #10 documents the cost of skipping this — heuristic patches without investigation produce worse problems downstream.

---

## Historian — substance retrospective

**Concern:** Substance retrospective. Consolidating session artifacts into durable state.

**Filled by:** Subagent (Sonnet-class).

**Spawn timing:** End of session.

**Output:**
- `retro.md` — session retrospective: what was attempted, what worked, what failed, lessons for next session
- Updated `state-<track>.md` — single-pointer state at repo root

**Does NOT:**
- Dispatch further agents
- Reopen substance questions the Director already closed

The Historian's job is to make tomorrow's resume cheap. If the Historian writes well, the next session's Resume Protocol takes minutes instead of hours.

---

## AGENTS.db layer-write permissions (cross-role reference)

Every role above has both a **file-output convention** (the `.md` artifact described per-role) and an **AGENTS.db layer-write permission**. Same discipline, two substrates.

| Role | local | delta | user |
|---|:---:|:---:|:---:|
| Team Lead | ✓ (dispatch records) | — | ✓ only `domain_hint` records sourced directly from user |
| Topic Director | — | ✓ (`director_note`) | — |
| Synthesizer | — | ✓ (`topic_summary`) | — |
| Scout | ✓ (`scout_report`) | — | — |
| Architect | — | ✓ (`architecture_spec`) | — |
| Builder | ✓ (scratch) | ✓ (`build_manifest`, `investigation_report`) | — |
| Verifier | — | ✓ (`verification_report`) | — |
| Investigator | ✓ (probes) | ✓ (`investigation_report`) | — |
| Historian | read all | ✓ (`retro`) | **promotion authority (delta → user)** |

The base layer is **never** written from automated work. Promotion to base requires human review.

**The Historian's promotion authority is the formal "earned learning" gate.** A finding becomes durable team knowledge only when the Historian decides it has earned promotion at end-of-session — survived a Director routing pass, been Verifier-PASSed (for specs), or affirmed by the user (for domain hints).

Full layer model, search conventions, promotion criteria, and setup are in `references/middleware.md`.
