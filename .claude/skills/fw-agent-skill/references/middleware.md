# Middleware — AGENTS.db Storage & Recall

The orchestration team uses **[AGENTS.db](https://github.com/krazyjakee/AGENTS.db)** as a vectorized flatfile context store. It sits between agents and durable knowledge — agents query it on dispatch and write to it at handoff, instead of carrying full state in context.

This solves three problems the bare orchestration playbook can't:

1. **Context bloat.** Director briefs no longer need to inline the full topic summary + 3 prior director-notes + round findings. Agents pull only the chunks they need via `agents_search`.
2. **Rework.** When a Builder hits a defect class that's been investigated before, semantic search surfaces the prior investigation instead of re-running it. Lesson #5 (wrong-direction stalls) becomes harder to fall into.
3. **Cross-agent cooperation.** A Verifier and an Investigator working in parallel can see each other's findings as they land, without the Team Lead manually shuttling files between them.

The methodology in `SKILL.md` does not change. AGENTS.db is the **storage substrate** for the durable artifacts the playbook already requires — director-notes, topic summaries, retros, investigations, build-manifests. The roles, modes, spine, and lessons all stand.

---

## The four-layer model

AGENTS.db has four layer files with strict precedence: `local > user > delta > base`. Higher-precedence layers win on conflict. This maps cleanly onto the orchestration team's existing notion of "earned knowledge."

| Layer | File | Mutability | Maps to |
|---|---|---|---|
| **base** | `AGENTS.db` | **Immutable** (never automated writes) | Project thesis, success criteria, ratified specs, this playbook, verified domain knowledge |
| **user** | `AGENTS.user.db` | Append-only, durable, committed | User-confirmed domain hints (lesson #6), approved scope-shifts, promoted findings, ratified architectures |
| **delta** | `AGENTS.delta.db` | Append-only, reviewable, committed | Director-notes, Synthesizer updates, Verifier reports, Investigation reports, Build-manifests — proposed additions awaiting promotion |
| **local** | `AGENTS.local.db` | Append-only, ephemeral, **gitignored** | In-flight Builder scratch, Verifier interim probes, Scout transient observations, iteration counter state |

**Why this maps well:** AGENTS.db's precedence model mirrors the freshness priority of the orchestration. Most recent observation wins for in-session decisions (`local`), but the absolute thesis (`base`) is never silently overridden. The `delta` layer is exactly what the team's director-notes already are: proposed additions to durable understanding, reviewed before becoming canonical.

---

## Per-role layer permissions

Layer write permissions are the durable-knowledge analog of the file-writability matrix in `operations.md`. Same discipline, different substrate.

| Role | Reads | Writes | Notes |
|---|---|---|---|
| **Team Lead** | All layers via `agents_search` | `local` (dispatch records, handoff notes) | Does not write substance to delta or user |
| **Topic Director** | All layers | `delta` (director-notes) | Director-notes go to delta as proposed routing decisions |
| **Synthesizer** | All layers | `delta` (topic-summary updates) | Summary updates are proposals; Director already made the priority calls |
| **Scout** | base, user, delta (read-only role overall) | `local` only (scout-report) | Read-only role does not contribute to durable layers |
| **Architect** | All layers | `delta` (architecture specs) | Specs promote to user only after Verifier passes the implementation |
| **Builder** | All layers | `delta` (build-manifests, investigation docs), `local` (scratch) | Builder never writes to user or base |
| **Verifier** | All layers | `delta` (verification-reports) | PASS results signal Director to consider promoting the verified spec to user |
| **Investigator** | All layers | `delta` (investigation-reports), `local` (hex/probe traces) | Iron Law: investigation precedes any fix code |
| **Historian** | All layers, deeply | `delta` (retro), **promotion authority** (delta → user) | Sole automated-side authority to promote delta records to user |

**The Historian's promotion authority is what makes the system work.** End-of-session, the Historian reads the session's delta records and decides which have earned promotion to `user`. This is the formal mechanism for "this learning has been earned" — the moment a transient finding becomes durable team knowledge.

**Promotion to `base` is human-only.** Per the AGENTS.db design, the base layer is immutable from automated work. Use `agentsdb import --allow-base` only via human-approved process (PR review, etc.).

---

## Search conventions

Agents query AGENTS.db using `agents_search`. To make searches reliable across roles, use these conventions when writing records.

### Record kinds (the `kind` field)

Use a small, stable taxonomy. Recommended kinds:

| Kind | What it represents | Written by |
|---|---|---|
| `director_note` | Per-round Director routing decision | Topic Director |
| `topic_summary` | Living summary of a topic | Synthesizer |
| `architecture_spec` | Named-interface spec with acceptance criteria | Architect |
| `build_manifest` | Files changed, with brief implementation notes | Builder |
| `verification_report` | Pass/fail per acceptance criterion | Verifier |
| `investigation_report` | Root cause with evidence | Investigator |
| `scout_report` | State validation, do-not-break list | Scout |
| `retro` | End-of-session retrospective | Historian |
| `domain_hint` | User-supplied or earned domain knowledge | User direct, or Historian on promotion |
| `lesson` | A failure pattern observed and its mitigation | Historian on promotion |
| `dispatch_record` | "Builder dispatched at T for topic X" — handoff trace | Team Lead |

Filter searches by kind when you know what you want: `agents_search --kind director_note --query "scope-shift signals last week"`.

### Scoping records to topics and tracks

Tag records with `topic:<topic-id>` and `track:<track-id>` strings in their content (or in metadata if your AGENTS.db version supports structured tags). This lets agents scope searches: "show me all `verification_report`s tagged `topic:cache-invalidation` from this track."

### Search-first dispatch

The default mid-dispatch pattern is now:

1. Agent receives brief.
2. Agent runs 2–4 `agents_search` calls to pull relevant prior context (e.g., past director-notes for this topic, related investigations, named samples).
3. Agent works against the spec + retrieved context.
4. Agent writes its output as a record (or records) to the assigned layer.

This is a meaningful change from the file-only approach: briefs now describe **what to search for**, not **what to read**. Briefs get smaller; recall gets richer.

### Search anti-patterns

- **Don't search before the spec is in hand.** The spec defines the acceptance bar; searching first risks the agent re-defining the problem to match what's findable.
- **Don't trust a single low-confidence hit.** AGENTS.db returns chunks ranked by similarity; a hit at 0.3 cosine similarity is not evidence. Cross-reference at least two hits or fall back to the file artifact.
- **Don't write the same finding to multiple layers.** Write once at the appropriate layer. Promotion goes upward through the discipline above.

---

## Promotion discipline

A finding's lifecycle:

```
local (in-flight)
   ↓ end of dispatch — agent decides if durable
delta (proposed, reviewable)
   ↓ end of session — Historian decides what's earned
user (durable team knowledge)
   ↓ human review only
base (canonical thesis)
```

**Local → delta**: Any agent at dispatch close. If the finding will matter beyond this session, write to delta. If it's session-only scratch, leave it in local.

**Delta → user**: **Historian sole authority** at end-of-session. Promotion criteria (Historian checklist):
- Has this finding survived at least one Director routing pass without revision?
- Has any implementation against it been Verifier-passed (for architecture specs)?
- Is it consistent with prior user-layer records, or does it explicitly supersede a specific prior record?
- Did the user explicitly affirm it (for `domain_hint` records)?

If yes to the relevant criteria, promote. If no, leave in delta — it's not earned yet.

**Special case: domain_hint records from the user.** When the user volunteers domain knowledge mid-session (lesson #6), the Team Lead writes it directly to `user` (not delta). User-authored knowledge is canonical immediately. Tag the record with `source:user` to make this auditable.

**User → base**: Human-only. Typically done at major release boundaries via `agentsdb import --allow-base`. The orchestration team never does this autonomously.

---

## Setup

Tested against AGENTS.db v0.1.9.

### Install AGENTS.db

```bash
curl -fsSL https://raw.githubusercontent.com/krazyjakee/AGENTS.db/main/scripts/install.sh | bash
agentsdb --help
```

### Initialize in the project root

```bash
cd <project-root>
agentsdb options wizard          # configure embedder backend (hash/openai/voyage/etc.)
agentsdb init                    # creates AGENTS.db from existing docs
```

### Compile the orchestration playbook into base

The orchestration playbook itself belongs in `base` — it's canonical methodology. After installing this skill into `.claude/skills/agent-team-orchestration/`:

```bash
agentsdb compile --out AGENTS.db --replace \
  .claude/skills/agent-team-orchestration/SKILL.md \
  .claude/skills/agent-team-orchestration/references/*.md
```

`--replace` is correct here only at first install. Subsequent updates to the skill go through human review and are recompiled deliberately — base is immutable from automated work.

### Register the MCP server with Claude Code

```bash
claude mcp add --transport stdio --scope project agentsdb -- \
  agentsdb serve \
    --base   "$PWD/AGENTS.db" \
    --user   "$PWD/AGENTS.user.db" \
    --delta  "$PWD/AGENTS.delta.db" \
    --local  "$PWD/AGENTS.local.db"
```

Once registered, subagents have `agents_search` and `agents_context_write` available as MCP tools.

### Gitignore the local layer

```gitignore
AGENTS.local.db
```

Commit `AGENTS.db`, `AGENTS.user.db`, `AGENTS.delta.db`. Treat `AGENTS.delta.db` like a PR-reviewable artifact — diffs of it should be reviewable in pull requests, even if the diff is binary-ish (use `agentsdb inspect` in CI for human-readable PR previews).

---

## Worked example — a Mode 2 round using AGENTS.db

Suppose the team is mid-build on a cache-invalidation refactor. Round N just ended; Verifier reported NEEDS_FIX with three items.

**Without AGENTS.db (the old way):**

Team Lead writes a Director dispatch brief that includes:
- Verifier's report (~1500 tokens)
- The current topic-summary (~2000 tokens)
- Last 3 director-notes (~3000 tokens)
- The Architect's spec (~1500 tokens)

Total brief: ~8000 tokens just to give the Director enough context to do continuity check.

**With AGENTS.db (the new way):**

Team Lead writes a Director dispatch brief:
```
Topic Director dispatch for topic:cache-invalidation track:refactor-q2.

Round N just closed. Verifier report committed to AGENTS.delta.db
(record id: ver-cache-inv-N). NEEDS_FIX with 3 items.

Search guidance for this round:
- agents_search --kind director_note --query "cache-invalidation continuity"  (last 3 rounds)
- agents_search --kind verification_report --query "cache-invalidation NEEDS_FIX"
- agents_search --kind architecture_spec --query "cache-invalidation interfaces"
- agents_search --kind investigation_report --query "cache invalidation race conditions"

Write your director-note as kind:director_note to delta layer with topic and
track tags. Apply the Director template (see SKILL.md / templates.md).

Continuity check focus this round: are we hitting the iteration ceiling
(now at round N) or has the work nature shifted?
```

Brief size: ~600 tokens. Director pulls only relevant chunks. Same effective context, fraction of the size. And the Director has access to *all* prior history via search — not just the 3 most recent notes.

**Cross-agent benefit:** if a parallel Investigator is exploring a related defect on a different branch, they can `agents_search` and surface findings the Director would otherwise have missed. The Team Lead doesn't have to manually shuttle the Investigator's report into the Director's brief.

---

## How this changes each role's templates

The dispatch templates in `templates.md` should now include search guidance instead of inlining context. Specifically:

- **T-DIR**: instead of "read the last 3 director-notes," say "search AGENTS.db for `kind:director_note topic:<topic>` recent."
- **T-SYN**: instead of "read the current topic summary," say "search AGENTS.db for `kind:topic_summary topic:<topic>` latest."
- **Templates A/B/C**: include a "search guidance" block listing the queries the agent should run before starting work.
- **Output instructions**: every template now ends with "write outputs as records to the appropriate layer" alongside (or instead of) "commit the .md file."

See the updated templates in `templates.md`.

---

## Anti-patterns

### 1. Treating local as durable

`AGENTS.local.db` is gitignored. Anything written there is gone when the container resets or the agent shuts down. If a finding is durable, write to delta.

### 2. Skipping promotion at session-end

If the Historian doesn't run promotion at end-of-session, durable findings stay in delta forever. Delta accumulates clutter; user starves; the system slowly degrades to "we have a lot of proposals but no canonical knowledge." **Run the Historian.**

### 3. Writing to user from a non-Historian role

Only the Historian (and the Team Lead for direct user-supplied `domain_hint` records) writes to user. If a Builder or Architect writes to user, they're claiming authority they don't have. Catch this in code review of `AGENTS.user.db` diffs.

### 4. Searching before the spec is in hand

Search after you know what acceptance looks like, not before. Pre-spec searching tempts the agent to re-frame the problem to match what's findable.

### 5. Not tagging records with topic and track

Untagged records become unsearchable noise within a few sessions. Every record should carry `topic:<id>` and `track:<id>` tags in content (or structured metadata if supported).

### 6. Trusting low-confidence search hits

`agents_search` returns ranked results; rank does not equal correctness. A hit at 0.3 similarity is suggestive, not authoritative. Cross-reference or fall back to the file artifact.

### 7. Letting delta grow without review

Delta is **proposed**. If nothing ever gets reviewed and promoted, you've recreated the original "everything in one place, nothing canonical" problem AGENTS.md was built to solve. Schedule periodic Historian sweeps even outside session boundaries if delta growth is fast.

---

## Failure-mode coverage map

How AGENTS.db helps with the lessons in `lessons.md`:

| Lesson | How AGENTS.db helps |
|---|---|
| #3 (deferrals were the actual blockers) | `verification_report` records make deferrals searchable; Director can query "all deferred items in this topic" before routing |
| #4 (aggregate stats hid sample failures) | Named samples become first-class records; `agents_search --kind named_sample` returns them directly |
| #5 (wrong-direction stalls) | Builder pre-search of `kind:investigation_report` surfaces prior dead-ends |
| #6 (domain knowledge gaps) | `domain_hint` records in `user` layer are searchable forever; the cache becomes a queryable store |
| #8 (iteration budget on wrong problem) | Director's continuity check uses semantic search over recent director-notes — drift detection improves |
| #9 (Verifier missed under-extraction) | Verifier briefs include search for "prior under-extraction findings on this topic" — the bidirectional check has memory |

Lessons #1, #2, #7, #10, #11 are still primarily addressed by the universal principles and role discipline. AGENTS.db is a force multiplier for memory; it doesn't replace orchestration discipline.
