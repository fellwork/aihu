# Lessons index

Post-mortems and named failure patterns. A lesson lands here when it has a
**receipt** — a file:line, a command, an output — not when someone mentions it in
chat. Add a row when you add a file.

## Start here — the cross-cutting patterns

These four are not about one subsystem. They recur across bench, CI, release,
compiler, docs, and agent coordination, and between them they account for nearly
every defect found in the 2026-07-25/26 session.

| lesson | one line |
|---|---|
| [An absent value rendered as real, failing quietly](absent-value-rendered-as-real.md) | Something that does not exist gets formatted as a plausible, often flattering value. **36 instances.** An absence must be loud — and never *assert* that an empty result is trustworthy unless you can prove it. |
| [The thing being checked is not the thing that changed](checked-thing-is-not-the-changed-thing.md) | An honest measurement of the wrong artifact — a published copy, `src` instead of `dist`, another branch, another machine, or a config comment instead of the config's behaviour. **23 instances**, incl. the one that took three instruments to settle. Red and green are equally uninformative. |
| [A structure outliving the constraint that produced it](structure-outliving-its-constraint.md) | The workaround survives the fix, and its comment now argues against the supported path. The value and the subject are both fine; the **explanation** is false — so it survives review. |
| [A second instrument beats a second reviewer](second-instrument-beats-second-reviewer.md) | The positive lesson. Every defect above survived diff review; a second *measurement* path by a different author is what caught them. With the caveat that cost two agents an afternoon: **two readings are not two instruments — a reading and a measurement are.** |

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
