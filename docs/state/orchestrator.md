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
origin/main  41c37df6  fix(ci): a draft is unfinished, not broken — warn instead of failing (#670)
```

### 🔴 A DRAFT NO LONGER FAILS `ci-ok` — #670, merged 01:12Z

**My standing triage rule is SUPERSEDED.** For six wakes I told every agent that
*"a draft showing `check=SKIPPED` + `ci-ok=FAILURE` is the FEL-437 guard doing
its job, not a defect."* On main, a draft now emits a **`::warning::`** —
visible, explicitly "NOT evidence of a pass", not a failure.

**New rule: on a run produced AFTER 01:12Z, a red `ci-ok` on a draft means
something REAL.** Triage it.

**Transition hazard:** runs predating #670 still show the old FAILURE, so a
draft red is ambiguous for a while — retired-behaviour-on-a-stale-run, or a real
failure. **Name which run you read, with its timestamp.** A conclusion drawn
from a run whose behaviour has since changed is a stale receipt — the same class
as the `bus.db` md5.

#670's reasoning is this session's own: *"the board fills with red that means
unfinished, genuine failures hide among them, and everyone learns to ignore red.
Red must mean this is broken."* Same noise-over-signal defect as the dead matrix
lane and the flapping check.

**MERGED since the ninth wake:** #655 (slot fallback), **#657 (the retro — the
session's lessons are on main, not in a draft)**, #660, #670.

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
| **668** | DRAFT | **FEL-434 compiler half** (closes FEL-423). Three files; the whole change is deleting `if elide_agent { String::new() }` at `emit.rs:398`. Accepted; mark ready. |
| **667** | DRAFT | **FEL-433, the paired filter fix — highest-stakes diff on the board**, it changes what CI runs on every PR. `code` split to its own step with `predicate-quantifier: every`; blanket `!**/*.md` → targeted doc-md exclusions so `skills/aihu/**.md` stays code. Mark ready; verifier dispatched. |

**A draft showing `check=SKIPPED` + `ci-ok=FAILURE` is the FEL-437 guard doing
its job, not a defect** — a draft built and tested nothing. Do not re-triage it;
rule "mark ready" and move on. As of the sixth wake **#656, #657, #667 and #668
are all READY** with runs in flight; `check` is *running* (not skipped) on
#667's ready run, which is the live confirmation that its own filter fix is not
inverted — corroboration, not proof; the matcher is the verdict.

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
- **#657 is FROZEN at `28b70e87`** (the line moved once — it was `d3cf271e` when
  I called the freeze, and the historian had banked three more verified lessons
  before the ruling landed; moving the line once beats ripping them back out).
  It had grown across every wake, which means *the entire session's durable
  memory existed only in an unmerged draft.* A PR that keeps growing never gets
  reviewed. Further banking goes on a fresh branch.

### Fourth wake — 🔴 THE LEDGER FILE IS PERMANENTLY STALE

**`md5 ~/.swarm/bus.db` is NOT evidence the bus is unchanged, and a `cp` of that
file alone reads a ledger from hours ago.** `packages/swarm/src/main.rs:503` sets
`journal_mode = WAL` and **nothing in the binary ever checkpoints** (`grep
wal_checkpoint` → nothing). Measured side by side:

```
cp ~/.swarm/bus.db alone   → offered 132 | verified 10 | claimed 4 | NO declined column at all
cp bus.db + -wal + -shm    → offered 125 | verified 12 | claimed  3 | declined 16
bus.db 901,120 B @ 20:15      bus.db-wal 4,169,472 B @ 20:42
```

The main-file read is not slightly behind — **it predates two full wakes of
committed status moves.** Found by verifier as a self-disclosed near-miss: their
first read used `cp` of the main file alone and reported the exact opposite of
the truth (13 still offered, 0 declined); trusting it would have falsely
overruled a completed cleanup. The tell was that the main file's md5 was
unchanged across a wake full of writes.

**To read the live bus read-only you must copy the `-wal` and `-shm` sidecars
too**, or query the live file with `sqlite3` (which is WAL-aware — every count
in this file was read that way and is correct).

**A disproven method leaves disproven receipts in circulation.** The unchanged-
md5 proof is cited as a headline receipt in the `C-FEL-REVIEW-0727` verdict.
Asked verifier to qualify it (their conclusion there is independently supported
by "claims write `agents.json`", so it is a qualify, not a retract). *When a
method is disproven, the verdicts that used it do not automatically update —
someone has to go back, and this repo has no mechanism for that.*

Filed as `C-SWARM-WAL-STALE` → builder-b, carrying an **anti-row: a fix must not
disable WAL.** It is on because multiple agent processes read while one writes;
"fixing" this by serialising writers would trade a stale copy for
`database is locked`.

### Fourteenth wake — 🔴 the live bus runs code older than three merged PRs

**Merging a `packages/swarm` PR changes nothing about the binary agents run.**
Measured while triaging #674:

```
installed ~/.swarm/bin/swarm-bus mtime : 2026-07-27 15:10:12
packages/swarm on main AFTER that      : 34f30d8a 15:10 (#651 verify-merged)
                                         8a692439 17:53 (#662)
                                         edba0c5a 20:13 (#664)
```

Consequences worth sitting with:

- **#662 shipped a closed verb enum that #664's own body says would have JAMMED
  THE SWARM — and it never did, purely because nobody deployed it. The
  protection was ACCIDENTAL, not designed.**
- Every verdict this session that verified `swarm-bus` behaviour from a *source
  build* was describing code that **is not running**.
- #674's own fix is equally invisible until someone deploys it.

**Third variant this session of one family** — work committed, pushed, and
*merged*, still unreachable by the thing that needs it: after the architect's
state file in the wrong repo and a stale lesson live on main. **The durability
rule says "push it." It does not say "and make sure the consumer gets it."**

Filed `C-SWARM-DEPLOY-GAP` → builder-b: an embedded build sha the binary can
report, ONE documented rebuild+install command, and a **loud staleness signal**
when the binary predates the repo it is invoked in. *Silence when stale is a
fail.*

**#674 accepted.** Both bar options delivered, anti-row honoured (WAL stays on;
24 concurrent writers, 0 errors). Checkpoint-on-write is deliberately
best-effort — it ignores `SQLITE_BUSY` so a checkpoint failure never turns a
*committed write* into a CLI error. And the real discovery, measured not argued:
**under a held reader neither checkpoint mode flushes to main, but `VACUUM INTO`
does** — so `export` is not a convenience alternative, it is **the only correct
snapshot under concurrency**; checkpointing is the optimisation.
*Could-not-check:* whether a dashboard process is live and holding readers — my
`ps` probe matched my own agent process, because "dashboard.py" appears in my
own prompt text.

**A corruption of my own, disclosed:** the first version of
`C-SWARM-DEPLOY-GAP`'s `must_fail` contained backticks inside an unquoted shell
string. The shell performed command substitution and ate the word, leaving
*"lacks a #651-era capability (e.g.  behaviour)"* — and `swarm-bus` accepted it
at **exit 0**, because the mangling happened in the shell *before the tool ever
saw it*. **A typed payload boundary validates what it RECEIVES, not what you
MEANT.** Re-offered and verified by reading the stored value back out of the DB.

### Thirteenth wake — a wrong lesson is LIVE ON MAIN, and its fix is stuck behind a conflicting branch

🔴 **`docs/lessons/triage-queue-mixed-products.md` is on `origin/main` and every
load-bearing sentence in it is false.** It landed with #657:

```
:62  "is a **founder business fact** neither..."
:65  "Status: SCOPE-DECLINED, ROUTING STILL PENDING. Escalated to the human…"
:77  "…is a founder business fact and stays in DECIDE."
:88  "this one is stuck on prose pending a human routing call"
```

The routing question was a **lookup**, is **answered**, nothing is pending on the
founder, and `C-SWARM-QUEUE-ROUTING` is retargeted with a full spec. **A lessons
file about wrongly escalating is live, containing the wrong escalation** — and
the correction is trapped in **#669, CONFLICTING for three wakes through two
explicit warnings.**

**RULING — split the correction out.** Fresh branch off `origin/main` carrying
ONLY that fix; deal with #669 separately. **When a branch cannot land, the
corrections on it must not inherit its paralysis.** A correction to something
already public is urgent in a way new material is not: new lessons can wait for
a rebase; a live falsehood cannot.

**And the recurrence is the finding.** #669 survived *two* warnings. That is not
a reminder problem — the prose rung was exercised twice and failed twice. *A rung
that fails under test is evidence for the next rung up, not for repeating the
same rung louder.* I stopped warning and changed the shape of the ask instead.

🔴 **`docs/state/architect.md` was created IN THE WRONG REPO.**

```
git ls-remote origin refs/heads/srmcguirt/sydney          → EMPTY  (origin = fellwork/aihu)
git ls-remote …/srmcguirt/agent-swarm refs/heads/…sydney  → 8eaf7ed
git ls-tree origin/main docs/state/  → builder-b, builder, historian, orchestrator, verifier
                                        …and NO architect.md
```

The next architect instance, woken in an aihu worktree and told to read
`docs/state/architect.md` first, finds **nothing**. **This is lesson #20
recurring in a new form** — the same silent right-content/wrong-location failure
that made resume step 1 a no-op, except harder to notice, because every check run
*inside agent-swarm* says the file is fine.

**Partly my fault:** I scoped the agent-swarm override to "this contract only"
to avoid overreaching, which left their default in place — then asked three
times for the file without ever naming the path.
**Ruling, unscoped: durable role state lives in the repo the role is woken in.**
And verify with `git ls-tree origin/main docs/state/`, not `ls-remote` on your
branch — the test is *"does it appear where the next instance will look"*, not
*"did my push succeed."*

The content itself is right, and recovered from the session trace and live bus
rather than from memory — the instrument-over-hand-reasoning rule applied to
one's own history, so what is written is what was actually decided.

### Twelfth wake — 🔴 the queue stopped moving at 01:12Z

**Nothing has merged since #670.** `main` is still `41c37df6` with **13 PRs
open**, several verified, green, and hours old:

```
READY + MERGEABLE : #673 #666 #663 #661 #659 #656
READY (unknown)   : #668 #667
DRAFT             : #672 #671 #665 #654
DRAFT CONFLICTING : #669
```

Landing is the interactive session and I do not merge from a wake. But **a queue
of green verified work is not a neutral state**: every hour it sits, rebase cost
rises, more children go CONFLICTING, and the twin-instance and stale-branch
hazards get more chances to fire. Recorded as a condition of the board.

**The one ordering constraint that must survive: #666 BEFORE #671.**

- **#673 ACCEPTED — and it took the ruling further than the ruling.** I required
  that a missing `rolldown` fail loudly rather than degrade to a silent no-op.
  The builder loaded it lazily inside `measureSizes()` but deliberately
  **outside the per-entry try/catch**, and wrote down *why*: that inner catch is
  for one entry failing to bundle, so a missing bundler caught there would be
  swallowed into `bytes: -1` for **every** entry. The error names the cause, the
  remedy, and the no-bundler alternative. *A comment that stops the next person
  from "tidying" the import inward is doing real work.* `readme-sync` is its own
  always-on job, in the ci-ok needs list **and** the failure loop.
- 🔴 **#669 STILL CONFLICTING after an explicit warning** — two wakes now, base
  merged, every lesson banked into it since is undeliverable. **The recurrence
  is the lesson:** it survived a warning, which is the argument for checking
  `mergeable` at the START of a wake rather than trusting a remembered state.
- **Ledger hygiene:** two different lessons have been called the absent-value
  "ninth". An index with duplicate keys is the small wrongness that makes people
  stop trusting the whole file.

### Eleventh wake — a stack base merged and its child went CONFLICTING silently

- 🔴 **#669 is CONFLICTING.** It was stacked on #657; #657 merged; the child did
  **not** become landable — it became conflicting, and **nothing notified
  anyone.** The historian had been adding wake-items to it for four wakes.
  *When a stack base merges, the child often becomes CONFLICTING and no signal
  fires.* Rung: **check `mergeable` on your own open PR at the START of a wake**,
  not when you go to land it. More insidious than the growing-unmerged-PR trap,
  because a growing draft at least looks like it is accumulating value; a
  conflicting one accumulates value it cannot deliver.
- **`C-SWARM-QUEUE-ROUTING` retargeted to builder-b**, architect's claim
  released by the re-offer. **Their three-outcome sharpening is ratified
  verbatim, and it corrected me:** I wrote "a distinct EXCLUDE *reason*", which
  keeps 24 actionable items inside a bucket whose whole meaning is *stop looking
  at these*.

  ```
  KEEP           project==aihu          → becomes an offered contract
  EXCLUDE        project in {data,web}  → owned elsewhere; TERMINAL
  NEEDS-PROJECT  no project set         → UNCLASSIFIED; its OWN list
  ```

  **EXCLUDE is terminal; NEEDS-PROJECT is actionable.** A reason-field does not
  carry that to a human scanning output; a third outcome does. The difference is
  between a taxonomy and a **worklist**, and only one gets acted on.
- **SEQUENCING RULING:** builder-b takes `C-SWARM-WAL-STALE` **first**, then
  routing. Both are `packages/swarm/src/main.rs` — WAL-STALE at `open_db`
  ~496-503, routing at `263` / `1496-1632` / `1785`. Regions do not overlap, but
  **two in-flight branches on one file is the collision hazard that has bitten
  this swarm five times.** One after the other.
- **House style, named because the architect reached it three times
  independently:** `/state` `error()` keeps the last good frame rather than
  blanking; `sync --pull` says KEEP/EXCLUDE rather than trusting a filter; an
  unclassified item is visibly unclassified rather than silently mixed into
  terminal noise. One sentence covers all three — **make the machine SAY what it
  did, especially when what it did was "nothing."** Every silent-wrong failure
  this session (the inert paths filter, the dead matrix lane, the stale ledger
  read, the suppressed manifest) is the machine doing nothing and saying nothing.
- **Tool gap, second face:** I can hand a contract over by re-offering (it
  releases the claim), but I **cannot amend a claimed contract's bar** without
  releasing the claim. Same gap, two symptoms.

### Tenth wake — I escalated a lookup, and it cost two wakes

**`C-SWARM-QUEUE-ROUTING` was never a founder decision.** I sent it to DECIDE as
*"a business fact I do not have."* It was a **lookup**, answerable with one
GraphQL query:

```
Linear team FEL projects:  aihu [started] | data [started] | web [started]
FEL-433 → aihu   FEL-434 → aihu   FEL-411 → aihu     (contracts we are building)
FEL-300 → data   FEL-332 → data   FEL-335 → data
FEL-311 → web    FEL-262 → web                       (5 of the 13 I declined)
```

**The attribute is `project`; the value is `aihu`.** The workspace was already
organised the way the question asked about.

**MY ERROR:** *"escalate what depends on business facts you do not have"* has a
precondition I skipped — **first establish that the fact is not available to
you.** Escalating a lookup is not caution, it is a stall. Same shape as the glob
trap: a conclusion reached by reasoning about my own position rather than
running the query. **Second time this session my own unverified premise cost
someone a wake** (C-FEL-READMESYNC-JOB was the first).

🔴 **AND THE RESIDUAL IS THE REAL FINDING:**

```
144 open FEL issues:  aihu 90 | NO PROJECT 24 | data 17 | web 13
```

The 24 with **no project** include **FEL-459/449/443/442/424/423/421/420/419 —
every one an aihu contract in our own queue right now.** A naive
include-iff-`project==aihu` filter would have **silently dropped nine active
contracts** — the front-door absent-value failure the bar forbids, and it would
have shipped to anyone who took "the attribute is `project=aihu`" as the whole
answer. The architect's **loud-exclusion** design is load-bearing, not a nicety.

Ruling: filter on `project`, never the title; `sync --pull` emits KEEP/EXCLUDE +
reason for every open FEL issue; **"no project set" is a DISTINCT reason from
"project=data/web"** — one is definitely-not-ours, the other is unclassified and
a ten-second human fix. Must-fail: the dry-run's no-project bucket must contain
those nine ids. Retargeted to a Rust builder; semantics fixed, value known.

### Also tenth wake

- 🟢 **`C-FEL-411` is FIXED — PR #671.** The guard **derives** required edges
  from actual imports (static/type/dynamic/require, any subpath) rather than
  hand-listing; cycle-safe (would-be-cycle imports reported informational, so
  the three deliberate lazy-import cycle-breakers survive); bounded soundly
  (skips no-real-tsc projects, does not descend into nested scaffold projects).
  Found **56 missing edges across 19 packages**, naming
  `packages/editor/moon.yml must add dependsOn: - compiler`. Ordering proven
  three ways, including `moon query projects` exit 0 to show the 56 edges added
  no cycle — the check most people skip.
- **LANDING ORDER: #666 MUST LAND BEFORE #671**, not merely "both must land."
  #666 alone = monotonic improvement. **#671 alone would take an
  intermittently-red lane and make it deterministically red** (every
  newly-ordered cold `compiler:build` hits `rolldown: command not found`), which
  is how a correct guard gets reverted by someone who did not read the caveat.
  The dependency must be stated **in #671's PR body**, not only on the bus.
- **Retire the flapping-gate caveat once #671 lands.** Six wakes of rulings
  carry *"do not treat `check` as evidence until C-FEL-411 lands"*; that tax
  should end the moment it is untrue.
- **`C-SWARM-SCHEMA` closed out — PR #672**, body intact (which is why I did not
  open it for them). The architect independently applied the *same* loud-failure
  principle in two contracts: `state()` keeps the last good frame rather than
  blanking, and `sync --pull` says KEEP/EXCLUDE rather than trusting a filter.
  **Prevent the silent-wrong outcome by making the machine SAY what it did** —
  ratified as house style.
- **The architect has NO durable state and it shows.** `docs/state/architect.md`
  does not exist; they have re-derived the same evidence repeatedly and had two
  messages cross rulings they would have found in their own file. Told them to
  create it — the widened-surface ruling already permits it, so no permission is
  needed.

### Ninth wake — `.git` as a FILE vs a DIRECTORY decides whether /tmp is fatal

**The architect's `C-SWARM-SCHEMA` work was committed but unpushed, in
`/tmp/aihu-swarm-zod`** — the state the durability rule exists to prevent. It was
**less dangerous than it sounds**, and telling the two apart is worth knowing:

```
/tmp/aihu-swarm-zod/.git is a FILE →
  gitdir: /Users/smcguirt/conductor/repos/aihu/.git/worktrees/aihu-swarm-zod
main clone holds the ref:  refs/heads/feat/swarm-state-zod = 7b8dc599
and the object:            git cat-file -t 7b8dc599 → commit
```

**`.git` as a FILE = a worktree; objects and refs live in the PARENT clone,** so
a `/tmp` wipe costs the checkout, not the commit. **`.git` as a DIRECTORY = a
standalone clone, and then `/tmp` really is the only copy.**

**I pushed it** (`feat/swarm-state-zod` → `7b8dc599`, verified via `ls-remote`)
at the author's explicit request, on a clean tree. Pushing a feature branch is
not merging, tagging, or releasing — it is inside what a wake may do, and the
alternative was real work living on one machine, invisible to the human and to
every gate. **I did NOT open the PR:** the architect has a body written, and
opening one with my words would discard theirs and risk misstating the
`dashboard.py`-is-ungated caveat, which is its most important sentence.

- **Ratified:** hand-rolled validator over `zod` — `zod` is absent from the
  monorepo and `@aihu/use` is deliberately dependency-minimal. "Same substance,
  zero new dep, cheap to flip" is the right trade, and *cheap to flip* is what
  makes it safe to accept.
- The schema must-fail row they added unprompted is the one that matters: a
  renamed field on a CLOSED array names the error **and `state()` keeps the last
  good frame — never blanks to empty.** A schema failure that empties the DECIDE
  bucket is indistinguishable from "nothing to decide."

### Also ninth wake

- **#668 PASSES** (verifier, from their own source-built compiler, both
  directions). Three things beyond the ask: they **grepped the client bytes**
  for `reports:read`/`rateLimit`/`registerAgentMetadata` and found zero — my
  ruling *asserted* the sidecar is not client bytes; they proved it, and a hit
  there would have made option (b) wrong. They **measured** the manifest
  collision (two components → one `agent-manifest.json` listing only the second),
  converting `C-FEL-434b` row 2 from argument to reproduction. And they **named
  what is still owed**: the policy-not-public guarantee is unverified as of #668
  and lives on 434b.
- **#656/#667/#668 all `ci-ok=PASS`.** #667's own `check` **ran and passed** on
  its own `plan-a.yml` diff — the fix is not inverted, confirmed by execution as
  well as by the matcher.
- 🟡 **#667 `bench=FAIL` is not the diff — but it is not proven noise either.**
  The `bench:` filter includes `.github/workflows/plan-a.yml`, so a workflow diff
  **trips the filter, not the numbers**; `bench` is outside `ci-ok`; the STOP on
  re-baselining stands. **But** `bench` is normally SKIPPED, so this is one of
  the few times it has actually run, and it reports **cellx 807→910 ns (12.7%)**
  and **wide-fanout-100 5363→6351 ns (18.4%)** against the frozen 2026-05-25
  baseline. That is either two months of real drift in `@aihu/signals` or the
  high-variance flakiness `C-FEL-409` targets. **One sample cannot tell.**
  Recorded as could-not-check, not dismissed: *"red-by-construction" answers
  whether it blocks the PR; it does not answer whether the numbers mean
  something.*
- **Third crossed message this session.** Naming the message id in every ruling
  is now standing on both sides — cite the id when re-raising.

### Eighth wake — a contract of mine was unbuildable, and only the builder's pre-build check caught it

**`C-FEL-READMESYNC-JOB` could not be built as written, and the defect was in my
contract.** I specced two constraints: *(1)* a cheap always-on job, no
`bun install` — *"sync-readme --check needs only bun and the repo"*; *(2)* do
not touch `scripts/sync-readme.ts`. They cannot both hold:

```
scripts/sync-readme.ts:29   import { rolldown } from 'rolldown'   ← STATIC, top-level
:274                        the ONLY rolldown() call — in the MEASURE path
empirical: move node_modules/rolldown aside → `--check` exits 1
           "Cannot find package 'rolldown'"
```

`--check` only **reads** the committed `scripts/__bundle-sizes.json`, yet it
loads a bundler it never calls. Verified against source before ruling.

**RULED (b): make the import lazy.** The coupling is *accidental, not designed* —
a static import at the top of a file that grew two modes. Option (a) would have
preserved my mistaken sentence by making the job ~100× more expensive,
reintroducing the exact install cost #667's filter exists to avoid, and leaving
the coupling to bite the next person. **Surface amended** to
`plan-a.yml + scripts/sync-readme.ts (rolldown decoupling only)`.

**Added must-fail row, because a dynamic import invites a specific trap:** with
`node_modules/rolldown` absent, `--check` must now SUCCEED *and* the measure
path must **fail loudly**. A dynamic import wrapped in try/catch turns a
measurement into a silent no-op — the absent-value family, and a worse outcome
than the coupling being removed.

**THE LESSON, and it is about me:** *a contract premise is as falsifiable as a
code claim, and nothing in this system checks it.* Every bar demands the
**builder** prove their work; nothing demands anyone prove the **contract**
before work starts. I asserted "needs only bun and the repo" from reading *which
script it was*, not from running it — the identical hand-reasoning failure as
the glob trap, one layer up, committed by the person who wrote the rule against
it. **Second instance this session:** C-FEL-434's framing implied a naive
un-elide, and the builder blocked rather than building it, which is the only
reason a deliberate security posture was not reversed. Two for two.
**A contract is an unverified claim wearing the costume of a specification.**
The builder's pre-build premise check is currently discretionary discipline; it
should be the first must-fail row of every contract.

**TOOL GAP:** `swarm-bus` cannot **amend a claimed contract's bar** — re-offering
resets status to `offered` and releases the claim. So the amendment lives on the
bus while the contract row still carries the stale, unbuildable surface; anyone
reading the ledger sees the wrong bar. Sits next to *"no index of which verdicts
cited which method"* — **two places where the ledger cannot express a
correction.** Not filed: no design I believe in yet.

**#667 and #668 are BOTH GREEN.** #667 `check=SUCCESS`, `ci-ok=SUCCESS` — its
own `check` job **ran and passed**, so the filter-inversion test is settled by
execution as well as by the matcher. #668 went green at `99be3b03` after a
concurrent instance pushed the compiler-binary bump; the builder correctly read
*which* job had failed (`check:compiler-binary-bump`) and did not duplicate it.
That is a **fifth** concurrent-instance-on-a-shared-branch event — benign and
green this time, and it belongs in the tally as such, since a record of only the
harmful ones understates how often this happens.

### Seventh wake — 🔴 the Scaffold DX `matrix` lane is DEAD, not flaky

**13 of 15 cells never run a line of aihu code.** Triaged from a red `matrix` on
#656 (run `30318406544`):

```
FAILED  pm-install: command npm install exited with status 1
FAILED  pm-install: command yarn install exited with status 1
  Error: proto::commands::run::fallback_loop
  × Unable to run node, as the global executable found at
    /opt/hostedtoolcache/node/22.23.1/x64/bin/node is a proto shim, which
    would trigger a recursive execution loop.  … caused by HOME or PROTO_HOME changing.
SUMMARY  2/15 cells passed, 13 failed, 1 package manager(s) skipped
```

Every cell dies at **package-manager install**, before any aihu code runs, on a
collision between moon's `proto` shim and the GitHub-hosted node. **Red on
`main`** (run 2026-07-27T10:41:31Z) and on `changeset-release/main`,
`chore/release-guard-cf-team`, and three FEL-431 branches — continuously. It
sits **outside `ci-ok`**, so nothing forced anyone to look.

- **It is never any PR's diff.** #656 changes `external` arrays in three
  `rolldown.config.ts` files; nothing in a bundler externals list can affect
  whether `npm install` resolves node. Rule "merges" and move on.
- **Same root as `C-FEL-MOON-ROLLDOWN`** — moon/proto PATH assumptions not
  holding in the real environment. Two instances, one root, found four wakes
  apart by different people.
- **A dead gate does not just stop catching bugs — it makes other people's work
  unverifiable, and they pay without knowing why.** #663 (C-FEL-431) shipped
  with an honest could-not-check: *"typecheck exit 0 on the pristine scaffold
  needs the real `create-aihu` pipeline."* **The matrix lane is that pipeline.**
  A dead gate silently converted a verifiable question into a permanent
  could-not-check on someone else's contract.
- Filed as `C-FEL-MATRIX-PROTO` → builder-b, ranked **third** behind
  `C-FEL-411` and `C-SWARM-WAL-STALE`. Its must-fail carries the anti-recurrence
  row: after the fix, a **deliberately broken scaffold must make the lane go
  red** — a lane that cannot fail for a real reason is not a gate.

### Also seventh wake

- **#657 is GREEN and landable** — `ci-ok=SUCCESS`, `check=SUCCESS`,
  `examples=SUCCESS` on the ready run (the SKIPPED/FAILURE pair is the draft
  run). Verified independently, not taken on report. The C-FEL-411 race did not
  bite it.
- **The C-FEL-REVIEW-0727 md5 receipt is struck, and the replacement is
  stronger.** Verifier went back unprompted on an already-accepted verdict.
  *"All swarm-bus tests ran on `SWARM_DB=<temp>`; the live `bus.db` was never
  opened by a test"* is **isolation by construction**; the md5 line was
  **detection after the fact**. Prevention beats detection — the original had
  simply led with the weaker of two receipts it already held.
  **An accepted verdict is not a closed one.** And the walk-back happened only
  because one person remembered writing the line: this repo has **no index of
  which verdicts cited which method**, so the mechanism does not scale. Named,
  not solved — deliberately not filed, because "index your receipts" has no
  falsifiable bar I believe in yet.
- **A red lane must be NAMED in a verdict, not omitted.** A verdict that quietly
  drops a known-red job is how a *real* failure hides behind a known one next
  time.

### Sixth wake — the PR that writes the rule it violates

- **#667 PASSES and is cleared to land.** Verifier verified it with a real
  picomatch 4.0.5 matcher under dorny's options, patterns **parsed from the PR
  head** rather than retyped — and, the step that matters, **proved the matcher
  faithful first** by reproducing the known pre-fix inert bug before running the
  new patterns. An instrument not shown to reproduce a known-wrong answer is
  just a second opinion. Nothing in that verdict rests on anyone reading a glob
  correctly, which is the point: three readers got this filter wrong by
  reasoning about it (architect twice, me once).
- 🔴 **`sync-readme --check` is a docs-facing gate sitting inside `check` — and
  #667's own comment forbids exactly that.** The PR added: *"a docs-facing gate
  must NOT be a step here, or it would silently skip on the doc-only PRs it most
  needs to run on; it goes in its own always-on job instead."* One screen above,
  at `plan-a.yml:123`, sits `bun scripts/sync-readme.ts --check`, which consumes
  root + `packages/**/README.md` and fails on drift. Post-#667 a README-only PR
  yields `code=false`, `check` skips, and drift is uncaught in CI.
  **Not a bug in #667** — the filter is correct and replaces one that had never
  discriminated; #667 merely makes a pre-existing misplacement start to bite.
  Filed as `C-FEL-READMESYNC-JOB` (needs `C-FEL-433`).
  **The lesson:** *a rule stated in prose does not audit its own file.* The
  author wrote the correct rule and did not sweep the file for existing
  violations — prose has no way to ask "what else here is already like this?"
  Rung: prose rule → a check that enumerates docs-facing gates and asserts each
  is its own job.
- **"The pre-commit hook catches it" is NOT a valid mitigation in this swarm.**
  The husky hook is `--no-verify`-bypassable and agents here push `--no-verify`
  routinely for docs (verifier on #659 and said so; historian too). A guarantee
  whose only backstop is a bypassable local hook is void precisely for the
  population it would need to cover.
- **Rejected the carve-back** (README back to `code=true`): it would make every
  prose-only README PR pay `bun install` + build + Rust + typecheck — the exact
  cost the filter exists to avoid. The cheap always-on job (the `lesson-refs`
  pattern: checkout + one run step) buys the coverage back at seconds. And it
  must go in the **ci-ok failure loop**, not just `needs[]` — #649 proved
  `needs[]` alone is sequencing, not enforcement.
- **#657's freeze point is `28b70e87`, confirmed** — the historian flagged that
  it sat one commit past the `d3cf271e` I named. That commit *is* the three
  additions I had asked for; freezing literally would discard the work the
  freeze was called to protect. Flagging a named SHA that has moved under you,
  rather than guessing which way I meant it, is the correct handling.
- **`C-FEL-428` deferral accepted.** *"A wrong meta-gate is worse than none"* is
  the correct reasoning: a gate certifying other gates is the one place a
  plausible-but-broken version is actively harmful, because it converts
  "unaudited" into "audited and fine." Left `offered`, not claimed — a claim is
  a lock, and the builder has now twice declined to hold one they were not
  building. Not reassigned: builder-b holds `C-FEL-411` (a flapping *required*
  gate) plus `C-SWARM-WAL-STALE`, both of which outrank it.

### Fifth wake — C-FEL-434 split and shipped, and a sidecar that overwrites itself

- **The C-FEL-434 ruling landed at the size it should.** PR #668 is three files,
  and the entire compiler change is deleting one branch of one conditional —
  the `if elide_agent { String::new() }` at `emit.rs:398`. `bin/main.rs:559`
  already wrote the sidecar whenever non-empty, so nothing had to be added. The
  fix for "client builds advertise no components" was **un-suppressing a file**,
  not shipping policy to browsers. Client JS elision, T1-b, and the size rows
  are all untouched.
- **Renaming a test that encoded the bug beats deleting it.**
  `build_target_client_suppresses_manifest` was renamed with the reasoning
  inline. A deleted test leaves no trace that the old behaviour was deliberate
  and wrong. (Same shape as `slot_default_codegen` on #655.)
- 🔴 **`agent-manifest.json` OVERWRITES ITSELF, and the follow-on is the half
  that reads it.**
  ```
  bin/main.rs:559   format!("{}/agent-manifest.json", dir)   ← FIXED name
  bin/main.rs:550   format!("{}/{}.ts", dir, tag_name)       ← per-tag, right beside it
  ```
  Multiple tags can share one `dir` — that is *why* `out_file` is per-tag. So N
  agent components compiled into one output directory leave **one** manifest.
  The docs contradict themselves about it: `agent-discovery.md:265` says "one
  per output directory"; `authoring-agents.md:374` says it is emitted "for every
  SFC that has exposed state or actions."
  **Pre-existing (server builds always had it), not #668's doing — but #668
  widens it to client builds and `C-FEL-434b` is the code that will read these.**
  A naive reader lists one component where five exist, which is the *same defect
  class FEL-434 exists to close, one level down and quieter*: "## Components
  lists 1 of 5" reads as a populated section, not an empty one. `must_fail` row
  2 on `C-FEL-434b` requires two components in one dir to both appear; the
  addressing scheme is the builder's to choose.
- **`C-FEL-434b` = GitHub #430**, "give `agent-manifest.json` a consumer". Four
  doc blocks currently assert the gap and go stale the moment it lands:
  `agent-discovery.md:69`, `:283`, `authoring-agents.md:20`, `:376`. Updating
  them is in the contract — otherwise it ships the FEL-439 defect class by hand.
- **A guarantee can go missing between two green PRs.** The policy-not-public
  row (a `$scope` component listed in `## Components` while `llms.txt` does not
  contain the scope string) *cannot be tested on #668* — there is no `llms.txt`
  in it. Verifier was told to verify #668 **and say in the verdict that the
  guarantee is unverified as of this PR and lives on the follow-on.** Half a fix
  verified without naming what the other half still owes is how the whole thing
  quietly never gets checked.
- **Could-not-check, stated rather than implied:** I did not trace whether the
  compiler's output `dir` is ever copied wholesale into *served* output. The
  manifest joins the same tier as `.route.json`, an established build
  intermediate, so the precedent is good — but precedent is not evidence. If
  that tier turns out to be served, the policy guard stops being about `llms.txt`
  rendering and becomes about the file itself.

### Also fourth wake

- **`C-GH-483` declined** (decomposed into `-a`…`-f`). Both epic families now
  verified clean: **every `needs` edge in the 483 and 487 families points at a
  barred, claimable contract**, and no child hangs off a declined row. The
  decomposition template is proven on two epics.
- **Bar the full arc up front; do not wait for the base to land.** Ruled on the
  ts-gen second wave. *A barred-but-blocked contract is cheap* — it sits behind
  a `needs` edge and nobody claims it. *An unbarred one is expensive* — it
  recirculates through triage every pass, which is the loop that cost the
  architect nine batches. And the person holding the arc in context now is the
  cheapest person to bar it.
- **Messages cross, twice now** (`f5755c4c`, `09e8cec5`) — the architect
  re-raised as still-open something already ruled, costing a wake each time.
  Not their fault; the transport cannot prevent it. Remedy adopted: **name the
  message id in the ruling** so a crossed reply is greppable, and check
  `watch --role <you>` before re-raising.

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

1. ~~**Route the non-aihu backlog.**~~ **RESOLVED tenth wake — it was a lookup,
   not a decision.** The attribute is Linear `project`, the value is `aihu`, and
   it already existed. See the tenth-wake section, including the 24 no-project
   issues that make loud exclusion mandatory. **Nothing owed by the founder.**
   Original framing kept below as the record of what was wrongly escalated.

   **Route the non-aihu backlog.** At least **13** offered contracts
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
- **Do not assume a merged `packages/swarm` PR is live.** The installed binary is
  deployed by hand and currently predates #651/#662/#664. Check its mtime against
  `git log origin/main -- packages/swarm` before trusting any bus behaviour.
- **Do not put backticks in an unquoted shell string when writing a contract
  bar.** The shell eats them before `swarm-bus` sees anything; the boundary
  cannot catch it. Read the stored value back to confirm.
- **Do not verify a state/docs file by `ls-remote` on your branch.** The test is
  `git ls-tree origin/main <path>` — does it appear where the next instance will
  LOOK. `architect.md` passed every check inside the wrong repo.
- **Do not tell anyone a draft's red `ci-ok` is "the FEL-437 guard".** Superseded
  by #670 as of 01:12Z — see the top of this file. Check the run timestamp.
- **Do not re-escalate the queue-routing question.** Answered by lookup:
  `project == "aihu"` on Linear team FEL. And **before escalating anything as
  "a business fact I do not have", check whether it is a fact you can look up.**
- **Do not land `#671` before `#666`.** #671 alone makes an intermittently-red
  lane deterministically red; see the tenth-wake landing-order ruling.
- **Do not re-triage `#667`'s red `bench`.** Ruled: the workflow diff trips the
  bench FILTER, not the numbers; `bench` is outside `ci-ok`; the re-baselining
  STOP stands. The 12.7%/18.4% deltas remain an OPEN could-not-check for
  `C-FEL-409` — do not close them as noise, and do not re-baseline to hide them.
- **Do not push or re-push `feat/swarm-state-zod`.** Already on the remote at
  `7b8dc599`; the draft PR is the architect's to open with their prepared body.
- **Do not re-litigate `C-FEL-READMESYNC-JOB`'s surface.** The contract row
  carries a STALE, unbuildable surface (no way to amend a claimed bar); the
  ruling is on the bus — lazy `rolldown` import, surface amended to include
  `scripts/sync-readme.ts` for that decoupling only.
- **Do not re-triage a red `matrix` (Scaffold DX) on any PR.** It is dead at
  `pm-install` on a proto/node shim collision, red on `main` and five other
  branches, and outside `ci-ok`. See the seventh-wake section. Name it in the
  verdict, rule "merges", move on.
- **Do not read the bus by `cp ~/.swarm/bus.db` alone, and do not cite its md5
  as proof of anything.** See the stale-ledger section above — that copy is two
  wakes behind and has no `declined` rows at all.
- **Do not "fix" the WAL staleness by disabling WAL.** Anti-row on
  `C-SWARM-WAL-STALE`; concurrent agent reads depend on it.
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
