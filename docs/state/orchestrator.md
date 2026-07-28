# State — orchestrator

**Project slug:** `aihu`
**Role:** orchestrator (merge train, release train, dispatch, merge-order rulings)
**Renamed from:** `docs/state/merge-train.md` on 2026-07-26. Scope names go stale —
`merge-train` spent 2026-07-25/26 orchestrating a swarm, not running a merge train,
and `docs-next` spent it doing config architecture. **Role names survive a pivot.**
**Last verified:** 2026-07-27 (orchestrator wake, against `origin/main` @ `edba0c5a`)
**Mode:** 2/3 mixed — build + defect fix, multi-agent

> **Why this file lives at `docs/state/` and not `state-orchestrator.md`:**
> `.gitignore:98` matches `state-*.md`, so a repo-root state file is untracked,
> invisible to every other clone, and lost on a fresh worktree. The
> `fw-agent-skill` resume protocol previously pointed at that path, which made
> resume step 1 a silent no-op — see lesson #20 in
> `.claude/skills/fw-agent-skill/references/lessons.md`.

## Substrate — CHANGED TWICE on 2026-07-27. Read this before trusting anything below.

**The bus is the record.** Coordination runs over `swarm-bus` (the Rust core in
`packages/swarm`, installed at `~/.swarm/bin/swarm-bus`) against one SQLite file
at `~/.swarm/bus.db`. Payloads are typed and validated at the boundary; a
malformed message is REJECTED with exit 2, so **read the exit code.** The
predecessor `bus.py` and the pre-cutover `skills/swarm/swarm.ts` Linear/Notion
path are both SUPERSEDED — a contract naming `skills/swarm/swarm.ts` as its
surface is describing a dead tool (this is how C-FEL-436 came to be dispatched
for work #645 had already done in `packages/swarm/src/main.rs`).

**Slack is banned for agents** (founder ruling 2026-07-27, landed as `#658`).
It is read by neither the reconciler, the console, nor the Linear/GitHub sync:
work reported there is invisible to every gate. It happened anyway this session —
verifier posted the FEL-461 finding to Slack and it existed in the ledger only
because builder-b relayed it onto the bus.

**Durable role state lives at `docs/state/<role>.md`**, committed, named by ROLE.
`docs/state/<your-own-role>.md` is **always in surface, on every contract** —
ruled 2026-07-27 after the historian correctly flagged it as a scope delta. A
surface that forbids the file every role is required to update is a defect in
the surface.

GBrain remains reachable at user scope as `gbrain-local` for semantic recall. It
is **not** the coordination or state layer. It went unused for ~20 hours on
2026-07-25 and the one page it holds was stale within 30 minutes of being
written. Do not treat it as truth.

## Where main actually is

```
origin/main  edba0c5a  fix(swarm): claim verbs are open, the format is what is validated (#664)
```

### Open PRs — verified 2026-07-27 via `gh pr list --state open`

| PR | state | note |
|---|---|---|
| **664** | READY, MERGEABLE | *(merged during this wake — became `edba0c5a`)* |
| **663** | DRAFT | FEL-431 cf-team `.moon` workspace. Honest could-not-check split: `moon` now resolves+runs, but typecheck-exit-0 needs the real `create-aihu` pipeline. Leave draft. |
| **661** | DRAFT | FEL-461 swarm SKILL.md `$S` → shell function. Evidence exists; needs a ready transition. |
| **660** | READY | `docs/state/builder-b.md`. |
| **659** | DRAFT | `docs/state/verifier.md` Round 3. |
| **657** | DRAFT | retro — 8 incidents with promotion rungs. |
| **656** | DRAFT | FEL-EXTERNALS `/^node:/` in cli/app/adapter-vercel. **Ruled: mark ready** — a draft builds nothing, so its own acceptance is unobtainable. |
| **655** | READY, MERGEABLE, **ci-ok green** | FEL-GH478 `<$slot>` fallback. Verified PASS both directions by verifier from a clean source-built compiler. Ready to land. |
| **654** | DRAFT | GH-503 `__aihu_each` non-iterables. Premise correction inside: the TS18046 the contract demanded does not exist on main (fixed by #505). |
| **666** | DRAFT | FEL-MOON-ROLLDOWN — `bunx` prefix on every bare `.bin` command across 6 `moon.yml`. **Accepted**; mark ready. Cold-cache proof + `dist` sha256 byte-identical to `bun run build`. |
| **667** | DRAFT | **FEL-433, the paired filter fix — highest-stakes diff on the board**, it changes what CI runs on every PR. `code` split to its own step with `predicate-quantifier: every`; blanket `!**/*.md` → targeted doc-md exclusions so `skills/aihu/**.md` stays code. Mark ready; verifier dispatched. |

**Every draft above shows `check=SKIPPED` + `ci-ok=FAILURE`.** That is the
FEL-437 guard doing its job, not a defect — a draft built and tested nothing.
Do not re-triage it; rule "mark ready" and move on.

Merged this session: **#639** (FEL-439 docs), **#640** (FEL-440 registration as
codegen input), **#641** (FEL-441 ref/onMount order), **#653**, **#658**
(CLAUDE.md), **#664**.

## Rulings issued 2026-07-27 (orchestrator wake) — do not re-litigate

Every one of these was verified against `origin/main` before it was made; a
self-assessed disposition is exactly what must not be taken on trust.

- **The recirculation loop is CLOSED, and the mechanism is worth remembering.**
  Five contracts (423/425/430/433/437) were re-dispatched to the architect for
  ~9 batches. `verify-merged` could never clear them: it selects only
  `claimed|building|submitted|no-claims` (`main.rs:2436`), so an **`offered`
  contract with no swarm claim is invisible to reconcile forever.** It needed an
  authority move. Done: `C-FEL-425 → verified` (#606), `C-FEL-430 → verified`
  (#625/#618), `C-FEL-437 → verified` (#627), `C-FEL-423 → declined`
  (covered by C-FEL-434), `C-GH-478 → declined` (duplicate of C-FEL-GH478).
- **Status moves on another agent's contract are the orchestrator's, not the
  agent's.** The architect was right to stop and ask rather than mutate.
- **FEL-433 is REAL, not stale — the earlier "does not reproduce" was wrong.**
  The `code:` paths-filter at `plan-a.yml:447-457` carries a full exclusion list
  and is **inert**: `dorny/paths-filter` defaults to `predicate-quantifier: some`
  and the leading `'**'` matches everything, so every negation is dead and
  `code` is true for every PR. The workflow documents this against itself at
  `:251-255` and `:353-358`. **#615 is `check:skill-samples`** (`plan-a.yml:102`),
  a step *inside* `check`, which is gated on `changes.code` — and its inputs are
  `skills/aihu/**.md`. So the naive fix (`predicate-quantifier: every`) makes a
  samples-only PR classify as docs and **skips the gate that exists to catch
  rotted samples.** Fix both halves in one contract or neither.
- **C-FEL-434 → option (b), and it is cheap.** Do NOT un-elide
  `registerAgentMetadata` into client bytes (policy `extract` carries scope
  names; `.size-limit.json` gates the bundles). `manifest_json` is a **build-time
  sidecar**, not client bytes (`emit.rs:125`, written like `route_json`), and it
  is suppressed at `emit.rs:397-398` — *that* suppression is what starves the
  readiness generator. Lift it; feed `plugin-agent-readiness` through the seam
  that already exists (`markdown-resolver.ts:81`
  `options.readComponents ?? getAllAgentMetadata`). **Hard requirement:**
  `llms.txt` is served, so a `$scope`-carrying component must appear in
  `## Components` while the emitted `llms.txt` must NOT contain the scope string.
  This also closes C-FEL-423.
- **FEL-440 closed, no surface waiver.** Keep the `panic!` tripwire; do not
  thread `Result<EmitResult, CompileError>` through ~212 call sites. 11-of-19
  trigger families is satisfied — the remainder provably funnel through the same
  append at `emit.rs:1622-1626`, and nobody should guess block-tag syntax to hit
  a round number.
- **C-GH-554 → `ts-blank-space`,** not the full `typescript` compiler. `stripTs`
  lives in `apps/docs/playground/playground-embed.ts`; `.size-limit.json` has no
  `apps/**` row, so the browser-budget argument does not apply. Docs-app
  dependency only.
- **C-FEL-424 → do NOT reintroduce `aihu.config.ts` into the scaffold.** That
  reverses #609 and the standing "config's home is `vite.config.ts`". `aihu add`
  must resolve config the way `build.ts`/`dev.ts` already do and fail naming the
  file it wanted.
- **C-FEL-427 → the architect's direction is ratified:** converge the scaffold
  `$action:{}` block onto the compiler-registered `action({describe,expose},fn)`
  intrinsic. It removes a scaffold-only outlier, not a public API.
- **`packages/server` and `packages/primitives` are DELIBERATE `/^node:/`
  exclusions.** In `server` the empty node: externals list *is* the check
  (`check:runtime-purity`); in `primitives` a `node:` import in a bundled entry
  is a genuine bug in a size-gated browser package. A blanket pattern silently
  externalises the exact leak the config exists to catch. Recorded in-file, not
  only on the bus.
- **The claim-verb vocabulary is OPEN; the FORMAT is what is validated.** #662
  shipped a closed enum and was measured against live traffic before deploy: it
  rejected 5 of 6 real verbs (`repro:`, `verified:`, `couldnotcheck:`, `tested:`,
  `impl:`), including `couldnotcheck:` — the most valuable claim an agent can
  make. #664 replaced it. **The spec (`design/typed-bus-payloads` §Schemas) is
  what is wrong here, not the implementation.** Do not rebuild the enum.
- **Batch size: at most THREE contracts per builder per wake,** and the
  orchestrator checks each against merged PRs before sending. A 20-contract dump
  produces either shallow claims or blocked ones; three of four in one earlier
  batch were already merged.

### Second wake, same day

- **The 13 non-aihu contracts are DECLINED from this queue**
  (`C-FEL-262/264/265/279/280/282/291/298/300/311/315/332/335` — lexicon,
  exegesis, pericopes, Sefaria commentary, the Stripe `usr.profiles` bridge).
  The architect's split was the right move and I executed it: **declining from
  the swarm queue is non-destructive** — `declined` classifies as `NoOp` in
  `classify()`, so no Linear issue is touched and each persists for its real
  owner. That separates the *scope* call (an agent can make it) from the
  *routing* call (needs a founder business fact, still in DECIDE). It also
  breaks the "cheap enough to live with, so never fixed" trap I named when I
  escalated it — the queue is clean now whether or not the routing is ever
  answered.
- **A DECOMPOSED PARENT LEAVES THE QUEUE.** `C-GH-487` was still sitting
  `offered` + bar-empty after being decomposed into `-a/-b/-c/-d`. That is the
  stuck-five shape exactly: an un-barrable row that resurfaces every triage pass.
  Declined as *"DECOMPOSED, not dropped: superseded by children …"*, with the
  children named in the recon and the GitHub epic untouched. **Every future
  decomposition ends this way.**
- **Epic decomposition method CONFIRMED** — cut along **role + feature seams,
  never compiler phases** (a parse/lower/emit cut yields children that cannot
  ship or fail independently, which makes their bars unfalsifiable in isolation);
  resolve an embedded design fork **inline**, never as a fifth contract (a design
  ruling has no bidirectional bar and would re-add an un-barrable row); use
  `needs` edges for sequencing. Verified before confirming: all four children
  carry a non-empty `must_pass`.
  **Gap flagged back:** `C-GH-483` is the `needs` target for all four children
  and is itself unspecced, so nobody can build them yet. Decompose it next.
- **A `needs` edge pointing at an un-barred contract is a trap,** not
  sequencing — it blocks-on-needs the moment anyone claims. Same shape that
  stalled `C-SWARM-SCHEMA`.

### Third wake, same day

- **A `blocked` with no natural contract gets its OWN contract row.** I attached
  the non-aihu routing question to `C-FEL-433` — the *paths-filter* contract —
  because a blocked wants a contract and it was a convenient handle. Result:
  verifier and historian both attached their responses there, tangling a product
  routing decision into the thread of a PR a builder was actively shipping, and
  **both spent a wake re-escalating a decision I had already executed.**
  Re-filed as `C-SWARM-QUEUE-ROUTING` with a real bar. *A ruling nobody can find
  is not a ruling — and I filed one where it could only be found in the wrong
  place.*
- **An escalation that CAN be split SHOULD be.** I sent the non-aihu item up
  whole, so the half needing a founder business fact (the routing target) blocked
  the half needing only a scope call (clean the queue). It sat a full wake. The
  architect split it; the non-blocking half then took minutes. This is the
  transferable lesson, banked in `docs/lessons/triage-queue-mixed-products.md`.
- **`C-SWARM-SCHEMA` → build the `/state` VIEW-MODELS, defer the payload
  mirror.** The architect's framing finding *is* the ruling: the payload schemas
  (`Verdict`/`Blocked`/`Claim`) and the `/state` view-models are **two schema
  sets**, and the contract conflated them. `/state` is the only one that crosses
  into TypeScript — `useSwarm` receives it and never receives a payload
  (`decide[]` is `{from,contract,ago,question}`, *not* the `Blocked` payload).
  The payload side is already enforced in Rust at the boundary; mirroring it in
  Zod would type a caller that does not exist. **Hazard named in the ruling:**
  typing `/state` creates a cross-language contract with `~/.swarm/dashboard.py`
  (outside any repo, so ungatable) that nothing enforces — so a parse failure
  must be **loud and visible**, never a silent empty panel. An empty DECIDE
  bucket meaning "schema drifted" is indistinguishable from "nothing to decide".
- **Do not "fix" `reviews[].pr`** — it is the string `"PR #641"`, not a number.
  That is `dashboard.py`'s surface; typing it honestly as a string is correct.
- **#657 is FROZEN at `d3cf271e`.** It had grown to ~10 files across every wake,
  which means *the entire session's durable memory existed only in an unmerged
  draft.* A PR that keeps growing never gets reviewed. Further banking goes on a
  fresh branch.

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

### Coordination protocol — adopted 2026-07-26, after paying for it three times

- **A claim is not a claim until it is in Linear.** *"I am filing X unless you
  object"* posted to a channel that scrolls and truncates is **not ownership — it
  is a hope.** Claim/file first, then work. Adopted after the orchestrator wrote
  that instruction for three agents and then broke it on intake within the hour:
  FEL-431 and FEL-432 were the same cf-team defect, filed an hour apart by two
  agents who had each verified it independently. **FEL-432 cancelled; FEL-431
  stands, raised to P1.**
- **No more "shout in the next few minutes" windows, in either direction.**
  **Silence means nothing on this transport.** If you need a ruling, say
  *"blocking on a ruling"* and stop — it is a hard gate, not a courtesy window.
  If someone must wait, say *"hold"* and they hold until answered.
  Three instances in one afternoon: builder shipped #619 on a two-minute silence
  window; the orchestrator answered that window eleven minutes later; verifier
  filed on a "few minutes" window and the orchestrator filed the duplicate.
- **Rulings go on the PR or in Linear. Slack gets a pointer only.** Adopted after
  three rulings evaporated in-channel in one afternoon: builder shipped #619
  against a ruling that had not reached it; builder-b asked twice for an answer
  already given; the historian reported three *decided* items as still open. The
  channel truncates at ~2 kB and had been *proven* to truncate two hours before it
  was still being used for load-bearing decisions.
- **Check Linear before reporting anything as unowned or undecided.** The channel
  is a notification, not a source of truth.
- **Merge authority for docs-only PRs is the historian's — under a stricter test
  than "`ci-ok` green".** `ci-ok` passes when its needs *succeeded **or were
  skipped***, and a draft skips them all, so the required status is satisfiable by
  a PR that compiled nothing (instance 48). Before merging or arming auto-merge:
  assert `check-runs.total_count > 0` **and** that `check` itself concluded
  `success` — not merely that `ci-ok` is green. Scope stays narrow:
  `docs/lessons/**`, `docs/state/**`, `docs/retros/**` only; anything touching
  `scripts/`, `.github/` or `package.json` goes to the orchestrator.
- **Ownership is by SURFACE, not by file.** `packages/cli/**` + config +
  `docs/plans/**` vs `examples/**` + `scripts/build-governed-examples.ts` +
  `governed-roster.json` + `.tastemaker/**` + `plan-a.yml`. Splitting a shared
  file between two owners does not work; splitting the surface does.


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

1. **Route the non-aihu backlog.** At least **13** offered contracts
   (`C-FEL-262/264/265/279/280/282/291/298/300/311/315/332/335` — lexicon,
   pericopes, exegesis verdicts, Sefaria commentary, the Stripe `usr.profiles`
   entitlement bridge) are fellwork's exegesis/Bible product, not aihu. Options
   put to the founder 2026-07-27: scope `sync --pull` by Linear team/label, move
   the issues, or work them here. Cannot be decided by an agent — it depends on
   how the founder wants the Linear workspace organised. **Failure mode if
   unanswered: nothing breaks, the queue just stays ~10% noise forever and every
   triage pass re-discovers it** — which is precisely why it will never get fixed
   without a ruling.
2. **Cut the release.** Everything is on main and unpublished; this session alone
   added #639/#640/#641/#653/#658/#664 with #655 ready to land. Outward-facing
   and irreversible, so no wake may cut it. Open since 2026-07-26.
   **Split as of the third wake:** the *scope* half is decided and executed;
   only the routing target remains, now on its own contract
   `C-SWARM-QUEUE-ROUTING` (bar filed, blocked pending the answer). Its bar
   **forbids keyword matching on titles** as the scoping key — it must be an
   explicit tracker attribute — and carries an anti-row: a genuine aihu issue
   that superficially resembles the excluded set must be KEPT. Misclassifying at
   intake would silently drop real aihu work, which is worse than the noise.
3. **`@state` model: is a bare `let x = 0` auto-reactive, or is
   `let x = state(0)` required?** The public authoring surface — what a person
   types in a `.aihu` file — so it is not an agent's to settle. **Non-blocking:**
   the architect ruled EXPLICIT as the working decision (Svelte 5 runes require
   `$state()`, Solid requires `createSignal()`, both having rejected implicit
   auto-reactivity as the invisible-reactivity footgun the epic itself names; it
   also matches the FEL-391 ruling). A flip is cheap — children `C-GH-487-a/-b`
   change their `let` treatment and the seams and must-fails do not move — which
   is precisely why decomposition proceeds without an answer.

**Note the shape of item 1 after the second wake:** the *scope* half is settled
and executed; only the *routing target* still needs the founder. An escalation
that cannot be split blocks everything behind it; one that can should be.

**Both former items on this list are RESOLVED and must not be re-escalated:**
FEL-391 (E1) was ruled by the architect — *ratify "replace, don't mutate"; no
deep Proxy layer; field-level reactivity via a record-of-signals*. FEL-423's
remainder was ruled by this wake as C-FEL-434 option (b) (see Rulings above);
it never needed to be a product question, because `manifest_json` is a build-time
sidecar and not client bytes.

## 🔴 `ci-ok` FLAPS — a red X on your PR may not be your diff

**Until `C-FEL-411` lands, a required-check result is not by itself evidence.**
Read *which job* failed and ask whether your diff could possibly have caused it.

`PR #661` is a **one-file markdown diff** whose required `check` went red:

```
run 30317184761 / job `check` / step `bun run typecheck`
  editor:typecheck | tests/component-compile.test.ts(16,31): error TS2307:
    Cannot find module '@aihu/compiler' or its corresponding type declarations.
  × Task editor:typecheck failed to run  ╰─▶ Process bunx failed: exit code 2
  → ci-ok FAILURE (CHECK_RESULT: failure, IS_DRAFT: false)
```

Cause, read from the file rather than inferred: `packages/editor/moon.yml`
declares `dependsOn: [signals]` **and nothing else**, while
`packages/editor/tests/component-compile.test.ts:16` imports `@aihu/compiler`.
The graph is missing the edge, so `editor:typecheck` can be scheduled before
`compiler:build` and the declarations do not exist yet.

`main` is **green** on every recent run (`edba0c5a`, `8a692439`, `622fa289`,
`2350f49c`) — so this is a **race, not a breakage**, and that is what makes it
serious: *a red X might be your diff or might be the race, and a green tick
might be correctness or might be luck.* Both are absent values rendered as real.
Dispatched to builder-b as `C-FEL-411`, paired with `C-FEL-MOON-ROLLDOWN` (same
`moon.yml` surface, same root class: **the task graph does not describe the real
dependencies**), with two added acceptance rows — the guard must name
`packages/editor` on today's graph, and it must **derive** required edges from
what packages actually import rather than hand-list them (a hand-list drifts the
way the `node:` allowlists and the `publish-all` PKGS array did).

## Queue shape — measured 2026-07-27, not estimated

```
offered                     127 → 118 → 125   (13 non-aihu + C-GH-487 out;
                                               then epic children + new contracts in)
  ...of which carry a bar    19 → 23           (all authored by the architect)
claimed                       4 → 3            (builder released 424/427 per ruling)
no-claims                    14 → 16
verified                      9 → 12           (three status moves, wake 1)
declined                      0 → 16
```

`offered` going **up** after a clearance is the healthy direction: the removals
were un-barrable noise, the additions are barred, claimable work.

The architect's own composition finding stands and is the reason "127 offered"
overstates the work: after the reproducible-bug seam was drained (~21 barred),
the remainder is **~28 epics/families** needing decomposition, the 13 non-aihu
items above, a set of exists-with-feature-gap composables whose one-line notes do
not pin a falsifiable behaviour, and design items that are architect rulings
rather than builder bars. **Do not read the raw `offered` count as a backlog.**

Pulled Linear titles live in the `note` column, not `issue` (`issue` gets the
bare identifier). `sync --pull` is working correctly — I nearly filed a bogus
tooling contract by querying the wrong column first.

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
| FEL-423 | **RESCOPED** | `full` already does served routes entirely; now = verify `full`+`agent`, build the floor assertion, document why minimal/docs cannot host served routes. Moved to builder-b |
| FEL-434 | **NEW** | The root cause under FEL-423 — `emit.rs:206` `elide_agent` strips agent metadata from client builds. Compiler-owner ruling, filed so it cannot quietly become permanent |
| FEL-431 | **P1** | cf-team scaffold cannot dev/build/typecheck — ships no `.moon` workspace. (FEL-432 was a duplicate of this and is **cancelled**) |
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
- ✅ **RESOLVED 2026-07-27 — `examples/hacker-news` unescaped remote HTML.** This
  was the single most consequential unactioned item on this file and it is
  **fixed on main**; the alarm below is kept only as the record of what was
  wrong. **FEL-426 removed all three `html={}` bindings.** Remote HN content is
  now parsed to structured data (`src/lib/parse-hn-markup.ts`) and rendered
  through escaped bindings, `src/components/hn-rich-text.aihu:5` states there is
  deliberately no `html={}`, and `examples/hacker-news/tests/smoke.test.ts:55`
  asserts *"no `html={}` binding anywhere in the example source"* — the fix is
  gated, not merely applied. The rejected alternative is recorded in
  `parse-hn-markup.ts:12`: keep feeding untrusted HTML to `html={}` behind a
  sanitiser. **Verified by reading `origin/main`, not by remembering.** Do not
  re-raise it.

  <details><summary>The original alarm, kept for the record</summary>

  🔴 **`examples/hacker-news` prerenders remote HTML unescaped, and no CI job
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

  </details>
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
- **Do not re-escalate FEL-391 or the FEL-423 remainder.** Both are ruled; see
  "Blocked on the founder".
- **Do not re-verify the stuck-five (423/425/430/433/437).** Their dispositions
  are recorded above with the merged PR that resolved each. The architect spent
  ~9 batches re-confirming them; the loop was a selector defect, not work.
- **Do not re-litigate the claim-verb enum.** It was built (#662), measured to
  reject 5 of 6 real verbs, and replaced (#664). The spec is what is wrong.
- **Do not "complete the `/^node:/` sweep"** into `packages/server` or
  `packages/primitives`. Deliberate exclusions; the reasoning is in-file.
- **Do not re-raise the `hacker-news` unescaped-HTML alarm.** FEL-426 fixed it
  and a smoke test gates it.
- **Do not treat an uncommitted `CLAUDE.md` in a sibling worktree as lost work.**
  Twice on 2026-07-27 (zurich, jerusalem) a twin left one staged; both were
  byte-identical to `origin/main` post-#658. Check
  `git diff --stat origin/main -- <file>` before preserving anything.
- **Do not re-open the `!.claude/**` exclusion in `#667`.** I suspected it was
  the same defect as the blanket `!**/*.md` (since `.claude/skills/swarm/swarm.ts`
  is live executable TypeScript) and was about to rule it a blocker. Then I ran
  the tool: `biome.json` `files.includes` carries `"!.claude"`, and
  `bunx biome check .claude/skills/swarm/swarm.ts` → *"These paths were provided
  but ignored"*. **Nothing in `check` covers `.claude/` at all**, so excluding it
  loses nothing. My candidate blocker was wrong. This filter has now produced
  three wrong readings from three readers, every one from reasoning about globs
  instead of running a matcher — mine was nearly the fourth.
- **Do not re-triage `#661`'s red `check`.** Ruled: not its diff, it merges.
  The cause is the missing `editor → compiler` moon edge (`C-FEL-411`); see the
  flapping-gate section above for the run id and the log line.
- **Do not re-decide the non-aihu 13 or re-add them to the queue.** Declined
  with reasons in each contract's recon; the Linear issues are untouched.
- **Do not accuse an agent of channel misconduct from a second-hand report.**
  Read that agent's own bus traffic first. Twins share `(workspace, role)` and
  the Slack bot stamps `username=<role>` for anyone, so attribution by username
  is impossible. I got this wrong about verifier and corrected it publicly.
- **Do not reuse a branch whose content already merged.** `docs/claude-md-bus-is-the-record`
  carries commits that are NOT ancestors of main even though its content landed as
  #658 (squash). Branch fresh off `origin/main` every time — this is retro
  incident 8, which recurred twice more the same day.

## Structural fix I owe, and have not built

**The supervisor must pin the checkout per wake.** On 2026-07-27 this defect
produced **three distinct consequence classes**, not three copies of one:

1. **Lost-work risk** — a force-push onto an already-merged branch; `CLAUDE.md`
   left staged mid-build in `aihu/zurich`; a branch switched under verifier in
   `aihu/jerusalem`. (Nothing was actually lost: both files proved
   byte-identical to `origin/main` post-#658. That was luck, not design.)
2. **Identity swap between turns** — a worktree that is on a different branch
   than the role that last used it, which has produced confident wrong
   corrections more than once.
3. **MISATTRIBUTION — the one I caused.** I publicly told the bus that verifier
   posted the FEL-461 finding to Slack. They produced a receipt: their instance
   sent it *over the bus* (msg `d2a3d18f`, 20:34:14). The Slack copy came from a
   verifier **twin** sharing the `(workspace, role)` identity — and because the
   Slack bot stamps `username=<role>` for any sender, **a twin's post is
   indistinguishable from theirs by construction.** I accepted a second-hand
   attribution about a peer's conduct without reading that peer's own traffic
   first, which is the "verify before you rule" standard skipped in the one case
   where it was about someone's reputation. Corrected to all, since that is
   where the accusation went.

4. **Concurrent mutation, caught live** — builder hit a real `index.lock`
   *mid-commit* on `C-FEL-433`, from another instance running git in the same
   shared worktree at that moment. First incident where the hazard was **active
   during** an operation rather than discovered after. They waited for it to
   clear rather than force-removing it (force-removing would have corrupted the
   other instance's commit), then **re-verified they were still on the right
   branch** before committing. Bank the remedy as hard as the incident: the
   re-verify-after-waiting step is the one people skip, and it is what turns a
   survivable collision into a silent wrong-branch commit.

**Four incidents, four distinct consequence classes, one root.** The current
rung is prose ("check your branch") — the weakest possible, and it depends on
remembering. Recorded as retro incident 8 in `docs/lessons/promotion-rungs.md`
(PR #657, frozen at `d3cf271e`). **Owner: orchestrator. Unbuilt.** Consequence
class 3 is the argument that should finally get it built: shared identity on an
unauthenticated channel means misconduct cannot be attributed *at all*.

## Pointers

- Session record + receipts: `docs/state/historian.md`
- Verification queue and its verdicts: `docs/state/verifier.md`
- Named failure patterns: `docs/lessons/absent-value-rendered-as-real.md`,
  `docs/lessons/checked-thing-is-not-the-changed-thing.md`
- Raw Slack transcript (the only copy): `docs/state/transcripts/`
- Previous retro: `docs/plans/merge-train-2026-07-24/RETRO.md`
