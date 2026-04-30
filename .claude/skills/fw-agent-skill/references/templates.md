# Spawn Prompt Templates

Every template assumes you (Team Lead) have already:
1. Decided the operating mode
2. Run the universal pre-flight checklist
3. Dispatched the Topic Director (or have a recent enough director-note to brief from)

Every template includes a **"Substance from Topic Director"** line near the top, pointing to the latest director-note. **You fill this in based on the most recent Director output.** If you don't have one, dispatch T-DIR first.

Project-specific paths and conventions (state files, branch naming, paired repos) need to be substituted in at dispatch time. Defaults shown use generic placeholders.

---

## Template T-DIR — Topic Director dispatch

```
Topic Director dispatch for topic:<topic-id> track:<track-id>.

Round <N> just closed. Round findings are records in AGENTS.delta.db
(record ids: <list of ids the Researchers wrote this round>).

Search guidance — run these before writing your director-note:
- agents_search --kind director_note --query "<topic-id> continuity"  (recent priors)
- agents_search --kind topic_summary --query "<topic-id>"             (latest summary)
- agents_search --kind verification_report --query "<topic-id>"        (round results)
- agents_search --kind investigation_report --query "<topic-id>"       (related root-cause work)
Pull only what's needed. Do not inline full prior notes — search and cite by id.

Your job: governance. Write a director-note as a delta-layer record:
  kind: director_note
  scope: delta
  tags include: topic:<topic-id>, track:<track-id>, round:<N>
  content: see structure below.

Optional file mirror: also write docs/topic-director-notes/<topic-id>-<YYYY-MM-DD>.md
for human-reviewable PR diff. (See middleware.md — projects choose mirror or native mode.)

Director-note structure:
1. **On-thesis assessment**: which findings advance the topic? Which are noise?
2. **Routing**: which finding ids go to Synthesizer for summary update? (Be specific:
   "Finding ver-cache-N warrants update to summary section Y.")
3. **Priority**: HIGH / MEDIUM / LOW per finding.
4. **Scope signal**: continue current direction / switch direction / surface to user.
   Justify briefly.
5. **Refined brief for next Researcher**: substance content of the next dispatch
   (acceptance criteria, named samples, defect class).
6. **Surface-to-user triggers**: any conditions met that warrant user interrupt?
7. **Continuity check**: do recent director-notes show drift, repeat-fixing,
   wrong-direction signals? Use search results to back any claims here.

Do NOT write the topic summary itself; that's the Synthesizer's job. Do NOT
dispatch agents; that's the Team Lead's job. Your output is the director-note record.

Status: STATUS: ROUTED with bullet summary + new record id, or
STATUS: SCOPE_SHIFT_NEEDED with the specific surface request, or STATUS: BLOCKED.
```

---

## Template T-SYN — Synthesizer dispatch

```
Synthesizer dispatch for topic:<topic-id> track:<track-id>.

Search guidance — run these before writing the summary update:
- agents_search --kind director_note --query "<topic-id>" --limit 1     (latest only)
- agents_search --kind topic_summary --query "<topic-id>" --limit 1     (current summary)
- For each finding the Director routed: fetch by id directly (no search).

Your job: update the topic summary. The Director made the priority calls; you
write the prose. Update sections:

1. **Current understanding** — refresh based on routed findings
2. **What changed in the most recent round** — concrete one-paragraph note,
   citing finding ids
3. **Distance to product goal** — refresh based on what we now know
4. **Open questions** — add new ones, retire resolved ones

Preserve everything in the summary that wasn't superseded by routed findings.
Do NOT add findings the Director marked as noise. Do NOT change priorities;
the Director set them.

Output: a new topic_summary record in AGENTS.delta.db with:
  kind: topic_summary
  scope: delta
  tags: topic:<topic-id>, track:<track-id>, supersedes:<prior-summary-id>
  content: the updated summary

Optional file mirror: also write docs/topic-summaries/<topic-id>-summary.md
if the project uses mirror mode.

Status: STATUS: UPDATED with diff summary + new record id, or STATUS: BLOCKED.
```

---

## Template A — Mode 1 (experiment loop / per-direction research)

```
Mode 1 experiment-loop session for <DIRECTION> on topic:<topic-id> track:<track-id>.

Substance from Topic Director: search AGENTS.db for the latest director-note:
  agents_search --kind director_note --query "<topic-id>" --limit 1
- Director's recommended focus this round: <copy from director-note>
- Acceptance criteria: <copy from director-note>
- Named samples to validate: <copy from director-note>

Search guidance for context:
- agents_search --kind investigation_report --query "<topic-id> related defects"
- agents_search --kind domain_hint --query "<topic-id>"
- agents_search --kind verification_report --query "<topic-id> prior runs"

Repositories in scope:
- <PRIMARY repo> (primary-write): branch <feature-tag>
  - writable: <list of files this mode allows writing>
  - read-only: <list of frozen files for this mode>
- <PAIRED repo if any>: read-only — reference only

Active state files:
- state-<track>.md (file-based, single-pointer)
- AGENTS.local.db (your scratch — gitignored)
- AGENTS.delta.db (your durable outputs land here)

Universal spawn principles apply.

Spawn:
- Scout: validate state file vs reality. Read-only. Output: scout_report record to local.
- Builder: per Director's refined brief. Each experiment edits → run → keep/discard → commit.
  Output: build_manifest records to delta, scratch to local.
- Verifier: confirm results vs commits; rerun evaluation script if available;
  bidirectional check. Output: verification_report record to delta.

After Verifier: Team Lead dispatches Topic Director (T-DIR template).
Then Synthesizer (T-SYN) if routed.
End of session: Historian — promotes earned delta records to user.

Safety: Guarded mode. Iron Law: any crash → Investigator (separate spawn).
```

---

## Template B — Mode 2 (build / refactor)

```
Mode 2 build session for <COMPONENT> on topic:<topic-id> track:<track-id>.

Substance from Topic Director: search AGENTS.db for the latest director-note:
  agents_search --kind director_note --query "<topic-id>" --limit 1
- Architect/Builder focus: <copy from director-note>
- Acceptance criteria: <copy>
- Named samples: <copy>

Search guidance for context (run before each phase):
- Scout phase: agents_search --kind scout_report --query "<component> existing landscape"
- Architect phase: agents_search --kind architecture_spec --query "<component> related interfaces"
- Builder phase: agents_search --kind build_manifest --query "<component> prior builds"
                 agents_search --kind investigation_report --query "<component>"
- Verifier phase: agents_search --kind verification_report --query "<component> prior audits"

Repositories: <PRIMARY repo + branch> + <PAIRED repo + branch> if cross-repo.

Universal spawn principles apply.

Phases:
1. Scout: existing landscape, do-not-break list, risk register. Read-only.
   Output: scout_report record to local.
2. Architect: spec with named interfaces + acceptance + alternatives. No code.
   Output: architecture_spec record to delta.
3. Builder: implement per spec; one commit per logical phase; tests must pass.
   Output: build_manifest record to delta, scratch to local.
4. Verifier: bidirectional + sample-based audit against spec.
   Output: verification_report record to delta.

After Verifier: Team Lead dispatches Topic Director. Loop continues per
Director's direction. Architect spec promotes from delta → user only after
Verifier PASS (Historian executes promotion).
```

---

## Template C — Mode 3 (defect fix)

```
Mode 3 focused defect fix session on topic:<topic-id> track:<track-id>.

Substance from Topic Director: search AGENTS.db for the latest director-note:
  agents_search --kind director_note --query "<topic-id>" --limit 1
- Defect class for THIS dispatch: <single defect, no bundling>
- Root cause hypothesis (if any): <from director-note>
- Acceptance criteria: <runnable script paths or precise checks>

Search guidance — REQUIRED before any fix code (Iron Law):
- agents_search --kind investigation_report --query "<defect class>"
- agents_search --kind domain_hint --query "<defect class>"
- agents_search --kind verification_report --query "<defect class> prior failures"
If a prior investigation exists with overlapping root cause, cite it in your
investigation_report. Do not redo work that's already in delta or user.

Repositories: <PRIMARY + paired if cross-repo>.

Universal spawn principles apply.

Phases:
1. Investigation: produce an investigation_report record to delta. Hex dumps,
   sample entries, root cause. NO code yet.
2. Fix: implement per investigation findings. Tests must pass.
   Output: build_manifest record to delta.
3. Re-extract / re-run: produce updated artifact; push to branch.
4. Self-audit against acceptance BEFORE claiming done.

Acceptance: <single-defect criterion as runnable script output>.

Status: DONE only if acceptance passes; PARTIAL with explicit list otherwise; BLOCKED.

After Verifier: Team Lead dispatches Topic Director.
```

---

## Template D — Verifier-only audit dispatch

```
Verifier-only audit dispatch on topic:<topic-id> track:<track-id>. Read-only.

Substance from Topic Director: search AGENTS.db for the latest director-note:
  agents_search --kind director_note --query "<topic-id>" --limit 1
- Audit target: <branch / PR / directory>
- Spec to verify against: search agents_search --kind architecture_spec --query "<topic-id>" --limit 1
  (or path if no record yet)
- Specific items to check (Director's priority list): <copy>

Search guidance:
- agents_search --kind verification_report --query "<topic-id> prior audits"
- agents_search --kind investigation_report --query "<topic-id> known issues"

Universal spawn principles apply. Bidirectional + sample-based + cite original spec.

Method:
1. Pull target branch.
2. For each spec item, measure against actual.
3. Sample-based checks: <NAMED SAMPLE LIST per Director's note — search if needed>
4. Look for under-extraction AND over-counting.

Output: verification_report record to delta with:
  kind: verification_report
  tags: topic:<topic-id>, track:<track-id>, audit-target:<branch/PR>
  content: pass/fail per criterion + sample-level evidence

Optional file mirror: <topic-id>-audit.md committed to verify/<topic> branch.

Status: PASS | NEEDS_FIX with bullet list | BLOCKED.

Director will route findings post-audit.
```

---

## Filling in templates — Team Lead checklist

Before sending any of the above:

- ☐ Substance line points to a fresh director-note (not stale, not made up)? Run `agents_search --kind director_note --query "<topic-id>" --limit 1` to verify recency.
- ☐ Search guidance block includes 2–4 concrete `agents_search` queries the agent should run before working?
- ☐ Acceptance criteria are runnable, not interpretive?
- ☐ Named samples specified (not "spot-check a few")? Searchable as records?
- ☐ Branch name decided; doesn't collide with another active agent?
- ☐ Cross-repo work uses paired branch names, both PR descriptions cross-reference?
- ☐ Single-defect or single-direction scope?
- ☐ Iron Law respected — no fix dispatch without prior investigation when defect is ambiguous? (Search `kind:investigation_report` first.)
- ☐ Surface conditions explicit?
- ☐ Output instructions specify which AGENTS.db layer to write to (delta for durable, local for scratch)?
- ☐ Records will carry `topic:<id>` and `track:<id>` tags for searchability?
- ☐ Agent's role does not exceed its layer-write permissions (see `roles.md` and `middleware.md`)?

If any unchecked, fix before dispatching.
