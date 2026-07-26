# State — orchestrator

**Project slug:** `aihu`
**Role:** orchestrator (merge train, release train, dispatch, merge-order rulings)
**Renamed from:** `docs/state/merge-train.md` on 2026-07-26. Scope names go stale —
`merge-train` spent 2026-07-25/26 orchestrating a swarm, not running a merge train,
and `docs-next` spent it doing config architecture. **Role names survive a pivot.**
**Last verified:** 2026-07-26 (historian, against `origin/main` @ `8aa12dc1`)
**Mode:** 2/3 mixed — build + defect fix, multi-agent

> **Why this file lives at `docs/state/` and not `state-orchestrator.md`:**
> `.gitignore:98` matches `state-*.md`, so a repo-root state file is untracked,
> invisible to every other clone, and lost on a fresh worktree. The
> `fw-agent-skill` resume protocol previously pointed at that path, which made
> resume step 1 a silent no-op — see lesson #20 in
> `.claude/skills/fw-agent-skill/references/lessons.md`.

## Substrate (resolved 2026-07-25, still true 2026-07-26)

**The repo is the substrate.** Durable artifacts under `docs/state/`,
`docs/plans/<slice>/`, `docs/lessons/`. Committed, visible in every worktree,
attributable via `git log`.

A gbrain server *is* reachable at user scope as **`gbrain-local`**
(`mcp__gbrain-local__search` / `__get_page` / `__put_page`). The project-scope
`gbrain` entry in `.mcp.json` does **not** run: `.claude/scripts/gbrain-mcp.sh`
exits unless `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are exported, so
`mcp__gbrain__*` does not exist. Re-resolve every session:

```
ToolSearch  query: "gbrain search put_page get_page"
```

**gbrain was resolved at the start of the 2026-07-25 session and then went unused
for ~20 hours.** One page was written, late:
`aihu/delta/session-2026-07-26/orchestrator-state`. It is a real record and it was
already stale within 30 minutes of being written (it lists #611 as open; #611
merged as `6bcef501`). Treat it as a source, not as truth — see "Corrections".

## Where main actually is

```
origin/main  8aa12dc1  fix(cli): agent template TS7006 regression + matrix tests the diff, not npm (#613)
```

**59 commits merged to `origin/main` since 2026-07-25T00:00** (`git log origin/main
--since=2026-07-25T00:00:00 --oneline | wc -l`).

### Open PRs — verified 2026-07-26 via `gh pr list --state open`

| PR | branch | state | note |
|---|---|---|---|
| **609** | `feat/config-in-vite-config` | OPEN, **DIRTY** (conflicts) | config lives in `vite.config.ts`. Rebuilt from `main` — the predecessor `#605` on `feat/scaffold-aihu-config` is **abandoned; do not rebase onto it.** Last known CI state: `check`/`ci-ok` still running, outcome never reported. |
| **602** | `changeset-release/main` | OPEN, MERGEABLE | changesets version PR. Would take `@aihu/cli` **1.0.1 → 1.1.0**. |

### Published vs repo — verified 2026-07-26 via `npm view <pkg> version`

```
@aihu/cli               1.0.1     (#602 would publish 1.1.0)
@aihu/signals           0.5.0
@aihu/arbor             4.0.0
@aihu/compiler          1.1.1
create-aihu             0.1.6
@aihu/templates-cf-team 3.0.1
@aihu/editor            0.1.2
@aihu/magna             0.2.5
```

Everything merged after the last publish is **on main and unpublished**. Cutting
that release is an open decision for the founder.

## Corrections to the previous state of this file

Recorded loudly, per the historian rule that a memory keeping only wins is worse
than none.

- **The landing order in the previous version of this file is resolved, and one
  quarter of it never landed.** It said `#546 → #550 → #556 → #539`.
  Verified: `#546` = `edc15f2a`, `#550` = `9d8a49db`, `#539` = `26268c42` — all
  merged. **`#556` is CLOSED, not merged** (`gh pr view 556 --json state` →
  `CLOSED`). INV-A's objection to its `paths`-filter half stood. Do not go looking
  for it on main.
- **The gbrain orchestrator-state page lists `#611` and `#613` as open. Both are
  merged** — `6bcef501` and `8aa12dc1` respectively. `#614` (conductor.json →
  `.conductor/settings.toml`, `d0c9200c`) is on main and absent from that page
  entirely. The page was written at 17:01Z and was wrong by 17:23Z.
- **All 24 PRs the gbrain page claims merged, are merged.** Verified by mapping
  each subject-line `(#N)` suffix to its commit on `origin/main`; see
  `docs/state/historian.md` for the method and why the naive
  `git log --grep="(#N)"` version of that check was itself wrong.

## Standing rulings (do not re-litigate)

- **Bench baselines: the STOP on regenerating stands** until the harness measures
  shipped artifacts rather than source in dev mode. Regenerating now canonises
  numbers describing an artifact nobody ships.
- **Publishable metrics are counted metrics only** — DOM move counts, writes/op,
  size rows. Not timings. Rationale, worth keeping verbatim: *a dead binding sends
  a count to zero, which screams; it sends a timing down, which flatters.*
- **Cross-machine ratios against a checked-in baseline are meaningless.** The
  26x/8.8x discrepancy resolved to a 3.11x hardware gap (751 ns CI ubuntu vs
  241 ns local M5) over a fabricated denominator. `#607` is the truth file.
- **The real arbor number is ~1.10x the true vanilla floor** (~185 ns through
  shipped `dist` vs a 168 ns cached-text-node floor). The committed `vanilla`
  adapter, whose own README calls it "the theoretical minimum", is **9.2x off that
  floor** — every inflated ratio removed on 2026-07-25 was measuring that gap.
- **`ci-ok`: the required check-run must NOT gain a `name:` field.** Adding one —
  even cosmetically — renames the check-run, the required context `ci-ok` never
  reports, and branch protection **silently detaches**: PRs stay mergeable with
  nothing enforced and no error anywhere.
- **`agent` template folds INTO `full`, it is not deleted.** `full` becomes the
  kitchen sink. `#601`'s `server.ts`/`mcp.ts`/`readiness.ts` generators are what
  `full` needs.
- **`--no-agent-tooling`, not `--no-ai`.** Removes developer-env files only, never
  the runtime agent surface.
- **daisyUI Option 4 design pass gates all other UI/CSS work.** It had never been
  written; it now exists at `docs/plans/2026-07-26-option-4-daisyui-design.md`.
  Slice 1 landed as `#604`.
- **`#608` style-lock amendment ratified** — single-accent protects *identity*;
  state hues are exempt inside closed oklch bands under a chroma cap. The
  2026-07-23 indigo falls in no band.
- **Config's home is `vite.config.ts`** (founder redirect). The LSP/VSCode/CLI read
  it there. `svelte.config.js` existed only because the language server could not
  parse the Vite config; SvelteKit 3 makes `vite.config.js` the required location.
- **Use `fable` for hard code and review** (founder standing instruction).
- **A cell that cannot run is SKIPPED, not failed.** And scaffold-matrix PR runs
  use `--mode local`; npm mode is for the scheduled run and post-release only.

## Blocked on the founder

1. **FEL-391 (E1)** — may a list opt into per-row reactive bindings, at one effect
   per binding per row? Gates FEL-416 and four `use` families.
2. **FEL-423 remainder** — *what may a static build claim about itself?*
   `packages/compiler/src/codegen/emit.rs:206` —
   `let elide_agent = target == BuildTarget::Client && is_agent_component;` — elides
   agent metadata from client builds **by design** (a v0.6.6 decision), so
   `llms.txt` ships at ~60–84 bytes while three tools genuinely exist. Reversing it
   is a product change, not a wiring fix. **Escalated 2026-07-26 08:51Z, never
   answered.**
3. **Cut the release.** Everything above is on main and unpublished.

## Linear ledger — queried live 2026-07-26, NOT copied from the channel

The in-channel record said **"FEL-407 reopened, link 2 outstanding."** It is
**Done**. Do not act on the channel's issue states; they are point-in-time and
several had already moved. Re-query rather than trusting any of the below:

```bash
KEY=$(security find-generic-password -s LINEAR_API_KEY -w)
curl -s -X POST https://api.linear.app/graphql -H "Authorization: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ issue(id: \"FEL-409\") { identifier state { name } title } }"}'
```

| issue | state (2026-07-26) | title |
|---|---|---|
| FEL-407 | **Done** | [bench] The 122x nodeValue claim is false and ships in the README |
| FEL-408 | **Done** | [bench] js-framework-benchmark harness measures 0.00 ms and reports success |
| FEL-409 | **In Progress** | [bench] Gate policy: p50 spread is 534–1176%; only one workload is fit |
| FEL-417 | Backlog | [ci] js-framework-benchmark has no browser on GitHub runners (`/snap/bin/...`) |
| FEL-419 | **In Progress** | [ci] `bun run test --coverage` hangs silently — 19 min of zero output |
| FEL-420 | Backlog | [release] `@aihu/plugin` is 0.1.1 on npm but 0.1.0 in the repo |
| FEL-421 | Backlog | [bench] Verify or retire the signals competitor table |
| FEL-423 | Backlog | [agent] `full` template emits an EMPTY agent-readiness surface |
| FEL-391 | Backlog | [use] OPEN blocker E1 — deep/structural reactivity ruling |

**Linear has no user for any agent.** Every issue is assigned to the founder as a
single-owner view, with the actual working agent recorded in a comment. At one point
all 13 open issues were unassigned and three of them were already done.

## Unresolved, with the detail the tracker does not carry

- **FEL-419 — the 0%-CPU hang.** Two independent instances in unrelated subsystems
  (`test --coverage`, docs-next prerender), same signature: 0% CPU, whole process
  tree asleep, no output, stuck partway. Not slow — *stopped*. One CI sample:
  19 minutes of total silence, job cancelled at timeout. Declared a pattern rather
  than a coincidence. `#589` merged on the separate grounds that it is not a
  candidate cause.
- **FEL-409 — the bench harness still measures the wrong thing.** *"The harness
  still measures **source, in dev mode, under jsdom** — `NODE_ENV` unset, `__DEV__`
  live."* **No plan to make it measure `dist` in production mode was ever
  proposed.** `bench-arbor` red is expected; see the STOP ruling above.
- **FEL-420 — `@aihu/plugin` 0.1.1 on npm, 0.1.0 in repo.** A published package
  corresponding to *no state in the repository* cannot be rebuilt, audited, or
  bisected. Everything else that session was a wrong number; this is an artifact
  with no provenance at all.
- **FEL-421 — the signals competitor table** in `bench/signals/RESULTS.md`. Three
  questions unanswered: hardware, dist-vs-source, steelman-vs-strawman adapters. Do
  **not** cite it anywhere new until provenance is established. *"No known defect"
  is not verification.*
- **FEL-417 — a public comparative ratio may only come from js-framework-benchmark**,
  not from our own harness. Blocked on GitHub runners having no browser. No owner.
- **#565 shipped without a regression test, and CI structurally cannot catch the
  bug.** It externalised `@aihu/context`, fixing a **silent DI no-op for `dist`
  consumers** — but *"workspace tests alias `src`, so CI could never see it."* That
  root cause is unaddressed. This is a live instance of
  `docs/lessons/checked-thing-is-not-the-changed-thing.md`.
- 🔴 **`examples/hacker-news` prerenders remote HTML unescaped, and no CI job
  builds it. RAISED 2026-07-25 11:50 EDT, NEVER ACTIONED, CONFIRMED STILL LIVE
  2026-07-26 by the historian.**

  `#572` made `html={expr}` interpolate **unescaped into the served static HTML**
  — the correct semantic for `html=` (it is raw-HTML injection by definition), but
  it moves the blast radius from "client DOM" to "bytes we serve." Three bindings
  in `hacker-news` carry **remote, HN-authored HTML**, which is now baked into
  prerendered output. That changes what CSP applies to, what crawlers ingest, and
  what anything downstream trusting prerendered HTML receives.

  Still present at `origin/main`:
  ```
  examples/hacker-news/src/components/hn-comment.aihu:20   html={comment().text}
  examples/hacker-news/src/pages/item/[id].aihu:53         html={route().data.story.text}
  examples/hacker-news/src/pages/user/[id].aihu:35         html={route().data.user.about}
  ```
  And `hacker-news` is in **neither** set in `.github/workflows/plan-a.yml`:
  ```
  build: live-counter temperature-converter timer todo-mvc color-theme
  test:  …the same five… agent-hub storefront
  ```
  `check:emit-parses` compiles every `examples/**/*.aihu`, so it *parses* — but
  nothing ever builds or prerenders it, so the SSR injection path is unexercised.

  It was raised as *"a security surface change — worth a deliberate decision, not
  an accident"*, with the ask that it *"be a stated decision in the PR rather than
  a side effect, and the docs for `html=` should say plainly that it is now an
  SSR-time injection too."* No such decision or doc change was ever made. **Not
  filed in Linear.** This is the single most consequential unactioned item from the
  session.
- **#546's derived-list side effect is real and was never filed as a PR.**
- **Two proposals were made and never accepted or rejected:**
  1. A **load/idle assertion in the bench harness** that *"refuses to record a
     baseline above some threshold"* — contamination at load 35–49 is exactly how
     the current numbers became unexplainable.
  2. A **staleness detector for the size cache.** The #591 cache-authoritative fix
     *"moves the failure from 'wrong numbers appear' to 'correct numbers stop
     appearing', and **that second one is quieter**."* Nobody answered.
- **`www.aihu.dev` was last seen `pending`** — the same state that preceded a 522
  earlier that day. Never confirmed `active`.

## WHAT THE NEXT INSTANCE MUST NOT REDO

- **Do not re-verify the 24-PR merge list.** Every PR in the gbrain
  orchestrator-state table is confirmed on `origin/main` with its commit SHA. The
  receipts are in `docs/state/historian.md`.
- **Do not go looking for `#556`.** Closed, deliberately, not merged.
- **Do not rebase anything onto `feat/scaffold-aihu-config`.** Abandoned; `#609`
  was rebuilt fresh from `main` with four cherry-picked app-side commits.
- **Do not "fix" a red `bench-arbor`** by regenerating baselines. Red is expected
  and the STOP stands.
- **Do not re-derive the 26x / 8.8x / 122x / 28.63 ns benchmark numbers.** All
  are resolved and removed; `#607` is the truth file and `#582` removed the 122x
  claim from eight prose sites.
- **Do not re-argue the `#605` vs `#606` merge order.** It was reversed twice and
  then made moot by the founder redirect. The third answer was the right one and
  it is already shipped.
- **Do not re-propose "stop emitting documents you cannot populate" (FEL-423
  Option 3).** It was ruled correct, then falsified: the templates really do
  declare three tools with `describe:` strings, so deleting the documents swaps one
  lie for another. The ruling was changed.
- **Do not trust a shared checkout's branch.** Run `git branch --show-current` in
  `/Users/smcguirt/conductor/repos/aihu` before grepping it — it sits on whatever
  branch another agent left it on, and this has produced a confident wrong
  correction at least twice. `git worktree list` shows 100+ worktrees on this repo.

## Pointers

- Session record + receipts: `docs/state/historian.md`
- Verification queue and its verdicts: `docs/state/verifier.md`
- Named failure patterns: `docs/lessons/absent-value-rendered-as-real.md`,
  `docs/lessons/checked-thing-is-not-the-changed-thing.md`
- Raw Slack transcript (the only copy): `docs/state/transcripts/`
- Previous retro: `docs/plans/merge-train-2026-07-24/RETRO.md`
