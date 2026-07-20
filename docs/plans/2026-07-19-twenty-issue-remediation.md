# Twenty-Issue Remediation — Slice Plan

**Date:** 2026-07-19
**Track id:** `remediation-q3`
**Mode:** mixed (per-slice, see each)
**Substrate:** files, not GBrain (see §Substrate)
**Origin:** findings catalogued in `TODOS.md` during the agent-surface work of 2026-07-19.

---

## Locked decisions

These were user calls, not agent calls. They determine what the slices ARE, so they
are recorded here rather than re-litigated per round.

| # | Question | Decision |
|---|---|---|
| 1 | `$prop` writes throw TypeError | **Rewrite to `.set()`.** `prop = x` / `prop++` inside `$action` bodies lower to `prop.set(…)`. Authored form works as written; no fixture edits; nothing stops compiling. |
| 2 | `agent-a2a` / `agent-acp` are non-conformant shims | **Implement both specs properly.** Real JSON-RPC 2.0 envelope + task store for A2A; real argument passing for ACP; tests rewritten against actual specs. Largest slice in the plan. |
| 3 | `@aihu/seo` duplicates `plugin-agent-readiness` | **Thin re-export + deprecate**, refined: port `seoLlmsSections` into the sibling, delete dead `json-ld.ts`, flip the AI-bot default, keep the package name for discoverability. |
| 4 | GBrain substrate is stale / wrong-branch | **Skip GBrain for this effort.** Durable artifacts go to `docs/`. Fresh sync on `main` after the work lands. |
| 5 | `agent-manifest.json` has no consumers | **Give it one.** Auto-populate the MCP server-card `skills` array from it at build time — turns dead weight into the fix for the hand-mirroring issue, and makes the docs' "aggregated at build time" claim true. |

### Why decision 3 is safe (evidence)

`@aihu/seo`'s unique surface is dead or derivative:
- `json-ld.ts` writes `ast.__seoJsonLd`; the only readers are its own test and its own
  doc comment. Real JSON-LD is `packages/server/src/head-lowering.ts` + `ssr.ts`.
- `seoLlmsSections` is 12 lines that already import from `@aihu-plugin/agent-readiness`.
- `sitemap.ts` / `robots.ts` / `createSeoRoutes` duplicate the sibling; seo's sitemap is
  the one missing XML escaping.

---

## Substrate

Decision 4 removes GBrain. The playbook treats GBrain as *storage substrate, not
methodology* — the roster, modes, spine, and lessons all stand. The repo already has the
four-layer model in files:

| Playbook layer | Repo location | Holds |
|---|---|---|
| `base` | `docs/architecture/`, `README.md` | Ratified specs, thesis. Human-only. |
| `user` | `docs/lessons/`, `docs/domain-hints/` | Promoted findings, user-supplied hints. Historian writes. |
| `delta` | `docs/plans/<slice>/` | Per-round: architecture specs, build manifests, verification reports, director notes. |
| `local` | agent scratch (scratchpad dir) | In-flight. Not committed. |

**State pointer:** `state-remediation-q3.md` at repo root — single human-reviewable
orientation file, updated by the Historian at session end.

**Post-merge:** run a fresh GBrain sync on `main` so the whole effort becomes queryable.
Add a source pinned to a *stable* path, not a conductor worktree — pinning to a
disposable worktree is how the index reached 7 days stale on the wrong branch.

---

## Slice decomposition

Decomposition and branch mechanics are Team Lead (orchestration). **Priority and
sequencing are the Topic Director's call (substance)** — the dependency graph below
constrains what is *possible*, not what is *next*.

### Track A — Compiler correctness

| Slice | Mode | Roster | Branch | Depends on |
|---|---|---|---|---|
| **A1** `$prop` write rewriting | 2 | Architect → Builder → Verifier | `fix/prop-write-rewrite` | — |
| **A2** Retire stale C205 | 3 | Builder → Verifier | `fix/c205-retire` | — |
| **A3** Migrate 11 stale examples | 3 | Builder → Verifier | `fix/examples-v2-codemod` | — |
| **A4** Gate `check:emit-parses` in CI | 3 | Builder → Verifier | `ci/emit-parses-gate` | A1, A3 |

**A1 needs an Architect pass.** Assignment rewriting is not a one-liner: compound
assignment (`+=`), prefix vs postfix (`++x` / `x++` differ in return value), shadowing
(an inner `let count` must NOT rewrite), destructuring targets, and nested closures all
have to be specified before code. Iron Law applies — spec before fix.

**A1 acceptance (runnable):**
- `cookbook/aihu-counter.aihu` compiles, and increment/decrement/reset mutate state
  without throwing. Drive it, don't just compile it.
- `bun run check:emit-parses` reports 0 `parse` failures across cookbook.
- `cargo test -p aihu-compiler` ≥ 773 passing, 0 failures.
- **Bidirectional:** a shadowed local named the same as a prop must NOT be rewritten
  (over-application), and every one of the 5 known-broken components must be fixed
  (under-application). Both directions get named-sample tests.

**A4 is the recurrence guard.** It only lands after A1 and A3 clear, because it goes red
otherwise. Do not weaken the check to make it pass early.

### Track B — Agent surface completion

| Slice | Mode | Roster | Branch | Depends on |
|---|---|---|---|---|
| **B1** Typed MCP param schemas | 2 | Architect → Builder → Verifier | `feat/mcp-param-schemas` | A1 |
| **B2** Server-card skills from manifest | 3 | Builder → Verifier | `feat/server-card-from-manifest` | — |
| **B3** Docs truth pass | 3 | Builder → Verifier | `docs/agent-surface-truth` | B1, B2 |
| **B4** `MarkdownResolver` + UA negotiation | 2 | Architect → Builder → Verifier | `feat/markdown-resolver` | — |

**B1 depends on A1** — both touch handler/action-body parsing. Landing them
independently invites a merge conflict in exactly the code A1 just rewrote.

**B3 lands last in the track** because it documents what B1/B2 actually shipped. Writing
docs first is how the current 937-line no-status-marker problem happened.

**B2 acceptance:** the server-card `skills` array is generated, `vite.config.ts` no
longer hand-mirrors it, and the hand-sync comment is deleted. Verify by adding an
`$action` and confirming the card changes with no manual edit.

### Track C — Security

| Slice | Mode | Roster | Branch | Depends on |
|---|---|---|---|---|
| **C1** a2a/acp spec conformance | 2 | Architect → Builder ↔ Verifier (multi-round) | `feat/a2a-acp-spec-conformance` | — |
| **C2** Rate-limit fail-closed | 3 | Builder → Verifier | `fix/ratelimit-fail-closed` | — |
| **C3** Bridge handshake auth | 3 | Builder → Verifier | `fix/bridge-auth` | — |

**C1 is the largest slice and the only one budgeted for multi-round ping-pong.** Scope:
- A2A: JSON-RPC 2.0 envelope, task lifecycle + task store (so `tasks/get` is
  implementable), correct `Message`/`parts` handling, honest `capabilities`.
- ACP: real argument passing — `handleToolCall(toolName, null)` is hardcoded today, so
  the transport structurally cannot invoke anything with arguments.
- Both: forward `RequestContext` so they stop being anonymous by construction.
- Resolve the naming question: the header claims Zed's Agent Client Protocol; the
  implementation resembles BeeAI ACP. Pick one and say so.
- **Rewrite the 542 lines of tests against the real specs.** The existing tests validate
  the shims' own invented shape, which is why the divergence looked finished. Deleting
  and rewriting them is in scope, not a side effect.

**C1 hard-stop: 5 Builder↔Verifier rounds.** If conformance hasn't converged by then,
Director surfaces a scope re-question rather than grinding.

**C2 acceptance:** declaring `$rate-limit` without installing the plugin must FAIL, not
silently pass unlimited. Plus: rate-limit keys must not be derivable from caller-supplied
`userId` alone.

### Track D — SSR / hydration

| Slice | Mode | Roster | Branch | Depends on |
|---|---|---|---|---|
| **D1** Unify path keys + integration test | 2 | Architect → Builder → Verifier | `fix/ssr-path-keys` | — |
| **D2** Declarative shadow DOM in SSR | 2 | Architect → Builder → Verifier | `feat/ssr-declarative-shadow` | D1 |
| **D3** Signal pre-seeding on hydrate | 2 | Builder → Verifier | `feat/hydrate-signal-seeding` | D1 |
| **D4** SSR for structural nodes | 2 | Builder → Verifier | `feat/ssr-structural-nodes` | D1 |

**D1 is the keystone of the track and blocks the other three.** It spans three files that
must agree: `packages/server/src/ssr.ts` (emits `"0"`), `packages/arbor/src/hydrate.ts`
(hardcodes `'hydrate.0'`), and `packages/server/src-native/src/render.rs` (Rust renderer,
same convention). It also folds in the production-path fix — `packages/router/src/server.ts`
calls `renderToString(component)` with no options, so it emits non-hydratable HTML
regardless of any key fix.

**D1 acceptance is the missing test, and it is the whole point:** pipe real
`renderToString(…, {hydratable:true})` output into `hydrate()` and assert the client
ADOPTS the server nodes rather than falling back to `_materialize`. No such test exists
anywhere today, which is why this has been broken while green.

**Do not** let a Builder "fix" this by hand-writing expected markup in the test. That is
precisely how `packages/arbor/tests/hydrate.test.ts` passes while the integration is
broken.

`_rootIdCounter` is a mutable module global, so keys are stable only within one page's
mount ordering. D1's spec must say what replaces it (content-derived or
compiler-assigned).

### Track E — Package hygiene

| Slice | Mode | Roster | Branch | Depends on |
|---|---|---|---|---|
| **E1** `@aihu/seo` → re-export + deprecate | 3 | Builder → Verifier | `refactor/seo-reexport` | — |

Port `seoLlmsSections` into `plugin-agent-readiness`; delete `json-ld.ts`; re-export the
rest; flip `disallowAiBots` to match the sibling's `allow-all`; publish deprecation.
Also: `mcp-server-card.ts:84-85` advertises two `/.well-known/oauth-*` endpoints that
nothing serves — either serve them or stop advertising.

**Published at 0.2.1**, so existing installs must keep working. Verify by installing the
re-export build against a consumer that imports the old surface.

### Track F — fellwork/web consumer (different repo)

| Slice | Mode | Roster | Branch | Depends on |
|---|---|---|---|---|
| **F1** `@aihu/context` dep + dedupe | 3 | Builder → Verifier | `fix/aihu-context-dedupe` (web repo) | — |

Add `@aihu/context@0.2.0` as a direct dep of `apps/web` (0.1.1 predates `contextKey` —
import-time failure), and add `@aihu/context` to `resolve.dedupe`. The dedupe entry is
the load-bearing half: `contextKey` interns tokens in a module-global `Map`, so two
copies mint different tokens for the same key and `inject` returns `undefined` silently.

**Cross-repo branch hygiene (lesson #7):** F1 runs in `fellwork/web`, everything else in
`aihu`. Paired-but-distinct branch names; cross-reference both PR descriptions. No two
concurrent agents on the same branch, ever.

---

## Dependency graph

```
A1 ──┬──> A4          (A4 also needs A3)
     └──> B1 ──> B3
A2   (independent)
A3 ──┘
B2 ──────────> B3
B4   (independent)
C1   (independent, longest)
C2   (independent)
C3   (independent)
D1 ──┬──> D2
     ├──> D3
     └──> D4
E1   (independent)
F1   (independent, other repo)
```

**Maximum safe concurrency: 9 branches** — A1, A2, A3, B2, B4, C1, C2, C3, D1, E1, F1
minus those already running. Practical wave sizing is the Director's call.

**Critical path: C1** (multi-round, spec conformance). Start its Architect early even if
its Builder waits.

---

## Universal dispatch rules for this effort

Every brief in every slice carries these. They are the mechanical safeguards against the
11 known failure patterns.

1. **Cite the acceptance criteria from THIS document verbatim.** Do not accept
   agent-revised targets. Compare reported numbers to the spec, not to what the agent
   found reasonable. (Lesson #1)
2. **Deliverable = the artifact on the branch, committed and pushed** — plus a build
   manifest at `docs/plans/<slice>/build-manifest.md`. "Code is done" ≠ "the thing
   shipped." (Lesson #2)
3. **No "PASS conditional."** Every deferral is a candidate blocker until the Director
   routes it explicitly. (Lesson #3)
4. **Named-sample acceptance, not aggregates.** "773 tests pass" hides the one component
   that regressed. Name the samples. (Lesson #4)
5. **Bidirectional verification, always.** Every Verifier brief states both directions
   explicitly: under-application AND over-application. A1 is the sharpest case — the
   rewrite must fire on all 5 broken components and must NOT fire on shadowed locals.
   (Lesson #9)
6. **Iron Law:** ambiguous defects get an investigation doc before any fix code.
   Applies to D1 and C1 unconditionally. (Lesson #10)
7. **Surface domain unknowns; do not guess.** If a brief hits an unstated product
   question, stop and surface. Four such questions were already answered above; more will
   appear. (Lesson #6)
8. **One branch per concurrent agent.** (Lesson #7)
9. **Do not trust self-reported STATUS.** Team Lead verifies against the artifact — git
   log shows the commit, the test actually runs, the file exists — before dispatching the
   Director. (Lesson #2)
10. **`.aihu` fixtures are not scratch.** `cookbook/` and `examples/` are documentation.
    A fix that edits a fixture to dodge a compiler bug is a regression, not a fix.

### Project-specific guardrails

- **Never syntax-check with a stale binary.** `check-emit-parses` picks the newest of
  `packages/compiler/bin` / `target/release` / `target/debug`. The Vite plugin's fixed
  precedence reads a stale `target/release` and reported 24 phantom failures once already.
- **`bun run check:emit-parses` is the fast signal** for any compiler change. Run it
  before claiming a codegen slice is done.
- **Suites assert substrings, not validity.** A green `cargo test` does not mean the
  emitted JS parses. That gap shipped five simultaneous bugs.
- **Pre-commit hooks rewrite files** (biome + `sync-readme.ts`). Expect README/bundle-size
  churn in commits; do not fight it.
- **Commitlint scope enum** now covers all real packages. Use `docs` for TODOS edits.

---

## Session protocol

Per the synthesis spine, each round:

1. Researcher ships; reports `STATUS: DONE | PARTIAL | BLOCKED` with concrete numbers per
   acceptance item, plus the path of any doc written.
2. Team Lead **verifies the STATUS against the artifact** before proceeding.
3. Topic Director reads findings + prior notes, writes
   `docs/plans/<slice>/director-note-<N>.md`: on-thesis assessment, priority, scope
   signal, refined next brief, surface triggers.
4. Synthesizer updates `docs/plans/<slice>/summary.md` when the Director routes for it.
5. Next Researcher briefed **from the summary**, not from raw prior findings.
6. End of session: Historian writes `docs/retros/2026-07-19-remediation-q3.md`, promotes
   earned findings into `docs/lessons/` and `docs/domain-hints/`, updates
   `state-remediation-q3.md`.

**Surface to user when:** Verifier reports BLOCKED with no path; Director says surface;
5 rounds without convergence in one defect class; cross-repo conflict; a product question
not already answered in §Locked decisions.

---

## Definition of done

- All 20 catalogued issues either fixed, or explicitly closed with rationale in `TODOS.md`.
- `bun run check:emit-parses` green and **gating in CI**.
- A real SSR→hydrate integration test exists and passes.
- `cargo test --workspace` and every TS package suite green.
- No fixture edited to dodge a compiler bug.
- Retro written; findings promoted; `state-remediation-q3.md` current.
- Fresh GBrain sync run on `main`, sourced from a stable path.
</content>
</invoke>
