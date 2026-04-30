# Operations Reference

Operational details: safety mode (writability matrices), cross-repo branch hygiene, checkpoint state mediums.

---

## Safety mode — writability matrix

The principle: **per mode, every file in the project falls into one of three categories** — writable, read-only, or frozen. The matrix changes with the mode.

- **Writable** — Builder may edit on the assigned branch.
- **Read-only** — agents may read but not modify in this mode. (May be writable in another mode.)
- **Frozen** — never modified during automated work; changes only via separate human-approved PRs.

### Worked example

This is the matrix used by an actual project (translation research) in three modes. Adapt to your project's file layout.

| File / path | Mode 1 (experiment) | Mode 2 (build) | Mode 3 (defect fix) |
|---|---|---|---|
| Training/experiment script (e.g., `train.py`) | writable | read-only | read-only |
| Result logs (e.g., `results.tsv`, `learnings.md`) | append-only | read-only | read-only |
| Pipeline scripts (e.g., `prepare*.py`, `evaluate*.py`, `score*.py`) | read-only | writable on feature branch | writable on fix branch |
| Fixture data (e.g., `data/fixtures/*`) | read-only | writable | writable |
| Gold/test corpus and rubric (e.g., `gold/`, `gold/rubric.md`) | read-only | read-only | **frozen** (never modified during automated work) |
| State files (e.g., `state-<track>.md`) | writable (Historian only) | read-only | read-only |
| Topic summaries (e.g., `docs/topic-summaries/*.md`) | writable (Synthesizer only) | writable (Synthesizer only) | writable (Synthesizer only) |
| Director notes (e.g., `docs/topic-director-notes/*.md`) | writable (Director only) | writable (Director only) | writable (Director only) |
| Program plan (e.g., `program.md`) | read-only | read-only | **frozen** — modified only via separate human-approved PRs |
| Docs and config (e.g., `docs/`, `pyproject.toml`) | read-only | writable on branch | writable on branch |
| Paired repo (e.g., `<other-repo>/*`) | read-only | writable on its own branch | writable on its own paired branch |

**Builder's rule:** if a file isn't in your "writable" column for the current mode, do not modify it. If you think it needs to change, surface as a finding — do not silently edit.

**Surface trigger:** any attempt to write to a frozen path is a Safety-mode breach and must be surfaced to the user immediately.

---

## AGENTS.db layer-write matrix

The durable-knowledge analog of the file matrix above. Same discipline, different substrate. Full detail and rationale in `references/middleware.md`; this is the per-role quick reference.

| Role | local | delta | user | base |
|---|---|---|---|---|
| Team Lead | write (dispatch records, handoff notes) | — | write only `domain_hint` records sourced directly from user | — |
| Topic Director | — | write (director-notes) | — | — |
| Synthesizer | — | write (topic-summary updates) | — | — |
| Scout | write (scout-report) | — | — | — |
| Architect | — | write (architecture spec) | — | — |
| Builder | write (scratch, probes) | write (build-manifest, investigation docs) | — | — |
| Verifier | — | write (verification-report) | — | — |
| Investigator | write (hex/probe traces) | write (investigation-report) | — | — |
| Historian | read all | write (retro) | **promotion authority** (delta → user) | — |

Empty cell = read-only. The base layer is **never** written from automated work; promotion to base requires human review (`agentsdb import --allow-base`).

**Key disciplines:**
- Only the Historian moves records from delta → user during automated work. This is the formal "earned learning" gate.
- The Team Lead is the only role allowed to write `domain_hint` records directly to user, and only when the user supplies the hint in the conversation. Tag with `source:user`.
- Builders and Verifiers never write to user. If they find something user-worthy, they write to delta and let the Historian promote.

**Layer-write breach** (writing to a layer outside permission) is an orchestration-equivalent of safety-mode breach. Surface to user.

---

## Cross-repo branch hygiene

Lessons from observed near-collisions:

1. **One agent per branch** — never have two concurrent background agents pushing to the same branch.
2. **Paired branch naming for cross-repo work** — for example: `fix/<topic>` in repo A ↔ `fix/<topic>-fixtures` in repo B. The names *correspond* but are not identical.
3. **PR descriptions cross-reference each other** — both PRs link the other; merge order called out explicitly.
4. **Merge dependency direction first** — when paired, the repo whose output the other depends on lands first. (E.g., if repo A produces fixtures consumed by repo B, merge A first.)
5. **Audit reports go on `verify/<topic>` branches** in the primary repo, never as PRs unless requested.

### Branch convention defaults

Adapt to project, but a sensible default:

| Branch prefix | Purpose | Who pushes |
|---|---|---|
| `feat/<topic>` | New feature build | Builder |
| `fix/<topic>` | Defect fix | Builder |
| `verify/<topic>` | Audit reports | Verifier |
| `<sweep-tag>/<run-id>` | Experiment branch (Mode 1) | Builder |

---

## Checkpoint state — four mediums

Durable session state lives in four places, with four different update cadences and four different consumption patterns.

### 1. `state-<track>.md` — single-pointer state

Markdown at repo root, one per track. Updated by **Historian only**, at end-of-session. Schema (suggested):

```markdown
# State — <track>

**Last session:** <date>
**Active topic:** <topic>
**Mode:** <1|2|3>

## Current focus
What the next session should pick up.

## Recent decisions
- <date>: <decision and brief reason>

## Open scope-shift signals (from Director)
- <if any>

## Pointer to active topic summary
docs/topic-summaries/<topic>-summary.md (if mirror mode)
or `agents_search --kind topic_summary --query "<topic>" --limit 1`
```

This is what the next session reads first on resume. It's intentionally human-readable and PR-reviewable — a quick orientation document, not a knowledge store.

### 2. AGENTS.db (the queryable knowledge store)

Four-layer flatfile DB (`base`, `user`, `delta`, `local`). Updated continuously by all roles (within their layer permissions). This is the **primary consumption surface** mid-session — agents query it via `agents_search` instead of reading files.

Full detail in `references/middleware.md`.

### 3. `docs/topic-summaries/<topic>-summary.md` — living understanding (optional mirror)

Updated by **Synthesizer only** when the project uses *mirror mode* (file artifacts mirrored alongside DB records). Pure DB-native projects skip this — `kind:topic_summary` records in delta are the canonical artifact.

Schema in `roles.md` under Synthesizer.

### 4. Git artifacts — full history

`results.tsv`, commits, branches, PR descriptions. Granular history; consulted on resume only for forensics.

---

## Resume protocol (canonical sequence)

1. **Team Lead** reads `state-<track>.md` (the orientation document).
2. **Team Lead** runs:
   ```
   agents_search --kind topic_summary --query "<active-topic>" --limit 1
   agents_search --kind director_note --query "<active-topic>" --limit 3
   agents_search --kind retro --query "<active-topic>" --limit 1
   ```
   This loads the recent durable context without inlining files.
3. **Team Lead** dispatches Topic Director with search guidance (T-DIR template). Director sets direction for this session.
4. **Team Lead** dispatches Researchers per Director's direction.
5. Loop the synthesis spine (Researcher → Director → Synthesizer → next-Researcher).
6. **End of session**: Team Lead dispatches Historian. Historian writes the retro record AND runs delta → user promotion for any earned findings.

If the state file or AGENTS.db doesn't exist on first session, the first dispatch creates them. Treat that as a Mode 2 micro-build: Architect specs the schema, Builder runs `agentsdb init`, Verifier confirms format, Director sets first direction. See `references/middleware.md` for the setup commands.

---

## Common operational gotchas

- **Don't dispatch a Builder before a Director has set direction this session.** Stale Director notes from prior session are not enough — too much may have shifted in the user's intent.
- **Don't accept a Builder's STATUS without verifying the artifact.** A 30-second `git log`, file existence check, or test run catches lesson #2 before it costs a round.
- **Don't merge fellwork-style paired-repo work in the wrong order.** The producer side merges first; the consumer side merges second. Out-of-order merges leave broken intermediate states.
- **Don't dispatch two agents to the same branch concurrently.** Even if you "know" they'll touch different files. Branch isolation is a hard rule.
- **Don't skip the Historian at end of session.** Tomorrow's resume cost depends entirely on today's Historian output.
