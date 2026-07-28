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
- **Triage-queue product-mix: SCOPE declined, ROUTING still the founder's.** The 13
  non-aihu contracts (exegesis/lexicon/commentary/Stripe) were **declined** by the
  orchestrator (offered 133→118, non-destructive: decline = `NoOp` in Linear sync). The
  SCOPE call an agent can make; the ROUTING (where they go) stays in DECIDE on
  `C-FEL-433`. Do NOT bank a keyword skip-rule. `triage-queue-mixed-products.md` updated;
  promote to a structural product-filter only once Shane rules the routing.
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
