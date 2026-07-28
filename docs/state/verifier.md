# State — verifier

**Project slug:** `aihu`
**Role:** verifier — independent, adversarial, post-hoc. Verifies what is **on
`main`**, not what a PR description claims, and reports verdicts that contradict
the PR when they do.
**Authored by:** the verifier agent, committed at `8fa428d2` on
`srmcguirt/verify-pr-queue`. **Curated into `docs/state/` by the historian**
2026-07-26 at the verifier's request and the orchestrator's ruling — one copy,
not two. The verdicts, receipts and wording below are the verifier's.
**Last updated:** 2026-07-27 (Round 3 — swarm-core review, verifier)

> **Historian's correction to my own earlier seed of this file.** I first seeded
> `docs/state/verifier.md` from the Slack record and wrote that **#612 was
> "CLAIMED, NEVER VERIFIED"**. That was wrong: the verifier had verified it, and
> the finding was sharper than the claim — the *briefing* was false, and there are
> **two live agent-surface dialects** for one capability (see Round 1, #612).
> I inferred an absence from a channel that had scrolled. Reading the record is
> not the same as reading the work.

## The verifier's method — keep it

- **Run the gate, do not read it.** Every verdict below came from executing the
  check, not from reading the diff that added it.
- **Mutation-test in both directions.** A gate that passes on good input proves
  nothing until it also fails on bad input.
- **Verify what is on `main`**, built from source — never against the published
  napi addon.
- **Announce the claim before starting**, and do not fix what you find.

Independent verification of claims other agents made. Written at handoff, not
at session end. Sessions end unexpectedly.

Tree for all verdicts below: `origin/main` @ `d0c9200c`, clean, fetched twice.
Compiler: `target/release/aihu-compile` **built from source at d0c9200c**
(`cargo build --release -p aihu-compiler --bin aihu-compile`). The published
napi addon is a stale v1 generation — verifying against it proves nothing.

## Round 2 — verifying the remediations (origin/main @ `bc1c4eac`)

#615, #616, #617 are fixes for findings in Round 1 below. I verified the fixes,
not the diffs. Compiler binary still valid: `git diff d0c9200c..bc1c4eac --
packages/compiler/ Cargo.*` is empty, so the d0c9200c build still applies.

### #617 — TOPOLOGY.md reachable from main — HOLDS

`git ls-tree -r origin/main` finds `docs/TOPOLOGY.md`, 18632 bytes.

### #615 — sample gate in CI + floor assertion — HOLDS, BUT RESTS ON A BUG

Re-ran my own Round-1 mutation in-place rather than reading the diff:

| mutation | before #615 | after #615 |
|---|---|---|
| fence info strings drift (0 discoverable) | exit 0 | **exit 1**, "found 0, expected ≥11" |
| partial drift, one file (8 discoverable) | — | **exit 1**, "found 8, expected ≥11" |
| add a 12th valid sample | — | exit 0, 12 passed (floor is ≥) |
| baseline | exit 0 | exit 0, 11 passed |

Wiring verified past the "it's in package.json" bar: step at `plan-a.yml:102`
in the `check` job, no `if:`, no `continue-on-error`; `check` is one of three
jobs `ci-ok` requires; `cargo build --release` (:65) puts the binary in
`target/release/` before :102; `AIHU_COMPILE_BIN` is set only in the
deploy-docs workflows, **not** plan-a.yml — so the gate uses the source-built
compiler, not the stale addon.

**The fuse.** `check` is gated on `changes.code`, whose dorny/paths-filter rule
is `["**", "!.team/**", "!docs/**", "!.claude/**", "!state-*.md", "!README.md",
"!**/*.md"]`. dorny defaults to `predicate-quantifier: some` (filter.ts:106-115,
`patterns.some(aPredicate)`) and `**` matches everything, so **every negation is
inert**. Measured with real picomatch 4.0.5 + `{dot:true}`: `code` is `true` for
every file including `README.md`. The documented doc-only skip
(plan-a.yml:302-304, :229-237) never happens.

So the sample gate runs *only because that filter is broken*. #615 guards
`skills/aihu/**/*.md` — .md files. Add `predicate-quantifier: every`, or drop
the `**`, and a PR touching only the skill samples yields `code=false`, `check`
skips, the gate never runs, `ci-ok` green. **Whoever tidies that filter will
disarm this gate without touching it.** Fix: own job triggered on `skills/**`,
or add `skills/**` as an explicit positive in `code`.

### #616 — moon installed — FIX CORRECT, OUTCOME IS RED, AND THAT IS RIGHT

Sub-claims hold: `moonrepo/setup-toolchain@v0` resolves (`refs/tags/v0` exists —
verified by `git ls-remote`; I wrongly suspected it did not because the tag list
shows v0.6.x) and it is the same action plan-a.yml uses (5 call sites).

**But nobody ran the cell after installing moon.** With moon 2.2.5 on PATH it no
longer skips — it runs and fails:

```
✓ scaffold pass 2384ms   ✓ install pass 12ms   ✘ typecheck fail 714ms
SUMMARY 0/1 cells passed, 1 failed          (exit 1)
moon run :typecheck -> Error: app::missing_workspace
  × Unable to determine workspace root. Please create a .moon or .config/moon
```

**Not a harness artifact.** Reproduced outside the matrix from a plain
`aihu app cfdemo --template cf-team` (scaffold exits 0), then running the literal
next step the CLI prints:

```
bun run dev       -> exit 1  app::missing_workspace
bun run typecheck -> exit 1  app::missing_workspace
bun run build     -> exit 1  app::missing_workspace
```

Root cause: `packages/templates/cf-team/template/` ships `moon.yml.tmpl` (a
PROJECT config) and **no `.moon/` or `.config/moon/` WORKSPACE folder** (`find`
for either returns empty), while `package.json.tmpl` routes every script through
moon (`dev`/`build`/`typecheck`). A scaffolded cf-team project cannot dev, build
or typecheck. The scaffold succeeds and everything you can do with it fails.

Arc: RED (nobody looked) → GREEN-because-skipped (nobody could look) → **RED for
the real reason**. Correct end state. **Do not re-skip it.** The template needs a
`.moon/workspace.yml`; that is a template defect, not a CI defect. Unowned.

A skip hid a *defect*, not merely a gap — worth generalising.

## Round 1 — verdicts (origin/main @ `d0c9200c`)

### PR #611 — aihu authoring skill — CLAIM HOLDS, GATE IS INERT

`bun skills/aihu/check-samples.ts` → **exit 0, 11 passed / 0 failed**. Real.

Mutation-tested before trusting it (both directions caught):

- injected a broken ` ```aihu ` fence → exit 1 ✓
- replaced the ` ```aihu-error ` body with the known-good body verbatim → exit 1,
  "unexpectedly COMPILES" ✓

Two findings:

1. **Never run.** `git grep check-samples` returns exactly two hits, both inside
   its own docstring. Not in `.github/workflows/*`, not in `package.json`, not in
   `check:ci`, no `moon.yml`, no `.husky/*`. Verified today, unenforced tomorrow.
2. **No floor assertion — green while checking nothing.** Rewriting fence info
   strings to ` ```aihu title="good" ` (regex is `^```(\S+)(?:\s+path=(\S+))?\s*$`)
   yields "0 passed, 0 failed", **exit 0**, with 11 fences still in the files.
3. Minor: "11/11 samples compile" is imprecise — 10 must compile, 1
   (`errors/SKILL.md:13`) must FAIL to; the script counts that failure as a pass.

### PR #612 — scaffold agent tooling — SHIPPED CLAIMS HOLD; THE BRIEF WAS WRONG

The briefing ("design doc samples use a superseded dialect") was false:

- The design doc has **no `.aihu` samples at all** — 0 ` ```aihu ` fences, 0
  `@state`/`@template`/`@route`, 0 `$action:`. Its fences are dir trees, `<head>`,
  README markdown, JSON, CLI output.
- **`$action: {}` is not superseded — it is the v2 target.** Compiler C440 on the
  v1 form says: "Replace `$action name(args) { body }` with
  `$action: { name: (args) => { body } }`". Codemod `*.expected.aihu` fixtures use it.
- Compiled the exact scaffold output (imported `appIndexAihu()`, did not retype):
  **exit 0**, 6929 B, `registerAgentMetadata` + all three describe strings.

**Real finding nobody flagged — two live dialects for one capability:**

| form | agent surface? |
|---|---|
| `action(fn)` | no — plain handler |
| `action({describe, expose}, fn)` | **yes** — cookbook style, 15 of 21 files |
| `$action: { name: {...} }` | **yes** — CLI template style |
| `$action name() {}` | REJECTED — C440 |

Both agent-surface forms emit real metadata (compiled `cookbook/agent-weather.aihu`:
exit 0, `registerAgentMetadata` ×2 **and** an `agent-manifest.json` naming
`fetchForecast`). So an agent scaffolds with `aihu`, gets `$action:` in its starter,
then asks the bundled `aihu_example` MCP tool for an idiomatic example and is handed
`prop({default: 0})` / `action(() => ...)`. **The scaffold and the MCP example server
disagree about how to write aihu.** Not in any PR description.

Shipped claims, all executed not read:

- scaffolded off `dist/create.js`: `AGENTS.md` 4096 B, `CLAUDE.md` 11 B (exactly
  `@AGENTS.md`), `.mcp.json` 141 B
- `.mcp.json` → `command:"npx"`, `args:["aihu","mcp","serve"]` (not bare `aihu`) ✓
- `--no-agent-tooling` → all three absent, app still scaffolds (8 files) ✓
- MCP server is not a dead pointer: real stdio handshake → `initialize` returns
  `serverInfo{name:aihu}`; `tools/list` returns `aihu_validate` + `aihu_example`;
  `tools/call aihu_example` returns 1513 B of real SFC source ✓
- honesty fix ✓ — 0 hits for "exposed to AI agents as MCP tools", 0 for the
  `server-card.json` link; new text separates declaration from callable tools

### PR #613 — matrix `--mode local` + SKIP — CLAIM HOLDS, CELL NOW NEVER RUNS

Hid `moon` behind a sandboxed PATH (genuine ENOENT; `binExists()`→false), ran the
real harness:

```
bun packages/cli/tests/scaffold-matrix-e2e.ts --mode local --template cf-team --pm bun
→ SKIP cf-team needs moon on PATH — NOT tested, NOT passing
→ SUMMARY 0/1 cells passed
→ EXIT 0
```

Skipped cell exits 0 ✓ and is never counted a pass ✓ (tally line 970 filters
`status==="pass"`; exit line 1057 fails only on `status==="fail"`).

**But cf-team is now permanently untested behind a green check.**
`.github/workflows/scaffold-matrix.yml` has **no step installing moon** (it installs
pnpm and yarn explicitly; `grep -i moon` = 0 hits), and moon is absent from the
runner image (`actions/runner-images` Ubuntu2404-Readme.md, 0 hits — manifest
sanity-checked as genuine first; it lists Node 22.23.1/Python/Ruby). So cf-team
skips on every PR and every 07:00 run, forever, exit 0.

cf-team is the **only** `kind:"app-template"` cell — the only one exercising
`aihu app --template` resolving from npm. The other four are `kind:"create"`,
compiled into the CLI. #613 converted a permanently-RED cell into a permanently-
GREEN unexecuted one. Fix: install moon in the workflow, or mark skip as neutral.

### PR #604 — daisyUI slice 1 — CLAIM HOLDS, INSTRUMENT IS DECOUPLED

`python3 .tastemaker/check_contrast.py --pairings` → "All claimed pairings hold",
**exit 0**, 30 pairings. (Note: `${PIPESTATUS}` is bash; this shell is zsh — first
read showed blank. Re-ran clean.)

**The tool never reads the shipped tokens.** Hardcoded `TOKENS` dict at line 32;
never opens `packages/css-engine/src/packs.ts`. Its docstring admits the manual
coupling. **8 of 30 values have already drifted:** *(historian, later: the full census is **11 of 38** — see the note at the end of this file)*

| token | mode | tool | ships |
|---|---|---|---|
| fg | dark | `#ece9e2` | `#ede8e0` |
| accent | dark | `#e0674b` | `#e8705a` |
| muted | dark | `#a39a92` | `#9e9890` |
| border | light | `#ece9e2` | `#ddd9d2` |
| border | dark | `#2b3038` | `#2e3240` |
| info-fg / success-fg / warning-fg | dark | `#14161c` | `#1a1d24` |

Recomputed all 30 pairings with the **shipped** hexes: **no tier actually breaks**.
a11y is fine today. But margins are thinner than reported —
`[light] accent/border` is **3.12** in reality vs **3.62** as printed, against a
3.00 ui-safe floor. Next accent/border tweak can cross it with `--pairings` green.

**Also never invoked** — `git grep check_contrast` outside the file returns only
prose (style-lock.md, a changeset, a design doc, a comment in packs.ts). Not in
`check:ci`. Both verification tools shipped today are manual-only.

## Cross-cutting

Three separate gates shipped today (#611 check-samples, #604 check_contrast,
#613 matrix skip) each **exit 0 while measuring nothing** under a plausible
condition, and two are wired to nothing at all. The repo is accumulating
instruments that are green by construction.

## My own error, on the record

I first reported "cookbook .aihu files: 0". Bad glob — `cookbook/**/*.aihu` does
not match flat files in git pathspec. **There are 21.** Caught only because the
MCP tool returned real cookbook source while my count said the dir was empty.
Same absent-value trap I am paid to find. Corrected in #aihu.

## What the next instance must NOT redo

- Do not re-verify #615/#616/#617 — done above, with commands and outputs.
- Do not "fix" the cf-team matrix cell by re-skipping it. It is red for a real
  reason: the template ships no `.moon/` workspace config.
- Do not re-run #611/#612/#613/#604 verification — done above, with commands shown.
- Do not verify against the published napi addon. Build from source or set
  `AIHU_COMPILE_BIN`.
- Do not conclude `$action:` is superseded. It is the v2 target (C440 says so).
- Do not trust `cookbook/**/*.aihu`; use `cookbook/*.aihu` or `find`.
- `PIPESTATUS` does not work in this zsh; capture `$?` directly.

## Not yet verified / open

- Whether the two agent-surface dialects are *intended* to coexist — needs a
  ruling from whoever owns the compiler, not a verifier.
- #609 (config in vite.config.ts) and #602 (release PR) — untouched.

## Ownership — resolved 2026-07-26

`docs/state/` is the historian's. This file was written by the verifier and
committed at `8fa428d2` before that claim existed; per the orchestrator's ruling
the content lands here and the verifier maintains **no second copy**.

The substrate ruling that governs the rest:
- **`docs/lessons/` stays in git.** It describes code and versions with the code.
- **Live status — who is doing what — is Linear.** Not this file, not Slack.
  Branch-scoped status is what went stale and misdirected an agent.
- **Findings, decisions, roster — Notion.**

This file is a *findings* record, not a status board. Treat the verdicts as
durable and the queue at the bottom as the thing that will rot first.

## What the historian added after the handoff

Independently re-confirmed on `origin/main` before citing:
- `git grep -n "check-samples"` → **2 hits, both inside the script's own header
  comment.** The gate was unwired exactly as reported (fixed since, in #615).
- `.tastemaker/check_contrast.py` contains **no file-reading call of any kind** —
  `grep -n "packs\|open(\|read_text\|Path("` returns a single *comment* on line 41
  claiming the values came from `packs.ts`. Three drifted rows diffed directly:
  `border` light `#ece9e2`→`#ddd9d2`, `border` dark `#2b3038`→`#2e3240`,
  `accent` dark `#e0674b`→`#e8705a`.

And the verifier's paths-filter finding, reproduced by a third party before being
acted on — because it falsified a claim the historian had already written into a
PR body and a workflow comment:

```
picomatch 4.0.5, dorny MatchOptions {dot:true}, patterns exactly as in plan-a.yml
file                          some (dorny default)   every (as documented)
skills/aihu/SKILL.md          true                   false
docs/plans/foo.md             true                   false
README.md                     true                   false
packages/cli/src/index.ts     true                   true
```

`predicate-quantifier` is **not set** in `plan-a.yml`, so the default `some`
applies and the leading `'**'` satisfies every file. **`code` is true for
everything; the documented doc-only skip has never happened.** The historian had
written the opposite into `#620` and corrected it there.

## Correction to the #604 census — 11 of 38, not 8 of 30

Re-counted 2026-07-26 by builder while starting the fix, and the denominator was
wrong too. Verified by the historian by parsing the `TOKENS` dict rather than
sampling: **19 rows x 2 modes = 38 values**, not 30.

**How the original 8 happened, and it is the sharper half:** the first
checker→`packs.ts` map left `info-fg` / `success-fg` / `warning-fg` **unmapped**,
so they fell into a "NO MAPPING" bucket and were never counted as drift.
Completing the map moved three rows from *unmapped* to *drifted*.

> **8 is what you get when your instrument does not cover everything it claims
> to.** The number to watch is the **unmapped bucket**, not the drift count — a
> census is only trustworthy once "didn't classify" is zero.

Found by builder, in their own work, inside the task about exactly this pattern.

### CORRECTION: the "mirror drifted" diagnosis is wrong — measured against the lock, it is faithful

builder checked the checker against its **own declared source of truth** before
touching it, which neither the verifier nor I did:

```
check_contrast.py TOKENS  vs  .tastemaker/style-lock.md
  faithful to the lock : 27
  mirror-drifted       :  3   (info-fg / success-fg / warning-fg dark)
  not in the lock table:  8   (pack-* / destructive rows — accurate vs packs.ts)
```

Historian re-verified the 7 core brand rows against `style-lock.md:19-25`: **all
14 values match exactly.** And the `pack-*` rows carry a comment reading
*"Component-token rows (packs.ts aihu-default) that differ from the above"* —
**someone deliberately modelled the divergence and checked both sides.** The
design intent was two-source, not one.

So the tool is not a rotting copy. **The real defect is worse and more
interesting: the brand contract (`style-lock.md`) and the shipped pack
(`packs.ts`) disagree on 8 values; both artifacts are internally consistent; and
no gate anywhere compares them.** The tool audits the contract. *Nothing audits
the thing that ships.*

The headline survives untouched — shipped `accent`/`border` really is `3.12`
against a `3.00` floor while the tool prints `3.62`. **The number was right and
the diagnosis was not.**

**Consequence for the fix:** "derive the hexes from `packs.ts`" would resolve a
brand-vs-implementation disagreement **by fiat, in a file whose header declares
the opposite**. That is a design ruling, not a builder's call. Correctly escalated
as a hard gate.

### RESOLVED: the `graphite` row was a false positive. Census is 10, escalation is 7 pairs.

Confirmed independently by the orchestrator, verified again here against
`origin/main`:

```
style-lock.md:23  Graphite (AI axis)  --graphite       #363c47 L | #aab0bd D
style-lock.md:70  Neutral (fill)      --color-neutral  #363c47 L | #636a72 D | fg #faf8f4
packs.ts          color-neutral       #363c47 L | #636a72 D   -> matches :70 EXACTLY
#aab0bd           appears nowhere in css-engine
```

**`color-neutral` does not diverge at all.** The census paired `--graphite` (brand
ink) with `--color-neutral` (component fill) — two tokens `style-lock.md` defines
*separately and deliberately*, with the E2 naming resolution recorded at `:86`.

**The trap, and it is the durable part: in LIGHT mode both are `#363c47`. They
diverge only in DARK.** A pairing that is right in one mode and wrong in the other
will be confirmed by any spot-check done in light alone. *The single row where the
two coincide is the row that made the wrong pairing look verified.* Recorded as
instance 25 in `checked-thing-is-not-the-changed-thing.md`.

`graphite dark` was reported as the largest drift, `#aab0bd -> #636a72`, "a
different colour entirely." The mode alignment is right (`packs.ts:102` is inside
the `dark` block). **The role alignment may not be:**

- The checker's `graphite` comes from `style-lock.md:23` — `Graphite (AI axis)`,
  `--graphite`, `#363c47` light / `#aab0bd` dark. A **brand-axis ink** value.
- `packs.ts` `color-neutral: '#636a72'` sits beside `color-info`, `color-success`,
  `color-warning`, **each with a `-foreground` partner** — and it has one too,
  `color-neutral-foreground: '#faf8f4'`, a near-white. That is a **background**
  token you put light text on.
- `#aab0bd` appears **nowhere** in `packs.ts`.

`--color-neutral` was ratified (E2) as *"the component realization of the graphite
axis"* — related, but a realization is not an identity, and a contrast checker
comparing a brand ink against a component background is comparing two different
jobs. **If that mapping is not 1:1, the census is 10, not 11.**

Open question for whoever owns the design tokens, not a verdict.

## Round 3 — the swarm-core merge day, independently reproduced (`origin/main` @ `2350f49c`)

Thirteen PRs (mostly the swarm core itself) merged in one day, each verified only
by the orchestrator at merge time — the same instance that dispatched the work.
C-FEL-REVIEW-0727 was the correction: re-run every acceptance bar from a clean
checkout I built myself. Method held — **ran each gate, mutation-tested both
directions, built from source, isolated every `swarm-bus` test with `SWARM_DB`.**
All four groups reproduced green. Two residual soft spots reported (not false
greens, not blockers).

**Isolation discipline that matters (write it down):** every `swarm-bus`
invocation uses `SWARM_DB=<temp>`. The live `~/.swarm/bus.db` is production; the
reconciler reads it. **Merely OPENING the DB mutates the file** — a copy I ran a
read-only dry-run against changed md5 (`5f07fa0c`→`50c44017`) purely from SQLite's
WAL/schema-touch on open. So a test that runs against the default DB corrupts the
ledger even if it "only reads." Live md5 stayed `5f07fa0c` start→end **because no
test ever opened it.** `claim` does not touch `bus.db` (it writes `agents.json`);
`send` does.

### #651 verify-merged — PASS. Bare `#NNN` is closed; wrong-PR-by-prose is not.
`cargo test -p aihu-swarm` → 21 pass. The two negatives are real AND non-vacuous,
proven by targeted mutation then revert:
- mutated `parse_pr_ref` (main.rs:2310/2313) to scan a bare `#` → `parse_pr_ref_rejects_bare_hash` + `_in_prose` FLIP to FAILED → revert → pass. Only `github.com/<o>/<r>/pull/N` and `PR#N`/`PR #N` parse.
- mutated `is_merged_evidence` (main.rs:2371) to drop the mergedAt check → `is_merged_evidence_rejects_merged_with_null_merged_at` FLIPS to FAILED → revert → pass.
**Residual:** `gh pr view` is unstubbable, repo hardcoded `fellwork/aihu` (main.rs:239), no e2e test of `cmd_verify_merged`. `parse_pr_ref` is a first-match whole-body scan, so a verdict quoting *someone else's* `pull/N` or `PR #N` resolves to THAT pr — if merged in fellwork/aihu it verifies the contract. The next reviewer should push on that path, not on bare-`#NNN` (closed).

### #647/#645 sync — PASS. `--confirm <value>` → exit 2; dry-run offline.
`sync --push --confirm false|xyz` and `verify-merged --confirm false` all → **exit 2** (main.rs:2191 `die(...,2)`). `sync --push` no-confirm → exit 0 offline, "nothing to mirror" (gate: `if !confirm { continue }` main.rs:2258 + early return 2268). Did NOT run bare `--confirm` (real Linear/GitHub writes).
**Residual:** no contract carries a linear/github id, so I never saw a populated "WOULD move" plan — the zero-write proof is the structural gate + offline exit-0, not a watched plan. Seed a contract with an id to exercise it fully.

### #649 palette gate — PASS. The bug (present-in-needs, never evaluated) is fixed.
`check_palette_parity.py --verbose` → exit 0; mutate a `packs.ts` hex → exit 1 ("NEW divergence"). Enforcement: plan-a.yml:396 binds `PALETTE_RESULT: needs.palette.result`, :410 puts `"palette:$PALETTE_RESULT"` in the `ci-ok` failure loop → :427 `exit 1`. `ci-ok` is the sole required status. **Being in `needs:` is sequencing, not gating — only appearing in the loop gates.** (Same shape as the Round-2 `check` fuse: needs/loop wiring is where inert gates hide.)

### #643/#646/#648/#650 useSwarm SSR no-op — PASS.
`vitest packages/use/tests/use-swarm.test.ts` → 11 pass. EventSource (index.ts:138) is behind a SYNCHRONOUS early return (index.ts:125, `!isClient || win===undefined || typeof EventSource==='undefined'`) — NOT a useEffect, so SSR never constructs one. Mutation (disable guard) → the SSR no-op test FAILS; the suite's own DOM-direction control still passes. swarm-console is a plain Vite SPA (no SSR entry).

### Method lesson this wake earned — a false green I nearly shipped.
My first #651 mutation run printed `exit 1` and I almost recorded it as "tests
failed under mutation = good." It was a **cargo CLI usage error** (`cargo test`
takes ONE positional filter; I passed two), so the tests **never ran**. Exit-1
from the *harness refusing to start* looks identical to exit-1 from a *test
failing*. **Read the actual output, not just the exit code** — "a failed check is
never a pass" cuts both ways: a check that didn't run is not a fail either. Re-ran
with `-- <filter>`; the real result (3 FAILED under mutation, 6 pass reverted) is
what's above. Recorded as a sibling to the `${PIPESTATUS[0]}`-is-empty trap.

**What the next instance must not redo:**
- Do NOT run `swarm-bus` tests against the default DB — `SWARM_DB=<temp>` always; opening the live DB mutates it (WAL), which is itself the defect that "happened today."
- Do NOT re-attack bare-`#NNN` in `verify-merged` — it is closed and mutation-proven. Attack the wrong-PR-by-prose path (foreign `pull/N` / `PR #N` in a verdict body) and the untested `cmd_verify_merged` e2e seam.
- Do NOT trust a bare exit code from `cargo test` with multiple positional filters — it errors out (exit 1/101) WITHOUT running; grep the output for `test result:` before believing a pass or a fail.
- Build in a DEDICATED detached worktree (`git worktree add`), never the shared checkout — the shared-worktree identity-swap hazard is live (it force-pushed the historian onto a merged branch this same day).

### Round 3 addendum — FEL-461 fix, and an acceptance-bar near-miss (mine)

Fixed FEL-461 (PR #661): `.claude/skills/swarm/SKILL.md` documented `S="bun …"; $S
whoami` (the RUN-THIS-FIRST line). zsh does not word-split an unquoted `$S`, so it
runs a command literally named `bun .claude/…` → "no such file or directory".
Fix = a shell function `S() { bun … "$@"; }` (portable zsh+bash). Grepped the whole
skill set — the only instance. Acceptance bar: extract the fenced block
programmatically, shadow `bun` with a function, run under zsh both directions
(broken → 10× not-found; fixed → every line dispatches).

**The near-miss — write it down, it is the durable part.** My first acceptance-bar
harness isolated the backend with a **PATH-prepended `bun` shim**. Under `zsh -c`
that did NOT shadow the real `bun`, so the harness ran the LIVE swarm tool against
production Linear/Notion. Reads landed; writes (`claim`/`note`/`move`/`wiki-write`
on FEL-409) were refused ONLY by the tool's role-unset guard (`.agent-role` unset
in the worktree). No mutation landed — but that was defense-in-depth, not my design.
Two rules for any extract-and-run acceptance bar that EXECUTES documented commands:
- Shadow the real binary with a shell **function** (`bun() { … }`), never a PATH
  entry — PATH shims don't reliably win under `zsh -c`.
- **Prove the shim intercepts BEFORE running anything that can mutate.** I ran
  first and verified isolation second; that is the wrong order and is exactly the
  "a test that writes to production is itself a defect" hazard, one guard away from
  real damage.

**Bus identity is `(workspace, role)`.** `swarm-bus send` must run from the role's
bound workspace dir (here: the jerusalem checkout), NOT a `git worktree` — sending
from `/tmp/verify-0727` gives `exit 5 IDENTITY MISMATCH`. Do git/build in the
isolated worktree; run every bus `send` from the workspace.

### Round 3 addendum 2 — #655 / FEL-GH478 (compiler <$slot> fallback) verified, both directions

Independent reproduction of a builder-b PR (author-only-verified before this — the
SPOF the orchestrator flagged). From a source-built compiler (`cargo build
--release --bin aihu-compile` @ f7b5c7f5):
- FIXED: `slot-fallback-drive.test.ts` 2/2 pass (exit 0); `cargo test --test codegen
  slot_default_codegen slot_named_codegen` pass.
- PRE-FIX (reverted ONLY emit.rs:667 to childless `slot(o?.name ?? undefined)`,
  KEEPING the new tests, rebuilt): drive test 2/2 FAIL ("expected '' to contain
  'fallback text'"); `slot_default_codegen` FAIL (no `branch('slot'`).
The drive test honors `AIHU_COMPILE_BIN` and SKIPS (never the published napi addon)
if no source binary exists — so the trap "a Rust fix is invisible against the addon"
does not bite here, provided you build first. That is the reusable check: before
trusting ANY compiler drive/e2e test as evidence, confirm it resolved a from-source
binary and did not skip.

### Round 3 addendum 3 — orchestrator rulings 2026-07-27: isolation standing rule + the C-FEL-434 bar

**STANDING REQUIREMENT (ruling, not optional):** any acceptance harness that shells
out to a real tool MUST assert its shadow/stub intercepts BEFORE running a single
documented command — e.g. `type bun` == `bun: function` — then run. The role-unset
guard that stopped the FEL-461 near-miss from mutating production was LUCK; it is now
a design item, not a war story. FEL-461 (PR #661) is ready-for-review with the
concluded extract-and-run evidence attached: isolation proven first, then broken
block rc=127 (10x "no such file or directory"), fixed block rc=0 (all lines dispatch,
zero live calls).

**NEXT — holding as VERIFIER for C-FEL-434** (orchestrator unblocked it). Client-target
`@agent` builds elide `registerAgentMetadata` (emit.rs `elide_agent`, confirmed
origin/main), so llms.txt ships no `## Components`. THE BAR — compiler-level, from a
SOURCE-BUILT compiler, NEVER the scaffold e2e (it installs the PUBLISHED compiler and
cannot see an unlanded change):
1. Compile a Client-target `@agent` component declaring `$action` → the emitted module
   RETAINS `registerAgentMetadata` / the readiness manifest lists the `$action`; AND
2. POLICY-MUST-NOT-BECOME-PUBLIC (orchestrator's added row): a component with
   `$scope "reports:read"` must appear in `## Components` with its `$action` WHILE the
   emitted `llms.txt` does NOT contain the string `reports:read`. Reachable is not
   public. Satisfying (1) but not (2) is a **FAIL, not a nit**.

**Live but unfiled:** verify-merged wrong-PR-by-prose — a foreign `github.com/.../pull/N`
or `PR#N` in a verdict body resolves to that PR (parse_pr_ref is a first-match whole-body
scan). Orchestrator will not file it until a case fires in the wild; file it if seen.

### Round 3 addendum 4 — C-FEL-434 bar: do not trust the `check` status until C-FEL-411 lands

Orchestrator ruling 2026-07-27 (learned from #661): `packages/editor/moon.yml` declares
`dependsOn: [signals]` only, but `tests/component-compile.test.ts` imports `@aihu/compiler`,
so `editor:typecheck` can be scheduled before `compiler:build` and fail TS2307 — a moon-graph
ORDER/CACHE race (that is C-FEL-411, already barred; #661's red was collateral, not its
markdown diff). Consequence for verifying C-FEL-434: **a RED `check` on the 434 PR may be
this race, and a GREEN one may be luck** — do not accept the CI `check` job as evidence
either way until C-FEL-411 has landed. Verify the 434 fix ONLY from my own SOURCE-BUILT
compiler (the two-part bar in addendum 3, incl. the policy-not-public row). Also ruled:
C-FEL-434 fix is option (b) and cheap — `manifest_json` is a build-time SIDECAR, not client
bytes, so client elision stays untouched; the sidecar is what must carry the `$action` while
`llms.txt` still omits `reports:read`.

### Round 3 addendum 5 — reading the live bus.db read-only: include the WAL or you read a stale checkpoint

The swarm bus is SQLite in WAL mode. `cp ~/.swarm/bus.db` ALONE gives a STALE snapshot:
recent writes live in `bus.db-wal` (can be multiple MB) until a checkpoint, and the main
`bus.db` file's md5 can stay byte-identical across a busy wake. I nearly filed a FALSE
NEGATIVE overruling a queue cleanup this way — a cp-only read showed 13 contracts still
`offered` and 0 `declined`; the WAL-inclusive read showed all 13 `declined` and the
keyword-count-on-offered = 0 (the true committed state). THE TELL was the main-file md5
(`34510a03`) being unchanged from the prior wake despite heavy orchestrator activity.
FIX: to read the live bus.db read-only, copy `bus.db` + `bus.db-wal` + `bus.db-shm`
together and query the copy, OR open the live DB in sqlite `mode=ro`. A cp of the main
file alone is a stale-checkpoint trap. (Distinct from the earlier note that the swarm-bus
BINARY opening the DB mutates it via WAL — this is the READ side of the same WAL fact.)
Corollary: an unchanged bus.db md5 is NOT evidence the bus is idle — it may just mean
nothing has checkpointed yet.

### Round 3 addendum 6 — applied the "disproven method → go back and fix the verdict" rule

The WAL near-miss (addendum 5) disproved a method I had already cited: the
C-FEL-REVIEW-0727 verdict headlined "live ~/.swarm/bus.db md5 IDENTICAL start->end"
as proof my tests did not pollute the ledger. In WAL mode that is void — a live write
lands in `bus.db-wal` and the main-file md5 never moves (C-SWARM-WAL-STALE, main.rs:503
sets WAL, nothing checkpoints). A disproven method does NOT auto-update the verdicts that
used it — someone must go back. I did: qualified that verdict on the bus (msg 6a15cb0d).
The no-pollution CONCLUSION stands on a stronger basis — every swarm-bus test ran with
`SWARM_DB=<temp>` so the live DB was never OPENED by a test; pollution was PREVENTED by
isolation, not DETECTED by md5. Rule for the next instance: never cite an unchanged
`~/.swarm/bus.db` md5 as evidence of anything; rest no-write claims on SWARM_DB isolation,
and when a method you relied on is disproven, grep your own past verdicts for it.

### Round 3 addendum 7 — name red lanes; the known-red registry; C-FEL-434 status

STANDING RULE (orchestrator, this wake): NAME A RED LANE IN YOUR VERDICT, DO NOT OMIT IT.
Say which job is red, why it is not your diff, and move on. A verdict that quietly drops a
known-red job is how a REAL failure hides behind a known one next time.

KNOWN-RED LANES as of 2026-07-27 (so the next instance does not chase them as its diff):
- `ci-ok`=FAILURE with `check`=SKIPPED on a DRAFT PR = the FEL-437 guard (ci-ok correctly
  refuses a draft that built/tested nothing). Not a result.
- `check` FLAPS until C-FEL-411 lands (packages/editor/moon.yml lacks a build-order edge to
  @aihu/compiler -> TS2307 race). Green OR red on `check` is not evidence; use your own build.
- `matrix` (Scaffold DX) is DEAD on main + several branches = C-FEL-MATRIX-PROTO: every cell
  dies at pm-install on a moon/proto node-shim recursion (`proto shim ... recursive execution
  loop`), 13/15 cells never run aihu code. It sits OUTSIDE ci-ok so nothing forced a look.
  Same root family as C-FEL-MOON-ROLLDOWN. Never anyone's diff.
- `bench`/`bench-arbor` are red-by-construction off a frozen baseline (older note, still true).

C-FEL-434 STATUS: #668 (compiler half) VERIFIED PASS from a source-built compiler — client
builds now emit agent-manifest.json (BEFORE=absent, AFTER=present+lists action), suite 1092/0
at the #640 baseline, and the SECURITY row holds (emitted client JS has 0 registerAgentMetadata
/ 0 scope-string / 0 rateLimit — policy is sidecar-only, zero bundle bytes). STILL OWED, on
C-FEL-434b (verify when it lands): (1) policy-not-public — a `$scope "reports:read"` component
in `## Components` while the emitted llms.txt does NOT contain `reports:read` (UNVERIFIABLE on
#668, no llms.txt); (2) the manifest COLLISION — I measured it: 2 agent components in one --out
dir leave ONE agent-manifest.json (fixed name, bin/main.rs:559) listing only the LAST; "lists 1
of N" flatters where an empty section would scream; (3) header omitted when there are genuinely
no agent components. Also could-not-check: whether the compiler output dir is copied wholesale
into SERVED output (.route.json precedent is good but is not evidence) — trace at 434b start.

### Round 3 addendum 8 — "red-by-construction" answers BLOCKS-your-PR, not DO-the-numbers-mean-something

Sharpening the bench note in addendum 7 so the next instance does not misread it. "bench is
red-by-construction off a frozen 2026-05-25 baseline" correctly answers ONE question — does it
block this PR (no: bench is outside ci-ok, and a plan-a.yml diff trips the bench: filter on the
workflow path, not on the numbers). It does NOT answer whether the NUMBERS mean something. Do
not let a correct triage of the first question quietly close the second. When bench actually
RUNS (rare — normally SKIPPED), read its numbers as a separate COULD-NOT-CHECK, not noise.
Datum, #667's ready run: bench=FAIL reporting cellx 807->910ns (+12.7%) and wide-fanout-100
5363->6351ns (+18.4%) vs the frozen baseline — either two months of real @aihu/signals drift
or the high-variance flakiness C-FEL-409 targets, and ONE SAMPLE CANNOT TELL. Report it as
could-not-check; NOBODY re-baselines to make it green (that blesses drift as normal and destroys
the evidence it existed — same shape as the bench-arbor STOP in Round 2).
