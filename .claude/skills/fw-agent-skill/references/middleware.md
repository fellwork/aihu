# Middleware — Storage & Recall Substrate

> ## READ THIS FIRST — resolve the substrate before you use anything below
>
> This document is written in **capability notation** (`SEARCH`, `GET_PAGE`, `PUT_PAGE`, `LIST_PAGES`, `ADD_TAG`, `ADD_LINK`) because **the concrete tool names are not knowable in advance**. Resolve them once per session with the Step 0 preflight in `SKILL.md`:
>
> ```
> ToolSearch  query: "gbrain search put_page get_page"
> ```
>
> - **Tools come back** → you are on a gbrain substrate. The namespace is whatever prefix those tools carry — `mcp__<server>__…`. **It is NOT necessarily `gbrain`.** In this repo, as of 2026-07, the live server is registered at user scope as `gbrain-local`, so every capability below resolves to `mcp__gbrain-local__*`.
> - **Nothing comes back** → you are on the **file substrate**, which is the default and is fully sufficient. Use the mapping table in `SKILL.md` Step 0: `PUT_PAGE` is `Write` + commit, `GET_PAGE` is `Read`, `SEARCH` is `Grep`/`Glob`, and slugs map to paths under `docs/plans/`, `docs/lessons/`, `docs/domain-hints/`, `docs/architecture/`.
>
> **Known trap, specific to this repo.** `.mcp.json` declares a project-scope server named `gbrain` pointing at `.claude/scripts/gbrain-mcp.sh`. That script exits before starting the server unless **both** `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are exported:
>
> ```
> [gbrain-mcp] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.
> ```
>
> Neither variable is set in a normal checkout, so the `gbrain` server **never starts and no `mcp__gbrain__*` tool has ever existed here** — silently. Every brief that has ever named `mcp__gbrain__search` in this repo named a nonexistent tool. Do not set or invent those credentials; run the preflight and use what is live.
>
> **Write resolved names into briefs.** A subagent handed `SEARCH` or `mcp__gbrain__search` cannot tell "tool missing" from "no results" and will improvise silently. Hand it `mcp__gbrain-local__search` — or hand it `Grep` and a directory.

---

When a gbrain substrate is live, the orchestration team uses **[GBrain](https://github.com/garrytan/gbrain)** as its storage and recall middleware: a Supabase + pgvector wiki-style brain that exposes ~74 MCP tools over stdio. Agents query it on dispatch via `SEARCH` and write to it at handoff via `PUT_PAGE` instead of carrying full state in context.

This solves three problems the bare orchestration playbook can't:

1. **Context bloat.** Director briefs no longer need to inline the full topic summary + 3 prior director-notes + round findings. Agents pull only the chunks they need via search.
2. **Rework.** When a Builder hits a defect class that's been investigated before, semantic + lexical hybrid search surfaces the prior investigation instead of re-running it. Lesson #5 (wrong-direction stalls) becomes harder to fall into.
3. **Cross-agent cooperation.** A Verifier and an Investigator working in parallel can see each other's findings as they land, without the Team Lead manually shuttling files between them.
4. **Ephemeral-container persistence.** Supabase lives outside any one Claude Code container — fresh cloud sandboxes pick up the team's full history instantly.

The methodology in `SKILL.md` does not change. GBrain is the **storage substrate** for the durable artifacts the playbook already requires — director-notes, topic summaries, retros, investigations, build-manifests. The roles, modes, spine, and lessons all stand.

---

## The data model: pages, slugs, tags, links

GBrain's primitive is the **page**: a slug (path-like identifier), content (text), tags (multiple per page), and links (page-to-page references). The MCP interface exposes operations like:

| Capability | Resolves to (gbrain) | Resolves to (file substrate) | What it does |
|---|---|---|---|
| `PUT_PAGE` | `mcp__<server>__put_page` | `Write` the mapped path, then `git add` + commit | Create or update a page (slug + content) |
| `SEARCH` | `mcp__<server>__search` | `Grep` / `Glob` over `docs/` | Hybrid (vector + lexical) ranked retrieval / literal match |
| `GET_PAGE` | `mcp__<server>__get_page` | `Read` the mapped path | Fetch a page by slug |
| `LIST_PAGES` | `mcp__<server>__list_pages` | `ls` / `Glob` the prefix directory | List pages by prefix/filter |
| `ADD_TAG` | `mcp__<server>__add_tag` | a `tags:` line in front-matter | Add a tag to a page |
| `ADD_LINK` | `mcp__<server>__add_link` | a relative markdown link in the body | Create a link from one page to another |
| `GET_BACKLINKS` | `mcp__<server>__get_backlinks` | `Grep` for the target filename | All pages linking to a given page |
| `DELETE_PAGE` | `mcp__<server>__delete_page` | `git rm` | Delete a page |

`<server>` is the namespace the Step 0 preflight resolved — **`gbrain-local` in this repo today, not `gbrain`.** On a gbrain substrate there are ~74 tools total; these are the ones the playbook uses regularly (`gbrain --help` for the full surface).

**Slug → path mapping on the file substrate:**

| Slug | Path |
|---|---|
| `<project>/delta/<topic>/<round>/<kind>` | `docs/plans/<topic>/<round>-<kind>.md` |
| `<project>/user/<topic>/<id>` | `docs/lessons/<id>.md` or `docs/domain-hints/<id>.md` |
| `<project>/base/...` | `docs/architecture/...` |
| `wiki/agents/<subagent-id>/...` | the agent's own scratch dir; never committed |

The file substrate has one property gbrain does not: **`git log` proves a write landed.** Use that — it is the cheapest STATUS verification in the playbook.

**Subagent namespace enforcement:** by default, GBrain wraps subagent `put_page` calls so the slug must match `^wiki/agents/<subagentId>/.+`. This is GBrain's built-in scratch namespace. Project-scoped writes (to `<project>/delta/...` and `<project>/user/...`) must come from a non-subagent caller — either the Team Lead writes on the subagent's behalf using the subagent's reported content, or the dispatch invokes `put_page` outside the subagent wrap. The worked example below shows both patterns.

---

## The four-layer model, mapped onto slugs + tags

The AGENTS-era four-layer precedence (`local > user > delta > base`) is preserved as **slug prefixes plus a `layer:` tag**. Every page lives under exactly one of these locations:

| Layer | Slug prefix | `layer:` tag | Mutability | Maps to |
|---|---|---|---|---|
| **base** | `<project>/base/...` | `layer:base` | **Immutable** from automated work | Project thesis, success criteria, ratified specs, this playbook, verified domain knowledge |
| **user** | `<project>/user/<topic>/...` | `layer:user` | Historian-promoted, durable | User-confirmed domain hints (lesson #6), approved scope-shifts, promoted findings, ratified architectures |
| **delta** | `<project>/delta/<topic>/<round>/<kind>` | `layer:delta` | Per-round agent writes, reviewable | Director-notes, Synthesizer updates, Verifier reports, Investigation reports, Build-manifests — proposed additions awaiting promotion |
| **local** | `wiki/agents/<subagent-id>/...` (GBrain default) | `layer:local` | Per-subagent scratch | In-flight Builder scratch, Verifier interim probes, Scout transient observations |

`<project>` is your project's slug (e.g., `aihu`). Pick once, write it into `docs/state/<track>.md`, and use it consistently across all dispatches.

**Why this maps well:** the slug prefix gives you cheap prefix-filtered searches (`LIST_PAGES` with prefix `<project>/delta/<topic>/` returns the round's deltas in order). The redundant `layer:` tag lets you do cross-layer scoped searches without parsing slugs. And `local` falling under `wiki/agents/<id>/` matches GBrain's enforced subagent namespace exactly — local is what subagents can write directly without any unwrap.

---

## Per-role layer permissions

Layer write permissions are the durable-knowledge analog of the file-writability matrix in `operations.md`. Same discipline, different substrate.

| Role | Reads | Writes | Notes |
|---|---|---|---|
| **Team Lead** | All layers via `SEARCH` | `<project>/delta/` (dispatch records on subagent's behalf), `<project>/user/` (only `domain_hint` pages directly from user) | Does not write substance to delta unsupervised |
| **Topic Director** | All layers | `<project>/delta/<topic>/<round>/director-note` | Director-notes go to delta as proposed routing decisions |
| **Synthesizer** | All layers | `<project>/delta/<topic>/topic-summary-<N>` | Summary updates are proposals; Director already made the priority calls |
| **Scout** | base, user, delta (read-only role overall) | `wiki/agents/<scout-id>/scout-report-<session>` only | Read-only role does not contribute to durable layers |
| **Architect** | All layers | `<project>/delta/<topic>/<round>/architecture-spec` | Specs promote to user only after Verifier passes the implementation |
| **Builder** | All layers | `<project>/delta/<topic>/<round>/build-manifest`, `<project>/delta/<topic>/<round>/investigation-<class>` | Plus scratch under `wiki/agents/<builder-id>/`. Never writes user or base. |
| **Verifier** | All layers | `<project>/delta/<topic>/<round>/verification-report` | PASS results signal Director to consider promoting the verified spec to user |
| **Investigator** | All layers | `<project>/delta/<topic>/<round>/investigation-<class>` | Iron Law: investigation precedes any fix code. Probe traces to `wiki/agents/<investigator-id>/probes/...` |
| **Historian** | All layers, deeply | `<project>/delta/retros/<session>`, **promotion authority** (writes promoted pages to `<project>/user/<topic>/...`) | Sole automated-side authority to promote delta → user |

**The Historian's promotion authority is what makes the system work.** End-of-session, the Historian reads the session's delta pages and decides which have earned promotion to `user`. Promotion is implemented as **writing a new page** under `<project>/user/<topic>/<finding-id>` with `layer:user` tag, linking back to the originating delta page via `ADD_LINK`. The delta page is preserved (history); the user page is the durable canonical statement.

**Promotion to `base` is human-only.** Per playbook design, the base layer is immutable from automated work. Promote to base via a PR that adds the new `<project>/base/...` page through a deliberate human review.

---

## Search conventions

Agents query GBrain using `SEARCH`. To make searches reliable across roles, use these conventions when writing pages.

### Tag taxonomy

Every page MUST carry these tags (via `ADD_TAG` after `PUT_PAGE`):

| Tag | Format | Required? |
|---|---|---|
| `kind:<kind>` | See record kinds below | Yes |
| `layer:<base\|user\|delta\|local>` | One of the four | Yes |
| `topic:<topic-id>` | Project's topic identifier | Yes (except `scout_report`, `dispatch_record`) |
| `track:<track-id>` | Project's track identifier | Yes |
| `round:<N>` | Integer round number | Yes for per-round pages |
| `session:<session-id>` | Session marker (date or UUID) | For session-scoped pages (retros, scout reports) |
| `source:user` | Page content authored by user | Only when applicable |
| `supersedes:<slug>` | Slug of the prior page this updates | For topic-summary chains |

### Record kinds

Use a small, stable taxonomy:

| `kind:` | What it represents | Written by |
|---|---|---|
| `director_note` | Per-round Director routing decision | Topic Director |
| `topic_summary` | Living summary of a topic | Synthesizer |
| `architecture_spec` | Named-interface spec with acceptance criteria | Architect |
| `build_manifest` | Files changed, with brief implementation notes | Builder |
| `verification_report` | Pass/fail per acceptance criterion | Verifier |
| `investigation_report` | Root cause with evidence | Investigator |
| `scout_report` | State validation, do-not-break list | Scout |
| `retro` | End-of-session retrospective | Historian |
| `domain_hint` | User-supplied or earned domain knowledge | User direct (via Team Lead), or Historian on promotion |
| `lesson` | A failure pattern observed and its mitigation | Historian on promotion |
| `dispatch_record` | "Builder dispatched at T for topic X" — handoff trace | Team Lead |

### Search query patterns

GBrain's `search` is hybrid (vector + lexical), so tag tokens contribute to lexical match. The general form:

```
SEARCH query: "kind:<kind> topic:<id> layer:<layer> <natural-language-query>"
```

Examples:

```
SEARCH query: "kind:director_note topic:cache-invalidation layer:delta continuity"
SEARCH query: "kind:investigation_report topic:halot-binyan race condition"
SEARCH query: "kind:domain_hint topic:font-rendering layer:user"
```

For strict prefix scoping (e.g., "all delta pages for this topic"), use `LIST_PAGES` with a prefix filter instead.

### Search modes

GBrain offers three named search modes — `conservative`, `balanced` (default), `tokenmax` — that bundle cost/quality knobs. Use:

- `balanced` for ordinary mid-dispatch retrievals
- `tokenmax` when a Topic Director needs the deepest possible recall on a hard scope-shift call
- `conservative` for cheap exploratory pulls (e.g., "is there a prior investigation on this?")

Pass with `--mode <mode>` when calling from CLI; via MCP, check the `put_page` arguments — most callers can omit and accept `balanced`.

### Search anti-patterns

- **Don't search before the spec is in hand.** The spec defines the acceptance bar; searching first risks the agent re-defining the problem to match what's findable.
- **Don't trust a single low-confidence hit.** Hybrid scores aren't proof. Cross-reference at least two hits or fall back to fetching the page directly with `GET_PAGE`.
- **Don't write the same finding to multiple layers.** Write once at the appropriate slug. Promotion goes upward through the discipline below.

---

## Promotion discipline

A finding's lifecycle:

```
wiki/agents/<id>/...                 (local, in-flight)
       ↓ end of dispatch — agent decides if durable
<project>/delta/<topic>/<round>/...  (proposed, reviewable)
       ↓ end of session — Historian decides what's earned
<project>/user/<topic>/...           (durable team knowledge)
       ↓ human review only
<project>/base/...                   (canonical thesis)
```

**Local → delta**: Any agent at dispatch close. If the finding will matter beyond this session, write to delta (on subagent's behalf via Team Lead, or via an un-wrapped `put_page` call). If it's session-only scratch, leave it in the agent's `wiki/agents/<id>/` namespace.

**Delta → user**: **Historian sole authority** at end-of-session. Promotion is implemented as:
1. Historian reads delta pages via `LIST_PAGES` (prefix `<project>/delta/<topic>/`)
2. For each candidate, applies the checklist:
   - Has this finding survived at least one Director routing pass without revision?
   - Has any implementation against it been Verifier-passed (for architecture specs)?
   - Is it consistent with prior user-layer pages, or does it explicitly supersede a specific prior page?
   - Did the user explicitly affirm it (for `domain_hint` pages)?
3. If yes, the Historian writes a new page at `<project>/user/<topic>/<finding-id>` with the consolidated content, tagged `layer:user`, and links to the originating delta page via `ADD_LINK`.

**Special case: domain_hint pages from the user.** When the user volunteers domain knowledge mid-session (lesson #6), the Team Lead writes it directly to `<project>/user/<topic>/<hint-id>` (not delta). User-authored knowledge is canonical immediately. Tag with `source:user` to make this auditable.

**User → base**: Human-only via PR. The orchestration team never does this autonomously.

---

## Setup

**Setup is OPTIONAL.** The file substrate needs none of it. Skip this section entirely unless someone has decided the project wants a queryable brain — and never block a session on it.

Tested against gbrain v0.18.x.

### Install GBrain

The fastest path is gstack's `/setup-gbrain` skill — it installs the CLI, provisions a Supabase project (or wires up an existing one), and registers the MCP server in one go.

Manual install:

```bash
npm install -g gbrain
gbrain --version
```

### Configure Supabase backend — REQUIRED, and silent when missing

```bash
export SUPABASE_URL=https://<project>.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

GBrain auto-creates the required pgvector schema on first connect.

> **These two variables are a hard requirement of the project-scope wrapper, and their absence fails silently.**
> `.claude/scripts/gbrain-mcp.sh` guards its `exec gbrain mcp serve` with:
>
> ```bash
> if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
>   echo "[gbrain-mcp] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set." >&2
>   exit 1
> fi
> ```
>
> When they are unset the process exits immediately, the MCP server never starts, **no `mcp__gbrain__*` tool is registered**, and nothing in the Claude Code session announces this. The only symptom is that agents told to call `mcp__gbrain__search` quietly do something else. **This is the state a normal local checkout of this repo is in.** Do not set or invent these credentials to make the entry "work" — establish the real substrate with the Step 0 preflight instead.

### Register the MCP server

Project scope (recommended for cloud sandboxes — see `INSTALL.md` step 4):

```bash
# .mcp.json already has the entry; this is what it does:
claude mcp add --transport stdio --scope project gbrain -- \
  bash .claude/scripts/gbrain-mcp.sh
```

User scope (convenient locally):

```bash
claude mcp add --transport stdio --scope user gbrain -- gbrain mcp serve
```

**The registered NAME determines the tool namespace, and the two scopes routinely disagree.** A project-scope entry named `gbrain` yields `mcp__gbrain__*`; a user-scope entry named `gbrain-local` yields `mcp__gbrain-local__*`. Both can be declared at once, with only one of them live — which is precisely this repo's situation:

```
$ claude mcp list 2>&1 | grep -i gbrain
gbrain-local: /Users/<you>/.gbrain/mcp-wrapper.sh  - ✔ Connected
gbrain:       bash .claude/scripts/gbrain-mcp.sh   - ⏸ Pending approval
```

So **never infer the namespace from this document, from `.mcp.json`, or from a previous session's briefs.** Once registered *and connected*, subagents have `SEARCH`, `PUT_PAGE`, `ADD_TAG`, etc. available under the resolved prefix — confirm it with the Step 0 preflight and put the literal names in your briefs.

### Optional: index the skill itself as a source

If you want this playbook's prose queryable alongside team knowledge:

```bash
gbrain sources add ~/.claude/skills/fw-agent-skill --label fw-agent-skill
gbrain sync
```

This is optional — the skill files are already read directly from `~/.claude/skills/`. Indexing makes them retrievable via `SEARCH` for subagents that prefer query-driven retrieval.

---

## Worked example — a Mode 2 round using GBrain

Suppose the team is mid-build on a cache-invalidation refactor. Project slug is `aihu`. Round 3 just ended; Verifier reported NEEDS_FIX with three items.

**Without GBrain (the file-only way):**

Team Lead writes a Director dispatch brief that includes:
- Verifier's report (~1500 tokens)
- The current topic-summary (~2000 tokens)
- Last 3 director-notes (~3000 tokens)
- The Architect's spec (~1500 tokens)

Total brief: ~8000 tokens just to give the Director enough context to do continuity check.

**With GBrain (the new way):**

Builder/Verifier from round 3 already wrote pages:

- `aihu/delta/cache-invalidation/3/build-manifest` (Builder)
- `aihu/delta/cache-invalidation/3/verification-report` (Verifier)
- both tagged `topic:cache-invalidation`, `track:refactor-q2`, `layer:delta`, `round:3`

Team Lead writes a Director dispatch brief:

```
Topic Director dispatch for topic:cache-invalidation track:refactor-q2.

Round 3 just closed. Verifier report at slug:
  aihu/delta/cache-invalidation/3/verification-report
NEEDS_FIX with 3 items.

Search guidance for this round (run via SEARCH):
- "kind:director_note topic:cache-invalidation continuity" (recent priors)
- "kind:verification_report topic:cache-invalidation NEEDS_FIX"
- "kind:architecture_spec topic:cache-invalidation interfaces"
- "kind:investigation_report topic:cache-invalidation race conditions"

Write your director-note via PUT_PAGE to slug:
  aihu/delta/cache-invalidation/4/director-note
Then ADD_TAG for:
  kind:director_note
  layer:delta
  topic:cache-invalidation
  track:refactor-q2
  round:4

Apply the Director template (see SKILL.md / templates.md).

Continuity check focus this round: are we hitting the iteration ceiling
(now at round 4) or has the work nature shifted?
```

Brief size: ~600 tokens. Director pulls only relevant chunks. Same effective context, fraction of the size. And the Director has access to *all* prior history via search — not just the 3 most recent notes.

**Subagent namespace handling:** when the Topic Director (a Sonnet-class subagent) runs `PUT_PAGE` with slug `aihu/delta/...`, GBrain's default subagent wrap would reject the call. Two patterns work:

1. **Team Lead writes on subagent's behalf.** The subagent returns its content in its STATUS report; the Team Lead (which is *not* under the subagent wrap) calls `PUT_PAGE` with the project-scoped slug. Lowest friction; aligns with the playbook's "Team Lead verifies STATUS before moving on" rule anyway.
2. **Configure the subagent's namespace policy.** GBrain supports relaxing the wrap per subagent — see `gbrain --help` for the schema flag. Use this if your subagents are long-lived and you want them writing directly.

The playbook recommends pattern 1: the Team Lead always sees and verifies before promotion.

**Cross-agent benefit:** if a parallel Investigator is exploring a related defect on a different branch, they can `SEARCH` and surface findings the Director would otherwise have missed. The Team Lead doesn't have to manually shuttle the Investigator's report into the Director's brief.

---

## How this changes each role's templates

The dispatch templates in `templates.md` now include search guidance + output-slug guidance instead of inlining context. Specifically:

- **T-DIR**: instead of "read the last 3 director-notes," say `SEARCH query: "kind:director_note topic:<topic>" recent`.
- **T-SYN**: instead of "read the current topic summary," say `SEARCH query: "kind:topic_summary topic:<topic>" latest`.
- **Templates A/B/C**: include a "search guidance" block listing the queries the agent should run before starting work, AND a "write outputs to slug" block specifying the exact slug + tags.
- **Output instructions**: every template ends with the exact `PUT_PAGE` slug to write to + the `ADD_TAG` calls to follow up with.

See the updated templates in `templates.md`.

---

## Anti-patterns

### 1. Treating subagent scratch (`wiki/agents/<id>/`) as durable

GBrain's enforced subagent namespace is for scratch. If you don't lift a finding into `<project>/delta/...`, it stays in scratch where the next session won't search for it by topic/track. If a finding is durable, lift it to delta at handoff.

### 2. Skipping promotion at session-end

If the Historian doesn't run promotion at end-of-session, durable findings stay in delta forever. Delta accumulates clutter; user starves; the system slowly degrades to "we have a lot of proposals but no canonical knowledge." **Run the Historian.**

### 3. Writing to `<project>/user/...` from a non-Historian role

Only the Historian (and the Team Lead for direct user-supplied `domain_hint` pages) writes to user. If a Builder or Architect writes to user, they're claiming authority they don't have. Catch this in periodic audits of `<project>/user/...` page provenance.

### 4. Searching before the spec is in hand

Search after you know what acceptance looks like, not before. Pre-spec searching tempts the agent to re-frame the problem to match what's findable.

### 5. Not tagging pages with topic/track/layer/kind

Untagged pages become unsearchable noise within a few sessions. Every page MUST carry the full tag set (see the taxonomy above).

### 6. Trusting low-confidence search hits

`SEARCH` returns ranked results; rank does not equal correctness. Cross-reference or fall back to `GET_PAGE` with a known slug.

### 7. Letting delta grow without review

Delta is **proposed**. If nothing ever gets reviewed and promoted, you've recreated the original "everything in one place, nothing canonical" problem GBrain was wired in to solve. Schedule periodic Historian sweeps even outside session boundaries if delta growth is fast.

### 8. Ignoring the subagent namespace wrap

GBrain's `wiki/agents/<id>/.+` constraint exists by design — it's how the brain knows which writes are scratch vs durable. Don't reflexively "fix" it; route durable writes through the Team Lead instead.

### 9. Naming a tool namespace you did not resolve this session

The worst failure in this document's history: **98 references to `mcp__gbrain__*` across the skill, naming a server that has never once started in this repo.** Nothing broke loudly, because "substrate is optional" made the file fallback look like a deliberate choice rather than an accident. Run the Step 0 preflight; put resolved names in briefs; if you find yourself typing a namespace from memory, stop.

### 10. Treating a hardcoded namespace swap as the fix

If a future session discovers this again, the tempting repair is find-and-replace `mcp__gbrain__` → whatever is live today. **Don't.** That re-hardcodes a per-machine, per-scope accident into a checked-in playbook and guarantees the same failure on the next machine. Capability notation + a runtime preflight is the fix; a rename is the bug wearing a different name.

---

## Failure-mode coverage map

How GBrain helps with the lessons in `lessons.md`:

| Lesson | How GBrain helps |
|---|---|
| #3 (deferrals were the actual blockers) | `kind:verification_report` pages make deferrals searchable; Director can query "all deferred items in this topic" before routing |
| #4 (aggregate stats hid sample failures) | Named samples become first-class taggable findings; `SEARCH query: "named-sample topic:<x>"` returns them directly |
| #5 (wrong-direction stalls) | Builder pre-search of `kind:investigation_report` surfaces prior dead-ends |
| #6 (domain knowledge gaps) | `kind:domain_hint` pages in `<project>/user/...` are searchable forever; the cache becomes a queryable store |
| #8 (iteration budget on wrong problem) | Director's continuity check uses semantic search over recent director-notes — drift detection improves |
| #9 (Verifier missed under-extraction) | Verifier briefs include search for "prior under-extraction findings on this topic" — the bidirectional check has memory |

Lessons #1, #2, #7, #10, #11 are still primarily addressed by the universal principles and role discipline. GBrain is a force multiplier for memory; it doesn't replace orchestration discipline.
