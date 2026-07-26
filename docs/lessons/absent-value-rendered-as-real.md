# AN ABSENT VALUE RENDERED AS REAL, FAILING QUIETLY — the pattern behind nearly every defect found on 2026-07-25/26

**Topic:** cross-cutting (bench, release, compiler, CI, docs, agent coordination)
**Session:** 2026-07-25 / 2026-07-26 (the ~20-hour swarm session)
**Category:** measurement-integrity, ci-lint, release-engineering, observability
**Severity:** critical — it is the single most common defect shape in this repo,
recurring **8+ times in one day across unrelated subsystems**
**Status:** named, registered, NOT mechanically prevented

## The shape

> Something that does not exist is rendered as a value. The value is
> well-formed, plausible, and often *flattering*. Nothing errors. The check
> passes. The number gets published.

The failure is never a crash. It is **a zero, an empty string, a default, a
fallback, a skip, or a silence that the surrounding machinery formats as a
result.** A crash would have been a gift.

The general rule this generates:

**An absence must be loud. If your code can produce a value from nothing, it will,
and someone will publish it.**

## Instances — 2026-07-25/26

Each row is a real occurrence with its receipt. They are in different subsystems,
written by different people, months apart. That is the point.

| # | The absence | What it rendered as | Receipt |
|---|---|---|---|
| 1 | A dead binding, doing no work | **`28.63 ns`** published as the `update-1-of-10k-leaves` benchmark result | Real measurement is `252.83 ns`. *"There was never drift to attribute — only the difference between measuring a no-op and measuring the code."* Resolved in #607 (`6e0fbc8e`) |
| 2 | An unbuilt `dist/` | **`"bytes": -1` on all 108 rows** of `scripts/__bundle-sizes.json`, **48 `_no dist_` cells** across README + 17 package READMEs — and `sync-readme --check` **EXIT 0, GREEN** | Green *because* the version step corrupted the README **and** the cache in the same pass, so they agreed. Fixed in #591 (`24c08c33`) |
| 3 | Agent metadata elided from client builds **by design** | **84-byte `dist/llms.txt`** (a title and a tagline, zero tools) and `dist/.well-known/mcp.json` with `tools listed: 0` — for the template whose tagline is *"agent-callable by default"* | `packages/compiler/src/codegen/emit.rs:206` — `let elide_agent = target == BuildTarget::Client && is_agent_component;`. Three tools genuinely exist. **Still open — FEL-423** |
| 4 | A package missing from the hand-maintained `PKGS` array | **A green release job and a 404 on npm** | `scripts/publish-all.sh`. Recurrence #8; see `publish-all-pkgs-array-gap.md`. Fixed in #585/#586/#588 |
| 5 | An **empty framework list** | js-framework-benchmark reporting **all `0.00 ms`, still green** — twice, historically | *"One workflow step from a real third-party number."* Fixed in #573 (`b26a4854`) |
| 6 | A route that was never prerendered | **SPA fallback served at HTTP 200** — nine endpoints | A 200 is indistinguishable from a real page to any check that only looks at status |
| 7 | An unset `ROLE`/identity variable | **Another agent's identity** | The Slack bot posts under one username for the whole swarm; role is a hand-typed `[prefix]` in the body |
| 8 | A `git log` run against the wrong path | **"no such change"** | Absence of output read as evidence of absence. **This one is really the mirror** — the change *was* on `main`; see "THE MIRROR IMAGE" below, where it is filed properly |
| 9 | A gate that is **never invoked** | `check-samples` reporting **`0 passed, 0 failed`, EXIT 0**, with 11 fences still physically in the files | `git grep -n "check-samples"` → exactly 2 hits, **both inside the script's own header comment**. Re-confirmed 2026-07-26. **Still open** |
| 10 | A matrix cell that **cannot run** | **Permanently GREEN**, after #613 changed it from permanently RED | `templates-cf-team` is the only `kind:"app-template"` cell. *"Trading a false negative you can see for one you cannot is not obviously the win the PR describes."* **Still open** |
| 11 | `${PIPESTATUS}` in **zsh** (it is a bash builtin) | **A blank exit code**, readable as success | Caught by the verifier mid-run; re-ran clean |
| 12 | A fetch that **404'd**, returning 14 bytes | A `grep` for a term would have **"confirmed" its absence off an empty file** | Verifier asserted the manifest was real (Node 22.23.1, Python, Ruby) *before* grepping it |
| 13 | A dead Slack socket listener | **Silence, indistinguishable from a quiet channel** | `if (attempt >= 5) { emit('FATAL … DEAD'); process.exit(1) }`, 30s backoff cap → ~2 min of network loss killed it permanently. Cost a **2h56m hole** in the session record |
| 14 | A **truncated** Slack export | **A complete-looking channel history** | One page returned; only the trailing `pagination_info` cursor revealed a second page existed. Found 2026-07-26 by the historian |
| 15 | An unassigned issue tracker | **13 open issues showing no owner, 3 of them already done** | *"Tracker was lying."* All real allocation lived in a chat channel |
| 16 | A test asserting a substring that a **60-byte broken file also contains** | A **green test written over the exact defect being reported** | `expect(llms).toContain("# my-app")`. Self-reported by its author |
| 17 | A test asserting the **absence** of a section | **The broken output blessed as correct, green forever** | *"omits the Components section when the registry is empty"* — encoding the absence certifies the bug |
| 18 | A failure mode that **had been compiled out of existence** | A **green** SSR/hydrate parity test, sitting across the exact regression it was named for | `tests/integration/ssr-string-hydrate-parity.test.ts:107` asserts `expect(host.innerHTML).toBe(before)`. It *"passed unchanged — and that was a green light proving nothing, because it never covered `html={}`. Before the fix the SSR miss was guaranteed, so **a mismatch wasn't even expressible.**"* → *"It did not merely prove nothing; **it was actively reassuring.**"* **This is the day's stated thesis: *a test that cannot fail is the through-line of this entire day.*** |
| 19 | An assertion that was **inexpressible**, not merely absent | #546 shipping a 1994-move regression through a green suite | `structural.test.ts` T11 pinned only the stable-reference path, so *"the move count was never expressible as a failure. #546 could not have been caught by the suite that existed."* **Not an absent test — an inexpressible assertion.** |
| 20 | A job with **zero successful runs** | Sampled as **missing data** (`bench-arbor n=0`) rather than as a failure | Across the last 25 `plan-a.yml` runs: `bench n=1`, `bench-lsp n=2`, `bench-arbor n=0 — no SUCCESSFUL runs to sample`. *"It has no successful runs **because it is currently failing**."* Wall time had to be read off a *failing* run (~4.5 min) |
| 21 | Nine version bumps that **never published** | `publish-packages: "already published — skipping"` | `@aihu/compiler-darwin-arm64` published `0.1.28` / repo `0.1.36`. *"Every bump since 0.1.27 is stranded in-repo."* `check:compiler-binary-bump` *"verifies the manifests moved, **never that the package carrying the pins can still publish.**"* Downstream symptom: a build without `AIHU_COMPILE_BIN` rejects correct source with retired `C306` |
| 22 | A workflow that **never builds** | `sync-readme` running in write mode against a tree with no `dist/`, committing 48 `_no dist_` rows every release | `release-pr.yml`'s only install is `bun install --frozen-lockfile`; *"**it NEVER builds**"*. Its own comment reads *"Without this, every Release-PR ships drift that downstream CI's sync-readme --check would flag."* — *"**It was added to prevent drift and is the entire cause of it.**"* |
| 23 | A `bash` monitor polling for MCP-delivered messages | **Silence forever, reading exactly like "no messages"** | *"MCP tools are only callable by the model during a turn, so such a monitor produces silence forever… **I lost time to that.**"* Working mechanism is a `Stop` hook with `asyncRewake: true` |
| 24 | Two poller filters each dropping **100%** of traffic | An empty channel | Slack bot messages carry `subtype: "bot_message"`, so *"filtering on 'no subtype' drops every agent post"*; and a shared cursor lets whichever session polls first advance it past the other's messages |
| 25 | An **unset** `AIHU_SLACK_ROLE` | **Another agent's identity**, and an inverted message filter for an entire session | `ROLE = os.environ.get("AIHU_SLACK_ROLE", "merge-train")`. Unset in the peer's session, so *"my filter has been inverted all session — it discards **your** posts as my own echoes and surfaces **my** posts as new peer messages."* Three messages (a STOP, a work split, a design correction) went unread *"until Shane asked whether I had checked Slack."* **The lesson, verbatim: *a default that is correct for exactly one caller is not a default, it is a landmine.*** Fixed by removing the default entirely: env → session-keyed file → **REFUSE** |
| 26 | An **empty** Slack message | A present, real message in the record | `merge-train:  [2026-07-25 13:06:15 EDT]` — no body, no role prefix, never referenced. Preserved in `docs/state/transcripts/` |
| 27 | A token authorised at the layer you touch, **unauthorised at the layer it depends on** | A Pages domain move that succeeded, then served **522 for six minutes with no way to repair it** | `status: pending`, `verification_data: { "error_message": "CNAME record not set" }`. Token had `pages (write)` but only `zone (read)`, so reading the DNS record returned `Authentication error (10000)` — *"I could create the broken state but not repair it."* **Moving a Pages custom domain does not move its DNS record.** |
| 28 | **An unmerged branch** — "committed" | **"on `main`"**, in two Notion pages and an orchestrator brief, with a correct and verified instance count attached | *This document.* On 2026-07-26 these three lesson files were written, committed, and cited **by repo path** as established doctrine. They were not on `main`. `git ls-tree -r --name-only origin/main -- docs/lessons/` returned neither file; `gh pr list --head srmcguirt/historian-state-files` returned `[]`. Every citation resolved to nothing for anyone not standing in one specific worktree, and **nothing errored** — the citation was well-formed, the count was right, the path was plausible. Caught by the incoming orchestrator, who re-derived three claims from the handoff page instead of trusting it. **`git commit` is not `git push` is not `on main`.** Now asked by `scripts/check-lesson-refs.sh` |
| 29 | A lesson that was **never written** | **"Now a promoted lesson"**, hedged with *"if it exists"* | `docs/retros/aihu-v1-framework-2026-05-22.md:75` cites `docs/lessons/builder-uuid-hallucination.md`. `git log --all --diff-filter=A --` on that path is **empty — it has never existed on any ref**, for over two months. The hedge is the sharp part: *"if it exists"* makes the claim **unfalsifiable**, so a reader cannot distinguish a missing file from a deliberate maybe. Found by `check-lesson-refs.sh` **on its first run**, in a file nobody was looking at — the same way #610's R0 liveness gate caught a fourth dead cell on *its* first run |
| 30 | An **unresolvable filter** | *"(no issues matched — team=FEL project=doesnotexist)"* followed by **"This is a real empty result, not a failure: the query succeeded."** — exit **0** | The swarm tool on #618, found by the verifier under FEL-430. `cmdTasks` builds `project:{name:{eq:"<raw string>"}}` and never resolves the name; Linear matches nothing and returns 200. A typo'd project and a genuine no-match are **byte-identical in shape, exit code, and reassurance.** Same shape in `cmdRecall`: Notion `/search` returns **200 with `results: []`** both when nothing matches and when the integration was granted access to nothing — the documented incident, reproduced by the tool written to embody the doctrine against it |
| 31 | A scaffold that **cannot do anything** | `aihu app --template cf-team` **exit 0** | Verifier, post-#616. `bun run dev` / `typecheck` / `build` → **exit 1, `app::missing_workspace`, all three.** The template ships `moon.yml.tmpl` (a *project* config) and **no `.moon/` workspace folder**, while every script routes through moon. The scaffold succeeds and everything you can do with it fails. Arc: RED (nobody looked) → GREEN-because-skipped (nobody *could* look) → **RED for the real reason.** A skip hid a *defect*, not merely a gap. Filed **FEL-431** (raised to P1) — and *also* as FEL-432 by a second agent an hour later, because both verified it independently and neither claim was in the tracker. **FEL-432 cancelled.** See the coordination protocol in `docs/state/orchestrator.md`: a claim is not a claim until it is in Linear |
| 32 | A **deleted** call site | Every test still green — unit tests *and* the served-bytes test | Builder, FEL-426: the sanitiser's own tests and the end-to-end test both passed with the loader call removed. **Present is not wired.** Fixed by adding trust-boundary tests that go red when the call is deleted — proven, not assumed |
| 33 | A **removed** item | The row simply vanishes; the lane stays green | *Promoted to its own shape — see `derive-from-disk-cannot-detect-removal.md`.* Builder: derive-from-disk coverage **cannot detect deletion**. Removing an example made its row disappear and the gate passed. A committed floor (`governed-roster.json`) is what makes a removal a visible line deletion |
| 34 | A **per-item** no-op | A global counter that passes | FEL-428: `hacker-news` declared `compile+smoke`, had no smoke suite, printed *"compile-only (no smoke suite…)"* and ran nothing — while the vacuity guard at `:139` worked correctly, because it is a **global** counter and eight passing neighbours masked the one no-op. **A guard at the wrong granularity reads as protection while providing none** |
| 35 | A function that **does not exist** | A documented API, **published to the docs site** | Builder-b, FEL-391: `collectSetupShape` is named in 3 Linear comments, the design doc, and `store/src/types.ts:91`. `git grep` finds **comments only, never a declaration** — the real function is `instantiateSetup`. `gen-api.ts` lifts that comment verbatim, so **the phantom shipped to the public docs.** A name repeated often enough acquires the appearance of a referent |
| 36 | The **only** layer that tests the actual defect | **26/27 green** | Builder's own suite, disclosed up front: the served-bytes layer — the one exercising the SSR emitter, i.e. the only one that can see the #572 defect — is `it.skipIf(!COMPILER)`. On a checkout without `target/release/aihu-compile` it **silently skips** and the run reads as a pass. It hard-fails only when `CI` is set. *"If you see 26 passed, the layer you were asked to check did not run."* Built deliberately for local ergonomics, and still the same shape |
| 37 | A **mutation that never applied** | **"0 tests red"** — read as *"these tests are unfalsifiable"* | The verifier's own mutation harness (#619): a `perl` substitution **silently did not match**, the file was unchanged, and the run reported zero red. One keystroke from being recorded as a finding about builder's suite. Caught only by printing the mutated line and seeing it identical; redone with an asserted anchor (`assert old in s`). **The pattern, aimed at the instrument built to hunt the pattern, mid-hunt** |
| 38 | A **parser that is not there** | Four tests passing, asserting malformed markup *"degrades to text"* | #619 tests 17–20 stayed green under **all ten** mutations including one that **disabled tag recognition completely** — because "degrades to text" is equally true when *nothing is parsed at all*. They cannot distinguish a working parser from an absent one. Weak rather than lying, but invisible to a green run either way. Fix: assert the parsed **structure**, not that the payload appears as text |
| 39 | The **28th** test | Guidance to expect **27** | Builder disclosed the `skipIf(!COMPILER)` trap honestly and still miscounted their own suite: *"want 27, not 26."* There are 28. `binary absent, no CI → 27 passed, 1 skipped, exit 0` — so someone following the correction lands on **exactly the false pass it was written to prevent.** A disclosed trap plus an off-by-one is still a trap |

| 40 | A **decided** ruling | Reported as **"still needs a human decision"** — three times in one message | The historian's own status report. The coverage-floor ruling had been made ~40 min earlier *on FEL-426*; FEL-431/432 had already been deduped. I read the *channel*, which had scrolled, instead of the *tracker*, which had the answer — while having written "check the artifact, not the channel" into the mirror section below that same day. The rule adopted from it: **the channel is a notification, not a source of truth** |
| 41 | A **priority escalation** | Applied to the **cancelled** duplicate | Verified 2026-07-26, after the dedup: `FEL-432  P1  Canceled` / `FEL-431  P2  Backlog`. The surviving issue is **P2**; the **P1 is on the issue that no longer exists.** Anyone triaging by priority sees a P1 that is cancelled and a live issue ranked below it — **the escalation evaporated into the tombstone.** Merging duplicates moves the *state*; it does not move the *priority* |

| 42 | Three tokens the census **could not classify** | Dropped into a "NO MAPPING" bucket and **excluded from the drift count**, yielding **8 of 30** | The real figure is **11 of 38**. Builder's first checker→`packs.ts` map left `info-fg`/`success-fg`/`warning-fg` unmapped; completing it moved all three from *unmapped* to *drifted*. Self-reported, inside the task about this pattern. **The number to watch is the unmapped bucket, not the drift count — a census is only trustworthy once "didn't classify" is zero.** And a wrong denominator (30 vs 38) hides in exactly the same place |

| 43 | A green obtained **before the gate existed** | Still displayed as **green**, under a contract it was never tested against | #621 was cut from `bc1c4eac` and went green there. #620 then added `lesson-refs` to `ci-ok`'s `needs`. *"Its old green did not mean what it looked like it meant."* Caught by builder-b, who rebased and re-ran rather than trusting the tick: `lesson-refs pass 7s` — **a gate that did not exist when the PR first went green.** GitHub renders both states identically. **After a required check is added, every open PR's existing green is stale evidence** |
| 44 | A draft PR where **every job skipped** | A check list with **no red in it** | #622: `plan-a.yml:28` skips CI on drafts by design. *"An all-skipping check list renders as an absence of red, and nothing has run in CI at all."* Its only evidence was local. **"No red" and "verified" look identical in that UI** — and a skip is not a pass, which is the same ruling already standing for the scaffold-matrix cell |

| 45 | An action that **never happened** | Reported as done, **carrying a real, resolvable issue ID about the real topic** — *full write-up in `guarantee-satisfied-by-the-defect.md`* | Builder wrote *"I filed it as FEL-435 myself rather than routing intake through you."* **No Linear call was ever made** — the orchestrator had done intake. `FEL-435` is real, is about `check_contrast.py`, and was created at `2026-07-26T20:42:29Z`. **Every property except "I did it" checks out**, so verifying the citation *confirms the wrong proposition.* Self-reported; nothing else caught it. See the section below |

| 46 | A PR that got **no CI at all** | **`MERGEABLE / CLEAN`**, rendered identically to a fully-tested PR | `gh pr view 625` → `CLEAN`; `gh api .../check-runs --jq .total_count` → **0**. `plan-a.yml` is `pull_request: branches: [main]`, so **a PR targeting a non-main branch is never checked.** `mergeStateStatus` describes *blocking*, not *coverage*: with zero checks, nothing can block. Merged on that signal by the orchestrator **30 minutes after publicly naming the fourth variant of this**. Verified here: `plan-a.yml`, `scaffold-matrix.yml`, `storybook.yml`, `visual.yml` are **all** `branches: [main]` — **stacked PRs get zero gate coverage** |
| 47 | A verification the style guide **mandates** | Never run by anything | `grep -rn check_contrast .github/ package.json scripts/` → **empty**. Every reference is prose — a changeset, a plan doc, `style-lock.md` itself. The lock mandates *"re-run `check_contrast.py` with the new token, don't eyeball it"* and **no gate has ever performed that.** *A mandated verification nothing runs cannot fail.* Found by builder while fixing the checker's *contents* — the outermost layer on that track |

## THE FIVE WAYS A GREEN LIED, IN ONE DAY

Collected because the count is the argument. Each was found separately, in a
different mechanism, and each renders in the UI exactly like a passing build:

| # | the green | what was actually true |
|---|---|---|
| 1 | gate **measuring nothing** | `0 passed, 0 failed`, exit 0 — FEL-428, green-by-construction |
| 2 | gate **green-because-skipped** | the cf-team cell could not run; a skip counted as not-a-failure |
| 3 | green **predating the gate** | #621 went green before `lesson-refs` joined `ci-ok`'s `needs` |
| 4 | **all jobs skipped** on a draft | an all-skipping check list reads as an absence of red |
| 5 | **no checks at all** | a non-`main`-targeting PR reports `CLEAN` with `total_count: 0` |

**Only #1 is a broken gate.** Two through five are *correct machinery* reported
through a UI that cannot distinguish "passed" from "did not run." That is the
common root, and it is not fixable by making gates better.

> **`CLEAN`, green ticks, and an absence of red are all claims about BLOCKING.
> None of them is a claim about COVERAGE.**

The check that separates them is one line and nothing in this repo ran it before
today:

```bash
gh api repos/:owner/:repo/commits/<sha>/check-runs --jq .total_count   # must be > 0
```

**And the trigger scope documents the property it does not have.** `plan-a.yml:17`
reads *"the workflow must trigger on EVERY PR so the always-on `ci-ok` job reports
a required status"* — three lines under `branches: [main]`. A stacked PR gets no
`ci-ok`, and the comment tells the reader the opposite. Same shape as the
`changes.code` doc-only-skip comment describing behaviour that never happens.

## Not in this file: when something TRUE does the concealing

Every row above is an **absence** rendered as a value. Two findings from the same
session are the inverse — the reassuring artifact is **genuine**, and its reality
is the camouflage:

- a coverage floor that truthfully said `html: covered ✓`, whose sole satisfier
  was a live stored-XSS;
- a claim *"I filed FEL-435"* carrying a **real** ID, for the real topic.

They do not fail a check; **they pass the wrong one**. Filed together in
**`guarantee-satisfied-by-the-defect.md`** rather than here, because scepticism
aimed at "is this value real?" does not catch them — the value *is* real.

## THE MIRROR IMAGE: a PRESENT value rendered as ABSENT

Named 2026-07-26 by the verifier, against their own instrument. Everything above
is an absence dressed as data. This is the same root cause pointed the other way,
and it is **just as expensive** — because the natural response to a false absence
is to **go and fix something that is not broken**, or to dismiss a real finding.

The root cause is identical: **an instrument that cannot distinguish two states**
and reports one of them confidently. Only the direction, and the cost, differ.

| the thing | the instrument said | what it really was |
|---|---|---|
| A 3371-char note, written correctly, all five markers present | **"the swarm write path silently dropped a 3.3 kB note"** — a blocking regression against a just-certified tool | Linear's `comments(last:1)` **does not reliably return the newest comment.** With `last:6` the four comments come back ascending (18:11, 18:11, 19:34, 20:07=mine); with `last:1` it returned the **oldest**. Connection ordering is not `createdAt`, so `last:N` slices some other order |
| 21 `.aihu` files in `cookbook/` | **"cookbook .aihu files: 0"** | A bad glob — `cookbook/**/*.aihu` does not match flat files in a git pathspec. The verifier caught it only because an MCP tool returned real cookbook source while the count said the directory was empty |
| A verification that had been done, thoroughly | **"#612 CLAIMED, NEVER VERIFIED"** | The historian's own seed of `docs/state/verifier.md`, inferred from a Slack channel that had scrolled. The work existed and was sharper than the claim being tracked. **Reading the record is not reading the work** |
| A commit that was on `main` | **"the fix is not on main"** | `git log` run against the wrong path (`packages/runtime/...` instead of `arbor`). Empty output read as evidence of absence |
| A real finding by a peer | **about to be corrected as mistaken** | A grep of the shared primary checkout found 3 hits including a live call site; the checkout was on the *other agent's branch*. On `main` there is exactly one hit. Caught with one `git branch --show-current` |

### Why the mirror is arguably worse

- **An absence-as-presence flatters you.** You ship, and the bill arrives later.
- **A presence-as-absence alarms you.** You act *immediately* — you file the
  blocking regression, you "fix" the healthy system, you tell a colleague they
  are wrong. The response is fast, confident, and aimed at the wrong target.

The verifier was *thirty seconds* from filing a blocking regression against #618
on the strength of one. The orchestrator was one sentence from telling docs-next
they were mistaken, off a stale checkout.

### The rule

> **Before believing an instrument that reports nothing, prove it can see
> something.**

Concretely, the same shape every time:

- **Read back by CONTENT, never by position.** `comments(last:20)` filtered for a
  marker string you know you wrote — not `last:1`. Two earlier read-backs on
  FEL-430 and FEL-428 returned the right comment *by luck*, because that agent
  happened to be the most recent writer at that instant; the notes were real, the
  method that confirmed them was not.
- **Before concluding "not found", run the query against something you know is
  there.** A glob that returns 0 and a glob that is wrong look identical.
- **Before concluding "never done", check the artifact, not the channel.**
- **Before concluding a peer is wrong from a shared checkout,**
  `git branch --show-current`.

The verifier's own framing, kept: *a verification instrument that is right most of
the time for the wrong reason, and whose failure mode is to report a healthy
system as broken.*

## The refinement that matters most: an assertion of validity forecloses the second look

Instance 30 is the worst form of this pattern found so far, and it is worth
separating from the rest.

Every other instance here is an absence that *renders as* a plausible value.
Instance 30 goes further: the tool **states that the empty result is
trustworthy** — *"This is a real empty result, not a failure: the query
succeeded."* That sentence is true of the GraphQL call and false as an assurance
about the filter.

> **Silence invites a second look. An assertion of validity forecloses it.**
>
> Or, sharper: **a silent empty is a gap; a confident empty is a lie with a
> receipt.**

So when you write the reassuring branch of an instrument, the bar is higher than
"do not lie." You must be able to prove the reassurance, or not offer it. If a
tool cannot distinguish *"your query was valid and matched nothing"* from *"your
query was meaningless,"* it must say the weaker thing — or resolve the filter and
`die()`, which is what the fix costs: one extra query.

The verifier's framing, kept verbatim: *it does not merely return
empty-and-green, it affirmatively asserts the empty is trustworthy.*

## The instrument for this pattern: ask whether the thing is *reachable*

Instances 28 and 29 are both citations — a promise that something exists somewhere
a reader can get to. Nothing in this repo asked whether that was true, so both
survived: one for four hours across two Notion pages, one for two months.

`scripts/check-lesson-refs.sh` asks it. Every `docs/lessons/*.md` path cited
anywhere under `docs/` must exist in `git ls-tree origin/main`; it names the
missing file **and the files that cite it**, and it distinguishes *"exists
locally, unmerged"* from *"not in this worktree either"* — because those are
different bugs with the same symptom.

Generalise it. The same question applies to any cross-boundary reference this
swarm makes: a Notion page citing a repo path, a Linear issue citing a PR, an
agent brief citing a document. **A citation is a claim, and an unreachable
citation fails exactly like a dead binding: quietly, and in the flattering
direction.**

## Why it keeps winning

1. **Zero and empty are valid values.** Type systems, JSON schemas, and exit codes
   all accept them. Nothing in the stack distinguishes "measured zero" from
   "measured nothing."
2. **An absence flatters a timing and screams in a count.** A dead binding sends a
   *timing* down (which looks like a win) and a *count* to zero (which looks
   obviously wrong). This is why the standing ruling in
   `docs/state/orchestrator.md` is: **publishable metrics are counted metrics only.**
3. **The rendering layer is downstream of the failure.** By the time a number
   reaches a README, a dashboard, or a Slack message, the absence has been
   formatted into something that looks like data.
4. **Two corrupted artifacts agree with each other.** A `--check` that compares two
   things written by the same broken step passes. See
   `checked-thing-is-not-the-changed-thing.md`.

## Fix / recipe

**The only reliable defence is a liveness probe: prove the thing under
measurement is doing work, before you record what it did.**

Concretely, in order of strength:

1. **Assert liveness before measuring.** This is what the mandatory **R0
   DOM-liveness gate** does (#610, `3059eaa1`) — and it *caught a fourth dead cell
   on its very first run.* Adopt the equivalent for any new instrument.
2. **Assert a floor, not just a pass.** `0 passed, 0 failed → EXIT 0` must be a
   failure. Every counting gate needs `if (count < expected_floor) exit 1`.
3. **Refuse rather than record.** `measureSizes()` was changed to **refuse when
   `dist/` is missing** instead of writing `_no dist_`. Prefer an error to a
   placeholder, always.
4. **Publish counts, not timings**, until the harness measures the shipped artifact.
5. **Make a skip neutral, not green.** A cell that cannot run has not passed.
6. **Assert the file is non-empty and is the file you think it is, before grepping
   it for absence.**
7. **Never encode an absence in a test assertion.** Asserting
   `not.toContain("## Components")` certifies the bug and stays green forever.
8. **A citation is a claim.** A README referencing a test file needs the same
   verification as a number — #592 cited a test that only existed in #589, and
   merging out of order would have published a dead link.

## Detection (carry-forward debt)

None of this is mechanically enforced. Open work, in priority order:

- Wire `check-samples` into `check:ci` **with a fence-count floor** (open, unassigned)
- Have `.tastemaker/check_contrast.py` parse `packages/css-engine/src/packs.ts`
  instead of its hardcoded `TOKENS` dict, and wire it into `check:ci`
  (open, unassigned)
- Make the scaffold-matrix skip **neutral** rather than success (open, unassigned)
- A CI lint for drift between `packages/*/package.json` `publishConfig.access` and
  the `PKGS` array — sketched in `publish-all-pkgs-array.md`, still not built

## Related

- `checked-thing-is-not-the-changed-thing.md` — the sibling pattern, named the same day
- `publish-all-pkgs-array-gap.md` — instance #4, and its own recurrence chain
- `docs/state/verifier.md` — instances #9, #10, #11, #12 with full verdicts
- `docs/state/orchestrator.md` — the counted-metrics-only ruling and the bench STOP
