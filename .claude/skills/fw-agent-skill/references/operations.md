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
| GBrain pages under `<project>/{base,user,delta}/` | per layer-write matrix below | per layer-write matrix below | per layer-write matrix below |
| Topic summaries (e.g., `docs/topic-summaries/*.md`) | writable (Synthesizer only) | writable (Synthesizer only) | writable (Synthesizer only) |
| Director notes (e.g., `docs/topic-director-notes/*.md`) | writable (Director only) | writable (Director only) | writable (Director only) |
| Program plan (e.g., `program.md`) | read-only | read-only | **frozen** — modified only via separate human-approved PRs |
| Docs and config (e.g., `docs/`, `pyproject.toml`) | read-only | writable on branch | writable on branch |
| Paired repo (e.g., `<other-repo>/*`) | read-only | writable on its own branch | writable on its own paired branch |

**Builder's rule:** if a file isn't in your "writable" column for the current mode, do not modify it. If you think it needs to change, surface as a finding — do not silently edit.

**Surface trigger:** any attempt to write to a frozen path is a Safety-mode breach and must be surfaced to the user immediately.

---

## GBrain layer-write matrix

The durable-knowledge analog of the file matrix above. Same discipline, different substrate. Layers are slug-prefix conventions in GBrain: `local` = `wiki/agents/<subagent-id>/...`, `delta` = `<project>/delta/<topic>/<round>/...`, `user` = `<project>/user/<topic>/...`, `base` = `<project>/base/...`. Full detail and rationale in `references/middleware.md`; this is the per-role quick reference.

| Role | local | delta | user | base |
|---|---|---|---|---|
| Team Lead | write (dispatch records, handoff notes) | write (commits subagent STATUS payloads as pages) | write only `domain_hint` pages sourced directly from user | — |
| Topic Director | — | write via Team Lead (director-notes) | — | — |
| Synthesizer | — | write via Team Lead (topic-summary updates) | — | — |
| Scout | write (scout-report in own namespace) | — | — | — |
| Architect | — | write via Team Lead (architecture spec) | — | — |
| Builder | write (scratch, probes in own namespace) | write via Team Lead (build-manifest, investigation docs) | — | — |
| Verifier | — | write via Team Lead (verification-report) | — | — |
| Investigator | write (probe traces in own namespace) | write via Team Lead (investigation-report) | — | — |
| Historian | read all | write (retro) | **promotion authority** (delta → user) | — |

Empty cell = read-only. The base layer is **never** written from automated work; promotion to base requires a deliberate human PR adding a page under `<project>/base/...`.

**Why most subagent writes route through the Team Lead:** GBrain enforces a `wiki/agents/<subagent-id>/.+` slug prefix on subagent `put_page` calls by default. Project-scoped slugs (`<project>/delta/...`, `<project>/user/...`) must originate from a non-subagent caller. Subagents return content in their STATUS payload; the Team Lead, having verified STATUS against the artifact, calls `mcp__gbrain__put_page` with the project-scoped slug and follows up with `mcp__gbrain__add_tag` for the standard tag set.

**Key disciplines:**
- Only the Historian moves pages from delta → user during automated work. This is the formal "earned learning" gate. Promotion is "write a new page under `<project>/user/<topic>/...` and link back to the delta page via `mcp__gbrain__add_link`."
- The Team Lead is the only role allowed to write `domain_hint` pages directly to user, and only when the user supplies the hint in the conversation. Tag with `source:user`.
- Builders and Verifiers never write to user. If they find something user-worthy, content goes to delta (via Team Lead commit) and the Historian promotes.

**Layer-write breach** (writing to a slug outside permission) is an orchestration-equivalent of safety-mode breach. Surface to user.

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

**Project slug (GBrain prefix):** <project>
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
Pull via:
  mcp__gbrain__search query: "kind:topic_summary topic:<topic> layer:delta" --limit 1
or by slug:
  mcp__gbrain__get_page slug: "<project>/delta/<topic>/topic-summary-<N>"
```

This is what the next session reads first on resume. It's intentionally human-readable and PR-reviewable — a quick orientation document, not a knowledge store.

### 2. GBrain (the queryable knowledge store)

Supabase + pgvector wiki-style brain with layer-as-slug-prefix convention (`<project>/base/`, `<project>/user/`, `<project>/delta/`, `wiki/agents/<id>/`). Updated continuously by all roles (within their layer permissions, see matrix below). This is the **primary consumption surface** mid-session — agents query it via `mcp__gbrain__search` instead of reading files.

Full detail in `references/middleware.md`.

### 3. `docs/topic-summaries/<topic>-summary.md` — living understanding (optional mirror)

Updated by **Synthesizer only** when the project uses *mirror mode* (file artifacts mirrored alongside GBrain pages). Pure GBrain-native projects skip this — `kind:topic_summary` pages in delta are the canonical artifact.

Schema in `roles.md` under Synthesizer.

### 4. Git artifacts — full history

`results.tsv`, commits, branches, PR descriptions. Granular history; consulted on resume only for forensics.

---

## Resume protocol (canonical sequence)

1. **Team Lead** reads `state-<track>.md` (the orientation document).
2. **Team Lead** runs (via the MCP tools):
   ```
   mcp__gbrain__search query: "kind:topic_summary topic:<active-topic> layer:delta" --limit 1
   mcp__gbrain__search query: "kind:director_note topic:<active-topic> layer:delta" --limit 3
   mcp__gbrain__search query: "kind:retro topic:<active-topic>" --limit 1
   ```
   This loads the recent durable context without inlining files.
3. **Team Lead** dispatches Topic Director with search guidance (T-DIR template). Director sets direction for this session.
4. **Team Lead** dispatches Researchers per Director's direction.
5. Loop the synthesis spine (Researcher → Director → Synthesizer → next-Researcher).
6. **End of session**: Team Lead dispatches Historian. Historian writes the retro page AND runs delta → user promotion for any earned findings.

If the state file doesn't exist on first session, the first dispatch creates it (the GBrain Supabase backend is provisioned at install time per `INSTALL.md`). Treat the state-file bootstrap as a Mode 2 micro-build: Architect specs the schema, Builder writes the file, Verifier confirms format, Director sets first direction. See `references/middleware.md` for GBrain setup.

---

## Common operational gotchas

- **Don't dispatch a Builder before a Director has set direction this session.** Stale Director notes from prior session are not enough — too much may have shifted in the user's intent.
- **Don't accept a Builder's STATUS without verifying the artifact.** A 30-second `git log`, file existence check, test run, or `mcp__gbrain__get_page` on the claimed slug catches lesson #2 before it costs a round.
- **Don't merge fellwork-style paired-repo work in the wrong order.** The producer side merges first; the consumer side merges second. Out-of-order merges leave broken intermediate states.
- **Don't dispatch two agents to the same branch concurrently.** Even if you "know" they'll touch different files. Branch isolation is a hard rule.
- **Don't skip the Historian at end of session.** Tomorrow's resume cost depends entirely on today's Historian output.
