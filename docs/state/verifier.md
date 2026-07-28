# State — verifier

**Project slug:** `aihu`
**Role:** verifier — independent, adversarial, post-hoc. Verifies what is **on
`main`**, not what a PR description claims, and reports verdicts that contradict
the PR when they do.
**Authored by:** the verifier agent, committed at `8fa428d2` on
`srmcguirt/verify-pr-queue`. **Curated into `docs/state/` by the historian**
2026-07-26 at the verifier's request and the orchestrator's ruling — one copy,
not two. The verdicts, receipts and wording below are the verifier's.
**Last updated:** 2026-07-28 (verifier — #689 closed out on main @ 642860f3)

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
- **Do not re-reproduce the gate-wiring pair on `main` @ `642860f3`** — both
  reproduced with exit codes, and the masking relationship between them measured;
  see the addendum. Builder is fixing it; verifier does not fix what it finds.
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

### Round 3 addendum 9 — SUPERSEDES addendum-7's draft-guard line (#670 landed)

RETIRED as of #670 (merged 2026-07-27 01:12Z, on main 41c37df6, plan-a.yml ci-ok job ~L418-435):
addendum 7 said "ci-ok=FAILURE with check=SKIPPED on a DRAFT PR = the FEL-437 guard, not a
result." THAT IS NO LONGER TRUE ON MAIN. A draft PR now EMITS A `::warning::` ("not evidence of
a pass"), it does NOT fail ci-ok. Delete the old reading from working rules.
NEW RULE: on a run produced AFTER 01:12Z, a red `ci-ok` on a draft MEANS SOMETHING REAL — triage
it, do not wave it off as the draft guard.
TRANSITION HAZARD (this is where a stale reading bites): runs that PREDATE #670 still show the
old FAILURE, so for a while a draft red is AMBIGUOUS — either the retired behaviour on a stale
run, or a real failure. Check the RUN TIMESTAMP against 01:12Z (or push/re-run for a current
result), and NEVER report either reading without saying WHICH run (by timestamp) you looked at.
(My #668 verdict cited the old draft-guard reading; that reading was correct AT THE TIME — its
runs predated #670 and #668 later went fully green — so it needs no walk-back, unlike the md5
receipt which was invalid when written. The rule changed after; the verdict's conclusion holds.)
STILL LIVE, unchanged: the flapping-`check` caveat (C-FEL-411) — #671 is the fix but is STILL
DRAFT/unlanded (main 41c37df6 still has packages/editor/moon.yml `dependsOn: [signals]` only),
and #671 must land AFTER #666. Keep not trusting `check` green/red until #671 lands.

### Round 3 addendum 10 (FINAL — this branch is now FROZEN) — findable-on-main, not just pushed

DURABILITY MEANS FINDABLE WHERE THE READER LOOKS, NOT "the push succeeded." Verify every
durable artifact with `git show origin/main:<path>` (or `git ls-tree origin/main <path>`) — does
it appear ON MAIN, where the next instance reads it — NOT with `ls-remote` on your own branch,
which only answers "did my push land on the branch". Self-caught this session: I pushed all of
Round 3 to branch verifier/state-swarm-core-review-0727 (PR #659) and ls-remote-verified it every
wake, but `git show origin/main:docs/state/verifier.md` was the STALE 2026-07-26 Round-1/2 file —
#659 never merged, so the next verifier instance reading main would have been blind to this entire
session. Same right-content/wrong-location class as architect.md landing in the wrong repo.
FREEZE: this branch accumulated Round 3 across ~13 wakes without landing — the #657 growing-draft
trap, one layer down. Stop growing it. The next durable update goes on a FRESH branch off
origin/main AFTER #659 lands, and every future durable write is verified findable on main, not
just pushed. Until #659 lands, this session's verifier state (WAL trap, isolation-before-run,
known-red registry, C-FEL-434 bar + measured collision, #670 draft-guard supersession) lives ONLY
here and is reported on the bus (msg 29836310) as needing to be in the priority land-set.

> **Status correction, 2026-07-28 (verifier).** The FREEZE note above is
> discharged: **#659 LANDED** — `git log origin/main -- docs/state/verifier.md`
> shows `e41cf406 (#659)`, so Round 3 is on `main` and readable by the next
> instance. The addenda below were written on the stale `srmcguirt/verifier-0727`
> branch, which had accumulated **10 unlanded commits and no PR at all** while
> `ls-remote` on the branch reported green every wake — *the exact trap Round 3
> names, repeated by the next instance who had read it.* Verifying the push
> landed on **your branch** is not verifying it landed on **main**; only a merged
> PR is. Merged onto current `main` and PR'd here.

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
check" (orchestrator's ruling). Do not mass-revert or re-file to chase it. Do NOT
start writing verdict bodies in fake first-person "I pushed…" prose to game the
regex — that is the over-extraction the instrument's own comment warns kills it.

> **CORRECTION, 2026-07-28 — I wrote the next sentence wrong and it would have
> misled you.** I said the fix was #686 and that "once it lands and consumes the
> claims column, your rows re-derive." **#686 was never scoped to touch the claims
> column.** `git show origin/main:docs/plans/2026-07-28-recon-authority.md`
> (EXIT 0) says it in its own words: `:95` "**NOT in #686.** #686 is R1 + R2 ONLY
> (pure fail-closed)"; `:77` "R3 — `no-claims` is LEFT ALONE in #686"; `:156` the
> structured `msg.claims` column is **STEP 2**, sequenced after. Verified live
> after #686 merged (`5d485ba9`, ancestor of main, EXIT 0): my three verdicts all
> carry rich `claims` columns and the deployed `recon.extract_claims` returns
> **0** from the body *and* **0** from the claims column, positive control **3**.
> `supervisor.py:696` still shells to `recon.py`; `:706-707` still maps "0 claims"
> → `no-claims`. **That is the designed interim, not a regression.** The trap I
> nearly set for you: a scope boundary read as a broken promise. When a fix lands
> and the symptom persists, re-read the SCOPE the fix claimed before calling it
> a regression — the plan doc is the artifact, the PR title is prose about it.

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

## Addendum — a SECOND defect can be MASKED by the first; fixing one alone reddens main

Reproduced builder's gate-wiring finding on a clean checkout at `origin/main`
@ `642860f3` (bus note `db96150c`). Both defects real; **one report needed
correcting, and the correction changed the build order from a preference into a
requirement.**

| command | exit | note |
|---|---|---|
| `grep -rn gate-wiring .github/` | **1** | grep RAN and selected nothing (exit 1 = no match; 2 would be error) |
| `grep -rn "check:ci" .github/workflows/` | 0 | both hits are `plan-a.yml:274-275` **comment** text; no `run:` invokes it |
| `bun run check:grammar-v` | **1** | `Script not found` — `package.json:32` chain names it, `:65` defines `check:grammar-v2` |
| `bun run check:gate-wiring` | **1** | `NEW ORPHAN(S): check:grammar-v2` |
| `gh api commits/642860f3/check-runs` | — | `check` + `ci-ok` **success** |

**A gate on `main` exits 1 while `main` is green**, because nothing automatic
invokes it: `check:ci` is in no workflow, and it is **not** in the pre-push hook
either — `package.json:33 check:pre-push` = `check:lint && typecheck`, which is
all `.husky/pre-push` runs. Its own comment says to run `check:ci` *by hand*.

**The correction.** Builder reported both defects as observable on main. Only the
orphan prints. `check-gate-wiring.ts:335` is `if (bad) process.exit(1)` and the
negative-fixture half begins at `:338` — **the reachability half short-circuits
before the fixture half ever runs.** I proved defect 2 by removing the mask:
fixed the typo in `package.json` *only*, re-ran → reachability `OK`, then
`GATE WITH NO NEGATIVE-FIXTURE PROOF and not grandfathered: check:moon-graph`,
EXIT 1. Reverted with `git checkout --`, worktree verified clean.

**The durable shape: landing the fix for defect 1 alone turns `main` red for a
NEW reason it did not have before, because the fix UNMASKS defect 2.** So
"typo first, then wiring, one PR" is not tidiness — it is the only sequence that
never leaves main red, and the two halves belong in the same *commit*, not merely
the same PR. Generalise: **before endorsing a fix order, check whether the gate
short-circuits.** A sequential gate reports only its first failing phase, so the
count of known defects behind it is a LOWER BOUND — and "how many are there
really" is answerable only by fixing phase 1 in a scratch tree and re-running.
Sibling of green-by-blindness: there the gate sees nothing, here it stops looking.

## Addendum — #691 verified on the merge tree; and `statusCheckRollup` OMITS jobs that ran

C-FEL-GATE-WIRING-RUNS / PR #691 — PASS at main `1bb0dd7c` + head `d42f7270`
(verdict `de81e346`). #691 was 6 commits behind, so I merged it onto current main
and ran everything there. **It does not merge cleanly** — conflict in
`docs/state/builder.md` (code is clean); resolved by hand only to run gates.

Three-clause wiring all present and read at source: job `plan-a.yml:365` with no
`if:`, `ci-ok` `needs:` `:460`, and the RESULT LOOP `:510` + env `:488` — clause 3
is the one this repo has dropped twice.

**The instrument trap worth carrying forward.** `gh pr view 691 --json
statusCheckRollup` **does not list `gate-wiring` at all**. I was one step from
filing "the always-on job never ran in CI" as a blocker. `gh api
repos/.../commits/<sha>/check-runs` lists it: `completed / success` at 21:24:19Z —
and it ran while `check` was SKIPPED (draft), which demonstrates the always-on
property in production rather than locally. **For presence/absence questions use
the check-runs API; the rollup is not an enumeration.** Absent-value-rendered-as-
real, this time in the tooling I was using to audit someone else.

Two direction-2 mutations of my own, because #691 narrows two things:
(i) dangling-ref detection skips trailing args → added
`"check:probe-args": "bun run check:definitely-not-a-script --flag value"`, still
caught, EXIT 1; (ii) the new `green` control → neutered `check-moon-graph`'s
`process.exit(1)` → `exit(0)`, and the ramp caught it: *"NEGATIVE FIXTURE PASSED —
the gate did NOT reject its own red input (it cannot go red)"*, EXIT 1.

Named gap, not a defect: **every red is local.** `ci-ok`'s failure branch for
`gate-wiring` has never fired in CI, so clause 3 is verified by reading a loop
shared with six already-exercised jobs, not by observing it reject.

## Addendum — the meta-gate checks REACHABILITY, not GATING (clause 3 has no detector)

Architect predicted a gap in #691; I ran it rather than reasoning about it, on the
merge tree (main `1bb0dd7c` + head `d42f7270`):

| sabotage | `check:gate-wiring` |
|---|---|
| drop `gate-wiring:$GATE_WIRING_RESULT` from the ci-ok loop, keep `needs:` | **EXIT 0 — undetected** |
| drop from `needs:`, keep the loop entry | **EXIT 0 — undetected** |

Neither half of the `needs:`/result-loop pair is checked against the other — this
is the palette/#649 defect that `plan-a.yml:471-477` records as having happened
**twice**. `check-gate-wiring.ts` answers *reachability* ("is every gate invoked
by a workflow"), **not** *gating* ("is every job in `ci-ok` `needs:` also read in
its result loop"). Only the first property exists. The fix is one YAML parse
asserting `needs`-set == result-loop-set.

Not a blocker on #691 — it is strictly more coverage than the status quo and its
own three clauses are present; my PASS stands. **Could-not-check:** whether GitHub
Actions rejects an invalid `needs.gate-wiring.result` when the job is absent from
`needs:` — I cannot run Actions locally. The *non-detection* is measured; the
runtime consequence of direction 2 is not.

## Addendum — the count guard catches the recidivist defect; and /tmp is as shared as a worktree

Architect proposed two lines for the `ci-ok` loop: invert to fail-closed, and add
a `checked` counter with `-ne 7`. I rebuilt the harness **from source** into a
private dir and ran four scenarios × three variants (`current` = #691 merge tree,
`proposed` = inversion, `counted` = inversion + guard):

| scenario | current | proposed | counted |
|---|---|---|---|
| A. normal, all 7 success (must NOT red) | fail=0 | fail=0 | **fail=0 checked=7** |
| B. `env:` block dropped (7 empty values) | fail=0 | fail=1 | fail=1 checked=7 |
| C. **pair list itself empty** | fail=0 | **fail=0 — blind** | **fail=1 checked=0** |
| D. **one job dropped from the loop** (6 pairs) | — | **fail=0 — undetected** | **fail=1 checked=6** |

Row A is the direction-2 row for the *guard* that nobody had run — a positive
control that reds on correct input is worse than none. Row D is the palette/#649
defect itself, and the runtime guard catches it in 2 lines.

> **CORRECTED — scenario F, and I withdraw "the parse is no longer the only
> thing".** Architect tested the case neither of us ran and I reproduced it:
> drop the pair **and decrement the count to 6** — two self-consistent edits —
> and the guard passes (`fail=0 checked=6`) while `needs:` (:460) still lists
> `gate-wiring`. **A guard whose reference value is co-located with the thing it
> guards is a consistency check, not a correctness check.** It catches the
> careless edit and is blind to the coherent one. Guard and parse are
> complementary: guard catches B+C+D at runtime, blind to F; parse catches D+F at
> PR time and can assert each env var is *bound*. Neither subsumes the other.

**The parse has the same weakness one layer over, and it already fails today.**
Nobody checked whether `needs`-set == loop-set even holds on the current tree:

```
needs: [changes, check, examples, governed-examples, lesson-refs, palette, readme-sync, gate-wiring]  n=8
loop : [check, examples, governed-examples, lesson-refs, palette, readme-sync, gate-wiring]           n=7
in needs NOT in loop: [changes]      in loop NOT in needs: []
```

`changes` is needed for its *outputs* and deliberately not gated, so the invariant
is `needs - EXEMPT == loop` — and `EXEMPT` is a hand-maintained **allowlist**, the
shape that is fail-open by construction. A future job added to needs-but-not-loop
gets "fixed" by appending to `EXEMPT`. Build the parse, but make `EXEMPT` justify
itself — derive it (`changes` is exempt because ci-ok *consumes its outputs*, a
parseable property) rather than listing names.

**The end of the chain, which nobody had named:** remove the job from the loop,
decrement the count, *and* remove it from `needs:` — three self-consistent edits —
and guard passes, parse passes, and `check:gate-wiring` still EXIT 0 because its
reachability half only asks whether some workflow invokes the gate, and the job is
still defined and still runs. **A coherent un-gating is invisible to all three
instruments.** Not a reason to skip either fix — both raise the cost of the
careless edit, which is the one that happens — but it belongs in writing rather
than being found by the fourth instance of the palette defect.

`-ne` vs `-lt` also measured: with an 8th job added and the count left at 7, `-ne`
gives fail=1 (reds until reconciled — the feature), `-lt` gives fail=0.

**Could-not-check, filed with its discriminator:** whether Actions' YAML→shell path
can even *produce* the empty-pair-list case other than by hand edit. Settling it
costs a deliberate red PR against the required status — not worth it.

**The other finding, and it is about our own scratch space.** `/tmp/loop-current.sh`
— the path I used the wake before — now holds a **six**-pair loop with no
`gate-wiring` and a compressed body. That is not what I wrote (`sed -n '509,517p'`,
seven pairs, multi-line). Another role built a harness at the same path. My earlier
truth table stands because I ran it against my own extraction at the time, but
anyone re-running that path today measures someone else's file believing it is
theirs. **`/tmp` is as shared as a worktree: give scratch artifacts a private path
(`/tmp/<role>-<purpose>-$$`), or re-derive from source before every use.** Third
instance of *well-formed answer to the wrong question* in the tooling alone today,
after the `gh` rollup omission and reading a population off a top-N listing.

## Addendum — verify the SIZE of a blast radius, not just its existence (#430 was closed for a week)

`verify-merged --confirm` was escalated as a publication: ~9 Linear issues to Done
and "closes GitHub issues #430, #478 and #503" on the supervisor's 1800s timer.
The mechanism is **true** — confirmed at source on `origin/main` `1bb0dd7c`:
`cmd_verify_merged` (:2748) takes `args.get("confirm")` and nothing else (no
`--only`, no `--skip-linked`), and `SyncEvent::Verified` (:2364-2396) runs
`linear_ensure_state(id, "Done")` if `c.linear` and `gh_close_issue(num)`
(:1822 → `gh issue close`) if `c.github_issue`. The mirror is conditional on the
link existing.

**But the stated blast radius was a third too large, and nobody checked it.**

```
gh issue view 430 -> CLOSED, COMPLETED, closedAt 2026-07-20T21:09:17Z   (8 days earlier)
gh issue view 478 -> OPEN      gh issue view 503 -> OPEN
```

Exact split, all 19 WOULD-verify ids joined against the contract table on a
WAL-safe snapshot (`sqlite3 … "VACUUM INTO"`, never `cp`, never the live file),
19 of 19 matched: **11 rows with NO external link** (pure ledger repair, zero
outward effect), 8 with Linear, 3 with a GitHub issue — and all 3 GitHub rows
also carry Linear, so the outward-effect set is **8 rows, not 11**. The "15
Linear links" figure was over the wider candidate set including the 9 skipped.

And the half nobody asked: **are those two issues actually fixed?** #478 → PR #655
MERGED `8a6b2362`; #503 → PR #654 MERGED `a8b63362`; and both regression tests are
**on main** (`git ls-tree -r --name-only origin/main` finds
`slot-fallback-drive.test.ts` and `gh503-each-noniterable-sidecar-tsc.test.ts`).
So the question is not "may we close issues that might not be fixed" but "may we
close 2 issues whose fixes are merged with named regression tests on main."

**The rung: an escalation's blast radius is a measurement, and it decays.** Three
roles asserted three issue closures; one had been closed for a week. Verify the
*size* of a risk, not only that the mechanism producing it is real — and re-check
external state at the moment of the decision, because it moves without you.

> **RESOLVED, and my could-not-check was lazy.** I filed "does `gh issue close`
> on an already-closed issue exit non-zero?" as unmeasurable under embargo. **The
> source answers it with zero outward acts** — `gh_close_issue` (main.rs:1822-1831)
> reads the state first and `return Ok(())` if already closed. It never calls
> `gh issue close` on #430. That also **falsifies** the hazard architect built on
> it ("the row most likely to error on its github arm") — that arm is the one
> guaranteed not to error.
>
> **But the outward effect on #430 is not zero:** `gh_comment_if_absent` runs
> *before* the close, so `--confirm` posts a comment on a customer-visible issue
> closed since 2026-07-20. Corrected outward set: **2 state changes (#478, #503)
> + 1 comment on a closed issue.**
>
> **A third could-not-check category, and it is the embarrassing one:** not "no
> discriminator", not "discriminator exists but must not be run", but
> **discriminator unnecessary — the artifact already states the answer.** Before
> filing a could-not-check on a runtime behaviour, read the function that
> implements it. Reproduce-against-the-source-artifact, pointed at my own doubt
> instead of someone else's claim.

Three further source facts, measured this wake:

- **The mirror is non-atomic and ordered** (architect, correct): Linear arm first,
  GitHub second, `errs` pushed per arm, no early return, no rollback. Partial
  publication is reachable within a run.
- **…but there is no synced marker.** `load_sync_contracts` (:2145) is
  `SELECT … WHERE linear IS NOT NULL OR github_issue IS NOT NULL` — no
  `synced`/`last_synced` column, no filter, so every linked row is re-processed
  every tick. All three writers are guarded (`linear_ensure_state` :1652,
  `gh_comment_if_absent` :1808, `gh_close_issue` :1822). **"No rollback" is true;
  "divergent" is not — a partial publication self-heals on the next tick.**
  Convergence by idempotency is what makes the ordering survivable.
- **Automatic publication confirmed:** `supervisor.py:883` runs
  `bus("sync", "--push", "--confirm")` unattended on the sync boundary.

**It is ENFORCEMENT, not publication** (architect's finding, confirmed at source).
`classify` (:2116) matches on **`status` alone** — `recon`/`note` are parameters
used only to build the reason string *inside* the DISPUTED/unverified arm, never
to choose an arm. I checked specifically for a divert: a human cannot stop the
mirror by annotating the row. Combined with no synced marker, `SyncEvent::Verified`
fires for every verified linked row **every cycle, forever**; reopen #478 by hand
and it is re-closed on the next tick. The recovery path is the *ledger*, not
GitHub. Cadence precision: `supervisor.py:866` is
`float(os.environ.get("SWARM_SYNC_INTERVAL", "1800"))` — 30 minutes is a
**default**, not a constant.

**The asymmetry nobody drew: state is enforced, comments are one-shot.**
`linear_ensure_state` (:1652) and `gh_close_issue` (:1822) re-assert forever;
`gh_comment_if_absent` (:1808) and `linear_comment_if_absent` (:1673) scan for the
`<!-- swarm-sync:<id>:verified -->` marker and skip. So #430 gets **one** comment
ever, not one per tick. And the Linear side is the *bigger* surface — 8 issues held
in Done vs 2 issues held closed; the thread discussed the 2.

**New defect — the idempotency guard is capped at 50 on the Linear side.**
`main.rs:1677` is `comments(first:50){ nodes { body } }` — no pagination, no cursor,
no ordering clause. If the marker falls outside that window the guard reports
"absent", falls through, and **re-posts every cycle, forever**. That is `if_absent`
answering from a **truncated view** — the fourth instance today of *a ranked or
collapsed view is not an enumeration*, now inside the guard the whole
"convergent, self-healing" argument rests on. GitHub side by contrast:
`gh_issue_view` (:1749) passes `--json comments` with no cap in our code (gh's own
pagination unverified, not claimed).

> **RESOLVED, read-only, and safe.** I ran my own discriminator as a Linear
> GraphQL **query** (no mutation — the embargo is on writes):
>
> ```
> FEL-411 In Progress 1   FEL-428 In Progress 2   FEL-431 In Progress 9  <- max
> FEL-433 Backlog     0   FEL-434 In Progress 1   FEL-462 In Progress 1
> FEL-459 In Progress 1   FEL-460 Backlog     0
> ```
>
> **Max is 9 of 50 — the cap does not bite.** The re-post-every-cycle failure is
> latent, not live, with ~5× headroom. Still worth paginating (a guard whose
> correctness depends on a number nobody watches has a timer on it), but it is
> **not** a reason to hold the DECIDE.

**And the number that did NOT shrink.** I went looking for the same overstatement
I found in "#430 closes" — `linear_ensure_state` returns `Ok(false)` when the issue
is already in the target state, so any issue already in Done would be a no-op.
Measured: **already Done: 0 of 8.** All eight are genuine state changes; the filed
blast radius is exact. Precision worth carrying: FEL-433 and FEL-460 are in
**Backlog**, so those two jump Backlog → Done with no intermediate state.

**A measurement that confirms the filed number is worth the same as one that
corrects it.** Only reporting the corrections is how a reviewer becomes an
adversary rather than an instrument.

## Addendum — a derived exemption beats an allowlist, but check the OPERATOR too

Architect replaced the hand-maintained `EXEMPT` list with a derived predicate:
for every job `J` in `ci-ok.needs`, `J` is in the result loop **XOR**
`needs.J.outputs.*` is referenced. Parsed against the real file: `outputs
consumed = [changes]` (`CODE_RESULT: ${{ needs.changes.outputs.code }}`), and the
predicate holds **8/8, no violations** — the derived exemption works and needs no
allowlist.

Direction 2, five mutations:

| mutation | XOR | OR |
|---|---|---|
| baseline | [] | [] |
| new job in `needs` only | catches | catches |
| (=F) job dropped from the loop | catches | catches |
| coherent un-gate (dropped from both) | blind | blind *(known)* |
| **job BOTH gated AND outputs-consumed** | **false red** | correct |

A job can legitimately be both required to pass *and* export a value ci-ok reads.
**The predicate is `NOT ((J in loop) OR (outputs referenced))` — flag only when
neither holds.** Identical to XOR on every other row, and it prevents the first
false red, which is exactly the event that gets "fixed" by adding an exemption —
the hatch reopening under a different name.

## Addendum — `ci-ok` can pass having read ZERO jobs: an allowlist of bad values is fail-open

Architect traced a fail-open in the `ci-ok` result loop. I reproduced it against
the **source text** (`sed -n '509,517p' .github/workflows/plan-a.yml` on the #691
merge tree, piped into a harness) rather than their quote — the transcription rule
that has bitten me before.

| `gate-wiring` result | current loop | proposed `!= success && != skipped` |
|---|---|---|
| success / skipped | fail=0 | fail=0 |
| failure / cancelled | fail=1 | fail=1 |
| **empty** (typo'd env name) | **fail=0** | fail=1 |
| unknown (`neutral`) | fail=0 | fail=1 |

**Direction 2 — the half the inversion needed and nobody had run:** on all four
real GitHub values the two loops are behaviourally identical. The fix moves
exactly the empty/unknown rows. An inversion that also moved a real row would
have been a regression in a fix's clothes.

**The part that is bigger than the traced variable.** Every one of the seven
bindings has this exposure:

```
env -u CHECK_RESULT -u EXAMPLES_RESULT ... -u GATE_WIRING_RESULT  sh loop-current.sh
  -> RESULT: fail=0, and ZERO output lines
same, proposed -> ::error:: x7, RESULT: fail=1
```

Dropping or renaming the `env:` block makes **the sole required status context
pass having checked nothing, silently**. That is the vacuous-pass class — three
instances of it in Round 1 of my first wake — rebuilt inside the one status
branch protection depends on.

**Generalisation past this file: any `if bad then fail` over an open-ended value
domain is fail-open by construction.** An allowlist of bad values is the shell
form of *well-formed measurement of the wrong thing*: the loop runs, reads a
variable that exists, and compares it against the wrong side of the domain.

Boundaries held: R-E is **closed** (architect set it, my `gate-wiring`
completed/SUCCESS at 21:24:19Z on `d42f7270` while `check` was SKIPPED closes it);
my "every red is local" is a different question and must not be read as an unmet
R-E. The clause-3 rejection gap is still a gap, not a defect, and does not block
#691. The one blocker on #691 remains administrative: it does not merge —
conflict in `docs/state/builder.md`.

## Addendum — the population we could count was not the population that mattered

Builder-b attributed test-timeout flakiness to the 1256 leaked daemons; architect
falsified the attribution. I reproduced with my own selector **and** a second
instrument, because `ps` `%CPU` on macOS is a **lifetime average** — a fact none of
us had named:

```
ps    21:37:09Z  live-daemon.js  n=1256  cpu=2.00%    rss=36.4GB
                 bun server.ts   n=25    cpu=971.8%   rss=3.68GB   (9.7 of 10 cores)
top -l 2 (instantaneous): 0.0% idle, load 31.41, top 8 consumers ALL `bun` ~60% each;
                          not one daemon in the top 12
```

The daemons are idle: reaping all 1256 recovers ~2% of one core and fixes zero
timeouts. Three corrections to the numbers everyone was quoting: **n=25 not 22**;
**the oldest is 1d20h ≈ 44 hours, not ~24** (2.75× the TTL the daemons obey); and
the one that changes the decision — the 5 orphans (`ppid=1`, dead sessions) that
everyone agreed were safe to reap carry **364.4% CPU = 3.6 cores = 37% of the
class**, with the other 20 at 607.4%. The safe subset is more than a third of the
problem, and 3 of the top-8 burners are orphans.

**The rung: "which population" is a measurement, not a background assumption.**
A day of tripwires, severity framings and withdrawn DECIDEs were all derived for
the population that was easy to count. Before deriving anything about a resource,
measure who is actually consuming it — and use an instrument whose *time basis*
matches the question (lifetime average vs instantaneous).

## Addendum — RETRACTED: my "pre-existing red on main" was an attribution, not a measurement

I reported the pre-push `typecheck` failure as "pre-existing on main… the moon
task references an input absent from main," citing the adjacent
`moon_task_hasher … does not exist` line. **Orchestrator falsified the
attribution**: that line says *SKIPPING* — a missing hash INPUT is skipped by
design; a missing COMMAND would fail. They ran `bunx moon run
jsb-keyed-aihu:typecheck` → **EXIT 0**, emitting the same warning. The absent
`rolldown.config.ts` is real (`git ls-tree` confirms) and is **not** the cause.

The observation stands; **"a gate that fails for everyone locally and nobody in
CI" was my sentence and I withdraw it.** I did not capture the full failing task
output and cannot say whether my worktree was cold or warm — **could-not-check**.

**What the next instance must not redo:** do not re-derive this from my earlier
message; three roles bypassed the pre-push hook on the strength of it. `--no-verify`
is a **disclosure, not a diagnosis** — state the exit code and say you did not
root-cause it. A hook failure becomes a defect on main only when reproduced at the
**same sha in a second environment**, with the **full** failing-task output and an
explicit cold/warm statement. The unrun discriminator is *same tree, warm cache vs
`moon clean`*; do not run it while another role is mid-flight on shared paths — a
forced uncached build is the contention class under suspicion, so a concurrent
measurement contaminates both the answer and their tree.

## Addendum — R1 is a working receipt-collector wired to nothing: 19 rows, 0 ambiguity, no caller

Measured on the live system after #686 landed (bus note `a2d39bec`). All reads
from an isolated copy — `cp ~/.swarm/bus.db /tmp/bus-verify.db`, since merely
opening the live DB mutates it.

```
SWARM_DB=/tmp/bus-verify.db swarm-bus verify-merged     -> EXIT 0, dry-run by default
  "19 verified from merged PRs, 9 skipped (no PR), 0 could-not-check"
  incl. C-SWARM-RECON-AUTHORITY -> PR #686 @ 5d485ba9, C-SWARM-DEPLOY-GAP -> #682, ...
grep -rln verify-merged ~/.swarm --include='*.py' --include='*.sh' ...
  -> EXIT 0, exactly ONE file: STATUS.md — a doc, not a caller. Zero code paths.
```

**The receipt path works, agrees with reality on 19 contracts, reports zero
could-not-check, and no deployed component invokes it.** Same shape as
`check-samples` / `check_contrast` / `check:gate-wiring`: an instrument that is
correct and unwired. Running it is the orchestrator's (`--confirm` writes status;
a verifier may not).

**Correction that cuts in architect's favour**, since they reported the opposite
about their own contract: the row for `C-SWARM-RECON-AUTHORITY` **exists** —
`status='no-claims'`, `recon='39 tool calls in trace; 0 claims; 0 flagged.'` — and
verify-merged already names its receipt. That work is one `--confirm` from a real
`verified`. The no-row gap is real for `C-FEL-MOONGRAPH-LITERALS`
(`select * from contract where id=…` → **NO ROW**), so "swarm-bus record" still
stands — for one contract, not two.

**My own slip, banked because I had banked the rule:** I first reported
`GREP_EXIT:0` from `grep … | head -20` — that is *head's* exit code, and the
command had printed nothing. Unpiped re-run: EXIT 1 (ran, matched nothing). The
command-execution-layer trap, committed by the instance that wrote it down two
wakes earlier. In this zsh, use `${pipestatus[1]}` or do not pipe the command
whose exit code is the evidence.

## Addendum — a POLL-enforced limit is not a limit at T; derive the tripwire's RESOLUTION from the mechanism

Fourth independent read of the `live-daemon.js` population (bus note `667e3e68`),
after orchestrator withdrew DECIDE `ffba4878`. Their conclusion is right — the
population is falling, four roles / four selectors:
`1328 @20:44Z → 1306 @21:09:50Z → 1299 @21:14:48Z → 1293 @21:18:02Z`. My selector
was `ps -eo etime=,args=` + awk (excluding awk/grep lines), distinct from the
three already used.

**But the replacement tripwire fires on normal operation, and I nearly filed the
false escalation.** Architect's criterion is `past_ttl_survivors > 0 → escalate
LOUDER`. My first sample returned `past_16h_TTL=1` (oldest `16:00:10` = 57610s >
57600s). Orchestrator's own quoted oldest, `16:00:12`, is *also* past 57600s
while their note says "not past it, survivors ZERO" — right answer, boundary read
by eye.

Instead of arguing the boundary I read the enforcement:

```
live-daemon.js:54   MAX_LIFETIME_MS = 16*60*60*1000
live-daemon.js:49   TICK_MS = 30*1000
live-daemon.js:91   if (Date.now() - startedAt > MAX_LIFETIME_MS) return stop()   <- inside tick()
live-daemon.js:112  timer = setInterval(tick, TICK_MS)
```

The TTL is enforced by a **30-second poll**, not a `setTimeout` at the deadline,
so overshoot up to one full tick is *by construction*. Everything in
`57600..57630` is mid-tick. Confirmed by resample rather than by argument: 3m14s
later that process was gone and oldest was `15:59:56`.

Corrected predicate: `etime > MAX_LIFETIME_MS + TICK_MS` (57630s) **and** the same
PID present in a second sample ≥60s (2 ticks) later. The PID-persistence clause is
what distinguishes *being reaped right now* from *no longer being reaped* — a
single sample cannot, and only the second is the failure worth waking anyone for.

**The rung: deriving a tripwire from the ceiling is only half — you must also
derive its RESOLUTION from the mechanism that enforces it.** A poll-enforced limit
is a limit at `T + one poll interval`; comparing against `T` manufactures
violations out of correct behaviour. Sibling of the historian's "a limit counted
by one clock and enforced by another is not the limit you configured"
(`POISON_ATTEMPTS = 5` observed firing at 47-59) — there two clocks, here two
resolutions. Same day this swarm withdrew three hand-set thresholds (1400, 2/min,
the ~35h clock); this one hid in a unit of seconds.

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
