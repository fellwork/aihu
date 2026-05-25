# Spawn Prompt Templates

Every template assumes you (Team Lead) have already:
1. Decided the operating mode
2. Run the universal pre-flight checklist
3. Dispatched the Topic Director (or have a recent enough director-note to brief from)

Every template includes a **"Substance from Topic Director"** line near the top, pointing to the latest director-note. **You fill this in based on the most recent Director output.** If you don't have one, dispatch T-DIR first.

Project-specific paths and conventions (state files, branch naming, paired repos, the project slug used in GBrain page prefixes) need to be substituted in at dispatch time. Defaults shown use generic placeholders.

**A note on subagent namespace:** GBrain wraps subagent `put_page` calls to `wiki/agents/<subagent-id>/.+` by default. When a subagent's brief calls for writing a *durable* page (to `<project>/delta/...` or `<project>/user/...`), the standard pattern is for the subagent to return content in its STATUS report and for **the Team Lead** to write the page after verifying the STATUS. The templates below frame this as "write outputs as a STATUS payload; Team Lead will commit the page to GBrain." For scratch/probes/in-flight work, the subagent writes directly under its own `wiki/agents/<id>/` namespace.

---

## Template T-DIR — Topic Director dispatch

```
Topic Director dispatch for topic:<topic-id> track:<track-id>.

Round <N> just closed. Round findings live in GBrain at slugs:
  <project>/delta/<topic-id>/<N>/build-manifest
  <project>/delta/<topic-id>/<N>/verification-report
  <project>/delta/<topic-id>/<N>/<other> (if any)

Search guidance — run these before writing your director-note (use mcp__gbrain__search):
- query: "kind:director_note topic:<topic-id> layer:delta continuity"   (recent priors)
- query: "kind:topic_summary topic:<topic-id> layer:delta"               (latest summary)
- query: "kind:verification_report topic:<topic-id> layer:delta"         (round results)
- query: "kind:investigation_report topic:<topic-id>"                    (related root-cause work)
Pull only what's needed. Use mcp__gbrain__get_page for known slugs; do not inline full prior notes.

Your job: governance. Write a director-note as a STATUS payload; Team Lead will commit
the page to GBrain at slug:
  <project>/delta/<topic-id>/<N+1>/director-note
with tags: kind:director_note, layer:delta, topic:<topic-id>, track:<track-id>, round:<N+1>.

Director-note content structure:
1. **On-thesis assessment**: which findings advance the topic? Which are noise?
2. **Routing**: which finding slugs go to Synthesizer for summary update?
   (Be specific: "Page <slug> warrants update to summary section Y.")
3. **Priority**: HIGH / MEDIUM / LOW per finding.
4. **Scope signal**: continue current direction / switch direction / surface to user.
   Justify briefly.
5. **Refined brief for next Researcher**: substance content of the next dispatch
   (acceptance criteria, named samples, defect class).
6. **Surface-to-user triggers**: any conditions met that warrant user interrupt?
7. **Continuity check**: do recent director-notes show drift, repeat-fixing,
   wrong-direction signals? Use search results to back any claims here.

Do NOT write the topic summary itself; that's the Synthesizer's job. Do NOT
dispatch agents; that's the Team Lead's job. Your output is the director-note content.

Status: STATUS: ROUTED with bullet summary + intended slug, or
STATUS: SCOPE_SHIFT_NEEDED with the specific surface request, or STATUS: BLOCKED.
```

---

## Template T-SYN — Synthesizer dispatch

```
Synthesizer dispatch for topic:<topic-id> track:<track-id>.

Search guidance — run these before writing the summary update (use mcp__gbrain__search):
- query: "kind:director_note topic:<topic-id> layer:delta" --limit 1     (latest only)
- query: "kind:topic_summary topic:<topic-id> layer:delta" --limit 1     (current summary)
- For each finding slug the Director routed: mcp__gbrain__get_page directly (no search).

Your job: update the topic summary. The Director made the priority calls; you
write the prose. Update sections:

1. **Current understanding** — refresh based on routed findings
2. **What changed in the most recent round** — concrete one-paragraph note,
   citing finding slugs
3. **Distance to product goal** — refresh based on what we now know
4. **Open questions** — add new ones, retire resolved ones

Preserve everything in the summary that wasn't superseded by routed findings.
Do NOT add findings the Director marked as noise. Do NOT change priorities;
the Director set them.

Output: return updated summary as STATUS payload. Team Lead will commit to GBrain at:
  <project>/delta/<topic-id>/topic-summary-<new-version>
with tags: kind:topic_summary, layer:delta, topic:<topic-id>, track:<track-id>,
supersedes:<prior-summary-slug>.

Status: STATUS: UPDATED with diff summary + intended slug, or STATUS: BLOCKED.
```

---

## Template A — Mode 1 (experiment loop / per-direction research)

```
Mode 1 experiment-loop session for <DIRECTION> on topic:<topic-id> track:<track-id>.

Substance from Topic Director: pull the latest director-note via
  mcp__gbrain__search query: "kind:director_note topic:<topic-id> layer:delta" --limit 1
- Director's recommended focus this round: <copy from director-note>
- Acceptance criteria: <copy from director-note>
- Named samples to validate: <copy from director-note>

Search guidance for context:
- mcp__gbrain__search query: "kind:investigation_report topic:<topic-id> related defects"
- mcp__gbrain__search query: "kind:domain_hint topic:<topic-id> layer:user"
- mcp__gbrain__search query: "kind:verification_report topic:<topic-id> prior runs"

Repositories in scope:
- <PRIMARY repo> (primary-write): branch <feature-tag>
  - writable: <list of files this mode allows writing>
  - read-only: <list of frozen files for this mode>
- <PAIRED repo if any>: read-only — reference only

Active state:
- state-<track>.md (file-based, single-pointer)
- GBrain Supabase brain (your durable outputs land here as pages)
- Your subagent scratch: wiki/agents/<your-id>/ (your in-flight notes; gitignored equivalent)

Universal spawn principles apply.

Spawn:
- Scout: validate state file vs reality. Read-only. Output: scout_report content;
  may write own probes to wiki/agents/<scout-id>/.
- Builder: per Director's refined brief. Each experiment edits → run → keep/discard → commit.
  Output: build_manifest content as STATUS payload for Team Lead to commit at
  <project>/delta/<topic-id>/<N>/build-manifest. Scratch under wiki/agents/<builder-id>/.
- Verifier: confirm results vs commits; rerun evaluation script if available;
  bidirectional check. Output: verification_report content as STATUS payload for
  Team Lead to commit at <project>/delta/<topic-id>/<N>/verification-report.

After Verifier: Team Lead dispatches Topic Director (T-DIR template).
Then Synthesizer (T-SYN) if routed.
End of session: Historian — promotes earned delta pages to <project>/user/<topic>/...

Safety: Guarded mode. Iron Law: any crash → Investigator (separate spawn).
```

---

## Template B — Mode 2 (build / refactor)

```
Mode 2 build session for <COMPONENT> on topic:<topic-id> track:<track-id>.

Substance from Topic Director: pull the latest director-note via
  mcp__gbrain__search query: "kind:director_note topic:<topic-id> layer:delta" --limit 1
- Architect/Builder focus: <copy from director-note>
- Acceptance criteria: <copy>
- Named samples: <copy>

Search guidance for context (run before each phase):
- Scout phase: mcp__gbrain__search query: "kind:scout_report <component> existing landscape"
- Architect phase: mcp__gbrain__search query: "kind:architecture_spec <component> related interfaces"
- Builder phase: mcp__gbrain__search query: "kind:build_manifest <component> prior builds"
                 mcp__gbrain__search query: "kind:investigation_report <component>"
- Verifier phase: mcp__gbrain__search query: "kind:verification_report <component> prior audits"

Repositories: <PRIMARY repo + branch> + <PAIRED repo + branch> if cross-repo.

Universal spawn principles apply.

Phases:
1. Scout: existing landscape, do-not-break list, risk register. Read-only.
   Output: scout_report content; scratch to wiki/agents/<scout-id>/.
2. Architect: spec with named interfaces + acceptance + alternatives. No code.
   Output: architecture_spec content as STATUS payload for Team Lead to commit at
   <project>/delta/<topic-id>/<N>/architecture-spec.
3. Builder: implement per spec; one commit per logical phase; tests must pass.
   Output: build_manifest content as STATUS payload for Team Lead to commit at
   <project>/delta/<topic-id>/<N>/build-manifest. Scratch under wiki/agents/<builder-id>/.
4. Verifier: bidirectional + sample-based audit against spec.
   Output: verification_report content as STATUS payload for Team Lead to commit at
   <project>/delta/<topic-id>/<N>/verification-report.

After Verifier: Team Lead dispatches Topic Director. Loop continues per
Director's direction. Architect spec promotes from delta → user only after
Verifier PASS (Historian executes promotion at end of session).
```

---

## Template C — Mode 3 (defect fix)

```
Mode 3 focused defect fix session on topic:<topic-id> track:<track-id>.

Substance from Topic Director: pull the latest director-note via
  mcp__gbrain__search query: "kind:director_note topic:<topic-id> layer:delta" --limit 1
- Defect class for THIS dispatch: <single defect, no bundling>
- Root cause hypothesis (if any): <from director-note>
- Acceptance criteria: <runnable script paths or precise checks>

Search guidance — REQUIRED before any fix code (Iron Law):
- mcp__gbrain__search query: "kind:investigation_report <defect class>"
- mcp__gbrain__search query: "kind:domain_hint <defect class> layer:user"
- mcp__gbrain__search query: "kind:verification_report <defect class> prior failures"
If a prior investigation exists with overlapping root cause, cite its slug in your
investigation_report. Do not redo work that's already in delta or user.

Repositories: <PRIMARY + paired if cross-repo>.

Universal spawn principles apply.

Phases:
1. Investigation: produce an investigation_report content payload. Hex dumps,
   sample entries, root cause. NO code yet. Team Lead commits at
   <project>/delta/<topic-id>/<N>/investigation-<defect-class>.
2. Fix: implement per investigation findings. Tests must pass.
   Output: build_manifest content as STATUS payload.
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

Substance from Topic Director: pull the latest director-note via
  mcp__gbrain__search query: "kind:director_note topic:<topic-id> layer:delta" --limit 1
- Audit target: <branch / PR / directory>
- Spec to verify against: mcp__gbrain__search query: "kind:architecture_spec topic:<topic-id>" --limit 1
  (or path if no page yet)
- Specific items to check (Director's priority list): <copy>

Search guidance:
- mcp__gbrain__search query: "kind:verification_report topic:<topic-id> prior audits"
- mcp__gbrain__search query: "kind:investigation_report topic:<topic-id> known issues"

Universal spawn principles apply. Bidirectional + sample-based + cite original spec.

Method:
1. Pull target branch.
2. For each spec item, measure against actual.
3. Sample-based checks: <NAMED SAMPLE LIST per Director's note — search if needed>
4. Look for under-extraction AND over-counting.

Output: verification_report content as STATUS payload for Team Lead to commit at
  <project>/delta/<topic-id>/<N>/verification-report
with tags: kind:verification_report, layer:delta, topic:<topic-id>, track:<track-id>,
audit-target:<branch/PR>.

Content: pass/fail per criterion + sample-level evidence + slug references.

Optional file mirror: <topic-id>-audit.md committed to verify/<topic> branch.

Status: PASS | NEEDS_FIX with bullet list | BLOCKED.

Director will route findings post-audit.
```

---

## Filling in templates — Team Lead checklist

Before sending any of the above:

- ☐ Substance line points to a fresh director-note (not stale, not made up)? Run `mcp__gbrain__search query: "kind:director_note topic:<topic-id> layer:delta" --limit 1` to verify recency.
- ☐ Search guidance block includes 2–4 concrete `mcp__gbrain__search` queries the agent should run before working?
- ☐ Acceptance criteria are runnable, not interpretive?
- ☐ Named samples specified (not "spot-check a few")? Searchable as pages?
- ☐ Branch name decided; doesn't collide with another active agent?
- ☐ Cross-repo work uses paired branch names, both PR descriptions cross-reference?
- ☐ Single-defect or single-direction scope?
- ☐ Iron Law respected — no fix dispatch without prior investigation when defect is ambiguous? (Search `kind:investigation_report` first.)
- ☐ Surface conditions explicit?
- ☐ Output instructions specify the exact slug + tags Team Lead will commit on subagent's behalf?
- ☐ Agent's role does not exceed its layer-write permissions (see `roles.md` and `middleware.md`)?

If any unchecked, fix before dispatching.
