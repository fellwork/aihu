# State — builder

**Role:** BUILDER · **Workspace:** `almaty`
**Last updated:** 2026-07-28 — C-FEL-434b LANDED (#683 @ `e7a1b7c2`),
C-FEL-CI-RECEIPT open (#685), C-FEL-EXTERNALS record recovered (#656, merged).

> Ownership note: `historian` claimed `docs/state/` at 13:24 on 07-26. This file
> was flagged to them and to team-lead (ts `1785087210.788909`); rename or delete
> on request.

## C-FEL-434b — BUILT, awaiting verdict (PR #683)

agent-readiness now CONSUMES the compiler's agent-meta sidecars, so a
**client-target** build lists its `@agent` components in `llms.txt`. Before this,
`## Components` came only from the live `@aihu/agent` registry, which is empty on
a client build because `registerAgentMetadata` is elided from client JS.

**Two things future instances will otherwise re-derive the hard way:**

1. **`$scope` on the `@agent` block derives `extract.read = { scope }`** — a hard
   tier, so `deriveReadPolicy(...).agentDiscovery` is **false** and the component
   is (correctly) filtered OUT of `llms.txt`. I lost a wake believing the row-1
   fixture was unsatisfiable because of this. The authoring shape that gives a
   publicly-discoverable component with a gated action is an EXPLICIT
   `$extract: { read: 'agents', call: { scope: 'x' } }` — explicit read wins over
   the derivation (`extract.rs` `resolve_explicit_read_wins_over_scope_derivation`),
   and the compiler emits W480 acknowledging the deliberate re-opening.
2. **The manifest→metadata mapping is an ALLOWLIST, on purpose.** The sidecar is
   a build artifact and really does carry `scope` / `rateLimit` / `streamOutput`;
   `llms.txt` is served anonymously. Copy only `tag`/`describes`/`state`/
   `actions`/`extract`. Do **not** convert it to a deny-list — a policy field
   added to the manifest later would then leak by default. `extract` MUST be
   carried forward: it is the input to the fail-closed advertise filter, and
   dropping it silently publishes everything.

Addressing scheme chosen: **per-tag filenames** (`<tag>.agent-manifest.json`),
matching the sibling `<tag>.ts` / `.route.json` / `.aihu.ts` sidecars. The old
fixed name meant the second agent component in a directory clobbered the first.
Rust change → FEL-414 two-family bump done (`0.1.41→0.1.42`, `0.1.6→0.1.7`);
`BASE_REF=main bun scripts/check-compiler-binary-bump.ts` → ok (exit 0).

> **#683 (C-FEL-434b) HAS LANDED** (`e7a1b7c2`); its section lives on `main`.
> Still open and also touching this file: **#685** (C-FEL-CI-RECEIPT) and this
> one, in disjoint sections. Whoever lands later takes **both**; do not pick one.
> Every edit here is additive, so it is a three-way merge and not a conflict.

## C-FEL-EXTERNALS — recovered record (PR #656, MERGED 2026-07-28T01:45:55Z)

> **This section was nearly lost.** It existed only in a `git stash` entry — on a
> stack shared by 132 worktrees, where any agent can pop or drop it — and on no
> branch at all, while its PR had already merged. Recovered from
> `recover/builder-state-fel-externals` @ `776b263f`. **A contract is not done
> until its state record is on a branch** (architect S2): a merged PR whose "what
> the next instance must not redo" is reachable only by a command nobody thinks
> to run is still lost, just more slowly.

Three configs converted from hand-listed `node:` arrays to a single `/^node:/`
pattern: `packages/{cli,app,adapter-vercel}/rolldown.config.ts`. Full `bun run
build` node: `UNRESOLVED_IMPORT` count **4 → 0**; the one remaining warning
(`virtual:aihu-components`, app client entry) is a legitimate vite virtual
module, reported not suppressed. MUST-FAIL run in both directions: a new
`node:crypto` probe produced no warning (drift survives), a genuinely bogus
`definitely-not-a-package` import still warned (the class is not silenced).
Probe reverted.

### The repo-wide audit the contract implies but the surface excluded

`must_pass` says *every* package that imports a `node:` builtin externalizes by
pattern; the granted surface named only six packages. Measured across all 12
rolldown configs (script: compare each config's quoted `node:` literals against
the builtins actually imported by its bundle inputs):

```
PATTERN (/^node:/)  adapter-vercel, app, cli   <- this contract
                    language-server, tsc       <- already were
hand-listed         adapter-cloudflare, compiler, css-engine, magna,
                    mcp, router, server
ACTIVE DRIFT        none — every hand-listed config is currently COMPLETE
```

So the remaining seven are **latent, not broken**. Do not describe them as
drifting; that was the scarier version and it did not survive the measurement.

:point_right: **`packages/server` must NOT be converted.** Its MAIN entry
externalizes *no* `node:` builtin on purpose — the design property is that the
main graph contains none, so a leak fails loudly (`check:runtime-purity`,
`@aihu/app@0.1.8` regression, investigation `4a796a8f`). A blanket `/^node:/`
there would silently externalize the exact leak the file exists to catch. Same
argument the prior instance used to leave `packages/primitives` alone. A
follow-up contract that says "convert the rest" is wrong as stated.

### #656's red `ci-ok` was the FEL-437 draft rendering, not a defect

**#656 MERGED 2026-07-28T01:45:55Z.** The paragraph below is kept as the
reasoning that was correct at the time — a draft's red is not a result.

Run `30298978032`: `check`/`examples`/`governed-examples` **skipped**, `ci-ok`
**failure** with `::error::Draft PR: 'check' was skipped, so nothing was built
or tested… mark the PR ready for review (FEL-437)`. Nothing has been built by
CI on this branch yet. Marking ready is what produces a real result.

## RULED 2026-07-28 — when to push, and how to read an absence

Two rules that cost a full wake to derive and must not be re-derived. They are
here rather than in a contract section because they bind every future wake.

### Push cadence: the boundary is DRAFT vs READY

The tension is real — durability says push the moment you have something;
receipts say a push during a run churns CI. Orchestrator's ruling:

- **While DRAFT:** push as often as you like. `check` is SKIPPED on a draft, so a
  push costs seconds of CI and there is no receipt to disturb.
  Commit-early-commit-often applies in full, and this is most of the work.
- **Once READY:** hold still. Runs are ~6 min and the receipt is live. Batch the
  remaining commits, push once, and let the run reach a verdict before pushing
  again.

Same boundary as ready-then-push: **readying is the moment cheap becomes
expensive and no-receipt becomes receipt.** Before it, free; after it, every push
costs a run. Corollary worth knowing: ready-then-push produces ONE run;
push-then-ready produces two, and the earlier one's green is a lie for the length
of a full build.

A push does **not** kill an in-flight run — measured, a `check` ran straight
through a later push to SUCCESS. Hold after READY for the CI-cost reason, not
because pushing destroys anything.

### An absence is not evidence until the thing had its chance to appear

**A positive measurement is stable; a negative one is not.** "X passed on sha S"
stays true forever and only its *relevance* expires, when S stops being head.
"X is absent on S" can flip **with the passage of time alone** — nothing
changing, no head moving. So they need different expiry conditions:

| measurement | expires when |
|---|---|
| positive ("X passed on S") | S stops being head |
| negative ("X is absent on S") | the pipeline is known complete — **until then it is not evidence at all** |

I built three separate findings on a premature absence in one wake — a new
taxonomy entry, an escalation about an "orphaned" run, and a self-imposed push
freeze — and all three were falsified by simply waiting. Each was measured
accurately and reported honestly; each was taken inside the routine ~2 min gap
between a build job finishing and its aggregate reporting.

**Why this one is uniquely dangerous: an absence is the one observation that
looks identical whether it is true or premature.** A wrong positive contradicts
something and gets caught. A premature negative contradicts nothing and reads as
a discovery.

So: **publish every measurement with its expiry condition.** "PR #N @ `sha` is
landable — VOID if `gh pr view N --json headRefOid` differs" is detectably wrong
to any reader in one command. "PR #N is landable" is silently wrong the moment
the head moves. Same move this repo keeps landing on: make the failure
detectable rather than promise to be careful.

## FEL-426 — DONE (founder-ruled: "not use an unsafe component… check by CI")

Both halves landed together. Half A alone re-breaks the moment someone edits the
file, which is why the ruling bound them.

> **The first shipped approach was REJECTED and superseded.** I sanitised and
> re-fed `html={}`. The orchestrator's HOLD arrived after I pushed. Rebuilt to
> the ruling: parse to structured data, render escaped, drop `html={}` entirely.
> Lesson for me: I announced an approach, got no reply in two minutes, and
> treated silence as assent — on a transport I had *personally just proven*
> delivers dispatches invisibly. Standing rule now: say "blocking on a ruling"
> and stop.

### Half A — the XSS

`html={}` is unsafe *by design* and stays a legitimate primitive; the defect was
what it pointed at. Since **#572**, `ssr_string_emit.rs:669` interpolates its
value **unescaped into served bytes** (`String((expr) ?? '')`) — before #572 it
was SSR-transparent, so the blast radius was client DOM only. Correct for
docs-next's authored markdown; stored XSS for `examples/hacker-news`, which
points it at the HN Firebase API at three sites.

The tell is inside one element: `comment().by` → `__aihu_stext(...)` (escaped),
`comment().text` → `String(...)` (raw), three lines apart.

**Fix (final):** `src/lib/parse-hn-markup.ts` parses at the loader ingress into
structured blocks/spans; `src/components/hn-rich-text.aihu` renders them through
ordinary escaped bindings. **All three `html={}` bindings are gone.** `safeHref`
is *reused* from `@aihu/editor/safe-href`, not reimplemented.

The safety property no longer depends on the parser being correct — output is
plain strings through `__aihu_stext`, so a parser bug is a *display* bug and
cannot be injection. A sanitiser structurally cannot promise that. Doctrine came
from `packages/editor/src/paste-sanitize.ts`: *"never re-serializes to HTML."*

**Compiler untouched.** It did exactly what `html={}` means.

### Half C — the coverage floor was satisfied BY the vulnerability

`MUST_BE_LIVE` guaranteed `html` was live-exercised. The only thing making that
true was the XSS hole. **The guarantee and the defect were one line of code**, and
the guarantee is why nobody looked. Distinct from FEL-428 (a gate measuring
nothing): this gate measured exactly what it claimed — presence of a usage,
never safety of one.

Ruled by Shane and the orchestrator independently, same answer: keep the floor,
move the exerciser. `examples/ssg-site/src/pages/about.aihu` now renders an
authored in-repo constant through `html={}`, backed by a **prerender needle** so
the row is proven in built bytes. Rows unchanged at 54 — relocated, not reduced.

### Half B — the CI gate (the brief's prescribed fix was wrong)

The brief said both loops enumerate by hand-typed literal and to derive from
disk. Half true, and applying it literally would have turned CI red:

1. `scripts/build-governed-examples.ts:64` **already** derives from disk
   (`readdirSync` + `coverage.manifest.json`). hacker-news is *in* that set,
   declares `ci: "compile+smoke"`, and declares it exercises `html`. It had no
   smoke suite, so the runner printed `compile-only (no smoke suite…)` and ran
   nothing. **It is the only governed example declaring `html`, and the only
   `compile+smoke` one with no suite.**
2. The `ran === 0` anti-vacuous guard is real and fires — but it is *global*, so
   eight passing neighbours mask one item's no-op.
3. Globbing `examples/*` into the `examples` job's `vite build` loop would fail:
   hacker-news's manifest says it is *not vite-buildable* (server/SSR wiring).
   The fix for that would be a skip-list — the literal list again.

**So Half B was not "derive the list" but "make a declared tier that silently
degrades to nothing be RED".** `plan-a.yml` needed **zero changes**:
`packages/compiler/**` is already in the `governed` paths filter, so #572 *did*
trigger this lane. It ran, reassured, and passed.

Also fixed: derive-from-disk **cannot detect deletion** (verified — removing the
example made its row vanish and the lane still passed). `examples/governed-roster.json`
is the committed floor. Adding an example still needs nothing there; removing one
requires an explicit, reviewable line deletion.

## Receipts — every direction proven, real exit codes

`PIPESTATUS` is a bash-ism; this shell is zsh, so piped `EXIT=` readings were
silently empty. These are unpiped `$?`.

```
MUST-FAIL-FIRST  payload live in served bytes, pre-fix        -> exit 1
  <div class="text" …>Interesting point. <img src=x onerror="…"></div>

Half A / B (examples/hacker-news, scripts/)
  delete example (roster tripwire)                            -> 1
  compile+smoke tier with no smoke suite                      -> 1
  break the SFC (smoke suite fails)                           -> 1
  reintroduce html={} in hn-rich-text     -> 2 red (A8 gate + served bytes)
  remove decode-before-validate                               -> 1 red
  remove loader trust boundary                                -> 1 red

Half C (examples/ssg-site)
  remove the html={} binding -> coverage-manifest             -> 1
  remove the html={} binding -> governed lane prerender needle-> 1

GREEN
  hacker-news smoke suite                                     -> 0, 28/28
  governed lane hacker-news                                   -> 0
  governed lane ssg-site (prerender 4 needles asserted)       -> 0
  check:coverage-manifest (9 examples, 54 rows, floor 48)     -> 0
  biome                                                       -> 0
```

Compiler was built **from this tree** (`cargo build --release --bin aihu-compile`),
not the published napi addon.

### Three assertion traps hit while writing this — all found by sabotage, not by reading green
- `not.toContain('onerror=')` **fails on correct output** — the literal text
  survives inside inert `&lt;img … onerror=&quot;`. Assert the property
  (`/<[a-zA-Z][^>]*\son[a-z]+\s*=/`), not the substring, or the next reader
  weakens the parser to satisfy a wrong test.
- Unit tests AND the served-bytes test both stayed green with the loader call
  deleted. Present is not wired. `loader trust boundary` tests close it.
- **"Encoded scheme cannot smuggle" passed BEFORE and AFTER the fix.** `safeHref`
  is an allowlist, so `&#106;avascript:` is rejected for matching nothing —
  decoded or not. I had written *denylist* reasoning into the comment. Relabelled
  honestly; replaced with `&#47;item?id=1 -> /item?id=1`, which is red without
  the decode. A required test case that proved nothing.

## No changeset — deliberate, with receipt

No published package changed (only `examples/` + `scripts/`), and
`@aihu/example-hacker-news` is explicitly in `.changeset/config.json`'s `ignore`
list. Stating it rather than silently skipping.

## What the next instance must not redo

- Do **not** "fix" `plan-a.yml`'s hand-typed lists as part of FEL-426. It is a
  real coverage gap (5 of 25 examples built, 7 tested) but a **separate** issue,
  and the naive fix reddens CI. Flagged, not claimed.
- Do **not** re-derive the alias map in `examples/hacker-news/vitest.config.ts`.
  It imports root's 34 aliases on purpose; hand-copying the subset needed today
  is how it rots.
- The vitest config is deliberately **not** an extension of the example's
  `vite.config.ts` — inheriting it drags in `@aihu/router`'s built plugin, so a
  missing `dist/` would make the security gate a build-ordering casualty.
- Local `bun run test` at repo root has ~20 pre-existing failures from a missing
  `aihu-css-core` binary (`cargo build --release -p aihu-css-core`). Four
  governed examples also fail locally on unbuilt `dist/`. **Not mine** — verified
  by running them on a clean tree.
- Do **not** chase the 5 red files in a full-parallel `bunx vitest run`
  (`arbor/tests/bench.test.ts`, `compiler/tests/state-model-sidecar-tsc.test.ts`).
  They are timing/contention casualties — each spawns `tsc` or asserts a
  wall-clock budget — and **all pass when the files are run in isolation**. Run
  `cargo build --release` (ALL bins, not `--bin aihu-compile`) first, or
  `css-engine/tests/resolve-binary.test.ts` reds on a missing
  `target/release/aihu-css-compile` too.
- Do **not** re-litigate the FEL-434b addressing scheme or re-read
  `extract-read-policy.ts` to answer "why is my scoped component filtered out" —
  both answers are recorded above.

## Queue behind this

1. **C-FEL-GATE-FIXTURE-RAMP** — shrink `notYetProven` in batches.
2. **C-FEL-CIOK-CANCELLED-MSG** — fold into the next PR that touches
   `plan-a.yml`'s `ci-ok` block; do not open a PR just for it.

Older queue (`.tastemaker/check_contrast.py`, FEL-423) predates 07-28; confirm
with the orchestrator before picking either up. `#609` and FEL-391 went to
**builder-b**.

## The gate rule that governs every "is it green" claim

Banked by historian as a lesson on **#669** (`3f709e05`) — not yet merged, so it
is deliberately named here rather than path-cited (`check-lesson-refs.sh` gates
that, correctly). A green aggregate `ci-ok` can certify a build that never ran.
One command: `gh api repos/fellwork/aihu/commits/<full-sha>/check-runs` —
`check` and `ci-ok` must share a run id, `check` must be `success`, and `ci-ok`
must have STARTED AFTER `check` FINISHED. Push, then mark ready. A rerun
destroys its own check-runs, so capture the output before re-running.
