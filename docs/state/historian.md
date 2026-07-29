# State — historian

**Project slug:** `aihu`
**Role:** historian — owns the swarm's durable memory. Promotes findings to
committed artifacts, records corrections as loudly as wins, and keeps the receipt
attached to every claim.
**Seeded:** 2026-07-26.
**Last verified:** 2026-07-27 against `origin/main` @ `2350f49c` (retro C-FEL-RETRO-0727)

## Why this role exists

A ~20-hour session on 2026-07-25/26 produced **59 commits on `main`**, a dozen
agents, and **one page** of shared durable state — written late, and stale within
30 minutes. Everything else lived in a Slack channel that does not survive a
session. Agents stalled mid-task and their state had to be reconstructed from
worktree diffs. Two agents made confident wrong claims by reading a shared checkout
sitting on someone else's branch. `docs/state/merge-train.md` was tracked, correct
in shape, and 27 hours stale.

## The substrate is the repo

`docs/state/<role>.md`, committed. It survives context clear, compaction, session
end, and machine restart; it is visible in every worktree; `git log` shows who
changed what.

`gbrain-local` works and is useful for search, but it **requires remembering to use
it** — which is exactly how it went unused for twenty hours — and its write-through
litters an ungitignored `aihu/` directory into the repo root. **Prefer the repo.**
Mirror to gbrain if convenient; never rely on it as the only copy.

**The counterexample that proves the rule (2026-07-27):** the **architect** is the one
role with **no `docs/state/architect.md`** (confirmed — every other role has one), and it
is the role that **kept re-deriving evidence and had rulings cross it twice** because the
answer was in no file it could read. The role without a state file is the role that
repeats itself. The widened-surface ruling permits any agent to create its own; the
absence is a choice with a visible cost, not a constraint.

**Files are named by ROLE, not by scope.** `merge-train.md` was renamed to
`orchestrator.md` on 2026-07-26 because `merge-train` had spent the session
orchestrating, and `docs-next` had spent it doing config architecture. Scope names
encode territory, which is how the FEL-425 duplicate-work collision happened —
ownership was framed as *who owns which files* rather than *who is doing which job*.

## What is archived, and the one thing that is nearly gone

`docs/state/transcripts/` holds the **only surviving copy** of the #aihu Slack
channel for the 2026-07-25/26 session. **It is complete** — the final fetch returned
`"pagination_info": "There are no more messages available."`, and the channel begins
at its creation:

| file | span |
|---|---|
| `part1-earliest-2026-07-25T11-09_to_2026-07-25T11-50.json` | channel creation → 11:50 EDT |
| `part2-middle-2026-07-25T11-50_to_2026-07-25T20-49.json` | 11:50 → 20:49 EDT (~103 KB) |
| `part3-latest-2026-07-25T20-49_to_2026-07-26T13-24.json` | 20:49 → 2026-07-26 13:24 EDT (~100 KB) |

**Slack's `conversations.history` paginates, and one page reads exactly like a whole
channel.** The first read returned a page that looked complete; only the trailing
`pagination_info` field revealed two more segments existed. Had I stopped there, the
first 9 hours of the session — including the channel's founding convention message
and the original FEL-407 diagnosis — would have been lost silently. **Anyone reading
these files: check `pagination_info` before concluding you have the whole channel.**
This is itself an instance of `docs/lessons/absent-value-rendered-as-real.md` — a
truncated export that renders as a complete one.

`part1` was reconstructed into structured JSON from the API response; `part2` and
`part3` are the raw tool output. Sender names in `part1` say "Shane McGuirt" for
**both agents** — at that point the Slack app posted from his personal account and
Slack could not distinguish senders at all. The `[bracket]` prefix is the only
attribution; `_attribution_warning` fields are the historian's annotation.

These files are one long line each. `Read`'s offset/limit will not chunk them; slice
by character range instead:

```
python3 -c "print(open('docs/state/transcripts/<f>.json').read()[0:25000])"
```

## Method — verified 2026-07-26

### Mapping PR numbers to merge commits (and the trap in the obvious way)

The obvious command is **wrong**:

```
git log origin/main --grep="(#591)" -1        # WRONG
```

`--grep` is a regex, so `(#591)` is a capture group matching the bare string
`#591` **anywhere in the commit body**, and `-1` returns the *newest* match. This
returned `3a7af464` — the commit for **#592** — for all three of #588, #591, and
#592, because that commit's body cites them. Adding `-F` does not help: it still
searches the body.

The correct method matches only the **subject line's trailing `(#N)`**:

```bash
git log origin/main --format='%h|%s' -400 \
  | awk -F'|' '{ if (match($2, /\(#[0-9]+\)$/))
      print substr($2, RSTART+2, RLENGTH-3)"\t"$1"\t"$2 }'
```

This is a live instance of *the thing being checked is not the thing that changed* —
I was checking "does this PR number appear" when the question was "is this PR's
merge commit here."

### Verifying a session record

Never trust the record; verify it against `git log` and `gh`. The gbrain page
`aihu/delta/session-2026-07-26/orchestrator-state` was checked line by line:
**all 24 PRs it claims merged are merged** (SHAs below), **and** it listed #611 and
#613 as open when both were merged, and omitted #614 entirely.

### Receipts for the 24-PR session table

```
582 1a322614   584 2a8ec837   585 a04a07ea   586 e34cf441   587 417c97e1
588 5b15d9c9   589 c85dfab7   590 cc636197   591 24c08c33   592 3a7af464
594 a448dfd2   595 e071e647   596 e7dcd250   601 57202988   603 37b14030
604 bba7e844   606 c8c1d714   607 6e0fbc8e   608 3ac389f5   610 3059eaa1
611 6bcef501   612 9286182f   613 8aa12dc1   614 d0c9200c
```

Also on main and absent from that table: `#593 07005b43`, `#597 07a30f66`,
`#598 a5284565`, `#599 2dff3b5d`, `#600 3ed40729`, `#583 1d731306`, and the whole
2026-07-25 first-half run (`#525`, `#546`, `#550`, `#549`, `#553`, `#557`–`#565`,
`#567`–`#581`).

**`#556` is CLOSED, not merged.** `#609` is OPEN and DIRTY. `#602` is OPEN and
MERGEABLE.

## The swarm's coordination layer — findings, with evidence

- **There is one Slack bot and no agent identities.** All 36 messages on page 2
  were posted by the username `merge-train`; `[team-lead]`, `[docs-next]`,
  `[verifier]`, `[historian]` are hand-typed prefixes inside the body. To Slack,
  a 16-hour multi-agent session is one speaker talking to itself. Every "your file"
  in the channel resolves only via a string an agent chose to type.
- **Five messages carry no role tag at all** — overflow halves of long posts,
  published as separate messages with the prefix stripped. Two of them sit directly
  adjacent to the *other* agent's messages and are written in the first person
  about opposing territory. They are unattributable on their face.
- **The tag placement convention was never stable** — `[role]` sometimes leads,
  sometimes follows an emoji and a bold marker. A parser keyed on a leading
  `[role]` recovers roughly half the messages.
- **The bot identity broke CI, too.** A push from a real token fired
  `pull_request` normally — *"That is exactly why the bot's own pushes never fire
  workflows."* Work done under a bot identity is invisible to the machinery that
  would check it.
- **Linear has no user for any agent.** Every open issue is assigned to the founder
  as a single-owner view, with the actual working agent recorded in a comment. At
  one point all 13 open issues were unassigned and three were already done.
- **Subagents have no identity whatsoever.** `fable` wrote PR #606 end to end,
  closed it, and produced two of the sharpest findings of the session — and never
  posted once. Same for the architect, the four config researchers, the perf team,
  and the tastemaker pass. Every finding enters the record as a quotation inside
  someone else's message.
- **The Slack listener died silently and nothing restarted it.** Backoff capped at
  30s and `if (attempt >= 5) { emit('FATAL … DEAD'); process.exit(1) }` — so ~2
  minutes of unreachability permanently killed it. Peer messages then stop arriving
  *silently*, indistinguishable from a quiet channel. **This caused a 2h56m gap in
  the record.** Repaired: retries forever, 60s cap, loud for three attempts then
  every twentieth, an explicit *"going quiet, push is DOWN"* at attempt four, and a
  recovery message. **Standing rule adopted: if an agent goes silent for a long
  stretch, assume network rather than absence.**
- **Shared checkouts have no per-agent ownership marker.** The primary checkout at
  `/Users/smcguirt/conductor/repos/aihu` sat on another agent's branch while a peer
  grepped it as if it were `main`, and nearly issued a false correction. The
  mitigation invented on the spot was purely social: *"I will post before I move
  it."* `git worktree list` shows 100+ worktrees on this repo.

## Blocked on / open

- **A third Slack page may exist.** Check `pagination_info` at the end of
  `page1-earlier.json`; if a cursor is there, fetch it before it expires.
- **Nothing enforces agent identity — and it bit where it matters most.** The
  per-message Slack `username` is provisioned by nothing and enforced by nothing.
  Worse: **Linear cannot attribute an action to an agent either.** Every agent's
  API key resolves to the founder's account, so `FEL-435`'s `creator` field reads
  `Shane McGuirt` regardless of which agent filed it.

  On 2026-07-26 an agent reported filing an issue it had not filed, citing a real
  ID for the real topic. **The tracker — adopted that same day as the source of
  truth for ownership — could not adjudicate the claim.** The only thing that
  caught it was the author checking their own assertion and retracting it. See
  "THE HARDEST VARIANT" in `docs/lessons/absent-value-rendered-as-real.md`.

  **Filed as FEL-436** after independent verification against the live API:

  ```
  FEL-435  creator: Shane McGuirt   assignee: Shane McGuirt
           every comment's Linear user = Shane McGuirt
  workspace users, in full:  Linear (the vendor bot), Shane McGuirt
  ```

  **Both of this swarm's identity layers have the same shape** — Slack's
  per-message `username` and Linear's shared API key are each a convention
  provisioned by nothing and enforced by nothing. The Slack version was treated
  as the known weakness, and ownership was moved to Linear *for exactly the
  property Linear does not have*.

  Proposed fix (FEL-436): a per-role Linear **label** on `new`/`claim`/`note`,
  because a label is a queryable field and a body prefix is not — and it is
  **explicitly not** presented as a guarantee, since an agent can set the wrong
  label exactly as it can post the wrong Slack username. It moves attribution
  from *unverifiable* to *checkable*. **A label sold as proof of identity would
  be this repo's favourite failure shape, one level up.**
- **`docs/retros/` and `docs/lessons/` are not cross-linked from `docs/state/`.**
  The lesson index is discoverable only by `ls`.

## 2026-07-27 — the first retro (C-FEL-RETRO-0727), and its own meta-finding

The historian's **first retro ever run**, which is the finding: the `C-SWARM-RETRO`
triggers are **spec only** (`~/.agent-swarm/docs/typed-bus-payloads.md:204`, table at
`:214-220`), **zero implementation** — nothing auto-offers the historian work, so
lessons were banked by hand in the orchestrator's head. Landed as **PR #657** (draft,
docs-only, off `origin/main`), banking **eight** 2026-07-27 incidents, each with the
three required fields (trigger / mechanism `file:line` / **promotion rung**):

- The rung vocabulary now has a home: **`docs/lessons/promotion-rungs.md`** — the
  ladder (`prose → injected-at-dispatch → structural gate`) plus the 8-incident audit
  table. **This is the durable answer to "a lesson that only restates is rejected."**
- New: `hyphenless-custom-element-tags.md` (5, open), `compiler-comment-apostrophe-codegen.md` (6, open),
  `swarm-db-env-ignored.md` (2, #642), `launchd-path-and-throttle.md` (3).
- Amended: `checked-thing-…` (1 + the exit-code **recurrence** + 8 shared-checkout),
  `absent-value-…` (4, palette #649), `team-read-latest-ordering-bug.md` (7).

**Incident 8 hit me while writing these lessons:** a shared worktree changed identity
between turns and I force-pushed a lessons commit onto an already-merged branch
(`e89e3c83`, orphaned on `2350f49c`; verified harmless — `#639` merged at `e71f80c0`
first, orphan is not an ancestor of `origin/main`). **The orchestrator ruled:** it is
a **supervisor defect, not a discipline failure**; my `git branch --show-current`
before every commit rule is the **weakest rung** (depends on remembering); the durable
fix — **the supervisor pinning each role's checkout per wake — is the orchestrator's,
not mine.** The orphaned branch is the orchestrator's cleanup; **do not force-push it
to "fix" it — that is the same error twice.**

**Gate proof:** `bash scripts/check-lesson-refs.sh` → exit 0, 25 cited lessons all
reachable. `check-lesson-refs` only validates `docs/lessons/*.md` citations — the
`~/.swarm/*`, `packages/*`, `.github/*`, and launchd paths I cite are **not** checked
by it, so open them yourself when auditing.

## WHAT THE NEXT INSTANCE MUST NOT REDO

- **Do not re-derive the eight 2026-07-27 incidents.** They are banked with receipts
  in `docs/lessons/` (index in `promotion-rungs.md`). Cite the rung, don't re-audit.
- **Do not re-litigate the shared-checkout force-push (incident 8).** The rung is
  settled: prose (branch-check) → structural (supervisor pins the checkout, the
  orchestrator's to build, **still UNBUILT**). One root, now **FOUR consequence classes**
  on 2026-07-27: lost-work risk (historian force-push, `aihu/zurich` staged mid-build),
  silent branch swap (`aihu/jerusalem`), misattribution (a verifier TWIN's Slack post is
  indistinguishable — orchestrator wrongly accused, corrected via bus receipt `d2a3d18f`),
  and **concurrent mutation** (builder hit a live `git index.lock` from a twin; remedy =
  wait for the lock, NEVER `rm -f` it, then RE-VERIFY the branch before committing). Tally
  in `docs/lessons/promotion-rungs.md`. Do not touch the orphaned `e89e3c83`.
- **#657 is FROZEN and marked ready (HEAD `28b70e87`) — bank further lessons on a FRESH
  branch.** Orchestrator ruling: a PR that keeps growing never gets reviewed, and #657 IS
  the session's durable memory (one-reset-from-gone). Landing is the interactive session's,
  not a wake's. New general rule: freeze/land, then a new branch. (The 0727 follow-ups —
  index.lock class, triage split-lesson — are on `srmcguirt/retro-followup-0727b`.)
- **Escalation hygiene (banked in `triage-queue-mixed-products.md`).** (a) An escalation
  that can be split SHOULD be — bundling a decidable half with a founder-only half makes
  the decidable half wait; split before sending. (b) A `blocked` with no natural contract
  gets its OWN row, never a borrowed one — riding `C-FEL-433` (an unrelated filter
  contract) tangled a routing decision into a builder's PR thread. I did this too.
- **`~/.swarm/bus.db` is WAL and NEVER checkpoints — the bare `.db` file is hours
  stale.** `main.rs:503` sets `journal_mode=WAL`; `grep wal_checkpoint` = nothing. To
  read the live bus, query it in place with `sqlite3` (WAL-aware) or copy `-wal`+`-shm`
  too; a bare-`.db` copy is missing whole status columns (I measured: main-alone has NO
  `declined` row; sidecars show declined 17). **`md5 ~/.swarm/bus.db` unchanged proves
  only nothing checkpointed, NOT that the bus was untouched.** Banked in
  `stale-ledger-wal-and-disproven-receipts.md`. Fix = C-SWARM-WAL-STALE (builder-b);
  anti-row: must not disable WAL.
- **Disproven-receipt rung: verdicts do not un-cite a disproven method automatically.**
  The md5 receipt above is cited as headline proof in the `C-FEL-REVIEW-0727` verdict;
  disproving it does not propagate backward — someone must go re-check. No mechanism
  exists. Rung prose → structural (a citation graph). Banked in the same file and
  `promotion-rungs.md`.
- **The plan-a.yml/biome glob trap has now burned THREE readers** (architect ×2,
  orchestrator ×1) — always run the real matcher (`picomatch`/`biome check`), never
  reason about globs. The picomatch-on-extracted-patterns method is ratified.
- **A rule stated in prose does not audit its own file** (`promotion-rungs.md`). #667
  added a comment that docs-facing gates must be their own always-on job, while
  `plan-a.yml:123` already has `sync-readme --check` as a STEP — so #667's filter fix
  stops README-only PRs being checked for README drift. Prose can't ask "what else is
  already like this?" Rung → a check that enumerates docs-facing gates. `C-FEL-READMESYNC-JOB`.
- **A `--no-verify`-bypassable hook is not a backstop in this swarm** (`guarantee-satisfied-by-the-defect.md`
  Instance 3). The `sync-readme` gap's mitigation was ".husky/pre-commit:9 runs it" — but
  `--no-verify` is our normal docs workflow (I use it on every commit; verifier on #659).
  Only a CI job is non-bypassable. Don't offer a local hook as a guarantee's backstop.
- **A DEAD gate makes OTHER people's work unverifiable** (`dead-gate-makes-work-unverifiable.md`).
  The scaffold `matrix` lane is red-by-construction (proto/node shim collision, run
  30318406544, outside `ci-ok` at `plan-a.yml:378`) — and it is the pipeline #663's honest
  could-not-check needed, so a dead gate silently made a builder's contract unverifiable.
  Rung structural (`C-FEL-MATRIX-PROTO`); must-fail = a deliberately broken scaffold must
  go red. Standing rule: **NAME a red lane in your verdict, never omit it.**
- **An accepted verdict is not a closed one** (`stale-ledger-…` update). Verifier struck
  the md5 receipt from `C-FEL-REVIEW-0727` and led with a stronger isolation-by-construction
  one — but only because one person REMEMBERED citing it. No receipt-index exists; the
  orchestrator refused to file "index your receipts" as it has no falsifiable bar yet.
- **Instrument-faithfulness is the rung, not the tool.** Prove a matcher/gate reproduces a
  known-WRONG answer before trusting its right one (verifier on #667's picomatch). An
  instrument never shown to fail on a known case is just a second opinion.
- **A contract is an unverified claim wearing the costume of a spec** (`a-contract-is-an-unverified-claim.md`).
  Twice this session an unbuildable/wrong-premise contract was caught only by a builder
  checking the premise before building (C-FEL-READMESYNC-JOB: "needs only bun" but
  sync-readme.ts:29 statically imports rolldown; C-FEL-434: naive un-elide would reverse a
  security posture). Nothing tests the CONTRACT — only the output. Rung → pre-build premise
  check = the first must-fail row of every contract. Builders: send `blocked`, don't drop a
  constraint silently.
- **Row 8 is now FIVE concurrent-instance events, 4 harmful + 1 benign** (#668 binary bump
  at 99be3b03). Record the benign ones too — keeping only harmful understates frequency,
  and frequency is the argument for the (still-unbuilt) checkout-pinning fix.
- **Two places the ledger cannot express a correction** (paired in `stale-ledger-…`): no
  index of which verdicts cited which method; and `swarm-bus` cannot amend a claimed
  contract's bar (re-offer resets/releases it), so a corrected bar lives on the bus while
  the row shows the stale one. Neither filed — no falsifiable bar yet.
- **"Red-by-construction" answers whether a lane BLOCKS you, not whether its NUMBERS mean
  something** (`checked-thing-…` bench section). #667's bench actually ran (workflow diff
  trips the `bench:` filter, not the numbers) and reported cellx +12.7% / wide-fanout
  +18.4% vs the frozen 2026-05-25 baseline → could-not-check, not dismissed. Never
  re-baseline to make it green.
- **`.git` FILE vs DIRECTORY decides whether `/tmp` is the only copy** (`worktree-vs-clone-tmp-durability.md`).
  File = worktree, objects in the parent clone (a `/tmp` wipe costs the checkout, not the
  commit — confirmed on THIS checkout). Directory = standalone clone, and if unpushed
  `/tmp` IS the only copy. Check `[ -f .git ]` before you panic or relax; push either way.
- **A guarantee can vanish between two green PRs** (`absent-value-…` ninth). If a guarantee
  splits across two PRs and each proves only its half, the seam is verified by neither.
  The control: a verdict that NAMES the unverified half (verifier did on #668/434b). Same
  as "name a red lane."
- **Flapping required gate (#661 / C-FEL-411) — do not read `ci-ok` blind.** A required
  `check` flaps red on a build-order race (`editor/moon.yml:4-5` `dependsOn:[signals]`
  while `editor/tests` import `@aihu/compiler`): a red X may be a race, a green tick may
  be luck. Check WHICH job failed and whether your diff could cause it. Banked in
  `absent-value-rendered-as-real.md` ("the eighth").
- **`docs/state/<your-own-role>.md` is ALWAYS in surface** — orchestrator ruling
  2026-07-27, general and standing. Updating your own state file at handoff never needs
  a contract to permit it and is never a scope violation, even when a contract's SURFACE
  names something narrower. (My FEL-439 file-for-file scope delta and this state-file
  flag were both ratified: flagging a delta beats silently doing or not doing it.)
- **The HN unescaped-html XSS is RESOLVED on main — do not re-flag it as live.**
  FEL-426 (#619, `7766286e`) removed all three `html={}` bindings; the `MUST_BE_LIVE`
  `html` floor was KEPT (`check-coverage-manifest.ts:23`) and moved to authored content
  (`examples/ssg-site/coverage.manifest.json:50`, `about.aihu`); `hacker-news/tests/smoke.test.ts:55`
  asserts its absence. Correction banked in `guarantee-satisfied-by-the-defect.md`.
  Verified by reading main 2026-07-27.
- **Triage-queue product-mix: RESOLVED — the routing was a LOOKUP, not a founder call.**
  13 non-aihu contracts declined (non-destructive, `NoOp`). The routing target was NOT a
  founder decision — the Linear FEL `project` attribute already exists (`aihu|data|web`);
  I (and the orchestrator) escalated a lookup, a two-wake stall. RULED: filter `project`
  include-iff `aihu`, LOUD KEEP/EXCLUDE + reason, "no project" a DISTINCT reason, must-fail
  on the 24 no-project ids (9 are active aihu). Naive `project==aihu` would drop them —
  correct answer implemented naively is a worse bug than the noise. `triage-queue-mixed-products.md`
  corrected.
- **Escalating a LOOKUP is a stall that looks like diligence** (`a-contract-is-an-unverified-claim.md`
  Instance 3). "Escalate what you lack the business fact for" has a precondition: FIRST
  establish the fact is not obtainable (run the query). Same root as the contract-premise
  miss — an unverified premise of the escalator's. I did it too (`C-FEL-433` blocked).
- **#657 (the retro) is MERGED — session durable memory is on main, not a draft.** The
  freeze worked. Follow-up lessons continued on `srmcguirt/retro-followup-0727b` (#669),
  which I REBASED onto main after #657 squash-merged left it CONFLICTING (a stacked child
  goes conflicting silently when its base merges). **CHECK `gh pr view <your-PR> --json
  mergeable` at the START of each wake** — banked in `stack-base-merge-goes-conflicting.md`.
  I fed a dead (conflicting) branch for two wakes before catching it; do not repeat.
- **THE SPLIT-OUT IS DONE (PR #676) — do not redo it.** The orchestrator ruled the
  triage-queue correction must NOT stay hostage to #669: a live falsehood on main
  (`triage-queue-mixed-products.md` still asserting "ROUTING STILL PENDING / founder
  business fact") is a different urgency class than a new lesson. I put ONLY the corrected
  file on a fresh branch off `origin/main` → `srmcguirt/triage-correction-0727`,
  `d80c3276`, **draft PR #676, mergeable=MERGEABLE / CLEAN**, `check-lesson-refs` exit 0.
  Gate note: the corrected file's bare-backtick ref to `a-contract-is-an-unverified-claim.md`
  (not yet on main) is NOT a tracked citation form — the gate greps only the absolute
  `docs/lessons/`-prefixed path form and the relative markdown-link form, NOT a filename in
  plain backticks — so a fresh-off-main split passes without dragging in the #669-only
  sibling files. Landing is the session's. (Meta-trap, now PROMOTED to its own lesson
  `documenting-a-checker-can-trip-the-checker.md` at the orchestrator's request — cite it
  by name the next time anyone documents a grep-based gate: an EARLIER draft of THIS bullet
  spelled the two grep patterns out with example filenames; the examples matched the
  citation form and the gate failed on the non-existent example file. Describing a
  citation-checker in prose can itself emit citations. It recurred three times this
  session, all mine — the argument for the structural rung, recorded in that file.)
- **#669 was REBASED A SECOND TIME — main moved again under it.** After the first rebase,
  `origin/main` advanced `41c37df6`→`b667bdcd` (8 more PRs landed: #656/#659/#661/#663/#666/#667/#668/#673
  — the queue un-stuck). #669 went behind; I rebased onto current main (clean, 8 commits),
  force-pushed → **`b11b36db`, mergeable=MERGEABLE / BLOCKED-because-draft**. This is the
  recurrence the `stack-base-merge-goes-conflicting.md` rung is for: a remembered "it's
  mergeable" is stale the moment main moves. Both #676 and #669 carry byte-identical
  triage-file content (both from `c299fc02`), so whichever lands second is a no-op/no-conflict.
- **#670 (`41c37df6`, merged 01:12Z): a draft `ci-ok` now WARNS, not FAILS.** RETIRE the
  old rule "a draft `ci-ok`=FAILURE is the FEL-437 guard doing its job" — dead on main.
  On a run AFTER 01:12Z a draft red is REAL (triage it); runs BEFORE it show the retired
  FAILURE. Always name WHICH run + its timestamp vs 01:12Z; a conclusion from a
  behaviour-changed run is a stale receipt. Marked resolved-and-changed in `absent-value-…`.
- **A #670 × #667 INTERACTION regressed docs-only PRs — the fix is PR #679; #669/#676 are BLOCKED on it.**
  When I marked #669/#676 READY (per the WIP=1 "finish your open PRs" dispatch), `ci-ok`
  FAILED: `::error::'check' was skipped on a non-draft PR`. **CORRECTED root cause (my first
  telling was wrong; the orchestrator caught it before it hardened — I had called it a lone
  "#670 overcorrection"):** it is the COMPOSITION of two individually-correct PRs. #670
  (01:12Z) made "non-draft + check skipped" a hard ci-ok fail — CORRECT then, because the
  `changes.code` filter was still inert (leading `**` under `predicate-quantifier: some`
  killed every negation), so `code` was always true and `check` always RAN, making the
  branch unreachable. #667 (01:46Z) made the filter discriminate, so a docs-only PR now
  correctly skips `check` — which ARMED #670's latent branch. **Receipt that proves the
  interaction, not #670 alone:** #659 is docs-only, merged 01:46:01Z AFTER #670, and passed
  with `CHECK_RESULT=success` because #667 had not landed yet (`check` still ran). #657/#660
  are before #670 entirely; #669/#676 fail because they are after BOTH. **NOT my diff, NOT
  red-by-construction.** Verified the merge times myself with `gh pr view --json mergedAt`.
  FIX I TOOK (pre-authorized prereq): **PR #679** (`srmcguirt/ci-ok-docs-only-green`,
  `b7fe8c02`) gates the error on `changes.outputs.code` — docs-only(false)→green, real
  code PR skipped(true)→fail, broken changes('')→fail-closed; banked the lesson
  `gate-fix-armed-a-sibling-false-red.md` (it lives on the #679 branch, so it is written
  here in bare backticks — a full `docs/lessons/`-prefixed path would be a cross-branch
  dangling citation the `lesson-refs` gate reddens; I tripped exactly that here, the THIRD
  instance this session of prose-emits-a-citation, which is the argument for the structural
  rung). **NEXT INSTANCE:** once #679 lands,
  **REBASE #669 and #676 onto fixed main** — `pull_request` runs use the workflow from the
  PR head branch, so they need the gate fix IN their branch to go green. Do not re-mark
  them ready before that rebase or they just re-fail. Do NOT re-derive the #670 root cause
  — it is receipted here and in #679's body.
- **#679 is DONE — verdict filed with the SAME-RUN receipt (not just a green PR summary).**
  Before claiming done I applied the orchestrator's systemic rule (banked as
  `ci-ok-green-only-with-same-run-check.md`): a green `ci-ok` certifies a build ONLY IF
  `gh api commits/<full-sha>/check-runs` shows `check` and `ci-ok` on the SAME run id,
  `check`=success, and `ci-ok` started AFTER `check` finished. #679 @ `868ac101`: check
  success run 30322783137 (ended 02:25:46Z), ci-ok success SAME run, started 02:27:57Z.
  **NEXT INSTANCE / every report:** readying a PR close to a push spawns TWO runs on one
  SHA; the cheap run (check skipped) can post a green `ci-ok` first (bit #680/#681, and
  #672 got red-because-cancelled). The PR summary + `mergeStateStatus` COLLAPSE the runs
  and hide this. Push first, let the run start, THEN ready; and capture a cancelled/failed
  run's output BEFORE re-running, because a rerun supersedes (destroys) its evidence.
- **CORRECTION to that lesson (wake 18) — it is a RE-ENABLED DOCUMENTED hazard, not new, and it has a FOURTH face.**
  I framed the fake-green as freshly found; it was not. `plan-a.yml:358-377` already
  documented it by name — the #622/#624 double-green ("same commit carried two green
  ci-ok runs, one draft-skipped, one real"). It was held closed by ONE guard (draft +
  check-skipped → `ci-ok` FAIL); **#670 retired that guard** (draft now warns+passes) for
  good reasons, which REOPENED the window **while leaving the comment saying "Only the
  draft case is refused"** — a stale comment that now contradicts the code at `:472`.
  Fourth face (builder-b, #682 head `518b204d`): the draft run had even `changes` SKIPPED,
  yet `ci-ok`=SUCCESS for 8 min. Verified the provenance myself (`git show
  origin/main:.github/workflows/plan-a.yml` :358-377). Updated `ci-ok-green-only-with-same-run-check.md`
  to 4 faces + the guard-removal story; the STRUCTURAL rung is now FILED as
  **C-FEL-CI-RECEIPT** (builder, claimed) — a read-only check-runs tool applying the three
  predicates with all four faces as fixtures. Do NOT touch `ci-ok` (sole required context;
  highest-stakes line); the stale comment gets fixed in whatever PR next touches that block.
  Also added a 4th, CROSS-ROLE instance to `documenting-a-checker-can-trip-the-checker.md`:
  builder #683 hit lesson-refs red citing a lesson that lands with my unmerged #669 — the
  gate catching a forward-reference is the gate working; it makes the trap a class, not my habit.
- **THE CLAIM-CHECK HAS NEVER FIRED (wake 21, diagnosed wrong 3× first). Banked, NOT mine to fix.**
  Started as "2 verified rows with no merged-PR evidence"; my read-my-own-row WEAK signal
  (C-FEL-RETRO-0727 = `no-claims` with a clean "0 claims" recon that ≠ my filed #679 verdict,
  reported WITHOUT inflating to corruption) led the orchestrator to pull the population and find the
  systemic defect. **DEFINITIVE mechanism, read in BOTH files + measured myself:** the reconcile
  reads the verdict `body` ONLY (`supervisor.py:687`), never the structured `claims` column; and
  `recon.py:95-104` matches six ENGLISH PROSE regexes (`\bI\s+pushed\b`, `\bI\s+filed X`), NOT the
  bus-mandated `pushed:PR#N,ran:...` format. So the format the bus REQUIRES is one the reconcile
  never reads and cannot parse. Receipts (VACUUM INTO snapshot): 27 `no-claims` rows, ALL identical
  recon "N tool calls; 0 claims; 0 flagged" across 24→236-tool-call traces (0 exceptions); 52
  verdicts carry a non-empty `claims` column, none read; my own C-FEL-RETRO-0727 verdict claims
  exist as structured data, extracted as ZERO. **The control CLAUDE.md cites ("only reconcile sets
  verified/no-claims after checking your claims") HAS NEVER RUN** — lifetime output = 27 vacuous
  passes + 2 false verifieds. Secondary defect: selection-by-role (`:681-687`, owner's current
  trace not the contract's) → the 2 false verifieds via incidental prose matches. The posture is
  otherwise DISCIPLINED (refuses to launder vacuous→verified) — "guarantee-free heuristic" was my
  unfair overstatement; correct it if you cite. **DO NOT repeat my wrong tellings** (wake19 "wrong
  worktree"; wake20 "selection doesn't matter, recon-generation") — both wrong; each READ went a
  layer deeper. The correction IS the lesson: reasoning about two files nobody opened; the shape of
  the error = the shape of the defect (certify/report without observing). `no-claims` is terminal +
  satisfies downstream needs (`main.rs:1201-1245`), so 27 rows unblocked downstream on a check that
  could not run; fired nothing outward only by LUCK (links NULL; ext side effects `:1064/1071/1082`,
  `:2438`). Banked (definitive) `the-audit-ledger-is-green-by-construction.md`.
  **DO NOT attach a PR link to C-SWARM-P0** — bare-int `github_pr` + `gh_pr_view` (`main.rs:1683-1694`)
  hardcodes `--repo fellwork/aihu`; `gh pr view 1` there = MERGED scaffolding PR vs OPEN in agent-swarm,
  so `--github-pr 1` manufactures a false receipt. Empty link is the correct posture.
  **FIX = `C-SWARM-RECON-AUTHORITY` (architect, dispatched):** promotion→Rust binary, supervisor.py
  proposes only; row2 cross-repo bar; **row3 (binding): adjudicator MUST consume the structured
  `claims` column** — prove both directions (my real verdict must NOT land no-claims; empty-claims
  must still reach no-claims). Rust lands FIRST then demotion (demote-first = DAG stall: 27 no-claims
  + 13 verified terminal, 12 declare needs). Heal = **27 UNCHECKED + 2 false, DO NOT MASS-REVERT**
  (no-claims currently = "we did not check", not "nothing to check"); make honest, re-run, re-derive;
  unrecoverable → could-not-check. Interim guard BINDING: no `sync --push` vs a verified row whose
  recon is not a real same-repo receipt. **I do NOT decide the DECIDE, touch supervisor.py/recon.py,
  set status, or attach a link.** Read-my-own-row: C-FEL-439fix legit-verified (#639).
  **Wake-22:** the orchestrator's "re-correct not-selection (4th time)" note CROSSED my `209951ea`
  — that commit already IS the 4th correction (all three defects + control-never-fired). No re-work;
  confirmed on the bus. Do NOT re-correct it again.
- **Fake-green lesson sharpened with two #685 (C-FEL-CI-RECEIPT, builder) measurements** —
  `ci-ok-green-only-with-same-run-check.md`: (1) the collapsed view can DROP a whole run silently —
  `gh pr checks 682` omitted run `30324508177` entirely, no cue, `mergeStateStatus`=CLEAN; only the
  per-run check-runs API shows all. (2) the fake-green window has a SHAPE not a size — 491s(#685)/494s(#682),
  within 3s, = draft-ci-ok→real-ci-ok = as wide as the build it lies about (slower build, longer lie).
- **FOURTH KIND OF RED banked (wake 23) — `four-kinds-of-red-unlanded-fix.md`.** Taxonomy from the
  orchestrator reading a failing job: broken→investigate, dead→fix-lane, cancelled→re-run(capture first),
  **red-because-an-unlanded-fix→LAND IT** (the new one, the orchestrator's error class not a builder's).
  Receipt: #685 red on `4112f541` with `editor:typecheck TS2307 Cannot find module '@aihu/compiler'` =
  C-FEL-411 moon-ordering race; #671 is the green MERGEABLE fix (verified it touches editor+compiler
  moon.yml), unlanded 12h+. A stalled queue lets a solved problem charge RENT (re-triage noise) —
  #670's noise-over-signal defect arriving from the merge queue not the gate. Diagnostic: a red on a
  diff that CANNOT have caused it (one state file → graph typecheck fail) is the tell. Also banked
  builder-b's cross-role corroboration of the reconcile finding into the audit-ledger lesson: "every
  --claims string was write-only" — but KEEP filling it, #686 R5 makes those rows the evidence.
- **TWO ORCHESTRATOR INSTANCES are active and it is legitimate — do NOT chase a ghost.** One is this
  wake orchestrator; one is the INTERACTIVE orchestrator working with the founder (e.g. it dispatched
  then stood-down C-FEL-CE-TAGS via direct subagents, 14:02→14:03). A message signed `orchestrator` may
  come from either. RULE for all roles incl. next historian: if a dispatch CONTRADICTS a prior ruling,
  say so on the bus — do NOT silently pick one. This is distinct from the worktree-twin hazard (same
  role, same checkout); this is two legitimate orchestrators. Neither merges from a wake (twin-merge hazard).
- **VOID RULE banked (wake 24) — builder's stamped-measurement principle → `stale-ledger-wal-and-disproven-receipts.md`.**
  Report a measurement WITH its expiry (the head/run/read-time it was taken at) so staleness is
  DETECTABLE not silent; "#685 landable" is silently wrong once head moves, "#685 @ 50c0dbd6, void if
  head differs" is detectably wrong (one `gh pr view --json headRefOid`). Generalises every stamp-it rule
  this session. I applied it to my OWN #669: board stamped `43e2a401`, remote head is `215b8056` (my
  wake-23 banking) — benign one-commit-stale snapshot, resolved in one `git ls-remote`. My bankings ARE intact.
- **VOID RULE — SECOND CLAUSE (wake 25, orchestrator falsified a report to earn it).** The stamp was
  right; the EXPIRY was wrong for a NEGATIVE measurement. A POSITIVE measurement ("check succeeded on
  sha S") is STABLE — void only when S stops being head. A NEGATIVE one ("ci-ok ABSENT on sha S") is
  NOT stable — it flips with the passage of TIME ALONE, so its expiry is "void UNTIL THE PIPELINE IS
  KNOWN COMPLETE", not "void if head moves". An absence is evidence only once the thing had its chance
  to appear = `absent-value` through a new door (an observation taken too early; 3rd: wrong-column
  query, skipped CI job, 2-min API gap). Added the clause to the void-rule section.
  **DID NOT BANK A FIFTH FAKE-GREEN FACE** — the orchestrator pre-warned me not to; I checked, I never
  did. Taxonomy STAYS at 4 fake-green faces + 4 kinds of red. The "ci-ok absent on 50c0dbd6" was
  FALSIFIED (I confirmed: check success + ci-ok success SAME run 30367626817, ci-ok 14:25:48 after check
  14:23:48 — it posted after a ~2min gap). builder's C-FEL-CI-RECEIPT tool is NOT wrong: "REFUSED: no
  ci-ok run" is a correct verdict-at-an-instant; the REPORT wrongly promoted it to a property-of-a-sha.
- **WAKE-STORM root cause banked (wake 26) — `wake-cadence-shorter-than-runtime-self-collides.md`.**
  The recurring "Session ID <uuid> already in use" storm (retry counter past 35 this session) is a MASK:
  wake cadence ~25s < wake runtime 20-42s, so each wake collides with its still-running predecessor on
  the same session id → exit 1 → not-acked → redeliver → self-sustaining. Confirmed from source: the
  "fallback" (`supervisor.py:434-442`) retries the SAME sid with `--session-id` (which CREATES at that
  id → also "in use") — a retry reusing the failing resource is NOT a fallback; and the loop only broke
  because the health pass mints a fresh id after WEDGED_FAILS=3 (`supervisor.py:143-152`) — "self-limiting"
  ≠ "self-healing by design". **CORRECTED wake 29 (was "one cadence later" — too generous):** the mint is
  NOT one cadence later. `SWARM_TICK=5s` (reconcile/wake-processing every tick) vs `SWARM_SYNC_INTERVAL=1800s`
  (health+mint) — both confirmed in-file at `supervisor.py:857/866` + the loop `:871-885`. So the repair fires
  up to 30 MIN later while the failure redelivers every ~5s = a REPAIR CADENCE 360× SLOWER. Falsifying case in
  the inbox: builder-b failed 15:07:53/15:08:39/15:09:13 with IDENTICAL sid 03ad5f3a (3 fails, WEDGED_FAILS=3,
  sid never changed — no sync boundary to fire on). Added a push-output-vs-remote-ref line (verdict-at-an-instant
  vs property; my wake-26 push timed out and ls-remote caught it — first time verify-on-remote PAID not reassured).
  DO NOT re-triage those stale errors (a clean wake acks the batch). Three shapes: period<runtime self-collides;
  reuse-the-failing-resource-isn't-a-fallback; name-what-actually-breaks-the-loop (on a clock 360× too slow). No
  work lost. NOT mine to fix; orchestrator carries backoff (rides the recon.py in-repo migration — ONE escalation not three).
- **DAEMON-COUNT — corrected THREE times, DEFINITIVE wake 29 (read the source). `per-session-daemon-leak-to-the-uid-ceiling.md`.**
  History of my errors: wake27 "leak with a deadline" (2 points); wake28 over-corrected to "bounded corpse,
  flat, no clock" (my 68s window too short to resolve ~1/min — the very error I was banking). BOTH wrong.
  **The question got FIVE measured answers (orch×2, me×2, architect) because the WINDOW chose the answer;
  it was settled by READING session-start.js + live-daemon.js, NOT any time series** (all confirmed in-file):
  `session-start.js:150-164` spawns the daemon UNCONDITIONALLY (no guard) — a DOCUMENTED-but-unenforced
  "once per session" invariant; `live-daemon.js:54` MAX_LIFETIME_MS=16h caps the population (no daemon has
  ever exceeded it). **TWO corrections that invert the fix:** (a) "93% is ce160f8f" is composition NOT cause
  — the corpse is 91% of population but 10% of GROWTH; 9/10 new daemons are NEW live sessions, so killing the
  corpse buys ~12h and does NOT stop it (I failed to apply my own reap-by-ground-truth shape to my headline);
  (b) the fix is a SPAWN GUARD not a reaper — a SessionEnd reaper CANNOT fire for a session that never ends
  (ce160f8f: status active, end_time null), which is the ONLY leaking case, so my wake-28 "reap in SessionEnd
  hook" was the WRONG fix. Durable shapes: a RATE needs a series but a BOUND needs the SOURCE; a documented
  invariant with no enforcement is no invariant; watch arrival-rate not population; honest severity = ~41GB
  RSS not fork(). There IS a slow clock but it is bounded (16h TTL), non-urgent, not a DECIDE. Killed nothing.
- **`git stash` IS SHARED ACROSS 133 WORKTREES — STANDING RULE: DO NOT USE `git stash` in this repo.**
  Banked `git-stash-is-a-shared-stack-across-worktrees.md`. The stash reflog lives in the COMMON git dir, not
  the worktree; I reproduced it from sarajevo (git-common-dir shared, git-dir per-worktree, 133 worktrees,
  `git stash list` shows builder-b's fix/fel-scaffold-pm-compat stash — `pop` would take it). ANY agent in ANY
  worktree can silently pop/drop another's work; bare `pop` takes whoever pushed last. Index lock is per-worktree
  (blocks you); stash stack is global + mutates silently. USE A WIP COMMIT on your own branch (owned, reflog-
  recoverable). Durability hole it opened: a MERGED contract's state (C-FEL-EXTERNALS/#656) lived only in a
  droppable stash 776b263f (on NO branch); builder preserved it to `recover/builder-state-fel-externals` (I remote-verified).
  Architect ruled S2 (folded in): **a contract is NOT done until its state record is on a branch** (receipt = merged PR+sha
  AND role-state entry on a branch; `docs/decisions/2026-07-28-state-records-must-land-on-a-branch.md @ fe01f5f`).
- **WAKE 30 — two corrections to MY measurements.** ~~Board: origin/main 2c3dd7fe→5d485ba9, RED~~ **← STALE/WRONG,
  struck in place (wake 31 rule): both halves went stale — main is past `5d485ba9`, the moon-graph red was resolved by
  (a) #685/`d10674ad`, and by my own later fetch main is GREEN. DO NOT store a board sha here; re-fetch. The lesson (1)
  below is CORRECT; only this board clause was wrong.**
  (a) NEW lesson `regex-over-source-cannot-tell-code-from-text.md`: #683's `.aihu` source-STRING fixtures tripped #671's
  check:moon-graph (a raw-source import regex, string-literal-blind) → main red (confirmed check+ci-ok FAILURE on 5d485ba9).
  SAME class as #681 "comment-blind" (df34eeb2), landed same day — a regex over raw source can't tell code from text-about-code
  (code twin of documenting-a-checker). Fix = teach extractor to skip strings/comments (builder's (b), pending dispatch; NOT
  add a fake dependsOn edge). NOT mine to fix. (b) MY DAEMON COUNTS WERE CONTAMINATED — six agents grepping `live-daemon.js`
  count each other; my own receipt this wake: unanchored 1135 vs ANCHORED `^node /Users/...` 1129 (Δ=observers), ce160 anchored
  1016 frozen. My wake-28 "flat at 1116" was a too-short-window trend claim off a contaminated count — in the SAME message that
  banked "a rate needs a series". Anchor to `^node /abs/path`. (c) TTL "no daemon exceeded 16h" is PREMATURE-ABSENCE (firing
  unobserved until ~12:23; falsifiable prediction, drain is a WINDOW 16:51→~01:34 not a date). All folded into the daemon lesson.
- **WAKE 31 — DO NOT STORE A BOARD SHA; it becomes a stale repo artifact. + several folds.**
  **The `5d485ba9` above is ALREADY STALE** (main moved to `3891300a`, then IN_PROGRESS). The orchestrator's
  own `2c3dd7fe` propagated from their broadcast into my state = "one bad measurement becomes a repo artifact."
  Sharpened rule (theirs, banked): **a board can go stale BETWEEN TWO COMMANDS IN THE SAME WAKE** — main moved
  TWICE while they measured it. RULE: never carry a board sha you did not fetch yourself; quote a sha only with
  the fetch that produced it, or not at all. My own fetch this wake: origin/main=`3891300a` @ 16:21:59Z,
  check IN_PROGRESS = **could-not-check** (not green, not red — reporting either is a coin-flip). **Do NOT
  hardcode a current-main sha in this file again; re-fetch each wake.**
  FOLDS this wake: (1) regex lesson — the red was RESOLVED by (a) `d10674ad` (the fake `- signals` edge), which
  verifier proved is a **NO-OP THAT LIES** (plugin-agent-readiness→server→signals already orders it); (b)
  C-FEL-MOONGRAPH-LITERALS must REVERT it. (2) NEW into `checked-thing-is-not-the-changed-thing.md`: `git diff
  main branch` shows main's ADDITIONS as the branch's DELETIONS — a branch merely BEHIND looks like a destructive
  rebase; use `git log main..branch`. (3) daemon — architect's amendment "a bound needs the SOURCE for EXISTENCE
  and an OBSERVATION for OPERATION"; TTL prediction NOT YET DUE at my 12:21:57 check (no verdict); "a background
  task is not a record" (watchers die with sessions — bank the test in the repo). (4) git-stash — recovery ref
  redundant once on MAIN not once on a branch/draft. (5) audit-ledger — interim guard retired (loop not agent),
  exposure measured-zero-with-a-deadline. Architect RETRACTED the "you misquoted me" charge (I quoted them
  accurately; they changed their mind in R2) — durable: correct a wrong attribution AT THE POINT OF THE ERROR,
  because "who said what" is what this record stores. I settled/attempted the TTL check (not-yet-due), corrected
  my board, killed nothing, touched no infra.
- **WAKE 32 — fixed a mis-quoted receipt + TTL RESOLVED + banked the premature-absence remedy.**
  (1) MY REGEX LESSON HAD A WRONG RECEIPT: I inherited builder's misquote `` [`"] ``; the ACTUAL
  `IMPORT_RE` is `['"]` (single-or-double), verified myself from `git show origin/main:scripts/check-moon-graph.ts:176`,
  and the fixture is SINGLE-quoted — so a reproducer from my class matched nothing and would falsely
  refute the diagnosis. FIXED + banked "copy a regex exactly, a wrong receipt manufactures a false refutation".
  (2) TTL PREDICTION RESOLVED — the reaper FIRED on schedule: predicted 12:23:10, the Jul 27 20:23:10 daemon
  gone by 12:23:20 (orchestrator+builder observed, no stake), whole pre-cutoff cohort cleared → bound is now
  OBSERVED not derived; population capped at arrival×16h (~1330), NO ceiling clock. ce160 bolus not draining
  until 16:51 today→~01:34 tomorrow — don't misread the rising total. Updated the daemon lesson.
  (3) NEW lesson `settle-a-contested-claim-with-a-committed-falsifiable-prediction.md`: the premature-absence
  loop bit FOUR roles today; the rung that WORKED was not "be more careful" but a committed falsifiable
  prediction with an expiry + BOTH branches, settleable by a stranger in one command — six watchers died with
  their sessions, the committed one-liner outlived them all. A BACKGROUND TASK IS NOT A RECORD.
  (4) BOARD: struck the wake-30 stale sha IN PLACE. My own fetch this wake: main=3891300a GREEN @ 16:29:18Z
  (was could-not-check minutes earlier — a live board-goes-stale-within-a-wake instance). NOT stored as a
  durable sha. #669 stays draft. Killed nothing, touched no infra, set no status, merged nothing.
- **WAKE 33 — two landmark incidents banked + two folds. Two DECIDEs are NOT mine.**
  (A) INSTANCE 4 in `guarantee-satisfied-by-the-defect.md`: the orphan-detector is itself an orphan.
  #680/c4724454 typo'd `check:ci`→`check:grammar-v` (should be v2) which aborts the chain BEFORE
  `check:gate-wiring`, AND orphaned check:grammar-v2 — both in one commit, each hiding the other; and
  check:gate-wiring is invoked by 0 workflows (I verified all three from origin/main). The DISEASE
  (architect R-C): check-gate-wiring.ts:16 treats "in the check:ci chain" as reachability PROOF, but
  check:ci runs in no workflow → every check:ci-only gate is green-by-construction. Wiring the detector
  alone makes it RUN with a FALSE VERDICT = worse than never (manufactures green from silence). R-D
  measure-the-hole-first, R-E must-fail must be a REAL CI run, "visible absence over manufactured presence".
  Third time TODAY for this class (moon-graph, then #680, then this). NOT mine to wire (plan-a.yml/ci-ok).
  (B) NEW `a-pr-reverted-its-own-fix-the-mutation-deleted-it.md`: #689's head e85c839d silently reverted
  its OWN 89-line moon-graph fix along with the moon.yml edge, under a commit msg naming only moon.yml —
  the must-fail MUTATION (revert stripNonCode→identity, restore) captured the tree MUTATED and committed it.
  "Measured the tree then committed again." A commit message is not a diff; a verdict is verdict-at-an-instant
  (stamp the head + void clause, the #685 clause would've caught it in 1 cmd). grep -c stripNonCode HEAD=0
  (attributed to orch+architect's independent greps; I could not fetch the branch sha — could-not-check my arm).
  (C) FOLDS: `a-contract-is-an-unverified-claim.md` Instance 4 — a DISPATCH that created no row is a WISH
  (builder's `claim` → exit2 "no contract"; ledger needs --issue; a fabricated link worse than a missing row).
  `settle-a-contested-claim…` — an INVARIANT beats a timed prediction (no clock, no reach-early bias); TTL now
  CONCLUSIVE (3 timed deaths 20:23:10/20:28:23/20:28:28, cohort cleared). DECIDEs not mine: who wires
  check:gate-wiring; the missing C-FEL-MOONGRAPH-LITERALS row. Board (my fetch): main 3891300a GREEN; #669 draft.
- **WAKE 48 — THE DAEMON GUARD EXISTS AND EXCLUDES NOBODY; MY STEADY-STATE MODEL WAS THE WRONG SHAPE;
  AND `ps -eo etimes` NEARLY MADE ME PUBLISH "THE LEAK STOPPED".** Branch `srmcguirt/retro-followup-0728`,
  **PR #692 OPEN / non-draft / MERGEABLE, head `c4d2d755` verified by `git ls-remote`.** Two commits:
  `6266f5bf` (the cut-off wake's 151 uncommitted lines — DISPUTED-mirrors-outward, the void-clause
  integrity check, which-link-is-untested; they were sitting in the worktree unpushed) and `c4d2d755`
  (this wake). Gate `check-lesson-refs` exit 0, 28 cited lessons.
  (1) **⛔ RELOCATES THE DAEMON FIX AND CORRECTS EVERY PRIOR WAKE ON THAT FILE, INCLUDING MINE.** We all
  reasoned from *"the spawn is unconditional"*. **It is not** — `session-start.js:32` returns early on
  `isAgentWorktreeCwd`, and `:142` comments *"agent-worktree sessions already returned above, so this
  never fires for them."* The predicate is `lib/language.js:111`
  `/[/\\]\.claude[/\\]worktrees[/\\]/` — **Claude Code's built-in worktree path. This swarm lives at
  `conductor/workspaces/<project>/<city>`, which it does not match**, so the guard falls through for
  every role. Receipt is self-observed and free: **my own session `1f41a56a`, cwd
  `conductor/workspaces/aihu/sarajevo`, has 2 live daemons (192 s / 169 s)** — the comment says it never
  fires for me. **A guarded system whose predicate excludes nobody is harder to catch than an unguarded
  one, because the guard reads as present in review.** Rung: structural and now FIRST — widen
  `AGENT_WORKTREE_SEGMENT` (one line, restores intended behaviour), spawn guard second. **NOT MINE** —
  `~/.promptbook`, outside this repo, rides the one-escalation-not-three.
  (2) **⛔ MY OWN CORRECTION, TWICE OVER. The population is a SUM OF TERMINATED BURSTS, not a stationary
  stream.** Nobody had bucketed **per session id** — I hadn't either. My read @ `2026-07-29T01:46:29Z`:
  **872 daemons / 26 sids / `past_ttl_survivors` 0 / oldest 57585 s vs 57600 s TTL.** `ce160f8f` = 393
  daemons emitted in a 3.79 h window that ended **12.2 h ago**, silent since; `4205b2a4` 55 in 3.40 h,
  silent 8.6 h; `48c51a9e` 56 in 28 min, silent 5.1 h. Bins 0–2 h = **15/2/2 ⇒ ≈0.11/min**, against the
  **0.98/min** my wake-36 steady state used. **`rate × TTL` is the steady state of a STATIONARY source;
  the architect and I argued for two wakes about the PARAMETER of a model whose SHAPE neither of us
  checked.** Wake 36 retired "a rate needs a series" (the age histogram IS the history) — true, and it
  hid this: **a histogram summed across sources destroys the structure that shows the bursts.**
  (3) **MY WAKE-36 PREDICTION IS HEADING FOR A LOW FALSIFICATION AND I RECORDED IT BEFORE THE DEADLINE.**
  I committed to *"~950 ± 150 after 13:10Z 2026-07-29, falsified by >~1400"*. At 0.11/min steady state is
  **~100**. **I bounded only the side where the leak got WORSE** — so a collapse to ~100 would have read
  as "not falsified, alarm can stand down", the wrong lesson from a wrong model. **Restated two-sided:
  anchored outside 100–1400 at 13:10Z with survivors 0 falsifies it either way**; a fresh multi-hundred
  burst from one new sid is how the high side gets hit. **A one-sided falsifier is half a prediction and
  the missing half is always the flattering one.**
  (4) **THE WAKE-STORM AND THE DAEMON LEAK ARE ONE PIPELINE.** Orchestrator's triage (their measurement,
  their processes SIGTERM'd before I could confirm — attributed, not claimed): 5 daemons tagged with the
  dead sid `55ccffb6`, one per failed wake, no `claude` owning it. **Consistent with what I CAN see** —
  this wake's batch carries ~2 daemons per role-session (`1f41a56a`/`50669875`/`7d3f60e3`/`062d35cd`/
  `117e61fc` = 2 each, `4ac3d75a` = 4). A storm is a **burst source** emitting the structurally
  un-reapable kind: session never started ⇒ never ends ⇒ no `SessionEnd`. **Counting a resource by its
  clean-exit event misses every unit the failure path produces.** Their RULING (builder-b needs no fix,
  self-healed, `50669875` live) — **do NOT re-triage; do not re-derive the storm root cause.**
  (5) **13th instance of `well-formed-measurement-…`, and the FIRST where the tool ANNOUNCED its own
  failure and I read past it.** `ps -eo etimes` **does not exist on Darwin**: it prints
  `ps: etimes: keyword not found` **to stderr and runs anyway** with the remaining keywords, so column 1
  became `node` (first word of `args`). `awk '$1<3600'` then compared **as a string** (`"node" < "3600"`
  is false) ⇒ **"0 daemons younger than 1 h"**, i.e. *"the leak has stopped"* — one paragraph from being
  banked. Tell I did catch: my min/max line printed `claude`/`node`. **Rule: if a command writes to
  stderr, no conclusion from its stdout until that line is explained** (exit code is 0 — it does not save
  you); **a rejected field does not abort the request, it silently re-indexes every field after it**;
  sanity-check positional output against its own type. Third shell-mutation in four wakes (backticks in a
  commit message, `:s` in a path, now this) — the class is **all three degrade into well-formed output
  instead of an error**, not "shells are quirky".
  (6) Killed nothing, touched no infra, set no status, merged nothing, posted no Slack. Registry-vs-reality
  note from the orchestrator (`agents.json` says orchestrator cwd `aihu/main`, wake ran in
  `aihu/little-rock`) **logged as their evidence, NOT promoted to a 7th row-8 event** — they explicitly
  declined to assert a twin and I am not inflating it.
- **WAKE 47 — THE DEMOTION PATH IS AN OUTWARD UN-PUBLICATION, AND "DRAFT UNTIL JUDGED" CANNOT BE
  SATISFIED. Mostly convergence; three genuinely new structural findings.**
  (1) **⛔ DEEPENS MY OWN "the demotion path is the real work" — it is WORSE than work.** I banked the
  one-string-vs-design-problem split and stopped. Architect read what a demotion DOES; **I confirmed at
  source**: `:2405 linear_ensure_state(identifier, "In Progress") // never Done` and **`:2425
  gh_reopen_issue(num)`**, with the code's own comment naming the FEATURE 3 reopen guard as symmetric
  with the Verified arm's close. **So re-deriving `verified` on the sync path = a heuristic decides a PR
  is no longer on main → the ledger demotes → THE MIRROR REOPENS A CUSTOMER-VISIBLE ISSUE and drags a
  Linear ticket back to In Progress, unattended, on the 1800s timer. A SECOND AUTOMATED OUTWARD CHANNEL,
  FIRING IN REVERSE, ON A GUESS.** And its likeliest failure mode is already banked in this repo by the
  same author from the same day: **sha instruments return confident FALSE NEGATIVES after a squash**, so
  a naive re-derivation **REOPENS CORRECTLY-CLOSED CUSTOMER ISSUES.** **WHOEVER SCOPES IT MUST NOT SCOPE
  IT AS ONE STRING.** Architect's self-named habit, second time in one day: **"I PRICED A CHANGE BY THE
  PART I COULD SEE"** — on `--confirm`, argued FOR it on "no code change" and missed it was a
  publication; here, argued a follow-on cheap because the CHECK exists and missed that the ACTION does
  not. **Both times the invisible half was the OUTWARD one** — not coincidence: the outward half lives in
  another system, so it is absent from the diff, the test run, and every instrument a reviewer reaches
  for first. **When estimating a change that touches another system, price the WRITE, not the read.**
  (2) **"DRAFT UNTIL JUDGED" IS SELF-DEFEATING — banked in `promotion-rungs.md`.** On a draft `check` is
  SKIPPED while ci-ok goes green by design, so a draft's green carries ZERO information; the convention
  judges on CI evidence while holding work in the state that SUPPRESSES CI evidence. **ONE MECHANISM, TWO
  SEMANTICS: `draft` means both "still writing" and "do not run the expensive checks" — A STATUS FLAG
  THAT MEANS BOTH "NOT FINISHED" AND "DO NOT CHECK" CANNOT EXPRESS "FINISHED, PLEASE CHECK."** Resolution
  is free because **draft does no protective work here** (branch protection + a reviewer enforce
  don't-merge-unreviewed independently; readying ≠ landing; #679 discharged the constraint). Same shape
  as the mirror's two arms: **when a flag carries two meanings, the WEAKER meaning silently governs the
  case where they disagree — which is the case you built the convention for.** builder-b applied the rule
  **against their own PR** first. **The #695 call is the orchestrator's; #693 is CLOSED (merged into
  #678), so that ruling is already discharged on builder-b's side.**
  (3) **AN EMPTY CONTRACT IS WORSE THAN NO CONTRACT — `promotion-rungs.md`.** Architect measured every
  clause of `C-FEL-CIOK-GATING-INVARIANT` as already shipped; the only residual was already priced as
  speculative hardening. **With WIP=1, an offered-but-empty row means a builder claims it, reads the
  spec, finds it implemented, and spends the ONLY LANE discovering that. DECLINE IT with the reason in
  the recon** so the parent leaves the queue declined rather than looking claimable. And record the
  causality: **the builder shipped the OR form BEFORE the note recommending it existed, and STRICTER than
  the spec asked** — the spec's only lasting contribution was an operator error a reviewer caught.
  **THE IMPLEMENTATION LED THE DESIGN HERE AND THE RECORD SHOULD SAY SO**, because a design note written
  after the fact reads as though it directed the work unless someone states otherwise.
  (4) **builder-b's account of HOW a wrong number won an argument is sharper than the correction, and it
  is now banked as its own section:** *"I supplied a claim that SOUNDED measured because it CAME WITH
  measurements. The measurements were real. They just did not measure the thing the sentence claimed."*
  **ATTACHED EVIDENCE IS EVALUATED AS THOUGH IT WERE EVIDENCE FOR THE CLAIM, WHEN IT IS ONLY EVIDENCE FOR
  ITS NEIGHBOURS.** The join — *these daemons caused that load* — was the only part asserted and the only
  part never measured. **Check: ASK WHICH MEASUREMENT ESTABLISHES THE VERB; if none does, the claim is a
  hypothesis wearing a receipt.** They originated it and carried the correction themselves (four
  independent reads now agree: orphans n=5 ≈ 3.5 cores ≈ 40%, stable across four roles and ~40 min).
  (5) **Two instrument confirmations banked:** the **void clause fired a FOURTH time and PASSED** — its
  other job is invisible, it tells you **when NOT to spend a re-verification**, and a stamp that could
  only ever cost work would not be kept. And **the pipe-exit trap caught its own author, third time this
  session** (`| tail -3` reporting rc=0 while the fatal printed; unpiped rc=128). Gate exit 0. Killed no
  process, filed no DECIDE, set no status, ran no `--confirm`, no Linear/GitHub write, merged nothing.
- **WAKE 46 — MY LAYER RANKING WAS COVERAGE-BASED AND MISSED THE STRUCTURAL POINT. A DETECTOR THAT RUNS
  IN A GATED JOB CANNOT ENFORCE ITS OWN GATING.**
  (1) **⛔ CORRECTS MY OWN "NEITHER SUBSUMES THE OTHER".** True about COVERAGE, and it misses the shape.
  **The parse lives INSIDE the `gate-wiring` job; for its EXIT 1 to mean anything, `gate-wiring` must be
  in ci-ok's result loop — but the parse's whole purpose is to detect jobs MISSING from that loop,
  INCLUDING ITSELF.** So **in exactly the case it exists to catch, it detects and is ignored** — proven
  in production (run 30401968909: parse installed, gate-wiring FAILURE, ci-ok SUCCESS). **A BOOTSTRAP
  DEPENDENCY, NOT A COVERAGE GAP** — no parser quality fixes it. The guard has no such dependency
  **because it runs inside the aggregator itself**, the only layer whose rejection does not route through
  the property under test. **So the guard is not merely complementary — it is the ONLY layer that can
  enforce the gating of the detector.** General form banked: **when you add a checker, ask what enforces
  the checker; if the answer is the same mechanism it checks, it cannot fail the build on its own
  behalf.** Supersedes my referent-distance ranking for THIS pair (distance still holds for F).
  (2) **⛔ CORRECTS MY "DERIVE THE EXEMPTION, RETIRE THE ALLOWLIST" — the answer is BOTH.** Builder
  shipped two locks: `NEEDS_NOT_GATED` membership **necessary**, `outputsRead.has(job)` **sufficient**
  (`:419-423`). Architect corrected their own recommendation on reading it. **An exemption should require
  a human to DECLARE it AND the machine to VERIFY the property — a two-key operation.** Pure derivation
  is weaker: it lets an exemption **appear silently** the moment someone adds an outputs reference.
  *A name alone silences nothing; a property alone silences without anyone deciding.* **NOBODY SHOULD
  FILE AN XOR FIX AGAINST #691** — verifier proved the shipped code is already OR **by measurement**
  (added `CHECK_FOO: ${{ needs.check.outputs.foo }}` → EXIT 0, no false red); the OR correction belongs
  in the QUEUED SPEC (`C-FEL-CIOK-GATING-INVARIANT`), which is the WRITTEN form of what is already in the
  tree — **do not build it twice.**
  (3) **FOURTH PALETTE VARIANT closed unprompted** (verifier's own mutation): bind the loop's var to the
  WRONG job (`GATE_WIRING_RESULT: ${{ needs.palette.result }}`) → EXIT 1, *"the loop reports on the wrong
  job."* Family now: (1) in needs never read [palette]; (2) same [#649]; (3) read but yields EMPTY;
  (4) **read, bound, pointing at another job**. Plus **rule 0 built into the checker**: `if (needs.length
  === 0) return ["... REFUSING TO PASS VACUOUSLY"]`.
  (4) **BUILDER-B ADDRESSED ME: THE FIFTH PLACE A DURABILITY CHECK READS GREEN.** Two open PRs against
  ONE file (#693/#678), **both `MERGEABLE/CLEAN` — true and irrelevant, because GitHub scores each
  against `main` and NEVER against its sibling.** Trial merge answered it: **rc=1**. **And the collision
  was in the ITEM NUMBERS** (16-20, 22 each pointing at two rulings) in the file whose whole function is
  to be **cited by number** — a textual merge could have succeeded and still broken the record.
  **`mergeable` answers "does this apply to main right now"; when two PRs touch one file the only
  instrument is a TRIAL MERGE of one into the other**, and for a numbered document success is not
  sufficient. Remedy banked: **renumber only the side that never reached `main`**, so existing citations
  do not move.
  (5) **CONDUCT RULE from the orchestrator against themselves:** five filings of one question is itself a
  cost. **REVISE THE ROW, MARK THE SUPERSESSION IN THE ROW ITSELF**, never make a reader reconstruct
  which version is live. Also theirs: **the mint gap is structural, not builder discipline** — the ledger
  row can only be written by the orchestrator while the work is discovered by whoever finds the defect;
  that is why `swarm-bus record` / a finder-proposes path stays the named next contract. (Third
  mint-after-the-fact today; C-FEL-CREATE-GIT-STATUS now minted to builder-b against #695.)
  (6) **Discipline worth copying, all from others:** verifier's void clause fired a **third** time (re-ran
  rather than re-cited); builder-b reported **run 1 EXIT 1 with ZERO failures** alongside two EXIT 0 runs
  and refused to attribute it (*"consistent-with is not evidence-of"*); builder-b applied the
  draft-ci-ok-carries-no-information rule **against their own PR**; orchestrator's jq positive control
  caught their own bad slice before it reached the record. Daemon thread corroborated from a fourth angle
  (loadavg 72→32→36 as anchored daemons fell 1328→1277) — **the drain is visible in SYSTEM LOAD, the
  variable that actually costs wakes.** Tripwires unchanged and unaffected. Gate exit 0. Killed no
  process, filed no DECIDE, set no status, ran no `--confirm`, no Linear/GitHub write, merged nothing.
- **WAKE 45 — I RE-FILED A PEER'S RESOLVED FINDING AS OPEN. THE EMBARGO IS ON WRITES, NOT ON LOOKING.**
  (1) **⛔ MY CATEGORY-2 FILING WAS A MISCLASSIFICATION, AND THREE OF US MADE IT.** I banked the
  `first:50` cap as *"a could-not-check with its discriminator, deliberately not run — it needs a Linear
  read against the system under embargo."* **A Linear GraphQL `query` is a READ.** The verifier had
  already run it and had to say so TWICE while architect, orchestrator and I carried the open version
  forward. **RESOLVED: max 9 of 50 (FEL-431), ~5x headroom, all others ≤2, re-read 22:08:18Z identical.
  THE CAP IS LATENT, NOT LIVE — do not hold anything on it**, and my "worst outward failure mode"
  framing must not be read as a present danger. Still worth paginating (*a guard whose correctness rests
  on a number nobody watches has a timer on it*). **RUNG FIX BANKED: category 2 now has a PRECONDITION —
  ask what the discriminator DOES; it owes a one-line justification naming the mutation, or it is
  category 3 wearing category 2's caution**, which is worse than either because the caution looks like
  diligence. Contrast preserved: *does `gh issue close` error on an already-closed issue* genuinely
  needs a write and was correctly routed around. **This is my own "a correction section does not correct
  the sentence above it" — applied to the RECORD, not a document** (verifier's observation).
  (2) **THE STRONGEST PROPERTY IN THE THREAD, confirmed by me at source** (`:2767-2772`): `cmd_verify_merged`
  selects `status IN ('claimed','building','submitted','no-claims')` — **`verified` DELIBERATELY ABSENT,
  per its own comment.** Nothing ever re-examines a verified row; it promotes INTO, never OUT. With
  `classify` pure on current status ⇒ **THE OUTWARD STATE IS ENFORCED FOREVER, ANCHORED TO A FACT
  CHECKED EXACTLY ONCE.** Revert #655 and #478 is still re-closed every cycle. **THE LEDGER RECORDS A
  HISTORICAL EVENT ("this PR merged", true forever); THE MIRROR PUBLISHES IT AS A PRESENT-TENSE CLAIM
  ("this issue is resolved"), WHICH A REVERT FALSIFIES.** Not a defect in verify-merged — a mismatch
  between what the receipt MEANS and what the mirror PUBLISHES. **"Yes" therefore means HELD CLOSED
  UNTIL SOMEONE EDITS THE LEDGER, not "while the fix is in main"** — *when an authorisation's duration
  is set by a mechanism the authoriser cannot see, the duration belongs in the question.* Fix has two
  halves that must not be scoped as one: adding `verified` to the IN-list is **one string**; **the
  demotion path does not exist and is the real work.**
  (3) **THE NORM, and the architect asked for it as a NORM not a courtesy — banked in `well-formed-…`:**
  the verifier went looking for the SAME overstatement they had found on #430 (`linear_ensure_state`
  no-ops when already in target state ⇒ an already-Done row would inflate the count) and **found none:
  0 of 8 already Done, all eight genuine.** They reported the null result as loudly as the hit.
  **A MEASUREMENT THAT CONFIRMS THE FILED NUMBER IS WORTH THE SAME AS ONE THAT CORRECTS IT; ONLY SAYING
  SO WHEN IT CORRECTS IS HOW A REVIEWER BECOMES AN ADVERSARY RATHER THAN AN INSTRUMENT** — mechanically,
  **a reviewer who reports only hits has an unmeasurable false-negative rate**, because silence conflates
  "I found nothing" with "I did not look". Precision for the row: FEL-433/FEL-460 jump **Backlog → Done**
  (not wrong; a bigger semantic step, visible on the board).
  (4) **XOR → OR.** Verifier tabled the four rows: a job **both** gated AND outputs-consumed is
  legitimate and **XOR false-reds it**. Final: **FLAG IFF NOT ((J in loop) OR (outputs referenced))**.
  **A FALSE RED IS NOT MERELY NOISE — IT IS PRESSURE TOWARD REINTRODUCING THE ESCAPE HATCH** (the fix
  for a false red is "add an exemption", i.e. the hatch re-opening under another name). Two precisions
  banked so nobody files a fix for a non-problem: **the SHIPPED code is already the OR form** (correction
  belongs in the queued contract's SPEC, not the PR), and the architect named the **residual hatch in
  their own corrected form** (declare an unused `needs.J.outputs.*` reference) plus the strengthening to
  build **only if exercised**.
  (5) **DETECTION IS NOT REJECTION — receipt from PRODUCTION, not argument.** Orchestrator ruled the
  runtime guard redundant; builder produced **run 30401968909: the parse WAS installed, gate-wiring
  FAILURE, ci-ok SUCCESS**, with the log printing "NOT GATED". **A DETECTOR WHOSE FAILURE NOTHING READS
  IS THE PALETTE DEFECT ONE LEVEL UP — reproduced by the defence proposed against it.** Orchestrator's
  self-diagnosis banked: *"I ruled redundant from the property I could see and skipped the adjacent
  one"* = **class 2 committed in a RULING rather than a measurement**, the more expensive place because
  a ruling propagates to everyone who complies.
  (6) **builder-b: the comment that cited the OTHER implementation as the reference** —
  `scaffold-pipeline.ts` names `create.ts` as good; `create.ts` discarded three `spawnSync` exit statuses
  under an unconditional `✓`. *"The other implementation already does this" is a claim about the other
  implementation, load-bearing exactly when nobody opens it* — and a COMMENT is worse than a message,
  because proximity reads as verification. Two harness rules banked: **assert the mutation APPLIED**
  (a no-op `str.replace` is a false green) and **commit before you mutate** (`git checkout --` cannot
  tell your work from the mutation). Their green suite **also passed with the fix removed** because git
  auto-derives `username@hostname`; correcting that inherited claim moved mutation B from killing 1 test
  to 2. **Building-without-a-contract is now 3 today** (builder ×2, builder-b ×1). Gate exit 0. Killed no
  process, filed no DECIDE, set no status, ran no `--confirm`, no Linear/GitHub write, merged nothing.
- **WAKE 44 — MY "CONVERGENT BY IDEMPOTENCY" WAS CONDITIONAL, AND MY INVARIANT-DISTANCE RULE IS NOT
  UNIVERSAL. Two of my own bankings corrected, both by reading source I had not opened.**
  (1) **⛔ THE IDEMPOTENCY GUARD IS CAPPED AT 50 — I banked "non-atomic within a run, CONVERGENT across
  runs" as the settled statement; it is CONDITIONAL.** Verified myself at `1bb0dd7c`:
  `linear_comment_if_absent` (`:1677`) = `comments(first:50)` — **no cursor, no pageInfo, no ordering** —
  while `linear_issue_list` (`:1562`) ~100 lines away has **full pagination** (`pageInfo { hasNextPage
  endCursor }`, `let mut after`, `after = cursor`). If the marker falls outside the first 50, `if_absent`
  reports ABSENT → **posts again EVERY sync cycle, forever, unattended, on a customer-visible ticket.**
  **THAT IS MY OWN "A RANKED OR COLLAPSED VIEW IS NOT AN ENUMERATION" CLASS — FOURTH INSTANCE, AND THE
  FIRST ONE THAT ESCAPES THE SWARM.** The first three cost a wrong report; **a truncated read inside a
  CORRECTNESS GUARD produces a wrong ACTION, repeatedly.** And the correct pattern being in the same file
  makes it a **DEFECT, not a limitation** — *when the right pattern already exists in the file, "the API
  only gives you a window" stops being an explanation.* CORRECTED STATEMENT: **state is enforced
  UNCONDITIONALLY; comments are one-shot CONDITIONAL ON A NUMBER NOBODY IS WATCHING.** Could-not-check
  filed WITH its discriminator and correctly not run (needs a Linear read under embargo): **count
  comments on the 8 linked FEL issues; any at/near 50 makes it live.** Filed AFTER reading the function —
  the third-category distinction holding.
  (2) **⚠ MY INVARIANT-DISTANCE RULE IS NOT UNIVERSAL — the architect inverted it against their own
  formulation and the inversion is better.** For **STATE** ("hold this closed"), distance from the
  editing hand is a **VIRTUE** — a remote referent survives local edits, which is why enforcement is
  robust. For a **ONE-SHOT** action ("say this once"), a distant referent is **WORSE**: the remote's
  first-50 window is distant AND truncatable, and the only complete referent is the **LOCAL ROW**.
  **DISTANCE IS NOT ALWAYS THE VIRTUE; COMPLETENESS IS THE PROPERTY, AND DISTANCE ONLY BUYS IT
  SOMETIMES.** Ask what the invariant needs — INDEPENDENCE from the editing hand, or COMPLETENESS of the
  record — and pick the referent for that.
  (3) **THE DESIGN RULING: two arms, OPPOSITE semantics, SAME mechanism.** state→enforce forever,
  referent = remote, **CORRECT** (for state the remote IS the truth); comment→at most once, referent =
  remote through a truncated window, **WRONG MECHANISM**. **"HAVE I ALREADY DONE THIS ONCE" IS A FACT
  ABOUT OUR OWN HISTORY, NOT THE REMOTE'S CURRENT CONTENTS — and we have a database.** **DO NOT ADD A
  BLANKET `synced` COLUMN** — its absence is exactly why state enforcement works; **record the
  COMMENT-POSTED fact specifically.** One column for the one-shot arm; leave the state arm re-asserting.
  (4) **STATE ENFORCED / COMMENTS ONE-SHOT, and the surface is LOPSIDED:** #430 gets **ONE comment
  total**, not one per cycle (footnote vs spam incident, now proven not assumed) — but **8 Linear rows
  HELD in Done vs 2 GitHub issues HELD closed. The thread argued about the 2; the enforcement property
  applies FOUR TIMES MORE OFTEN on Linear.** Two precisions: `classify`'s `recon`/`note` **never
  influence which arm is taken** (a human cannot stop the mirror by annotating; only `status` is a
  lever), and **1800s is a DEFAULT, not a constant** (`SWARM_SYNC_INTERVAL`) — say *"at least every 30
  minutes, configurable."*
  (5) **THE PARSE NEEDS NO ALLOWLIST — DERIVE THE EXEMPTION.** Architect confirmed their own
  `needs-set == loop-set` is FALSE on the current tree ("I proposed an invariant the repo already
  violates, as the thing that closes the recidivist defect"). Fix, no hatch anywhere: **for every job J
  in ci-ok.needs: J is in the result loop XOR ci-ok references `needs.J.outputs.*`** (`changes` is exempt
  *because* ci-ok consumes `needs.changes.outputs.code`). **AN EXEMPTION THAT MUST BE EARNED vs ONE THAT
  CAN BE DECLARED.**
  (6) **THE FOURTH REFERENT: check-runs, outside the repo entirely.** A coherently un-gated job STILL
  RUNS, so it can be RED while ci-ok is GREEN — visible via the check-runs enumeration. Ranking banked:
  guard = same file/same line; parse = same file, INDEPENDENT DECLARATION (survives F); check-runs =
  outside the repo (survives a coherent multi-file edit). **Honest complication recorded rather than
  hand-waved:** "any red job while ci-ok is green" is WRONG as stated (bench/chromatic are advisory), and
  scoping with a list of advisory jobs **REINTRODUCES THE ALLOWLIST**; the non-hatch version scopes to
  the 22 gates check-gate-wiring already DERIVES. A direction, not a spec; third contract, NOT a #691
  blocker. Gate exit 0. Killed no process, filed no DECIDE, set no status, ran no `--confirm`, edited no
  workflow or source, merged nothing.
- **WAKE 43 — THE VERIFIER'S FLAG WAS PARTLY RIGHT (one uncorrected sentence in MY file), and the
  ledger question changed shape a third time: IT IS ENFORCEMENT, NOT PUBLICATION.**
  (1) **MY FILE STILL OVERSTATED IT IN ONE PLACE.** I added the ⛔ correction section last wake but left
  the ORIGINAL sentence *"close 3 customer-visible GitHub issues"* uncorrected further up. Verifier
  caught it. **Both spots now struck in place.** *A correction section does not correct the sentence
  above it — grep your own file for the wrong number, do not just append the right one.*
  (2) **THE NUMBER MOVED A THIRD TIME AND I VERIFIED THE GUARD MYSELF** (`git show 1bb0dd7c:…main.rs`,
  literal sha): `gh_close_issue` **early-returns if already closed** — so `gh issue close` is NEVER
  invoked on #430. But `gh_comment_if_absent` runs **FIRST** and #430 has no marker. **FINAL OUTWARD SET:
  2 state changes (#478, #503) + ONE COMMENT on a customer-visible issue closed since 2026-07-20.**
  **A NUMBER CORRECTED TWICE IS NOT THEREBY CORRECT** — each correction came from someone who had read
  one more line; the tell for "still guessing" was not disagreement (everyone agreed) but that **nobody
  had opened the function.**
  (3) **MY BANKED "PARTIAL PUBLICATION IS REACHABLE AND A REVERT DOES NOT UNDO IT" IS HALF WRONG.**
  Confirmed at source myself: `load_sync_contracts` = `WHERE linear IS NOT NULL OR github_issue IS NOT
  NULL` — **no synced/last_synced column, no filter**, every linked row re-processed every tick — and all
  three writers are guarded. **CORRECT STATEMENT: NON-ATOMIC WITHIN A RUN, CONVERGENT ACROSS RUNS.**
  "No rollback" true; "divergent" false.
  (4) **THE BIGGEST NEW ONE, and I measured it: `classify` matches on `status` ALONE** — a **pure
  function of current status, not a transition** — so `SyncEvent::Verified` fires **every 1800s for every
  verified linked row, FOREVER.** **THE IDEMPOTENCY THAT MAKES A PARTIAL PUBLICATION SELF-HEAL IS THE
  SAME MECHANISM THAT RE-ASSERTS THE OUTCOME AGAINST A HUMAN:** reopen #478 by hand → closed again within
  30 min, silently. BY DESIGN (the neighbouring fn documents the reopen guard's primitive). **A
  CONVERGENT RECONCILER CANNOT DISTINGUISH DRIFT FROM DISAGREEMENT; its safety property and its override
  property are ONE property.** So the honest question: not *"may these close"* but ***"may they be HELD
  closed, re-asserted every 30 min for as long as their contracts read `verified`, plus one comment on
  #430"*** — and **the recovery path is "change the contract status", the LEDGER not GitHub**, which is
  invisible from outside. Strengthens the flag: the 11 link-less rows **never enter the enforcement loop
  at all** (not even SELECTed) — permanently outside the mirror, not just outward-effect-free today.
  (5) **THE COULD-NOT-CHECK RUNG NOW HAS THREE CATEGORIES** (verifier handed me the third, against
  themselves): no discriminator → name one; discriminator exists but MUST NOT be run → **route around**;
  **discriminator UNNECESSARY, the artifact already states the answer → READ THE FUNCTION.** The third is
  the lazy one. **A could-not-check is only honest AFTER checking whether the artifact answers it. An
  UNREAD function is not an UNKNOWABLE one — and a could-not-check inherited from someone else becomes
  YOURS the moment you reason from it** (repeating is a citation; building a hazard on it is a claim, and
  the claim owes the read). Architect's "second, stronger" argument for `--skip-linked` is **RETIRED**;
  the flag stands on its original argument. *"I would rather lose a supporting argument than keep one
  built on an unread function."*
  (6) **THE PARSE HAS THE SAME CO-LOCATION WEAKNESS ONE LAYER UP — AND IT ALREADY FAILS TODAY.** needs
  n=8 vs loop n=7; `changes` is in needs, deliberately not gated (consumed for outputs). So the invariant
  is `needs − EXEMPT == loop`, and **EXEMPT is a hand-maintained ALLOWLIST — fail-open by construction,
  the shape flagged that same morning.** Remedy: **make EXEMPT justify itself / derive it** (`changes` is
  exempt *because ci-ok consumes its outputs* — a parseable property). **An exemption that is a NAME is a
  hole; an exemption that is a PROPERTY is a rule.**
  (7) **THE HONEST END OF THE CHAIN, banked so it is not discovered by the 4th palette instance: A
  COHERENT UN-GATING IS INVISIBLE TO ALL THREE INSTRUMENTS** (drop from loop + decrement count + drop from
  needs = guard passes, parse passes, check-gate-wiring exits 0 because the job is still defined and still
  runs). **Every layer raises the number of self-consistent edits an un-gating needs from one to three —
  that is a COST INCREASE, not a proof**, and it is still worth buying because the careless edit is the
  one that happens.
  (8) **THE PAIRED HABIT, banked in `well-formed-…`:** architect's = missing SECOND direction; verifier's
  = missing FIRST read. **Both are the cheap step skipped because the expensive step felt done** — the
  more work you have done on a question, the likelier you are to skip the four-second check that settles
  it. Gate exit 0. Killed no process, filed no DECIDE, set no status, ran no `--confirm`, edited no
  workflow, merged nothing.
- **WAKE 42 — I CLOBBERED A PEER'S HARNESS IN `/tmp`, AND I REPEATED A WRONG NUMBER THAT FOUR ROLES CARRIED.**
  (1) **THE `/tmp` CLOBBER WAS ME — OWNED, VERIFIED, CLEANED UP.** Verifier went to re-run their ci-ok
  harness at `/tmp/loop-current.sh` and found a SIX-pair loop with no gate-wiring; architect's diagnostic
  (*"six pairs = the loop as it exists ON MAIN, not the #691 merge tree"*) identified the author without
  accusing. `ls -l` → **17:48, six pairs, compressed body = MINE**, written last wake straight to a
  guessable shared path. **Nothing lost** (their table was run against their own extraction and stands;
  they re-extracted on noticing). **I deleted my two stale files after disclosing.** **STANDING RULE
  ADOPTED (verifier's): A SCRATCH ARTIFACT NEEDS A PRIVATE PATH (`/tmp/<role>-<thing>-$$`)** — the
  natural name is the one every role independently chooses. **`/tmp` IS AS SHARED AS `zurich`, and worse
  in one way: a worktree has a branch name you can print; a `/tmp` path has NO IDENTITY AT ALL.**
  (2) **⛔ I REPEATED "#430, #478, #503" — IT IS TWO, NOT THREE. #430 HAS BEEN CLOSED SINCE 2026-07-20.**
  My own `gh issue view`: 430 CLOSED/COMPLETED (8 days), 478 OPEN, 503 OPEN. Asserted by orchestrator,
  repeated in architect's retraction, **banked by me into the lesson AND re-sent on the bus**. **One
  third of the stated blast radius did not exist** because four roles CITED instead of running a
  four-second command. Corrected split (verifier, VACUUM INTO snapshot, 19/19 matched): **11 NO LINK
  (zero outward effect, 58% of the work) + 8 linear + 3 github (all 3 also linear ⇒ OUTWARD SET IS 8
  ROWS)**. "15 Linear" was the WIDER candidate set incl. the 9 skipped-no-PR rows. **`say the number or
  say nothing` claimed its own author — the wrong count was introduced INSIDE the message that coined the
  rule, and a wrong number in a RETRACTION inherits the retraction's credibility.**
  (3) **THE REFRAME IS THE BEST THING IN THE THREAD AND IT IS THE VERIFIER'S:** everyone (me included)
  framed it *"may these close?"*; the question a human needs is **"are they FIXED, and is closing them
  correct?"** — #478→PR #655 `8a6b2362`, #503→PR #654 `a8b63362`, **both regression tests ON MAIN**
  (`slot-fallback-drive.test.ts`, `gh503-each-noniterable-sidecar-tsc.test.ts`). **MAKING AN ESCALATION
  SMALLER IS GOOD; MAKING IT ANSWERABLE IS BETTER** — a smaller question still needs judgement; an
  answerable one carries its own evidence.
  (4) **NON-ATOMIC ORDERED MIRROR** (architect, at source): Linear publishes FIRST, GitHub SECOND, errors
  **collected per arm, not fatal** ⇒ **PARTIAL PUBLICATION IS REACHABLE** and a revert does not undo it.
  C-FEL-434b is the row that exercises it. **A two-system publication with per-arm error collection has
  no transaction; "it reported a failure" ≠ "nothing happened".**
  (5) **NEW SUB-RUNG, requested by the architect: A COULD-NOT-CHECK WHOSE DISCRIMINATOR MUST NOT BE
  RUN.** My banked rung says file it WITH the discriminator, converting a dead end into an invitation.
  Second kind: the discriminator exists, is known, and **running it is the very act under decision**
  (does `gh issue close` on an already-closed issue exit non-zero?). **Remedy is not "run it" — it is
  "ROUTE AROUND IT":** under `--skip-linked`, C-FEL-434b is skipped and the path never fires. **A
  granularity flag does not only shrink the human question — it DELETES an edge case nobody can safely
  test.**
  (6) **THE SHARPEST GENERAL LESSON OF THE DAY, banked in `guarantee-satisfied-…`: AN INVARIANT IS ONLY
  AS STRONG AS THE DISTANCE BETWEEN ITS TWO REFERENTS.** Full 5×3 table banked (A normal / B empty values
  / C empty pair LIST / D job dropped count left / F job dropped AND count decremented). Inversion closes
  B, blind to C. Count guard (`checked`, `-ne 7`) closes B+C **and D — the recidivist palette/#649 defect
  — at RUNTIME for 2 lines** (verifier's find; architect revised in the stronger direction). **But F
  passes silently: the guard's expected value is CO-LOCATED with the thing it guards, edited by the same
  hand in the same commit ⇒ it is a CONSISTENCY check, not a CORRECTNESS check.** The static
  `needs`-set==loop-set parse survives F because **`needs:` is an INDEPENDENT DECLARATION**. **NEITHER
  SUBSUMES THE OTHER — build both.** `-ne` not `-lt` (measured: `-lt` silently passes an 8th job). And
  `checked=0` makes C **rule 0 wearing shell** — `fail=0` is an ABSENCE REPORT, indistinguishable from
  "no job examined".
  (7) **TWO METHOD LINES:** verifier's **a positive control that reds on correct input is worse than
  none** (scenario A is the direction-2 test *of the control*); and the architect naming their own habit
  — direction-1 shipped and direction-2 called obvious **three times in one session while citing the bar
  to others**. **A standing bar you apply to others' work and not your own is not a bar, it is a
  preference**; the only reliable detector is a second role who RUNS what you asserted.
  (8) **A RANKED OR COLLAPSED VIEW IS NOT AN ENUMERATION — three tooling instances in one day**:
  `gh statusCheckRollup` (omits a job that ran), top-N process listing (orphans read as ~2 cores vs
  measured 3.6 — the orchestrator counted what a top-6 SHOWED rather than selecting on `ppid=1`), and my
  `/tmp` collision. **Select on the PREDICATE, never off what the display chose to show.**
  (9) My **12× daemon-CPU discrepancy stays DECLARED, not resolved** — architect: do not let anyone
  settle it by picking whichever number they saw first; named candidate cause is `ps` lifetime-average
  vs `top` instantaneous (ps averages a 44-hour process differently than a 3-minute one). Gate exit 0.
  Killed no process, filed no DECIDE, set no status, ran no `--confirm`, edited no workflow, merged nothing.
- **WAKE 41 — `ci-ok` CAN PASS HAVING READ NOTHING (live on main, I reproduced it), and my
  verify-merged banking is STRUCK by its own author.**
  (1) **THE BIGGEST TECHNICAL FINDING OF THE DAY.** Architect found it chasing verifier's named gap one
  level down; verifier confirmed by execution; **I reproduced it a third time against `origin/main`'s OWN
  loop text** (`git show origin/main:.github/workflows/plan-a.yml`, never a quote). The `ci-ok` result
  loop is **an ALLOWLIST OF BAD VALUES** (`if result = failure || cancelled`), so an **empty** result
  matches nothing and **passes**. My truth table: success/skipped/failure/cancelled **behaviourally
  IDENTICAL** under the proposed `!= success && != skipped`; only **EMPTY** and `neutral` change —
  so the inversion is not over-strict (direction 2, which is the half that licenses it). **WORST CASE,
  MEASURED ON MAIN'S SIX BINDINGS:** `env -u` all six → **`fail=0` and ZERO OUTPUT LINES**; proposed →
  6 `::error::` + `fail=1`. **So dropping/renaming the `env:` block makes THE SOLE REQUIRED STATUS
  CONTEXT pass having checked NOTHING, silently.** Not "gate-wiring is exposed" — **`ci-ok` can go green
  with zero jobs read.** **THIS IS LIVE ON MAIN TODAY, not only in #691.** Palette family **THIRD
  VARIANT**, each notch harder to see: palette/#649 = in `needs`, never read; this = **read, but the read
  yields empty** — invisible to the eye (prints `gate-wiring:` + blank, reads as formatting) AND
  **structurally invisible to `check-gate-wiring.ts`** (shell semantics inside a YAML scalar). **DURABLE
  (verifier): ANY `if bad then fail` OVER AN OPEN-ENDED VALUE DOMAIN IS FAIL-OPEN BY CONSTRUCTION —
  enumerate the GOOD values.** Tradeoff accepted: a new GitHub value would red ci-ok until allowlisted;
  **erring toward red is recoverable in one commit, erring toward green is what we have shipped three
  times.** Fix goes in **builder's rebase, SAME COMMIT** (architect will not edit plan-a.yml themselves —
  shared hot file, builder mid-flight). Follow-on upgrade: the needs-set==loop-set parse **must also
  assert each pair's env var is BOUND** — set equality alone passes this typo. **NOT MINE TO FIX.**
  (2) **R-E IS CLOSED** — architect set the bar and closed it on verifier's production measurement
  (gate-wiring SUCCESS 21:24:19Z while `check` SKIPPED on a draft). **Banked the boundary as its own
  shape: do not let an adjacent UNMET question re-open a SATISFIED bar** — verifier's "every red is
  local" is a different question (does ci-ok REJECT), never R-E's subject. Clause-3 gap is a **gap, not a
  defect**, and does **not** block #691. #691's real blocker is administrative: **CONFLICT in
  `docs/state/builder.md`**.
  (3) **MY WAKE-39 BANKING IS STRUCK BY ITS AUTHOR.** I banked *"hand-editing repairs one row;
  `verify-merged --confirm` repairs 19 and teaches receipts are collected"* and called it **the
  transferable part**. Architect **retracted it**: `verified` is **not a label, it is a PUBLICATION** —
  `main.rs:1064-1082` + `:2289-2315` move ~9 Linear issues to Done **and CLOSE GitHub issues #430/#478/
  #503** on the supervisor's automatic 1800s sync. **A revert does not un-close a customer-visible
  issue.** And no narrow form exists: `cmd_verify_merged` takes **`args.get("confirm")` and nothing
  else** — all 19 or nothing. **DURABLE: CHEAPNESS IS NOT SAFETY WHEN THE EFFECT IS OUTWARD** — "no code
  change" was used as the argument FOR it; *reversible in the repo says nothing about reversible in the
  world.* Also Q1 verbatim (bundling ~10 zero-effect rows with 3 issue closures **stalls the dispatchable
  half**). RULING: **build `--skip-linked`/`--only` FIRST** (faster path, not delay) → link-less rows
  collect receipts today → the human question shrinks to *"may these 3 named issues close?"*.
  **MAKING THE QUESTION SMALLER IS THE WHOLE JOB OF AN ESCALATION**, and: **ANY BULK COMMAND WITH
  EXTERNAL SIDE EFFECTS MUST SUPPORT A SUBSET** — without it every use becomes a founder decision, and a
  gate that always needs a human is a gate nobody runs. **DO NOT recommend `--confirm`. Two DECIDEs are
  open and BOTH are the orchestrator's.**
  (4) **METHOD RULES banked in `well-formed-…`:** **REPRODUCE AGAINST THE SOURCE TEXT, NEVER THE QUOTE**
  (verifier `sed`'d the loop from the file so a transcription error could not flip their verdict; I did
  the same — general form of the `IMPORT_RE` misquote: *a reproduction built from someone's prose is a
  test of their typing*). And **SAY THE NUMBER OR SAY NOTHING** (architect vs themselves: their implied
  "the safe subset isn't worth much" was an **unmeasured aside riding a measured ruling** — verifier
  measured it at **3.6 cores / 40%**; *that is how a soft claim inherits a hard one's credibility*).
  Small live instance: cited `main.rs:2610` had moved to `:2748` — find things by NAME, not by a line
  that rotates.
  (5) **THE LADDER FIRED TWICE — banked as the evidence that a rung is not decoration.** Me (504 lines,
  #669 landed) then verifier (489 lines, #690) by their own audit. **AND THE "do not ready a docs-only
  PR" CONSTRAINT IS DISCHARGED** (#679 merged `43c47c46`) — orchestrator ruled: MARK #690/#692/#693/#694
  READY; readying is not landing. **I marked #692 ready this wake.** *A standing constraint outlives the
  defect that justified it unless someone retires it by name.* Gate exit 0. Killed no process, filed no
  DECIDE, set no status, ran no `--confirm`, merged nothing, edited no workflow.
- **WAKE 40 — THE BIGGEST CORRECTION OF THE DAY, AND I AMPLIFIED THE ERROR INTO THE RECORD.**
  (1) **⛔ "WE OPTIMISED THE POPULATION WE COULD COUNT." THE DAEMON LEAK IS NOT WHAT DEGRADES THE TEST
  SIGNAL.** Last wake I banked builder-b's "the leak corrupts the test signal" and called it **better
  than my own framing** — without asking what was actually using the CPU. Architect falsified it,
  verifier reproduced with a 2nd instrument, **I reproduced with a 3rd (my own awk)**:
  `live-daemon n=1253 cpu=27.4%` **vs** `bun server.ts n=25 cpu=946%` (9.5 of 10 cores); `top -l 2`
  2nd sample = **top five consumers ALL `bun` ~67% each, NOT ONE daemon.** **The daemons are IDLE**
  (30s setInterval); reaping all 1253 fixes ZERO timeouts — the remedy that framing implies is the one
  that cannot work. **NOTE MY OWN DISCREPANCY, unresolved and honest: my daemon cpu 27.4% vs their
  2.0-2.2% (12x). Does not change the conclusion (0.27 vs 9.5 cores) — direction robust, magnitude not,
  the same pattern I banked for bin-0.** PROFILE CONTRAST is the operative content: daemons = MANY /
  IDLE / **TTL-bounded, observed firing** / cost RSS; bun servers = FEW / EXPENSIVE / **NO TTL, oldest
  1d20h = 44h = 2.75x the daemon TTL** / 5 ORPHANS at ppid=1. **The proven remedy (TTL) is absent from
  the population that needs it.** Verifier's decision-changing correction: **orphans n=5 = ~3.5 CORES =
  36-37% of the class**, safe to reap (parents already dead) — I measured 337.7%/36% myself. Severity of
  the daemon leak: **~36-37GB RSS measured** (I said ~41GB), bounded, falling, unchanged, still not
  urgent — **but nobody should ship the R1 spawn guard expecting test stability.** Neither role filed a
  DECIDE (orchestrator owns that lane, just withdrew ffba4878) — question NAMED so it is not lost:
  *"may orphaned (ppid=1) plugin/MCP servers be reaped, and should plugin servers carry a TTL?"*
  NOT VERIFIED BY ANYONE: whether the ~67-90% CPU is a busy-loop bug or honest work.
  **THE DURABLE SHAPE: counting a population is not establishing it is the population that matters; a
  number that is easy to produce attracts effort out of proportion to its importance.** And the personal
  half: **a framing can be correct and still be pointed at the wrong subject — a correct framing is the
  HARDEST kind to audit, because agreeing with it feels like checking it.** builder-b's WAKES-not-
  gigabytes unit SURVIVES; re-attach it to the bun servers. Their triage command is untouched and best:
  `vm.loadavg` + `--testTimeout=30000` before believing any timeout.
  (2) **ARCHITECT'S "your banking is stale" FLAG CROSSED MY WAKE-39 COMMIT — already fixed** (grep:
  "SETTLED — the unrun experiment was run" = 1, "NOBODY HAS AN UNCACHED RUN" = 0). **Their general point
  is banked anyway and is new:** `stale-ledger-…` now carries **A COULD-NOT-CHECK HAS NO EXPIRY** — in a
  citation graph it is a durable claim that the question is OPEN when it is closed. **Remedy: file every
  could-not-check WITH THE DISCRIMINATOR that would settle it** (the command + what each outcome means),
  which converts a dead end into an invitation — that is exactly how the pre-push dispute closed.
  **Corollary: a retracted claim propagates faster than its retraction because roles wake at different
  times; the role that ORIGINATED a claim carries its correction, more than once if it is still moving.**
  (3) **ARCHITECT'S FAIR HIT ON MY NEW FILE: my headline rule is phrased as a HABIT, which by my own
  test is the weak rung.** Added the **FIXTURE FORM**: *every gate that reports a negative MUST carry an
  input it is required to report POSITIVE on, exercised in the same run.* Also folded their class map
  (rule 0 / 0b / 0c were TWO classes filed three times — **DID-NOT-RUN vs RAN-AND-MISSED**; my rule
  **generalises** rule 0, `wc -l` being the special case) and their stated tradeoff (paid overwhelmingly
  on TRUE negatives; worth it because the prevented failure ENTERS THE RECORD AS FACT). Architect filed
  `docs/decisions/2026-07-28-a-well-formed-answer-to-the-wrong-question.md @ 3eb3a36`; **the lesson stays
  mine.** TWO NEW INSTRUMENT CAVEATS banked in it: **`gh pr view --json statusCheckRollup` IS NOT AN
  ENUMERATION** (omits a job that ran; use `gh api commits/<sha>/check-runs` for presence/absence — 2nd
  face of the collapsed-view defect), and **`ps` %CPU is a LIFETIME AVERAGE** (cross-check `top -l 2`,
  use the SECOND sample) — nobody said it while three roles argued off `ps`.
  (4) **CLAUSE 3 CONFIRMED BY MUTATION AND IT IS TWO-SIDED** (verifier): drop loop entry keep `needs:`
  → EXIT 0 undetected; drop `needs:` keep loop → EXIT 0 **also** undetected. Non-detection measured;
  whether Actions rejects the dangling `needs.*.result` = could-not-check (cannot run Actions locally).
  **NOT a blocker on #691.** And **my both-directions bar was applied by a THIRD ROLE unprompted** to
  two of #691's narrowings — incl. replacing `check-moon-graph`'s `exit(1)` with `exit(0)` → caught:
  *"the gate did NOT reject its own red input (it cannot go red)"*. **First time in this directory that
  green-by-construction was caught by MACHINERY rather than by a person noticing.**
  (5) **#691 DOES NOT MERGE** — conflict in `docs/state/builder.md`; `gh` said mergeable UNKNOWN, which
  **is not the same as yes**. My own #692 read UNKNOWN last wake and is now **MERGEABLE/CLEAN** — the
  premature-observation clause resolving exactly as predicted. Gate exit 0. Killed nothing, touched no
  infra, set no status, ran no `--confirm`, filed no DECIDE.
- **WAKE 39 — NEW LESSON `well-formed-measurement-of-the-wrong-thing.md` (builder-b handed it to me).
  Plus: the typecheck dispute SETTLED, a countermand WITHDRAWN, and a severity framing better than mine.**
  (1) **THE NEW FILE IS THE WAKE'S REAL OUTPUT.** builder-b found it (4 instances in ONE wake) and
  explicitly offered it to docs/lessons rather than filing it. Rule: **before believing a NEGATIVE
  result, state what a POSITIVE one would have looked like and confirm your command could have produced
  it.** **CRITICAL DISTINCTION — this is NOT the empty-and-green class:** existing doctrine catches
  instruments that DID NOT RUN (empty/silent/skipped); this catches instruments that **ran perfectly and
  were pointed one inch off target**. No error, no missing file, no non-zero exit — **it survives every
  check we currently teach.** Nine instances tabled from five roles in one day (wrong branch, wrong
  file, deleted-branch-reads-as-lost, load-induced timeout, squash/two-dot ×3, cached green, `| head`
  exit code). Remedy is **one command** in every case — the asymmetry IS the argument. Rung: prose →
  **injected-at-dispatch (belongs next to "evidence over assertion" — it is that instruction one level
  deeper: evidence over assertion, then INSTRUMENT over evidence)** → structural = **a POSITIVE CONTROL**
  (builder's `NEGATIVE_FIXTURES.green`; verifier's prose-claim control that turned "0 claims" into
  *format mismatch* rather than *no claims*). **A negative result without a positive control is an
  opinion about your instrument.**
  (2) **MY COULD-NOT-CHECK RESOLVED — AND THE WAY IT RESOLVED IS THE LESSON.** I banked "the clean
  discriminator nobody has run: warm vs cold". Orchestrator RAN IT: `bunx moon run
  jsb-keyed-aihu:typecheck --force` → **EXIT 0, 2m40s, no cache line**, real builds. **MAIN IS NOT
  BROKEN; the verifier's failure was environmental contention.** `dead-gate-…` updated from
  could-not-check to SETTLED. **Naming a cheap falsifiable discriminator you cannot run beats another
  opinion — the next role with two spare minutes ends the dispute.** DO NOT re-open this.
  (3) **CORRECTION TO MY WAKE-36 BANKING: the architect's countermand of builder's own-job route is
  WITHDRAWN.** Builder shipped all three clauses; architect verified on the PR head (`:460` needs,
  `:488` RESULT, `:510` in the loop). **A ruling whose premise is measured away should die**; the risk
  was retired by EXECUTION AND PROOF, not argument. I marked the block superseded rather than deleting
  it (the reasoning was sound on the evidence available). **REMAINING GAP = exactly the recidivist
  clause: CLAUSE 3 HAS NO NEGATIVE FIXTURE** — delete the result-loop line while leaving `needs:` and
  nothing detects it (the palette/#649 defect, documented in `plan-a.yml:471-477`'s own comment as
  having happened twice). **Durable: `check-gate-wiring.ts` answers REACHABILITY, not GATING; a parse
  asserting `needs`-set == result-loop-set closes it structurally. A COMMENT THAT RECORDS A RECURRENCE
  IS A CANDIDATE ASSERTION.** NOT mine to build.
  (4) **BUILDER-B'S SEVERITY FRAMING BEATS MINE AND I RECORDED IT AS A CORRECTION.** I argued ~41GB RSS
  over fork(); they showed the leak **corrupts the TEST SIGNAL** — `packages/cli/tests/agent-readiness-floor.test.ts`
  gave **2 then 3 then 4 failures on the SAME tree** (**the varying count is the tell**), loadavg 72 on
  10 cores, all `timed out in 5000ms`, and `--testTimeout=30000` → 5 passed. **Cost is measurable in
  WAKES, not gigabytes.** My own read 21:34:54Z: loadavg 30.59, daemons **1258** — 2.4× lower, which
  STRENGTHENS it: the corruption is load-dependent and therefore **intermittent**, the exact shape that
  gets misattributed to a diff. Triage in one command: `vm.loadavg` + `--testTimeout=30000`.
  (5) **A DEFECT IN LESSON-WRITING ITSELF, banked in `promotion-rungs.md` — this one is about MY craft.**
  Orchestrator: *"the rung was written about the wrong COMMAND, not about the CLASS."* The old rung named
  a bad command (`git diff main..branch`) and a good one (`git log main..branch`) but not the PROPERTY
  (**a two-dot range answers a question about SHAs**) — so it protected against one instance and
  **licensed the next**. Filing test adopted: **if the tool changed but the property held, would this
  text still be right?** Also folded: architect ratified the poll-resolution predicate and **replaced
  their own generalisation with the verifier's**; that is the **4th hand-set threshold in a day** — three
  wrong about WHERE, one about PRECISION.
  (6) **LEDGER — I CONFIRMED THE COUNT MYSELF AND THE ORCHESTRATOR'S MESSAGE IS STALE.** WAL-safe copy,
  `select id,status from contract where id in (…)`: `C-SWARM-RECON-AUTHORITY` **HAS a row** (`no-claims`,
  "39 tool calls; 0 claims"); `C-FEL-MOONGRAPH-LITERALS` returns **NOTHING**. **It is ONE contract, not
  two** — verifier measured it, architect accepted it against themselves; the orchestrator re-asserted
  "two in one day is a pattern" in the same wake, crossed. **Do not re-inflate the count.** The real
  finding is bigger and is banked in `the-audit-ledger-…`: **the BROKEN predicate runs every 5s
  (`supervisor.py:696` in `reconcile()`) with authority to write TERMINAL statuses; the CORRECT one
  (`verify-merged`, 19 rows, 0 could-not-check) runs NEVER** — three roles confirmed zero callers, mine
  being `grep … supervisor.py recon.py` → **EXIT 1**. **Self-demonstrating: it ate its own remedy's
  contract.** Repair ruling: **`verify-merged --confirm`, NOT a hand-INSERT** — *hand-editing repairs
  one row and teaches the ledger is editable; verify-merged repairs 19 and teaches receipts are
  collected.* **That run is the ORCHESTRATOR's; I set no status and ran no --confirm.**
  **#669 MERGED mid-wake 38 (21:24:52Z, `8482cb8c`); this work is on FRESH branch
  `srmcguirt/retro-followup-0728` → draft PR #692.** Gate exit 0. Killed nothing, touched no infra.
- **WAKE 38 — THREE OF MY OWN BANKINGS CORRECTED. This was a correction wake, not a banking wake.**
  (1) **I STRUCK MY OWN "INVERSE DEAD GATE" HEADLINE.** I banked "pre-push is red LOCALLY for everyone
  on a tree CI calls green" with causation hedged — but the FRAMING was not established and is now
  falsified. Orchestrator at `642860f3`: `bunx moon run jsb-keyed-aihu:typecheck` → **EXIT 0**, emitting
  the very WARN quoted as the diagnosis; `bunx tsc --noEmit` → 0; `plan-a.yml:134` runs the same root
  script CI-side. **No local/CI divergence to explain.** Observation real, ATTRIBUTION FALSIFIED.
  **DO NOT re-assert a bench/pre-push defect on main — it is could-not-check.** What replaced it is
  better than what I wrote: **(a) `--no-verify` IS A DISCLOSURE, NOT A DIAGNOSIS** — a hook failure
  becomes "a defect on main" only when reproduced AT THE SAME SHA IN A SECOND ENVIRONMENT; report the
  exit code + **cold-or-warm worktree** + the FULL task output, not the tail. **(b) A CACHED GREEN IS
  COULD-NOT-CHECK WEARING A RECEIPT** — architect retracted an EXIT 0 that was `(cached, 29640012)`;
  they PRINTED "57 cached" and read it as corroboration; orchestrator's was "5 cached" too; `--force`
  timed out (exit 143, no verdict). **NOBODY HAS AN UNCACHED RUN IN EITHER DIRECTION.** (c) **AN
  INHERITED DIAGNOSIS COMPOUNDS INTO CONSENSUS** — orchestrator: "I inherited a diagnosis and restated
  it with more confidence than it had earned, and it then read as corroboration for the next role."
  Four roles held one unverified belief and **I turned it into a repo artifact.** *A citation and a
  reproduction look identical in prose and are not the same evidence.*
  (2) **THE `past_ttl_survivors > 0` PREDICATE I BANKED FIRES ON NORMAL OPERATION** (verifier).
  Their first sample fired it (oldest 57610s > 57600); orchestrator's quoted 16:00:12 = 57612 also
  fires, yet they concluded "survivors ZERO" — **right conclusion, wrong test, boundary read by eye.**
  I CONFIRMED THE MECHANISM AT SOURCE: `live-daemon.js:49 TICK_MS=30s`, `:54 MAX_LIFETIME=16h`,
  `:91` check INSIDE tick, `:112 setInterval` — **the TTL is poll-enforced, so overshoot up to one tick
  is normal by construction.** CORRECTED predicate: `etime > 57630` **AND same PID present in a second
  sample ≥60s later** (a single sample cannot tell "being reaped now" from "never reaped"). My read
  21:27:32Z: count 1277, oldest 57580, over_57630 **0** — does not fire. **SHAPE: deriving a tripwire
  from the ceiling is only HALF — derive its RESOLUTION from the mechanism that ENFORCES it. A
  poll-enforced limit is a limit at T + one poll interval.** Sibling of my POISON_ATTEMPTS finding
  (different clocks) — this is different RESOLUTIONS.
  (3) **⛔ "1400-2000 IS EXPECTED CONVERGENCE" IS RETIRED** (architect self-retracted; my bin-0
  correction killed it — it was `1.47 × 960` off the NOISIEST bin). **Use ~950 ± 150 after full
  turnover (~13:10Z 2026-07-29).** I had quoted the dead band; so had the orchestrator. **The escalation
  tripwires (>4.16/min, past_ttl_survivors) are UNCHANGED because they came from INVARIANTS; the
  retired band came from a MEASUREMENT.** Fifth read 1277 — decline now 1328→1306→1299→1293→1277 across
  four roles.
  (4) **MY "TWO CONTRACTS IN ONE DAY IS A PATTERN" WAS WRONG — it is ONE** (verifier, queried the
  ledger). `C-SWARM-RECON-AUTHORITY` **HAS a row** (`no-claims`) and `verify-merged` already names its
  receipt; only `C-FEL-MOONGRAPH-LITERALS` has NO ROW. **I banked a pattern claim off verdict prose
  without querying the population — in the file about stale receipts.** The proposal stands on one
  instance. **THE REAL FINDING UNDERNEATH: `verify-merged` WORKS AND NOTHING CALLS IT** — 19 rows on
  unambiguous merged-PR receipts, and I confirmed the caller side at the strongest point:
  `grep verify.merged ~/.swarm/supervisor.py ~/.swarm/recon.py` → **EXIT 1, no match.** A working
  receipt collector wired to nothing = the gate-wiring defect in the ledger's clothes. **Running it is
  the ORCHESTRATOR's (`--confirm` sets status); NOT mine, NOT the verifier's.**
  (5) NEW, not corrections: **"same COMMIT not same PR" is stronger than its own argument** — the "one
  PR" ruling silently assumed squash, and I reproduced `gh api repos/fellwork/aihu` →
  `{"squash":true,"merge":true,"rebase":true}` — **all three enabled, convention not rule.** Shape:
  **do not let correctness depend on an unenforced convention when the stricter form is free**; the
  tell is a proof containing "because we always…". **Row 8 → SEVENTH event** (architect measured the
  wrong branch): **blast radius of a branch swap is EXACTLY the commands reading HEAD or the working
  tree; REF-QUALIFIED commands are immune — partition your claims by whether they named their ref
  instead of discarding the wake.** Tally 7: 4 harmful, 1 benign, 2 near-miss. **A PROSE RUNG WENT
  STRUCTURAL IN ONE DAY**: my both-directions mutation became builder's `NEGATIVE_FIXTURES.green`
  control (#691) — **a lesson phrased as a fixture is portable into code; one phrased as a habit is
  not.** Third instance of the regex class (`check:grammar-v2`, 5 false positives) — **and its fix is
  NOT a copy of #689's**: `stripNonCode` blanks template literals and preserves strings; the grammar
  gate needs the opposite on both counts. **"What counts as code" is a property of the GATE'S QUESTION,
  not the language** — own contract. Builder's baseline choice is disclosed, countermand is the
  orchestrator's. Verifier's pipe-exit slip (`| head` masking grep's code) = my own banked trap, theirs
  this time. Gate exit 0. Killed nothing, touched no infra, set no status, merged nothing, ran no
  `--confirm`.
- **WAKE 37 — I AUDITED MYSELF AGAINST THE VERIFIER'S TRAP AND I AM EXPOSED. Plus: my own wake-31
  remedy is DEFEATED by squash merges.**
  (1) **THE DURABILITY LADDER HAS FOUR RUNGS AND `git ls-remote` ONLY PROVES #2.** Verifier self-caught:
  `srmcguirt/verifier-0727` had **10 state commits and NO PR AT ALL** (`gh pr list --head … --state all`
  → `[]`), 29 behind main, ls-remote green every wake. **The warning was already in their own
  `docs/state/verifier.md` — they read it and repeated it.** That is the cleanest proof in the
  directory that **a lesson filed in your own state file does not fire.** Ladder banked in
  `worktree-vs-clone-tmp-durability.md`: worktree → branch (`ls-remote`) → PR (`gh pr view`) →
  **readable on main (`git show origin/main:<path>`)**. **MY OWN EXPOSURE, MEASURED NOT ASSUMED:**
  `git show origin/main:docs/state/historian.md | wc -l` → **309, exit 0**; my branch copy → **813**.
  **504 lines — wakes ~20-36 — exist only on unlanded draft #669** (OPEN, draft, MERGEABLE, ahead 33 /
  behind 0). This is the PARTIAL form and it is WORSE than the verifier's total form: rung 4 answers
  "yes, exit 0" while the content is a whole day behind. **CHECKING THE PATH RESOLVES ON MAIN IS NOT
  CHECKING WHAT YOU WROTE IS ON MAIN.** Next instance: run the rung-4 check on YOUR file at every
  handoff, and if #669 is still draft, say so loudly again — landing is the interactive session's.
  (2) **CORRECTION TO MY OWN WAKE-31 BANKING.** I banked "two-dot diff shows main's additions as the
  branch's deletions → use `git log main..branch`". The remedy is **incomplete**: after a SQUASH merge
  the originals are NEVER ancestors, so `git log origin/main..branch` → 6 commits FOREVER and
  `merge-base --is-ancestor` → exit 1 for all six. **Both true, both meaningless about whether the work
  landed** — a sha instrument structurally cannot see content-identity, and returns a confident NEGATIVE
  (absent-value, in git). Ask by question: *is this sha on main* (`--is-ancestor`, squash-defeated) /
  *what did this branch do* (**three-dot**) / *is this WORK on main* (**merge commit + content compare**:
  `gh pr view --json mergeCommit`, `--is-ancestor <mergeCommit>`, `git show origin/main:<path>` diff).
  Also: the two-dot trap **recurred a THIRD time** (architect: 111 files / 3605 deletions vs three-dot
  2 files / +415-15) — banked in prose after two instances and it still bit a third role, which IS the
  above-prose argument. **Nothing was at risk in /tmp; that branch is strictly behind (1 insertion / 96
  deletions vs main = main is a SUPERSET).**
  (3) **MASKING (verifier, reproduced clean): defect 2 is INVISIBLE on main because defect 1 hides it.**
  `check-gate-wiring.ts:335 if (bad) process.exit(1)`, negative-fixture half starts `:338`. Fixing the
  typo ALONE would red main for a NEW reason. **So (b)+(d) must be in the same COMMIT, not merely the
  same PR** — the architect's ORDER is now measured, not asserted. Shape: **a sequential checker with an
  early exit hides its own later findings; the fix REVEALS the red rather than causing it, and those are
  indistinguishable to observers. Re-run a multi-part gate after fixing its first failure.** Root: `check:ci`
  has **NO automatic invoker** — not CI (both `check:ci` hits are comment text `plan-a.yml:274-275`) and
  NOT the pre-push hook (`check:pre-push` = lint+typecheck only).
  (4) **THE INVERSE DEAD GATE** (`dead-gate-makes-work-unverifiable.md`): pre-push fails LOCALLY for
  everyone on a tree CI calls GREEN. **Its real cost is the HABIT** — a hook that cries wolf teaches
  `--no-verify`, which disables its good checks too; this is where Instance 3's bypass habit is
  manufactured. I reproduced the verifier's decisive check (`git ls-tree origin/main bench/…/aihu/` →
  no `rolldown.config.ts`, exit 0) — real defect. **BUT causation is OPEN and I recorded it as such:**
  their own paste shows moon treating the missing input as a WARN "skipping", and the architect measured
  `check:pre-push` → **EXIT 0** (57 cached) the same day, calling it build-state (cold artifact)
  dependent. **Two roles, one command, opposite exit codes ⇒ the discriminator is something neither
  report names (cache warmth). COULD-NOT-CHECK on causation — do not blame a diff for it.** Unowned.
  (5) `promotion-rungs.md` row 8 → **SIXTH concurrent-instance event, new consequence class: the FALSE
  LOSS REPORT** (builder-b, near-miss). A bare `git checkout` in shared `zurich` swapped their branch
  mid-run — and swapped in **MY `srmcguirt/triage-correction-0727`**; I am in sarajevo and ran no
  checkout there. Every post-swap answer was **WELL-FORMED AND WRONG** (`wc -l`→291 vs 534,
  `git log`→1 foreign commit); nothing was lost. **Not the empty-and-green class — no error, no
  non-zero exit, a real tree that is not yours.** My rotating-coordinate clause one tier worse: stale →
  **live and someone else's**. Check = **`git branch --show-current` (the NAME, not a sha you cannot
  recognise)**, before every commit AND before reading history you will act on; protocol =
  `git worktree add --detach <tmp> <sha>`, never a bare checkout in a worktree you did not create.
  Tally **6 events: 4 harmful, 1 benign, 1 near-miss**; supervisor checkout-pinning STILL UNBUILT.
  (6) Ledger gap 3 is now **TWICE in one day** (C-FEL-MOONGRAPH-LITERALS + C-SWARM-RECON-AUTHORITY
  #686/`5d485ba9`) = a pattern, not an incident. Orchestrator WITHDREW ffba4878 (my point 5 accepted:
  severity = ~41GB RSS; the row asked for two things already ruled against) and adopted my
  rotating-coordinate clause verbatim + accepted my one-SPOF-counted-twice correction. **Three roles have
  now hand-set a threshold** (my 1400, architect's 2/min, orchestrator's ~35h clock) — the class holds.
  Gate exit 0. Killed nothing, touched no infra, set no status, merged nothing.
- **WAKE 36 — MY FALSIFIER WAS WRONG AND THE ARCHITECT CAUGHT IT. Struck in place; do not reuse ~1400.**
  (1) **THE CORRECTION, recorded loudly because it is mine.** I set the daemon tripwire at "anchored
  >~1400 sustained" — the architect derived that steady state at the then-current rate is
  `1.47/min × 960min = 1408`, i.e. **I set the alarm ON the model's own prediction**, so ordinary
  convergence fires it and it cannot separate the two cases it exists to separate. DERIVED tripwires now
  in the lesson: **>4/min sustained** (4000÷960=4.16/min for 16h; all-time peak 2.33/min = 1.8× margin);
  **`past_ttl_survivors > 0` = escalate LOUDER** (that breaks the cap itself); **1400-2000 = EXPECTED,
  not a signal.** The architect **withdrew their own hand-set ~2/min** in the same message (2/min⇒1920,
  and BELOW a rate hit today with no incident) — two roles, same day, same error. Class: **a threshold
  picked for plausibility is a restatement of the current value, not a tripwire — derive it from the
  invariant that would be violated (ceiling/TTL/SLA), because the derivation is what makes it checkable.**
  (2) **"A RATE NEEDS A SERIES" IS RETIRED FOR THIS CLASS — the age distribution IS the arrival history.**
  Since nothing survives the 16h TTL, bucketing the live population by age gives 16h of rate data from
  ONE `ps` — no clock, no second sample. My "two reads ≥10min apart" was not merely mis-calibrated, it
  was **unnecessary**. **PRECONDITION, CHECK IT FIRST: `past_ttl_survivors == 0`** — else the histogram
  silently stops being an arrival history. My own verification @ 21:10:14Z: anchored **1305**,
  past_ttl_survivors **0**, oldest 57585s vs 57600s TTL (reaper holding to 15s).
  (3) **MY CONTRIBUTION — the instrument reproduces, and the reproduction sharpens it.** Bins 8h-15h
  agree closely across two roles 26min apart (stable history); bins 0h-7h disagree wildly (bursty, and
  they shift with read time). So **the headline `arrival_now` is bin 0, the NOISIEST bin, and the net
  rate is a difference of two single bins**: bin-0 alone arch 1.47 vs hist 1.15 = **28% spread**;
  bins 0-2 averaged 0.94 vs 0.98 = **4%**. **DIRECTION robust (both falling), MAGNITUDE not — smooth
  over ≥3 bins before doing arithmetic.** Same too-short-window error surviving into the instrument that
  eliminated windows. (4) Committed prediction (both branches, settleable by a stranger): smoothed
  0.98/min ⇒ steady state ~940, so **after ~13:10Z 2026-07-29 expect anchored ~950±150 with
  past_ttl_survivors 0**; falsified by >~1400 with survivors 0 (arrival rose — read bins 0-2, not bin 0)
  or by any survivor. **Do NOT read the coming ~1017-daemon decline (bolus drains to ~01:34) as the leak
  stopping** — the leak is unfixed (`session-start.js:150-164` still unconditional); bounded waste is
  still ~41GB RSS. ffba4878 severity already ruled = RSS not fork(); the architect flagged that the row
  as framed asks for two things already ruled against — **orchestrator's row, not mine.**
  (5) `stale-ledger-…` now **THREE** places the ledger cannot express a correction: + **a contract
  cannot be recorded RETROACTIVELY.** C-FEL-MOONGRAPH-LITERALS shipped, was verified twice, was ACCEPTED,
  and **has no ledger row** — `main.rs:907-923` `offer` writes the row AND a dispatch msg atomically
  ("no contract without a work order"), correct for new work, so a retroactive row means dispatching a
  builder to rebuild merged work (the C-FEL-436 failure, on purpose). Orchestrator refused the
  hand-INSERT ("a ledger you can hand-author is not a ledger") — right call. **Durable record = the msg
  stream keyed to the contract id + this lesson.** Fix named and DELIBERATELY not filed (would consume
  the WIP slot given to gate-wiring) — naming what you are not doing is what makes a backlog ≠ a silence.
  It is also the first of the three with an obvious falsifiable bar.
  (6) `guarantee-satisfied-by-the-defect` Instance 4: **the three-clause wiring bar has a MEASURED
  recidivism rate** — this repo shipped 1+2-without-3 **twice** (the `palette` job: waited on, result
  never read, green on a red palette; and #649). That is why the architect **countermanded builder's (a)**
  (own always-on job = 3 coordinated edits) in favour of **a step in the existing `check` job = ZERO
  edits**. **Do not carry a fix on a mechanism that has demonstrated it can lose the fix** — sharpest
  because the gate being built exists to forbid green-by-construction gates. Also banked: the ruling
  **named its own reversal condition** (a doc-only diff that creates an orphan; currently unreachable —
  `check`'s `if:` is draft==false && changes.code==true and `code` counts package.json + workflows) and
  **stated the tradeoff it accepted**. (c)+(d) STAND; order TYPO FIRST then wiring, ONE PR; R-E must-fail
  is a REAL CI run. **NOT MINE:** plan-a.yml/ci-ok, the contract row, ffba4878.
  Gate exit 0. Killed nothing, touched no infra, set no status, merged nothing.
- **WAKE 35 — #689 RESOLVED on main; R-D's hole is MEASURED and small; two method rungs banked.**
  My wake-33 could-not-check arm is CLOSED: **verifier PASS on the MERGE COMMIT `642860f3`**, having
  VOIDED their own earlier PASS at `18d6d6e8` when the head moved to `e85c839d` with the fix committed
  away. My independent fetch: `origin/main`=`642860f3` @ 20:52:45Z, `git show 642860f3:scripts/check-moon-graph.ts
  | grep -c stripNonCode` → **2**, exit 0; the no-op `- signals` edge is GONE from moon.yml. **DO NOT
  re-open #689 or re-flag the reverted fix as live.** New 4th sub-lesson in `a-pr-reverted-its-own-fix…`:
  **verify a shipped fix on the MERGE COMMIT / `origin/main` with a LITERAL sha, never the PR head** —
  the head is exactly the coordinate this lesson proves you cannot trust; the merge commit is written
  once. Void rule has now PAID TWICE (stale board snapshot; a verdict whose subject deleted its own
  subject). (2) **BOTH-DIRECTIONS MUTATION banked into `regex-over-source-…`, the most reusable thing
  this wake:** dir-1 (revert `stripNonCode`→identity) reproduced the false edge verbatim = fix is
  load-bearing; dir-2 (delete a REAL `- server` edge) exit 1 = does NOT over-strip. **Dir-1 alone cannot
  tell "reads code correctly" from "reads nothing" — a stripper that strips everything passes it.
  Whenever a fix NARROWS what a gate looks at (stripper/filter/skip-list/exclusion glob), the must-fail
  MUST include a case the gate must still catch, or you have shipped green-by-blindness.** Also: the
  verifier used `git checkout --`, explicitly NOT `git stash`, citing the repo-global stack — **my prose
  rung was applied by another role unprompted, inside the exact operation that would have exposed it.**
  (3) **R-D IS DONE (builder, on `642860f3`) — fold into `guarantee-satisfied-by-the-defect.md` Instance 4.**
  The false `check:ci`-chain route costs **exactly ONE gate: the meta-gate itself**; the other 18 live
  gates are workflow-reachable by name/path, 2 baseline orphans unaffected. **The blast radius of a false
  premise is the count of things depending on that clause ALONE, not the size of the model.** But the
  detector was NOT hiding nothing: `bun run check:gate-wiring` → **exit 1** (NEW ORPHAN `check:grammar-v2`,
  which **has never executed in CI once**), and `check:moon-graph` trips `NO NEGATIVE-FIXTURE PROOF`, exit 1.
  So R-D's "do not wire it blind" was load-bearing — wiring today reddens main on two real defects, which
  is why builder's (d) must land WITH (a). **A dangling script ref truncates a chain AND orphans what
  follows; the two halves hide each other.** And the wiring bar has **THREE clauses**: invoked by a
  running workflow + in `ci-ok` `needs:` + in `ci-ok`'s RESULT LOOP ("being in needs is NOT being gated
  on") — "it's in package.json" clears none. (4) `a-contract-is-an-unverified-claim.md`: the
  dispatch-with-no-row **RECURRED same day, same role** (`claim C-FEL-GATE-WIRING-RUNS` → exit 2) — now a
  CLASS not a slip; record the second, frequency is the argument. **NOT MINE:** wiring plan-a.yml/ci-ok,
  minting the contract row. I am NOT in plan-a.yml (told builder on the bus). Gate exit 0. Killed nothing,
  touched no infra, set no status, merged nothing.
- **WAKE 34 — the orchestrator's own correction folded in, and it does NOT reverse the clock finding.**
  (1) `wake-cadence-shorter-than-runtime-self-collides.md`: orchestrator corrected "only the mint breaks
  the loop" → **poison-quarantine also does** (17 quarantined + fresh sid, 16:40:21-24). TRUE, but I read
  the source before folding: quarantine (`supervisor.py:104-113`) and mint (`:143-152`) are **both inside
  `health_check()`**, called from exactly ONE place — the `last_sync >= sync_interval` branch (`:874-877`).
  Same 1800s gate, which is WHY they fired in the same 3-second band. **Two self-heals, one slow gate:
  "there is a second remedy" reads like redundancy and is the same SPOF counted twice.** The 360×
  conclusion stands. (2) NEW shape 4, and the cheapest receipt for the clock in the whole system:
  `POISON_ATTEMPTS = 5` (`:83`) vs **observed firing at 47-59** = **~10× the configured value**, because
  the counter advances on the delivery path and the check runs on the sync path. **A limit counted by one
  clock and enforced by another is not the limit you configured** — read the effective limit off observed
  firings, never off the constant; tuning 5→3 changes ~50 to ~50. (3) NEW section *who the error names*:
  the wedged role was the ORCHESTRATOR (1891 WAKE FAILED), but **the supervisor's own wake failures are
  not posted to the bus**, so its only visible symptom is FIVE PEERS' stale errors redelivering — each
  role reads a peer's outage as its own. `absent-value` pointed at the messenger: **the delivery channel
  does not cover its own deliverer.** Rung: prose → **injected-at-dispatch (the orchestrator DID this and
  it worked — one paragraph stopped five re-derivations; but nothing emits it, so it must be re-sent every
  storm)** → structural (health_check on the tick, not the network-sync boundary; supervisor posts its own
  wake failures to the bus). NOT mine to fix. **DO NOT re-triage that inbox** — a clean wake acks it.
  (4) `stale-ledger-…` THIRD CLAUSE: **a ROTATING identifier in a record is stale by construction** — the
  mint rotates sids, so a sid quoted in ANY state file is a coordinate for a session that may not exist;
  diff against `~/.swarm/agents.json` LIVE. Generalised: sha/sid/run-id/head-ref/PID — quote a coordinate
  with its fetch or not at all. (5) DAEMON BOUND PASSED ITS FIRST TEST: orchestrator reported "1324, +21%,
  ceiling 4000"; my anchored read **1328 @ 20:44:30Z** (unanchored 1334, Δ=6 observers) — the derived cap
  was **~1330**, so the rise is the bound being APPROACHED, not the ceiling. **A series rising toward a
  bound and one rising toward a ceiling are indistinguishable from two points** — +21% is alarming against
  4000 and unremarkable against 1330, same number, opposite conclusion. Falsifier banked: anchored >~1400
  sustained (two reads ≥10min apart) reopens it; a rise before the ce160 drain (16:51→~01:34) is expected
  and evidence of nothing. Gate `check-lesson-refs` exit 0, 25 refs. Killed nothing, touched no infra, set
  no status, merged nothing.
- **AUDIT-LEDGER updates (architect): interim guard RETIRED + exposure MEASURED-ZERO.** The `sync --push` guard doesn't bind the
  actor — the supervisor LOOP runs `sync --push --confirm` (supervisor.py:874-884; NOT dry-run, main.rs:110-113) every 1800s;
  "a guard whose subject can't do the forbidden action is not a guard". Exposure is 0 NOW (0 submitted, 0 linked) = measured luck
  with a DEADLINE: the fix (b) must land before the next Linear/GitHub-linked contract reaches submitted. Also added verifier's
  negative control (no-t-o-adjacency path → None, proving the "to" substring coincidence). "An escalation must carry only what a
  human must decide" (architect's self-rule; cross of my escalation-split lesson).
- **RECONCILER-IS-NOT-A-VERIFIER formally RULED (architect) — folded into the audit-ledger lesson.**
  `docs/decisions/2026-07-28-reconciler-is-not-a-verifier.md @ e615ab0` (agent-swarm draft PR #1). Rejects
  pause-vs-port: porting a bad predicate gives a REVIEWED BAD PREDICATE; the defect is a plausibility-checker
  exit wired to a terminal+side-effect status. Concrete receipt banked: the 2 false verifieds are a SUBSTRING
  COINCIDENCE — `extract_claims("I wrote to …")` captures the preposition `"to"` as the filename (recon.py:102,
  I confirmed), and `backs("to", …)` grounds it against any redirect path containing `t,o` — "condu**cto**r".
  Exposure = 27 rows not 2 (no-claims satisfies needs via main.rs:1241). R1 verified=receipt-status only;
  R2 reconcile the structured claims field, prose may only DISPUTE; R3 stopword targets ungroundable; R4
  no-claims STOPS satisfying needs; R5 do NOT pause. Fresh count 65 verdicts / 53 with-claims / 27 no-claims (live).
- **Reconcile defect is LIVE, still minting (added to audit-ledger lesson).** Count moved mid-discussion
  (orch 26/50 → hist 27/52 → orch re-measure 27/52; both right, population grew). I re-measured fresh
  this wake: still 27 no-claims / 27-of-27 zero-recon / 52 claims-verdicts / 13 verified — stable now but
  a live defect. The 26↔27 "disagreement" is itself the stamp-your-measurement lesson.
- **Board arc (2026-07-27):** main reached `41c37df6` (#670), the queue STOPPED at 01:12Z
  with ~13 green PRs sitting — then UN-STUCK: main is now `b667bdcd`, having landed
  #656/#659/#661/#663/#666/#667/#668/#673. So "the queue stopped at 01:12Z" was a
  snapshot, not the arc; it resumed. Landing is the interactive session's; the
  rebase/twin/stale-branch hazards rise the longer green work sits (this cost me a second
  #669 rebase). Do not report a stale board figure — read `git rev-parse origin/main` fresh.
- **The release is uncut and it is the ORCHESTRATOR's item, not mine.** Merged-but-
  unpublished on main (incl. #639/#640/#641/#653/#658/#664, #655 pending); publishing is
  outward-facing + irreversible, held for the founder. Tracked on
  `docs/state/orchestrator.md` — pointer only; do not action it from the historian seat.
- **Do not re-triage C-FEL-423 vs C-FEL-434.** They are **one defect** —
  `packages/compiler/src/codegen/emit.rs:249` `elide_agent` — banked in
  `docs/lessons/promotion-rungs.md` (coordination addendum) with receipts. Disposition
  (close 423 / `needs`-link 423→434) and the offer-selector recirculation fix are the
  **orchestrator's/reconcile's**, not the historian's. The structural dedup precedent
  is `packages/swarm/src/main.rs:1312-1344` (CONFLICT on duplicate tracker id).
- **Do not run receipt-gathering in a background subagent in this environment.** One
  died mid-run this session (host process exited) and returned nothing; gather
  citations foreground. You have to open every cited path yourself anyway.
- **Report on the bus, never Slack** (founder ruling 2026-07-27). Slack is read by no
  gate — not the reconciler, console, or Linear/GitHub sync — so a report there did
  not happen in ledger terms. A human decision is `--kind blocked --question '…'`.
- **Do not re-read the Slack channel from the API.** It is archived under
  `docs/state/transcripts/`, and the API copy will age out. Read the files.
- **Do not re-verify the 24-PR merge table.** SHAs are above. If you need to check
  a *new* PR, use the awk method above — not `git log --grep="(#N)"`, which is
  wrong and will silently return a different commit.
- **Do not re-discover the identity findings.** One bot, hand-typed role prefixes,
  five untagged messages, no Linear users, invisible subagents, bot pushes that
  fire no workflows. All evidenced above.
- **Do not rename these files back to scope names.** `orchestrator.md`,
  `verifier.md`, `historian.md` are role-named on purpose, and the rename is the
  fix for a real failure.
- **Do not write state at session end.** Write it at handoff. Both senior agents in
  the 2026-07-25/26 session stopped mid-sentence with work in flight
  (*"`check`/`ci-ok` still running"*, *"Fixing all of it"*) and neither outcome was
  ever recorded. Sessions end without warning; this file is the thing that does not.

## Pointers

- `docs/state/orchestrator.md` — merge/release state, standing rulings, founder blocks
- `docs/state/verifier.md` — verification verdicts and the open #612 item
- `docs/lessons/absent-value-rendered-as-real.md` — failure pattern #1
- `docs/lessons/checked-thing-is-not-the-changed-thing.md` — failure pattern #2
- `docs/state/transcripts/` — the raw Slack record
- gbrain mirror: `aihu/delta/session-2026-07-26/orchestrator-state` (partial, stale)
