# Historian Close — 6-Track Follow-Up Session

**Date:** 2026-05-03
**Closed by:** Historian (Mode 2 close round)
**Session start HEAD:** `7665c2e` (docs-reorg session merged)
**Session close HEAD:** `b704cd9` (Merge PR #51 — t4e/examples-integrated)
**Branch:** `historian/followup-6track-close`

---

## TL;DR

The session was dispatched as a 6-track follow-up to the 2026-05-03 docs-reorg
retro. It expanded mid-session to **9 tracks** under user direction:

- **T7** folded in after T6 surfaced a `bun install`-blocking postinstall 404.
- **T4-D / T4-E1 / T4-E2 / T4-E3** descended from the original T4 grammar.md
  intent question — the user picked option (D) "research better examples,"
  which produced a 10→12-example curriculum that then split into three
  parallel Builders (pure-SFC + agent / meta-fwk / CSS-pluggability).

All tracks shipped to main:

- **612 TS tests passing** (up from 607; +5 TS — none of the 5 are regressions).
- **222 Rust tests** (untouched).
- **No new npm runtime/dev deps** (Learning #49 honored).
- **One new compiler capability** landed: `aihuCompilerPlugin({ shadowMode })`.
- **Three v1.x parser/spec issues** surfaced during T4-E2 — flagged for
  separate sessions.

Iteration budget exceeded the original 4-round plan because user-driven scope
expansion added the entire T4-E branch family. No surface-condition triggers
fired beyond Surface Condition #1 (T1 Architect α/β) and Surface Condition #7
(T4 zero-round surface). Token cap (250K) was respected.

---

## Tracks summary

| Track | What | Outcome | Commit / PR |
|-------|------|---------|-------------|
| T1 | createRouter cross-package collision | Architect spec → user picked α/strict cutover → MERGED | spec `52b352e`, builder `bfc2175`, merge `b517f71` |
| T2 | arbor build-path variance | Investigation report; defer fix to v1.1 → MERGED | `e3e908c` rebased to `e79876e` |
| T3 | leaf factory migration in tests/manual-demo | DONE → MERGED | `5ee2b2b` rebased to `ebda75e` |
| T4 | grammar.md intent question | User picked option (D) — research better examples | (no commit; expansion into T4-D/E) |
| T4-D | examples research proposal | 10-example curriculum → refined to 12 (+ Hacker News + CSS pluggability) | `a5fb456` |
| T4-E1 | pure-SFC + agent examples (1-8) + base infra | DONE → MERGED via PR #51 | `82d4ab4`, `8e09941`, `ef01c26`, `93a9065`, `3c2bb46`, `656d916` |
| T4-E2 | meta-fwk examples (blog-router + blog-loader + hacker-news) + paired docs | DONE → MERGED via PR #51 (surfaced 3 v1.x parser/spec issues) | `0f92e78`, `fe8dc08`, `2edb87b`, `fd7bae0`, `c26bf27` |
| T4-E3 | CSS framework pluggability research+build (added shadowMode) | DONE → MERGED via PR #51 | `39d6eac`, `3c81f62`, `c4f3d89`, `04e9f7f` |
| T5 | CI re-enable triggers | DONE → MERGED (`plan-a.yml` already had triggers; doc note added) | `075f834`, merge `18dd5f4` |
| T6 | agent-acp/agent-a2a typecheck align | PARTIAL → MERGED | `c2c67a5` rebased to `71cedf3` |
| T7 | compiler postinstall 404 fix (folded in mid-session) | DONE → MERGED | `03d6eb3`, merge `419b9a1` |
| Verifier | batch validation of T1+T2+T3+T5+T6+T7 | DONE | `82b0986` (`verifier/batch-1`) |

**Final main HEAD:** `b704cd9` — Merge PR #51 (t4e/examples-integrated).

---

## Surface conditions fired

The director-note enumerated 10 surface conditions. Two fired during this session.

### Surface Condition #1 — T1 Architect surfaces α/β as viable (FIRED)

**When:** Round 2, after T1 Architect spec landed at `52b352e`.

**What surfaced:** Architect recommended Option α (remove deprecated alias) but
flagged user adjudication required on migration strategy: **(a)** one-minor
deprecation grace period vs **(b)** strict cutover (per v0.7.4 JSDoc commitment
"Will be removed in v1.0").

**User decision:** Picked **(b) strict cutover.** Rationale (paraphrased): v1.0
already shipped; the JSDoc commitment "Will be removed in v1.0" had been made;
the deprecated alias was the only consumer of any grace window; honoring the
commitment preserves deprecation-signal credibility for future work.

**Outcome:** T1 Builder shipped strict-cutover removal at `bfc2175`.

### Surface Condition #7 — T4 user-surface (FIRED, by design)

**When:** Round 1, immediately on dispatch (zero-round track by design).

**What surfaced:** Verbatim from director note —
> "The docs-reorg session deleted `examples/airtime-quote/` and
> `examples/scripture-reference/` (PR #47). A follow-up commit then scrubbed
> the now-dangling references in `docs/grammar.md`. You reverted the scrub on
> disk during merge, so `docs/grammar.md` currently points at folders that
> don't exist."

Options: (a) recreate folders, (b) re-apply scrub, (c) inline TODOs, (d) other.

**User decision:** Picked **(d) — research better examples.** This single user
choice is the proximate cause of the session's 6→9-track expansion: it spawned
T4-D (examples research), which then forked into T4-E1, T4-E2, T4-E3 when
scope outgrew a single Builder.

**Outcome:** `docs/grammar.md` was deleted entirely (commit `3c2bb46`,
T4-E base-infra step) and replaced by the new examples curriculum and an
examples README.

### Surface conditions NOT fired

- **#2** (T1 Builder propagation breaks consumer) — clean propagation; 11
  call sites + tests + 2 docs files updated without breakage.
- **#3** (T2 reveals load-bearing bug needing user judgment) — reveal was
  structural (mangle skip + sourceMap trailer), but Investigator stayed within
  scope and produced a defer-to-v1.1 report rather than surfacing.
- **#4** (T3 breaks importer of pages/) — confirmed clean; `tests/manual-demo/server.ts`
  unaffected.
- **#5** (T5 triggers CI failure) — `plan-a.yml` already had triggers from
  Plan 7.1 v1 cutover; no new YAML edit.
- **#6** (T6 typecheck fix needs source changes) — fix was tsconfig + script
  alignment only; no source touched.
- **#8** (new npm runtime dep) — none added.
- **#9** (test count drops) — went 607 → 612, never regressed.
- **#10** (250K token cap approached) — not approached.

---

## User-adjudication moments

The session had **6 user-surface moments** (4 explicit decisions + 2 mid-session
expansions):

1. **T4 grammar.md intent (a/b/c/d)** — user picked (d) "research better
   examples." Spawned T4-D, which spawned T4-E.
2. **T1 strategy (α grace vs α strict cutover)** — user picked (b) strict
   cutover. Cited JSDoc "Will be removed in v1.0" commitment.
3. **T4-D 5 questions on examples curriculum** — user steered scope from 10
   to 12 examples (added Hacker News as a multi-page demo and CSS pluggability
   as a research-then-build track).
4. **T7 fold-in request** — after T6 surfaced the postinstall 404 blocker
   (which prevented `bun install` from creating workspace symlinks), user
   directed adding T7 (compiler postinstall fix) as a parallel single-round
   Builder track. Out of original 6-track scope.
5. **T4-E parallel-Builders steer** — when T4-D's 12-example curriculum
   exceeded single-Builder capacity, user steered three parallel Builders:
   T4-E1 (pure-SFC + agent), T4-E2 (meta-framework), T4-E3 (CSS).
6. **PR #51 integration steer** — user merged T4-E1/E2/E3 as a single
   integrated PR rather than three separate PRs to keep examples-tier history
   cohesive.

---

## Capability additions

### `aihuCompilerPlugin({ shadowMode: 'open' | 'closed' | 'none' })`

**Track:** T4-E3 (`3c81f62`, `04e9f7f`).

**What:** The Vite/rolldown plugin gained a `shadowMode` option that the
compiler reads when emitting `defineElement(tag, Ctor, { shadowMode })`. Prior
state: `.aihu` SFCs had no syntax to opt into light-DOM, and the compiler
always emitted with default open shadow root. New state: a single plugin
config flag flips the entire app to light DOM, enabling Tailwind / UnoCSS /
Pico / vanilla CSS to apply via the global cascade.

**Why this was load-bearing:** the T4-E3 research found that utility-class
CSS frameworks (Tailwind, UnoCSS) are fundamentally incompatible with the
default shadow-DOM scoping unless every component opts out. Without a
plugin-level flag, the only opt-out path was hand-authoring components
post-compile or post-processing the compiled JS — neither is documentation-
ready. The capability addition is the load-bearing artifact of the entire T4-E3
track.

**Sub-1 KB cost:** verified via `bun run size`; compiler is build-time only
(no browser-bundle row).

---

## Test floor history

| Phase | TS tests | Rust tests | Source |
|-------|----------|------------|--------|
| Session start (`7665c2e`) | 607 | 222 | director-note baseline |
| Post-T1 (`bfc2175`) | 607 | 222 | T1 deleted v0.7.test.ts (4 tests) but added 4 compensating `createRequestRouter` smoke tests |
| Post-T2/T3/T5/T6/T7 (verifier `82b0986`) | 607 | 222 | T2/T5/T7 docs-only or config-only; T3 migration didn't change test count; T6 was tsconfig+scripts |
| Post-T4-E1 (`656d916`) | ~607 | 222 | examples are not in TS test paths |
| Post-T4-E2 (`c26bf27`) | ~607 | 222 | examples not test paths |
| Post-T4-E3 (`04e9f7f`) | ~610 | 222 | shadowMode capability added a few tests |
| Session close (`b704cd9`) | **612** | **222** | new floor |

Net: **+5 TS tests, 0 Rust.**

---

## What we surface to a separate session

The following items surfaced during this session but are out of scope for
v1.x patch work; flag for separate sessions:

### v1.x parser/spec issues (3, surfaced during T4-E2)

1. **Inline-helper apostrophe handling** — `93a9065` had to "align with shipped
   v1 compiler `$each` + apostrophe rules"; the meta-fwk examples surfaced
   parser handling around apostrophes inside template strings that the v1
   compiler shipped without a spec-quartet test. v1.1 candidate.
2. **`$prop` standalone-vs-namespaced ambiguity** — `ef01c26` had to "switch
   agent flagships from `\$prop` to standalone signals"; the v1 compiler
   permits both forms but the spec quartet does not pick one as canonical.
   v1.1 spec-quartet candidate.
3. **`$each` with iteration var that shadows outer scope** — surfaced during
   `93a9065`. The fix landed but no failing test was added; v1.1 should add
   a conformance test.

### color-theme `$reactive` + `$global` lowering question

The color-theme example (T4-E1) uses `@style { $global { ... } }` for global
CSS and `$reactive` bindings for the theme switcher. The combination compiles
correctly but the spec quartet does not document the interaction (does
`$reactive` write to `document.adoptedStyleSheets` or to per-component
sheets?). Surface to a separate spec-quartet review session.

### Latent path-mismatch bug (postinstall write target vs runtime read target)

T7's fix made `bun install` graceful on 404, but the postinstall script writes
the binary to `bin/aihu-compiler<.exe>` while the runtime loader resolves
via `target/release/`. If a future graceful-fallback path writes the
downloaded binary to `bin/`, the local-cargo-build path writes to
`target/release/`, and the runtime loader reads the `target/release/` path
first — there's a chance for a stale binary to win. Recommend a v1.1 audit of
the loader's resolve order vs postinstall's write target.

### moon-vs-bun mangle-skip latent risk

Learning #44 (this session) documents that `.moon/tasks/tasks.yml` shared
`build` task hard-codes `bunx rolldown -c`, bypassing per-package
`scripts/mangle-dist.mjs` that arbor and signals run on the package-script
path. If a future release pipeline switches to moon-driven build, every
consumer gains ~26 B gz per mangler-using package — silently. v1.1 should
either (a) lift mangle into a shared moon task, or (b) drop mangle from the
package scripts since the per-package path is no longer the primary build
path post-v1.

### TS6059 rootDir misconfig (T6 partial)

T6's typecheck-align fix unblocked the immediate failure but a deeper audit
during T6 found a TS6059 `rootDir` misconfig in agent-acp / agent-a2a's
tsconfig. The fix as shipped works around it; v1.1 should normalize rootDir
across all `@aihu/agent-*` packages.

---

## Cross-track lineage hygiene

The Verifier's batch report flagged that T2/T3/T6 were branched off
`2c47efd` (the previous session's historian-close commit) rather than off
main. This created a 3-way conflict risk on `README.md` and
`docs/site/api-reference.md` — files that T1 modifies. The Verifier's
recommended merge order (T7 → T5 → T1 → T3-rebased → T2-rebased →
T6-rebased) was followed; rebases were clean cherry-picks. Documented as
Learning #46.

---

## Closing notes

- **Iteration budget:** original 4 rounds + Historian. Actual: ~6 logical
  rounds owing to T4-E expansion. Recommendation captured in Learning #45.
- **Roster:** 1 Architect, 1 Investigator, 4 Builders (T3/T5/T6/T7 + 3 T4-E
  Builders), 1 Verifier (batched), 1 Historian. Larger than original
  6-Builder plan because T4-E branched.
- **No state-file ratchets needed** — all `state-*.md` at repo root pre-date
  v1 and are pinned to historic team-branch HEADs; the post-v1 framework
  doesn't drive them.
- **CLAUDE.md test-floor line update:** `607 TS + 222 Rust` → `612 TS + 222
  Rust` (single-line edit).
- **Learnings appended:** #40 through #47 (8 new entries). The Verifier had
  cited "ended at #42 referenced #47 in MEMORY.md" — actual end of file
  before this close was #39, not #42; numbering reconciled.
