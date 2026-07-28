# State — verifier

**Project slug:** `aihu`
**Role:** verifier — independent, adversarial, post-hoc. Verifies what is **on
`main`**, not what a PR description claims, and reports verdicts that contradict
the PR when they do.
**Authored by:** the verifier agent, committed at `8fa428d2` on
`srmcguirt/verify-pr-queue`. **Curated into `docs/state/` by the historian**
2026-07-26 at the verifier's request and the orchestrator's ruling — one copy,
not two. The verdicts, receipts and wording below are the verifier's.
**Last updated:** 2026-07-26

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

- **Do not re-verify #689 / C-FEL-MOONGRAPH-LITERALS.** Closed out on `main`
  @ `642860f3`, both halves, both mutation directions — see the addendum.
- **Do not re-triage the "Session ID ... is already in use" inbox errors.**
  Orchestrator measured them 2026-07-28: every cited sid was already replaced by
  the supervisor mint (verifier `1adbd108` vs live `8ab72a0b`), and
  `swarm-bus pull --role orchestrator` was `[]`. They are pre-mint redelivery of
  history, not an outage, and the wedged role was the orchestrator, not us. If it
  redelivers, diff the cited sid against `~/.swarm/agents.json` **live** — never
  against a sid quoted in any state file, this one included; the mint rotates.
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

## Addendum — C-FEL-434b / PR #683 independently reproduced (PASS), and a compiler-test trap

Verdict sent (bus msg 20b9e44e): #683 (readiness CONSUMES the agent-manifest
sidecar) PASSES all three must-fail rows, reproduced end-to-end from a
SOURCE-BUILT compiler on my OWN inputs (scope `billing:write`, tags
billing-card/metrics-card — mine, not the builder's `reports:read` fixture, so
"scope absent from llms.txt" cannot be an accident of the fixture). Row 1
(policy-not-public) holds across /llms.txt, /llms-full.txt AND the mcp
server-card; row 2 (both components listed) via per-tag filenames; row 3 (header
omitted on empty). Containment is a structural ALLOWLIST (toAgentMetadata copies
only tag/describes/state/actions/extract; scope/rateLimit/streamOutput never
referenced). Load-bearing mutation: revert main.rs:568 to the fixed
`agent-manifest.json` → two components collapse to ONE manifest (last-writer-wins)
and the per-tag reader glob finds none → row 2 fails; restore → green.

**THE DURABLE TRAP: a bare `vitest run` on a compiler-consuming test silently uses
a STALE `target/release/aihu-compile`.** The test resolver order is
`AIHU_COMPILE_BIN → packages/compiler/bin → target/release`. My first run (no env
set) picked up a target/release binary left from an EARLIER worktree build (#668 @
9cfcafcc, pre per-tag-manifest) and 3 rows failed with `ENOENT
reports-card.agent-manifest.json` / `[]`. That looks exactly like a diff failure
and would overrule a correct PR. It was the pre-#683 collision reproduced by
accident (the BEFORE direction). ALWAYS `cargo build --release -p aihu-compiler
--bin aihu-compile` at THIS head and `export
AIHU_COMPILE_BIN=<worktree>/target/release/aihu-compile` before running any
sidecar/compiler-output test; a stale binary is an environment red, not a diff
red. Sibling of [[project_aihu_compiler_binary_resolution_trap]].

## Addendum — your own verdicts reconcile to no-claims regardless of --claims (until #686 lands)

Reproduced from source (bus note 6d5c1f71, contract C-SWARM-RECON-AUTHORITY):
the trace reconciler **never reads the structured `claims` column**.
`supervisor.py:686` selects the verdict `body` only and feeds it to
`recon.py`, whose CLAIM_PATTERNS (:95-104) are six first-person past-tense
PROSE regexes (`I filed/claimed/pushed/ran \`...\`/wrote`). `supervisor.py:707`
sets `no-claims` whenever recon reports "0 claims" — which it always does for a
verdict written in structured prose. I proved it three ways via
`recon.extract_claims`: the bus-mandated `pushed:PR#N@sha` format → 0; my own
rich #683 verdict body → 0; a first-person-prose positive control → 3 (so the
regexes work — it's a format mismatch, not a dead instrument).

**What the next instance must not redo / must not misread:** when your PASS
verdict shows up as `no-claims`, that is NOT a rejection of your evidence — it
is this defect. no-claims currently means "we did not check," not "nothing to
check" (orchestrator's ruling). Do not mass-revert or re-file to chase it. The
fix is architect's (C-SWARM-RECON-AUTHORITY / PR #686, draft as of this wake);
once it lands and consumes the claims column, your rows re-derive. Do NOT start
writing verdict bodies in fake first-person "I pushed…" prose to game the regex
— that is the over-extraction the instrument's own comment warns kills it.

**The inverse also holds — do not trust a reconciled `verified` from the trace
path either.** The only 2 firings this session were FALSE POSITIVES: "I wrote to
the file" captures the preposition "to" as the target (recon.py:102), and
backs() (recon.py:173) then matches ANY Bash redirect through a path containing
"to" — e.g. conducTOr — a pure substring coincidence in the pathname, not a real
write (reproduced with a negative control, bus note eb5ae79e). So the current
trace-recon has coverage ~0 AND precision 0/2: BOTH terminal statuses it emits
(`no-claims` and `verified`) are unproven. Trust `verified` only in its RECEIPT
form (merged PR + sha, what the 11 healthy rows show) — architect's R1. Until
R1-R3 land, treat any trace-reconciled terminal status as "not yet checked", in
either direction.

## Addendum — NEVER `git stash` in the disposable verify worktree; the stack is repo-global

Reproduced builder's finding from my own checkouts: `/tmp/verify-0727` (my
disposable verify worktree) and jerusalem BOTH resolve to the same
`git rev-parse --git-common-dir` = `/Users/smcguirt/conductor/repos/aihu/.git`,
and `git worktree list | wc -l` = 132. **The `git stash` stack is per-REPOSITORY,
shared across all 132 worktrees** — not per-checkout like the index lock. Any
agent in any worktree can `git stash pop`/`drop` (both default to stash@{0} =
whoever pushed last, from anywhere) and silently take another agent's work. A
merged contract's only state record (C-FEL-EXTERNALS / #656) was found stranded
in a stash on this stack, on no branch.

**What the next instance must not redo:** to revert a mutation in the verify
worktree, use `git checkout -- <file>` / `git restore` and rebuild (what I do for
the main.rs mutation test) — NEVER `git stash`. If you must shelve work, make a
WIP commit on your own branch (per-branch, reflog-recoverable, cannot be popped
by a stranger). Sibling of the durability discipline: state lives committed +
pushed + findable on remote, never in a stash or workspace-only.

## Addendum — reproduce against the SOURCE artifact, never the reporter's quote of it

Main went red (origin/main 5d485ba9, check+ci-ok FAILURE, CI-confirmed);
builder diagnosed check:moon-graph's extractor as string-literal-blind, reading
`.aihu` test-fixture text (`import { signal } from '@aihu/signals'` at
tests/agent-manifest-sidecar.test.ts:61/:82) as a real import. The diagnosis is
CORRECT and I reproduced it — but ONLY after I nearly refuted it falsely.
Builder QUOTED the regex as `[`"]` (backtick-or-double). I pasted THAT into my
repro and got `[]` — a clean "refutation" of a true claim. The ACTUAL regex in
scripts/check-moon-graph.ts is `['"]` (SINGLE-or-double); the fixture uses single
quotes, so the real regex matches and the real gate fails. A one-character
transcription error in the report flipped my reproduction's verdict.

**What the next instance must not redo:** when reproducing a claim ABOUT code (a
regex, a specific line, a constant), read that code from the source file and run
THAT — never reproduce against the value as transcribed in a bus message or
verdict. A reporter's quote is prose-about-code; it carries exactly the
transcription errors your reproduction exists to catch. Same family as the
compiler `AIHU_COMPILE_BIN` trap (run the real binary, not the assumed one) and
the recon repro (I ran recon.extract_claims itself, not architect's paraphrase of
it) — the load-bearing habit is: the artifact is the authority, the message is a
pointer to it. Also confirmed here, as decisive-test discipline: strip ONLY the
suspected cause (the two fixture lines) and re-run — gate went green (exit 0),
proving single causation, which a "read the code and reason about it" pass would
not have established.

## Addendum — verify a fix on the MERGE OUTCOME, not the PR's own (possibly stale) base

C-FEL-MOONGRAPH-LITERALS / #689 fixed check-moon-graph.ts to skip string
literals + comments. On its OWN head (18d6d6e8, based on 5d485ba9) the gate ran
green and all three mutation cases passed — it would have read as a clean PASS.
But #689 was 2 commits behind main, and the orchestrator's amended bar required
it to ALSO revert the `- 'signals'` edge #685 had since landed on main
(moon.yml:21). #689's diff touched only the script, so **merging it onto current
main LEAVES that edge in place** — the very no-op-that-lies the amendment exists
to remove. I only caught this by overlaying #689's diff onto current origin/main
(3891300a) and running the gate there, and by testing edge-present vs
edge-removed on that merged tree.

**What the next instance must not redo:** a PR that is green on its own base is
NOT necessarily what lands. When the PR is behind main, or the acceptance bar
names a change to MAIN (revert X, remove Y), reproduce on the MERGE RESULT:
`git checkout <current-main>` then `git checkout <pr-head> -- <changed-files>`
(or a real merge) and run the gate THERE. A fix based on pre-change main can
satisfy its own tree while silently not performing a required edit to main.
Sibling of the squash-merge `--is-ancestor` trap (content-on-main is the
authority, not commit ancestry) and reproduce-from-source: the thing under test
is what reaches main, not the branch in isolation.

## Addendum — STAMP every verdict to its head sha with a void-if-head-moves clause

My #689 verdict (f00e3647) PASSED the extractor fix at head 18d6d6e8 and did NOT
stamp a void clause. The head then moved to e85c839d, where the must-fail
mutation (stripNonCode -> identity, observe EXIT=1) had been COMMITTED without
restore — so the 89-line fix I passed was GONE, under a commit subject naming
only the moon.yml revert. A reader acting on my PASS could have landed a PR that
re-breaks main from the identical cause (I reproduced it: check:moon-graph EXIT 1
on the e85c839d tree). The orchestrator caught the head-move; my verdict should
have made it catchable in one command.

**What the next instance must not redo:** a verdict is a measurement of a
specific tree, and its relevance EXPIRES the instant the head moves (positive
measurements are stable on their sha, not across shas — the temporal-absence
rule's twin). EVERY verdict MUST: (1) quote the exact head sha it measured, and
(2) carry an explicit VOID clause — "void if `gh pr view <N> --json headRefOid`
differs" — plus, where there is a one-command integrity check, name it (here:
`git show <head>:scripts/check-moon-graph.ts | grep -c stripNonCode` MUST be 2).
Builder did this on #685 and it is why their #685 verdict could not silently
rot; I did not on #689 and it nearly cost a re-break. A COMMIT MESSAGE IS NOT A
DIFF: verify head CONTENTS (grep the artifact), never the subject line. This is
the ci-receipt void-clause discipline applied to my own output, not just to CI.

## Addendum — a gate command's ZERO must be proven to come from a command that RAN

I published `git show <head>:scripts/check-moon-graph.ts | grep -c stripNonCode
-> must be 2` as the #689 landing gate in three verdicts. Builder found — and I
reproduced — that its scripted form gives a FALSE STOP on a correct PR:
  git show "<interpolated-or-mangled-ref>:path" 2>/dev/null | grep -c X  -> 0
git-show exits 128 on a bad ref (interpolating a headRefOid can eat `:scripts/chec`
off the end), `2>/dev/null` swallows the error, grep sees empty input and prints
0 — BYTE-IDENTICAL to a real "X is absent". A count of zero from a command that
never ran is indistinguishable from zero from a command that did.

**What the next instance must not redo:** when a verdict/gate command's negative
result is load-bearing (grep -c == 0, "no rows", empty output = FAIL/absent),
assert the command RAN before trusting the zero: use a LITERAL sha not an
interpolated var, NEVER `2>/dev/null` on the gate command, and check the exit
code — a non-zero exit is could-not-check, NOT "absent". Cross-check with a
second instrument (here `git show --stat` said +89 while the fragile grep said 0;
the disagreement is the signal). This is the same absent-value-rendered-as-real
family as the reconciler's 0-claims and the premature-absence door — now at the
command-execution layer, inside a gate I authored. The zero you must fear is the
one from a command that failed silently.

## Addendum — #689 CLOSED OUT ON MAIN (642860f3); a voided verdict is re-run, not re-reasoned

The void clause I wrote one wake earlier did its job. My #689 PASS was stamped to
head `18d6d6e8`; the head then moved to `e85c839d` (fix committed away under a
moon.yml-revert subject) and finally to `046807ef`, merged as **`642860f3`**,
which is `origin/main`. I did NOT reinstate the old verdict — a voided
measurement is void, so I re-ran the whole bar on the **merge commit**. Verdict
`df181aeb`: PASS, both halves on main.

| check (literal sha, no `2>/dev/null`, exit read) | result |
|---|---|
| `git show 642860f3:scripts/check-moon-graph.ts \| grep -c stripNonCode` | **2**, EXIT 0 (command RAN) |
| cross-instrument `grep -n` in checked-out tree | `:220` def, `:272` call — two instruments agree |
| `bun scripts/check-moon-graph.ts` @642860f3 clean | **EXIT 0** |
| `git show 642860f3:packages/plugin-agent-readiness/moon.yml` | `agent, agent-service, server` — the no-op `- 'signals'` edge from #685 is **gone** |
| mutation: `stripNonCode` → identity | **EXIT 1**, reproducing the original false `- 'signals'` edge verbatim |
| mutation: delete the **real** `- 'server'` edge | **EXIT 1**, `must add - 'server'` |
| wiring | `plan-a.yml:85` in `check`, no `if:`, no `continue-on-error` |
| `gh api commits/642860f3/check-runs` | 14 runs, **all `completed`**, `check`+`ci-ok` success |

**The second mutation is the one that was missing from my earlier passes and is
the durable addition.** For a fix that makes a scanner *ignore* text, proving it
now ignores the fixture (direction 1) is only half — a stripper that ate too much
would also be green. Direction 2 (delete a genuine edge, demand RED) is what
separates *correct* from *blind*. **Whenever a fix narrows what a gate looks at,
mutation-test that the gate can still SEE the real thing.** Green-by-blindness is
this repo's recurring failure (three gates in Round 1 alone); a narrowing fix is
the way it gets introduced deliberately.

Reverted both mutations with `git checkout -- <file>`, never `git stash` (stack
is repo-global across 133 worktrees). Worktree `/tmp/verify-0727` left clean.

## Addendum — an ABSENCE is only evidence once you've shown it had its chance (spatial AND temporal)

From orchestrator's C-FEL-CI-RECEIPT ruling: the repo's named defect
`absent-value-rendered-as-real` has a TEMPORAL door verifiers walk through.
- POSITIVE measurement is STABLE: "check succeeded on sha S" stays true forever;
  only its RELEVANCE expires (void if the head moves). That is the right expiry.
- NEGATIVE measurement is NOT STABLE: "ci-ok is absent on sha S" can flip with
  the PASSAGE OF TIME ALONE — nothing changing, no head moving. A check-run set
  has a ~2-minute gap between `check` finishing and `ci-ok` posting; an absence
  read inside that gap is premature, not a finding. Its expiry is not "void if
  head moves" — it is **VOID UNTIL THE PIPELINE IS KNOWN COMPLETE**.

**What the next instance must not redo:** before you report ANY absence as a
finding or could-not-check, prove it had its chance to appear — (1) SPATIALLY:
assert the positive precondition is present so the absence isn't vacuous (I did
this in #683: asserted the sidecar CONTAINS `reports:read` before asserting
llms.txt does NOT); and (2) TEMPORALLY: confirm the producing process is
COMPLETE (pipeline finished, run concluded, query over settled state), not
observed mid-flight. Same family as the [[project_aihu_measurement_traps]] WAL
stale-snapshot and the empty-`${PIPESTATUS}` traps: the read was taken before the
state settled. An absence taken too early is the fifth thing this pattern has
bitten this session.
