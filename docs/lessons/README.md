# Lessons index

Post-mortems and named failure patterns. A lesson lands here when it has a
**receipt** — a file:line, a command, an output — not when someone mentions it in
chat. Add a row when you add a file.

## Read this first: naming a pattern does not inoculate you against it

The single most reliable finding of 2026-07-26, and the reason these files are
written as warnings rather than advice. Every one of these is a *different person*
committing the pattern **after** publishing it, in a median of under an hour:

| who | published | then |
|---|---|---|
| orchestrator | named *"a green that means nothing"* publicly at 20:47 | merged a PR with **zero check-runs** at 21:08, reading `CLEAN` as passed |
| orchestrator | told three agents *"a claim is not a claim until it is in Linear"* | filed a duplicate intake within the hour (FEL-431/432) |
| orchestrator | broadcast *"use PIPESTATUS"* as a safety rule | had never run it; it is a bash idiom that yields empty in zsh |
| historian | wrote *"the thing being checked is not the thing that changed"* | read a workflow from a worktree one commit behind, **inside that document** |
| historian | wrote *"check the artifact, not the channel"* | reported three decided items as open, from the channel |
| historian | wrote the whole directory | never once **rendered** it; seven blank lines had split the tables |
| builder | spent the day demanding *"read back the write"* | reported filing an issue they had not filed |
| builder | was fixing a census with an unmapped bucket | shipped a census with an unmapped bucket |
| verifier | was hunting tests that cannot fail | ran a mutation that silently did not apply and nearly recorded its zero |

**Knowing the shape does not make you see it in your own work.** Every instance
above was caught by *someone else running the check*, or by the author
volunteering a correction nothing would have forced.

So: **read these as descriptions of what you are about to do**, not as a list of
mistakes other people made. The nine rows above are the evidence for that claim,
and they are the reason this directory records its authors' failures alongside
everyone else's — *a record that only holds other people's instances reads as
advice, and advice does not work on this.*

## Start here — the cross-cutting patterns

These six are not about one subsystem. They recur across bench, CI, release,
compiler, docs, and agent coordination, and between them they account for nearly
every defect found in the 2026-07-25/26 session.

| lesson | one line |
|---|---|
| [An absent value rendered as real, failing quietly](absent-value-rendered-as-real.md) | Something that does not exist gets formatted as a plausible, often flattering value. **48 instances** — plus **the mirror**, a *present* value rendered as absent, which is worse because a false absence makes you act immediately on the wrong target. An absence must be loud; and before believing an instrument that reports nothing, prove it can see something. |
| [The thing being checked is not the thing that changed](checked-thing-is-not-the-changed-thing.md) | An honest measurement of the wrong artifact — a published copy, `src` instead of `dist`, another branch, another machine, or a config comment instead of the config's behaviour. **27 instances**, incl. one that took three instruments to settle and one where I verified a fix against my worktree instead of the commit. Red and green are equally uninformative. |
| [A structure outliving the constraint that produced it](structure-outliving-its-constraint.md) | The workaround survives the fix, and its comment now argues against the supported path. The value and the subject are both fine; the **explanation** is false — so it survives review. |
| [A guarantee satisfied by the defect it should have caught](guarantee-satisfied-by-the-defect.md) | **Something TRUE does the concealing.** A coverage floor said `html: covered ✓` — true, and its only satisfier was a live stored-XSS. A claim cited a **real** issue ID for an action never taken. These don't fail a check; **they pass the wrong one.** |
| [Derive-from-disk cannot detect removal](derive-from-disk-cannot-detect-removal.md) | A gate that globs its own universe ratchets one way: adding is checked, **removing is invisible** and the lane goes green. One-line test inside, plus the fix — which already exists in this repo. |
| [A second instrument beats a second reviewer](second-instrument-beats-second-reviewer.md) | The positive lesson, and the **mutation matrix** — the only method that finds a test which cannot fail. Every defect above survived diff review; a second *measurement* path by a different author is what caught them. With the caveat that cost two agents an afternoon: **two readings are not two instruments — a reading and a measurement are.** |

## Release engineering

| lesson | one line |
|---|---|
| [publish-all PKGS array gap](publish-all-pkgs-array-gap.md) | New publishable packages must join `PKGS` or they are silently skipped — green job, npm 404. Recurrence of the below. |
| [publish-all PKGS array](publish-all-pkgs-array.md) | The round-7 original. |
| [Changesets pre-1.0 cascade](changesets-pre-1.0-cascade.md) | |
| [Cross-package version drift](cross-package-version-drift.md) | |
| [Release PR autogen sync](release-pr-autogen-sync.md) | |
| [Version PR correction — refresh lockfile](version-pr-correction-refresh-lockfile.md) | |
| [Tag after version-PR merge](tag-after-version-pr-merge.md) | |

## Build, CI, and toolchain

| lesson | one line |
|---|---|
| [css-engine CI binary build](css-engine-ci-binary-build.md) | |
| [Fresh worktree binaries](fresh-worktree-binaries.md) | |
| [resolveBinary executability fallback](resolvebinary-executability-fallback.md) | |
| [rolldown platform node require](rolldown-platform-node-require.md) | |
| [Optional peer + dynamic import variable specifier](optional-peer-dynamic-import-variable-specifier.md) | |
| [Docs regen batch conflicts](docs-regen-batch-conflicts.md) | |
| [Compiler grammar needs a changeset](compiler-grammar-needs-changeset.md) | |

## Agent orchestration

| lesson | one line |
|---|---|
| [Verifier needs bash](verifier-needs-bash.md) | |
| [Scout subagent type](scout-subagent-type.md) | |
| [team read-latest ordering bug](team-read-latest-ordering-bug.md) | |

## Where the rest of the durable state lives

- `docs/state/orchestrator.md` — merge/release state, standing rulings, founder blocks
- `docs/state/verifier.md` — verification verdicts and the open queue
- `docs/state/historian.md` — session records, method, and receipts
- `docs/state/transcripts/` — raw Slack, the only copy
- `docs/retros/` — per-session retrospectives
- `.claude/skills/fw-agent-skill/references/lessons.md` — orchestration lessons
  (numbered, separate from this directory)
