# A REGEX OVER RAW SOURCE CANNOT TELL CODE FROM TEXT-ABOUT-CODE — and it reddened main twice in one day

**Topic:** CI dependency/graph extractors, source scanning, test fixtures
**Session:** named 2026-07-28; diagnosed by builder when `check` went red on `origin/main`. Live
incident at bank time — the fix is ruled-pending, the CLASS is the durable lesson.
**Category:** ops, measurement-integrity, recurrence
**Severity:** high — `check` FAILS on `origin/main` (`5d485ba9`, `check` + `ci-ok` FAILURE, confirmed),
and **every PR rebased onto it inherits the red**, so nothing lands until it is fixed.

## The incident

Two individually-green PRs collided on `main`:
- `#671` (`bea13b99`) landed `check:moon-graph` — derives Moon build-order edges by scanning source for imports.
- `#683` (`e7a1b7c2`) landed agent-manifest sidecar tests whose **fixtures are `.aihu` source strings** inside
  template literals — and one contains `import { signal } from \`@aihu/signals\`` at
  `tests/agent-manifest-sidecar.test.ts:61/:82`.

`plugin-agent-readiness` does **not** import `@aihu/signals` in any executed TypeScript. The gate read
**fixture text as a real import** and demanded a `dependsOn: signals` edge that must not exist:

```
check:moon-graph -> plugin-agent-readiness/moon.yml must add dependsOn: signals (imports @aihu/signals)
scripts/check-moon-graph.ts:176   IMPORT_RE = /(?:from|import|require)\s*\(?\s*['"]([^'"]+)['"]/g
                          :188     matchAll over RAW file content — no awareness of comments or string literals
```

**Quote the regex EXACTLY — an earlier telling here had the class as `` [`"] `` (backtick-or-double).
The real class is `['"]` (single-or-double), verified from source (`git show
origin/main:scripts/check-moon-graph.ts:176`), and the tripping fixture is **single-quoted**. That is
not pedantry: a reader reproducing from the wrong class matches nothing and concludes *the diagnosis is
false* — a wrong receipt in a durable lesson manufactures a false refutation. Copy the character class,
do not paraphrase it.**

## The class, and it is a same-day recurrence

`#681` (`df34eeb2`) is **literally titled "dep-check import-extractor is comment-blind"** — it fixed the
identical shape in a *different* script hours earlier. `check:moon-graph` shipped with the sibling
defect — **string-literal-blind** — and the two landed the same day. The class:

> **A regex over raw source is a lexer pretending not to be one. It matches the pattern wherever it
> appears — inside a comment, inside a string, inside a fixture that is *text about code* — because it
> has no model of which bytes are code and which are data.** Any repo whose tests carry source fixtures
> (and an `.aihu`/DSL project will) re-manufactures this every time someone adds a realistic fixture.

This is the code-side twin of `documenting-a-checker-can-trip-the-checker.md`: there a prose checker
could not tell a *mention* of its pattern from a *use*; here a source checker cannot tell *text about
code* from *code*. Same root — **the scanner has no notion of context** — one over prose, one over source.

## The rung

- **prose (the trap) — and it LANDED, and it is worse than "misleading": it is a NO-OP THAT LIES.**
  Candidate (a) "just add the `dependsOn: signals` edge" is what the interactive session shipped to
  green `main` quickly (`d10674ad`, on `main`). Verifier then ran the test and proved it: `plugin-agent-readiness
  → server → signals` **already orders `signals` before the typecheck** (`server/moon.yml` lists `signals`),
  so the transitive need `moon.yml:5-16` documents was **already satisfied** — the direct edge **buys
  nothing and records a fact that is false.** The only thing that ever demanded it was a regex reading
  fixture text. So (a) is not merely misleading; it is a **no-op that also lies**, and the ruling upgraded
  accordingly: **(b) must REVERT `d10674ad`'s `- signals` line**, with the must-fail that `check:moon-graph`
  passes WITHOUT it once the extractor skips literals — if it still demands the edge, the literal-skipping
  is incomplete. Rewriting the fixture to hide the literal (candidate c) makes the red vanish while leaving
  the extractor blind — it **retires the alarm** and the next `.aihu` fixture re-breaks `main`. Verifier's
  **negative control** is the proof of sole-cause: strip *only* the two fixture import lines → `check:moon-graph`
  exits 0.
- **structural (the fix, builder's recommended (b), ~10 lines):** teach the extractor to **skip string
  literals and comments** — i.e. do the minimal lexing a scanner-over-source actually requires, so it
  reads code and not text-about-code. Same shape as `#681`'s comment-skip. A gate that scans source
  MUST tokenise enough to know what is data; a bare regex over raw bytes is under-specified by
  construction, and its test suite must include a **fixture that contains the pattern as data** (which
  goes red without the skip) or the defect is invisible to its own CI.

## SHIPPED — both halves of the bar are on `main`, and the must-fail needed BOTH DIRECTIONS

`C-FEL-MOONGRAPH-LITERALS` landed (#689, merge commit `642860f3`; historian's own fetch confirms
`origin/main` = `642860f3` @ 20:52:45Z, `grep -c stripNonCode` → **2**, exit 0). The ruling above is
satisfied in full: the extractor now strips non-code (`:220` definition, `:272` call site — two
instruments agree), **and** `d10674ad`'s no-op `- signals` edge is **gone** from
`packages/plugin-agent-readiness/moon.yml`. `bun scripts/check-moon-graph.ts` on a clean worktree at
that sha → exit 0. Wiring checked past the *"it is in package.json"* bar: `plan-a.yml:85`
`- run: bun run check:moon-graph`, inside the `check` job, no `if:`, no `continue-on-error`.

**The methodological result is the durable part — a STRIPPER needs a mutation in both directions:**

| direction | mutation | expected | what it proves |
|---|---|---|---|
| 1 | `stripNonCode` → identity (early `return src`) | exit 1, **reproducing the original false edge verbatim** | the fix is **load-bearing** |
| 2 | delete a **real** edge (`- server`) from `moon.yml` | exit 1, `must add - server (imports @aihu/server)` | the fix does **not over-strip** — genuine imports still seen |

> **Direction 1 alone proves a fix is load-bearing; it cannot distinguish "reads code correctly" from
> "reads nothing at all."** For any change that makes a checker *ignore* more input — a stripper, a
> filter, a skip-list, an exclusion glob — the failure mode you have just made possible is
> **green-by-blindness**, and only the false-negative direction can see it. A stripper that strips
> everything passes direction 1 perfectly. **Whenever a fix narrows what a gate looks at, the
> must-fail must include a case the gate MUST still catch.**

Method note worth recording: the verifier ran both mutations with `git checkout --` to revert and
explicitly **no `git stash`** — *"stack is repo-global across 133 worktrees."* That is the historian's
standing rule (`git-stash-is-a-shared-stack-across-worktrees.md`) applied by another role, unprompted,
inside the exact operation that would have exposed it. **The prose rung took.**

## The meta

Two sibling defects in two scanners landed the same day, each green in isolation, and `main` went red
only when a fixture from one met the scanner from the other — the collision-of-two-correct-changes shape
(`gate-fix-armed-a-sibling-false-red.md`), here in the CI scanners rather than the gate logic. When a
class is fixed in one place (`#681`), grep the repo for its siblings the same day; the second scanner
was shipping the same bug while the first was being fixed.

## Related

- `documenting-a-checker-can-trip-the-checker.md` — the prose twin: a checker that cannot tell mention from use
- `gate-fix-armed-a-sibling-false-red.md` — two individually-correct changes whose composition reddens main
- `four-kinds-of-red-unlanded-fix.md` — this is red-because-broken (a real gate defect), distinct from the unlanded-fix kind
