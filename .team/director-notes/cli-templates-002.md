# Director-note · cli-templates · round 002 · 2026-05-05

**Trigger:** Builder B1 (round 1) stalled silently. Task ID `a1c129ec49f58db13`. Worktree `c:/git/fellwork/aihu-b1` was created on `feat/cli-templates-b1` (off `308600c`), zero commits, no push, no PR. Worktree currently clean. Agent terminated without reporting.

**On-thesis assessment:** **arch-6 spec is good; B1 *batch* was too big for one Builder dispatch.** The §10 plan in arch-6 itself was well-cut at the architecture level (B1/B2/B3), but B1's contents — pipeline machinery + cf-team template package + scaffold-and-compile harness across 3 auth providers + initial changeset, all in one dispatch — exceeded a single Builder's plausible budget. The §13 RESOLUTIONS (3 auth providers as runtime prompt for cf-team) effectively tripled B1's smoke-test surface vs the original plan, and that change wasn't reflected in a re-cut of B1 before dispatch. **No re-spec needed; just a finer cut of the same scope.**

**Routing for synthesis:** **Synthesizer should NOT fire this round.** No new substantive findings — no Builder output to capture, no Verifier verdict, no new architectural decisions. The state file `state-cli-templates.md` and arch-6 remain accurate. Synthesizer fires after B1.1 lands with verifier-confirmed work product.

**Priority:** B1.1 next. B1.2 + B1.3 sequenced behind it. B2 and B3 (per arch-6 §10) shift downstream by one effective round but their scope is unchanged.

**Scope signal:** **continue (re-cut, not surface).** Per fw-agent-skill discipline: this is a Mode-2 ping-pong round 1 that produced no output (effectively counter unchanged or +1 of 5). The re-cut is in-spec because arch-6 §10 already gestured at it ("Round-B1 deliberate scope cut: no other vendors. No solo template. No full-agent."). The new cut subdivides B1 itself along the same logic, one level deeper. Surface-to-user happens only if B1.1 *also* fails — then we have a pattern, not a one-off.

---

## Diagnosis (1 paragraph)

The original B1 brief asked one Builder to land, in a single dispatch: (a) 4 new `@aihu/cli` modules totaling roughly 600+ LOC of new code with their own unit tests, (b) extension of `bin.ts` to dispatch `aihu app --template <T>` to a new pipeline, (c) the entirety of `@aihu/templates-cf-team` as a workspace package with its `template/` directory tree (10+ template files including monorepo+moon shape, three auth-provider conditional file sets, `.mcp.json`, GitHub Actions CI), (d) a scaffold-and-compile Vitest harness covering 3 auth-provider × cf-team = 3 fully-built scaffolds in a single test file, (e) a backward-compat snapshot test with golden files, and (f) initial changeset entries for both packages. Conservative estimate: 25-30 new files, 800-1200 LOC, plus the harness needs a working bunx installation that resolves the workspace template — which is itself non-trivial bootstrapping. The agent created its worktree, then likely either hit token-budget exhaustion before producing a commit, got distracted by skill auto-loading on keywords like "deploy"/"test"/"agent" (the session has many auto-suggested skills firing on those), or crashed mid-edit before any partial work was saved. **Root cause: scope, not skill.** The clean-worktree state is consistent with "agent never reached first save" — so the fix is smaller batches, not better tooling.

---

## Re-cut: B1 → B1.1 / B1.2 / B1.3 (3 sub-rounds)

The cut respects the existing arch-6 §10 dependency graph but subdivides B1 along its natural seam: **pipeline machinery** vs **template content** vs **cross-cutting harness**. Each sub-round is verifiable in isolation.

### B1.1 — Pipeline scaffolding only (no template, no smoke harness)

**Goal:** prove the CLI machinery compiles and unit-tests pass *before* any template package exists. The pipeline is generic — it has no idea what cf-team is. We can validate it with a mocked manifest fixture in unit tests.

- **In scope:** 5 new `packages/cli/src/*.ts` files (`template-manifest.ts`, `prompts.ts`, `templates-registry.ts`, `conditional-eval.ts`, `scaffold-pipeline.ts`); extend `bin.ts` to recognize `--template <T>` and dispatch (with the new path stubbed if `T` not in registry yet, fall through to legacy); minimal unit tests for each new module using **in-memory mock manifests**, NOT a real template package.
- **Out of scope:** any `packages/templates/*` directory, any cf-team content, any scaffold-and-compile end-to-end harness, any changesets.
- **Estimated:** 5 new src files (~400-500 LOC) + 3-5 unit-test files (~200-300 LOC). One PR. Builder should plausibly finish in 20-30 minutes.
- **Branch:** **reuse `feat/cli-templates-b1`** (worktree clean; no need to burn another worktree). Builder treats it as fresh.
- **Acceptance (Bash-runnable):**
  ```bash
  bun run typecheck  # exit 0 — new modules type-check
  bun run test packages/cli/tests/template-manifest.test.ts   # exit 0
  bun run test packages/cli/tests/conditional-eval.test.ts    # exit 0
  bun run test packages/cli/tests/scaffold-pipeline.test.ts   # exit 0
  bun run test packages/cli/tests/prompts.test.ts             # exit 0
  bun run test packages/cli/tests/templates-registry.test.ts  # exit 0
  # bin.ts continues to pass existing legacy test
  bun run test packages/cli/tests/cli.test.ts                 # exit 0
  ```

### B1.2 — `@aihu/templates-cf-team` package (template content only)

**Goal:** with B1.1 in main, ship the cf-team template package — its `template.config.ts`, its `template/` directory tree (monorepo+moon shape, all 3 auth-provider conditional file sets, `.mcp.json`, CI workflow). No smoke-and-build harness yet — manual scaffold validation by Builder is sufficient.

- **In scope:** new `packages/templates/cf-team/` workspace package (`package.json`, `template.config.ts`, full `template/` tree with `*.tmpl` files); add to bun workspaces glob if not already covered by `packages/*`; add to `KNOWN_TEMPLATES` registry from B1.1; manual sanity check `bunx aihu app smoke --template cf-team --no-interactive --use-defaults` produces a directory tree (don't yet require it to compile).
- **Out of scope:** scaffold-and-compile harness, changesets, the other 4 templates (per arch-6 §10 those are B2).
- **Estimated:** 1 new package (~15-20 files in `template/` + manifest), no LOC ceiling for templates since they're mostly static content. Builder dispatches in one pass; if Builder finds a template file is producing more than ~80 lines of substantive logic, surface immediately.
- **Branch:** **fresh worktree on `feat/cli-templates-b1.2`** (off main once B1.1 lands).
- **Acceptance (Bash-runnable):**
  ```bash
  test -d packages/templates/cf-team/template
  test -f packages/templates/cf-team/template.config.ts
  jq -e '.name == "@aihu/templates-cf-team"' packages/templates/cf-team/package.json
  bun install  # workspace resolves cleanly
  bun run typecheck  # exit 0
  # Manual scaffold sanity (Builder runs locally; reports tree count):
  TMP=$(mktemp -d) && cd "$TMP" && bunx --bun "@aihu/cli@workspace:*" app smoke \
    --template cf-team --no-interactive --use-defaults --no-git
  test -f smoke/.mcp.json || test -f smoke/apps/web/.mcp.json
  ```

### B1.3 — Smoke harness + auth-provider matrix + initial changeset

**Goal:** with B1.1 + B1.2 in main, wire the scaffold-and-compile Vitest harness covering all 3 auth providers for cf-team, add a CI job to `plan-a.yml`, and write the initial changeset for both `@aihu/cli@0.2.0` and `@aihu/templates-cf-team@0.2.0`.

- **In scope:** `packages/cli/tests/scaffold-and-compile.test.ts` with `it.each` over the 3 auth providers for cf-team; CI integration (extend existing `plan-a.yml` `check` job per arch-6 §5.5); changeset files; legacy-snapshot test from arch-6 §7.3.
- **Out of scope:** any other template (cf-team only — broader matrix is B2); README autogen (B3 in arch-6 §10).
- **Estimated:** 2 test files + CI YAML edit + 2 changeset files. One PR. ~150-250 LOC.
- **Branch:** **fresh worktree on `feat/cli-templates-b1.3`** (off main once B1.2 lands).
- **Acceptance (Bash-runnable):**
  ```bash
  bun run test packages/cli/tests/scaffold-and-compile.test.ts  # exit 0 (all 3 auth providers green)
  bun run test packages/cli/tests/legacy-snapshot.test.ts        # exit 0
  test -f .changeset/*.md                                        # changeset entries present
  grep -q 'scaffold-and-compile' .github/workflows/plan-a.yml    # CI wired
  ```

---

## Refined brief for B1.1 (Team Lead pastes this verbatim into the next Builder dispatch)

```
ROLE: Builder · ROUND: B1.1 · TOPIC: cli-templates · MODE: 2

INPUTS (do not re-derive):
- docs/roadmap/arch-6-cli-templates.md sections §2.3, §3.4, §4 (esp. §4.1, §4.2, §4.4)
- state-cli-templates.md §5
- Existing source you must NOT break:
    packages/cli/src/index.ts (legacy scaffolders — leave alone)
    packages/cli/src/bin.ts (extend; preserve existing dispatches)
    packages/cli/src/create.ts (do not touch in B1.1 — that's B1.2's seam)
    packages/cli/tests/cli.test.ts (must continue to pass)
- AGENTS.db: agents_search "cli-templates round 002" returns this director-note's cut.

WORKTREE: c:/git/fellwork/aihu-b1 on branch feat/cli-templates-b1
  (worktree currently clean; treat as fresh; commit + push to this branch).

DELIVERABLES (5 src files + 5 test files + 1 minor bin.ts edit):

1. packages/cli/src/template-manifest.ts (~80 LOC)
   - Exports the TemplateManifest TypeScript type per arch-6 §2.3.
   - Exports validateManifest(obj: unknown): TemplateManifest — runtime
     schema check (no zod dep — hand-rolled type guards). Returns parsed
     manifest or throws Error with a clear message.
   - Zero runtime deps. Pure types + one validator.
   ACCEPTANCE: bun run test packages/cli/tests/template-manifest.test.ts → exit 0.

2. packages/cli/src/conditional-eval.ts (~100 LOC)
   - Exports evalWhen(expr: string, context: Record<string, unknown>): boolean.
   - Strict-subset evaluator per arch-6 §4.2: identifiers, string literals,
     boolean literals, ===, !==, &&, ||, !, parentheses. NO eval/Function/vm.
   - Recursive-descent parser over a tiny tokenizer. Throws on
     unrecognized syntax.
   ACCEPTANCE: bun run test packages/cli/tests/conditional-eval.test.ts → exit 0.

3. packages/cli/src/templates-registry.ts (~30 LOC)
   - Exports KNOWN_TEMPLATES = ['@aihu/templates-cf-team', '@aihu/templates-vercel-team',
     '@aihu/templates-fly-team', '@aihu/templates-cf-solo', '@aihu/templates-cf-full-agent'] as const.
   - Exports resolveTemplateName(short: string): string | undefined that
     maps short names ('cf-team' → '@aihu/templates-cf-team').
   ACCEPTANCE: bun run test packages/cli/tests/templates-registry.test.ts → exit 0.

4. packages/cli/src/prompts.ts (~150 LOC)
   - Hand-rolled prompts per arch-6 §3.4. Three exports: promptText(),
     promptSelect(), promptYesNo(). All use node:readline + raw stdin.
   - In non-TTY mode (process.stdin.isTTY === false), error with a clear
     message asking for --no-interactive flag.
   - Number-fallback for promptSelect (user types 1, 2, 3).
   - Zero deps.
   ACCEPTANCE: bun run test packages/cli/tests/prompts.test.ts → exit 0.
     Tests use mocked stdin/stdout streams (no real TTY).

5. packages/cli/src/scaffold-pipeline.ts (~200 LOC)
   - The 6 pure functions per arch-6 §4.4: resolveTemplate (stub for now —
     just imports a manifest from a path argument), mergeOptions,
     enumerateFiles, readSubstituteWrite, runPostInstall, printNextSteps.
   - readSubstituteWrite uses the placeholder set in arch-6 §4.3 (literal
     __NAME__ string-replace).
   - runPostInstall handles 'pm-install' | 'git-init' | 'lint-fix' kinds
     via spawnSync (shell:false; mirrors create.ts pattern).
   - NO real I/O in resolveTemplate / mergeOptions / enumerateFiles
     (arch-6 §4.4 — keep them pure).
   ACCEPTANCE: bun run test packages/cli/tests/scaffold-pipeline.test.ts → exit 0.
     Tests use in-memory FileTuple fixtures and a mock filesystem
     (a Map<path, content> wrapper); no real fs writes during unit tests.

6. packages/cli/src/bin.ts (small edit, ~20 LOC added)
   - When cmd === 'app' AND --template flag is present: parse the flag,
     check resolveTemplateName, and IF the registry resolves it, write
     'STUB: new pipeline not yet wired in B1.1' to stderr and exit 0.
     (B1.2 wires the actual dispatch.) IF the registry doesn't resolve it,
     fall through to legacy scaffoldApp().
   - When cmd === 'app' AND no --template flag: identical behavior to today.
     (Backward-compat — see arch-6 §7.2.)
   ACCEPTANCE: bun run test packages/cli/tests/cli.test.ts → exit 0
     (existing tests still pass).

PROCESS:
- Make a separate commit per src file + its test file (6 commits is fine,
  fewer is also fine — what matters is the tests pass at every commit).
- After each commit, run `bun run typecheck && bun run test`. If either fails,
  fix before next commit.
- After the final commit, push to origin/feat/cli-templates-b1 and STOP.
  Do NOT open a PR — Team Lead handles that.
- Report STATUS: DONE | PARTIAL | BLOCKED with file count and test count.

OUT OF SCOPE — do NOT do these in B1.1:
- Do NOT create packages/templates/cf-team/ or any template content.
- Do NOT add a scaffold-and-compile end-to-end harness.
- Do NOT touch packages/cli/src/create.ts (B1.2 owns that seam).
- Do NOT add changesets.
- Do NOT add any npm dep to packages/cli (zero-runtime-dep contract).
- Do NOT write README updates.

TIME BUDGET (informational, not a hard limit):
If you finish all 6 deliverables in <30 minutes wall-clock, that's the
right scope — proceed to push and report DONE. If at the 30-minute mark
you have <4 of the 6 deliverables landed, surface immediately with what
you have committed; do NOT keep going silently.

UNCERTAINTY:
- If any arch-6 reference is ambiguous, prefer the simpler reading and
  note the ambiguity in your STATUS report. Do not invent new spec.
- If unit-testing prompts.ts on Windows (CRLF, no real TTY) is harder
  than expected: skip the failing platform-specific test with a TODO and
  surface in your STATUS report. Do not block the round on it.
```

---

## Anti-pattern check (Step 4)

- **Did the original B1 brief revise targets?** **No.** It cited arch-6 §10 directly. The spec was right. **The batch was wrong.** This is a Team-Lead orchestration miss, not a substance miss. (The arch-6 spec itself, in §13 Q3 RESOLVED, also tripled the cf-team smoke surface from 1 → 3 auth providers without re-cutting B1 — that's a substance/orchestration handoff failure that the round-002 cut now corrects.)
- **Were there sample-level acceptance items hidden by aggregate?** **Yes.** "Compiles after scaffold for cf-team" was a 3-test bundle (3 auth providers) presented as one acceptance item. The new cut explicitly distributes the 3 auth providers across B1.2 (template content for all 3) and B1.3 (the scaffold-and-compile matrix runs all 3). Each provider is now its own check.
- **Has the work nature shifted?** **No.** Still building CLI templates. **Iteration counter does NOT reset.** This is round 002 of the same Mode-2 build, with the orchestration-side correction.
- **Is this hitting the iteration ceiling?** **No.** Round 1 didn't ship — counter is at 1 of 5 ping-pong rounds in arch-6 §10's projection. Plenty of headroom.
- **Surface to user?** **Already done — user invoked this skill saying "program stalled".** Continue with the new cut. Surface again only if B1.1 *also* fails.

---

## Continuity check

- **Round 001 produced** `state-cli-templates.md` (PR #76) plus this track's first SOTA-CLI-survey + 11-dimension matrix + 4 surface questions answered by user (Q1=vendor-distinct, Q2=split family, Q3=ON/Minimal, Q4=team-ready promoted to M1).
- **Round 002a (substance)** was the Architect spec landing as PR #77 (`docs/roadmap/arch-6-cli-templates.md`, 893 lines, 13 sections, with 4 in-spec §13 RESOLUTIONS making cf-team smoke matrix 3× larger). AGENTS.db has the arch-spec record.
- **Round 002b (this note, governance correction)** corrects the iteration cadence after B1's silent stall. arch-6 spec is still the formal architecture; only the Builder batching changes.
- **AGENTS.db state:** 2 prior records on `topic:cli-templates` (round 001 director-note id 408960901; round 002 arch-spec id 1790932701). This note adds the third.

---

*Substance only. Branch names, dispatch mechanics, worktree creation, and merge sequencing belong to the Team Lead.*
