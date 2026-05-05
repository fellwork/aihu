# Director-note · cli-templates · round 004 · 2026-05-05

**Trigger:** B1.2 closed. PR #84 (`verify(cli-templates): B1.2 audit — PARTIAL`) merged at `82c9a2a` and effectively sneaky-landed the full B1.2 deliverable (the verifier-report branch was forked off `feat/cli-templates-b1.2` so it carried the 22-file `template/` tree + 3-file package shell along with the audit doc). PR #83 (`fix(templates): B1.2 patches — phantom moon project (F-1) + biome.json rename (F-6)`) merged at `4dac59a` and closed the only blocker (F-1) plus an opportunistic biome-discovery fix (F-6) by adding `packages/templates/moon.yml` (`language: 'unknown'` + noop overrides), `packages/templates/cf-team/tsconfig.json` (`exclude: ['template/**']`), and renaming `template/biome.json` → `template/biome.json.tmpl`. `bun run typecheck` is green on main again. Four non-blocker findings (F-2 through F-5) plus two pre-existing state-file inconsistencies need substance routing before B1.3 dispatches.

**On-thesis assessment:** **The cut and the spec both held up under fire.** B1.2 produced exactly the 22-file template tree the brief specified, with zero out-of-scope creep (no harness, no changesets, no other vendors), all 9 expected `conditionalFiles` entries, all 5 pipeline-behavioral variants symmetric, manifest validates against the locked `TemplateManifest` type from B1.1, `.mcp.json` byte-identical to §2.5. F-1 was a phantom-moon-project surface the brief had explicitly anticipated under "TYPECHECK NOTE — option (a)/(b)" and Builder β/γ failed to surface — that's an orchestration/communication miss, not a substance miss, and it's now closed. arch-6 unchanged. Continue to B1.3, the last round in the projection.

**Routing for synthesis:** **NOT FIRE this round.** The substantive findings from B1.2 (manifest contract honored, conditional-file logic correct across 5 variants, `.mcp.json` lock byte-stable) are routine confirmations, not new architectural facts. F-2's arch-6 §2.6 amendment IS a durable-knowledge edit, but I'm folding it into B1.3's brief as a lightweight inline edit — Synthesizer doesn't need to mediate a one-line spec change. Synthesizer fires after B1.3 lands, when v0.2.0 closes and the state file needs a milestone-complete record (which is the natural place to also fix the two pre-existing state inconsistencies — see disposition below).

**Priority:** B1.3 next. Smoke harness + 3-auth-provider matrix + initial changesets + backward-compat snapshot + CI integration. Last round in the arch-6 §10 projection for v0.2.0.

**Scope signal:** **continue.** Same Mode-2 build, same iteration counter advances by 1 (now 4 of 5). No surface-to-user; no re-spec.

---

## F-2 — `expose.aihu` extends arch-6 §2.6 with `@state` block + `$describe`

**Disposition: (b) brief into B1.3 — amend arch-6 §2.6 to include the `@state` block, keep `$describe` as-is.**

The shipped expose.aihu has three additions vs the literal §2.6 example: `@state { appName: string = '__APP_NAME__' }`, a CSS class on the `<span>`, and `$describe appName "..."`. The Builder's defense holds: an SFC referencing `{{ appName }}` in `@template` without an `@state` declaration would not compile against the current arbor binding model — the §2.6 example is prose-illustrative, not literally compilable. Verifier's recommendation (ii) — update §2.6 — is the right call because future template authors (B2 — vercel-team, fly-team, cf-solo, cf-full-agent) will copy this shape and we want one canonical form, not one form in §2.6 + a different form in `cf-team/template/`.

The `$describe` line is genuinely additive (it gives MCP introspection a human-readable hint) and the rendered shipped version is a strict superset of what §2.6 prints today. I'm routing the §2.6 edit into B1.3's brief because (a) it's a 4-line doc edit with no risk surface, (b) bundling it with the rest of B1.3 means one PR not two, (c) §2.6 is what the B2 templates will reference and B2 is the next track — this lets §2.6 be authoritative before B2 dispatches. **Picking (a) over the original three options because the literal example WAS broken; investigate-then-route would just rediscover that.**

## F-3 — `apps/web/package.json.tmpl` lists `@aihu/server` and 3 auth providers unconditionally

**Disposition (split):**
- **`@aihu/server` issue: (a) add to `appPeerDeps`** — accept Builder γ's import as the authoritative source-of-truth.
- **Unconditional auth providers: (b) accept the redundancy for v0.2.0; file conditional-deps as v0.2.1 followup.**

For `@aihu/server`: `apps/web/src/main.ts` imports `createRequestRouter` and `defineRoute` from `@aihu/server` — that import is correct (Cloudflare Workers entry needs a request router). The manifest is the document that diverged. Adding `'@aihu/server': '^0.2.0'` to `appPeerDeps` reconciles manifest with reality and keeps the import. Pulling the import would force `main.ts` to inline a router or import from `@aihu/runtime` directly, neither of which is correct architecturally — `@aihu/server` is the right package for server-runtime work and the cf-team template is a server scaffold. **Route into B1.3 brief: one-line manifest edit.**

For the three auth providers: the static `apps/web/package.json.tmpl` lists `better-auth`, `@kinde-oss/kinde-typescript-sdk`, and `@supabase/supabase-js` unconditionally because B1.1's `readSubstituteWrite` is a pure literal-string-replace pass — there's no manifest-driven dep injection mechanism. The manifest's `appPeerDepsConditional` is currently *informational only*: nothing in the pipeline reads it and edits the emitted `package.json`. Two paths forward:
- **(a) Reconcile in B1.3** — add a "render `appPeerDeps` + chosen `appPeerDepsConditional` into emitted package.json" pipeline pass. This is a meaningful pipeline change (~50 LOC + tests + a JSON deep-merge function); under B1.3's time budget if scoped tight, but it's not what the brief originally promised B1.3 would deliver and there's a real risk of re-opening the §4.4 "pipeline functions are pure" contract.
- **(b) Accept the static-template duplication; file as v0.2.1 followup.** The user gets all 3 auth-provider node_modules even though they only use one — that's ~15MB of extra `node_modules` and a slightly noisier `package.json`. Compile-after-scaffold still passes (no extra deps cause build failure, just disk bloat). Verifier explicitly recommended this: "Recommend punt to B1.3 — outside B1.2's scope." Read carefully, that was actually "punt OUT of B1.2 to *somewhere later*", and the simplest "later" is v0.2.1 not B1.3.

I'm picking (b) because B1.3 is the last round in the projection and adding pipeline machinery (especially deep-merge into package.json) past round 4 is exactly the kind of work that pushes us through the iteration ceiling. The disk-bloat is a UX nit, not a correctness bug. **Folding into B1.3 brief as an explicit "DO NOT TOUCH" with a v0.2.1 followup note.**

## F-4 — `appPeerDeps` pinned to `^0.2.0` (vs arch-6 §2.3 example `^1.0.0`)

**Disposition: (a) update arch-6 §2.3 example to `^0.2.0` — fold into B1.3 brief.**

Builder γ's defense is correct on its face: `bunx create-aihu my-app --template cf-team` resolves the user's `apps/web/package.json` deps against npm at scaffold time. `@aihu/runtime@^1.0.0` doesn't exist on npm; `@aihu/runtime@^0.2.0` is what's shipping alongside this CLI. The §2.3 example was aspirational, written at a time when arch-6 imagined the framework would have cut 1.0 by the time the templates shipped. Reality is the templates ship first.

Updating §2.3 to show `^0.2.0` makes the spec match what's deployable today AND preserves a clear audit trail for when the framework cuts 1.0 (a future change touches both the spec example and every template manifest in the same PR — the symmetry makes the bump obvious). One-line spec edit; folds cleanly into B1.3's brief alongside F-2's §2.6 amendment.

## F-5 — `.env.example.<provider>` retains provider suffix on emit

**Disposition: (c) document in template README.md.tmpl now (B1.3); file pipeline rename mechanism as v0.2.1 followup.**

The conditional-files mechanism doesn't currently rename files at emit time. After scaffold, the user has `apps/web/.env.example.better-auth` (or `.kinde` / `.supabase`) and must rename to `.env.example` themselves. The pipeline-side fix is genuinely small (add an optional `rename` field to `conditionalFiles` entries; `readSubstituteWrite` honors it) but it's a pipeline contract change in the last round before v0.2.0 ships — exactly the situation §4.4 says to avoid.

Cheap fix now: B1.3 adds a "Setup" section to `template/README.md.tmpl` instructing the user to copy/rename the `.env.example.<provider>` file. Verifier explicitly recommended this. The pipeline `rename` enhancement gets filed as a v0.2.1 followup where it can also subsume the `.tmpl`-stripping logic into a more general rename pipeline. **Two minor B1.3 edits: README.md.tmpl Setup section + a v0.2.1-followup line in `state-cli-templates.md` (Synthesizer can promote at r-005, no need to anticipate now).**

---

## State-file inconsistency disposition (pre-existing items)

Synthesizer r-003 flagged two state-file ↔ arch-6 §13 RESOLVED gaps:

1. **D2 Auth (state §2.6 + §3) says "v0.2.0 = None default; @aihu/auth deferred v0.2.1; Clerk/Lucia/better-auth = v0.2.2"** — but arch-6 §13 Q3 RESOLVED promotes a 3-provider runtime prompt {better-auth, kinde, supabase} into v0.2.0 / M1 with `better-auth` as default for the four team templates. The state file's auth phasing is now wrong for v0.2.0.

2. **R-CT-07 (state §6) recommends "bundle templates in CLI for v0.2.0; split if a v0.2.x has > 3 template-only patch releases"** — but arch-6 §13 Q2 RESOLVED locks separate `@aihu/templates-*` family from day one. The state file's risk-mitigation guidance now points at the wrong outcome.

**Routing decision: defer to Synthesizer r-005 (after B1.3 lands).** Reasoning:
- Both are state-file-only edits — no Builder needs to consume them. B1.3's Builder reads arch-6 §10 + the B1.3 brief, not state §2/§3/§6 directly.
- Synthesizer r-005 will run anyway after B1.3 closes the v0.2.0 milestone — that's the natural place to align the state file with shipped reality (3 templates' worth of shipped reality, in fact: cf-team-the-template, the contract from B1.1, the harness from B1.3).
- Routing a synthesizer pass mid-round to fix two pre-existing copy-edits is mass-disproportional to the value (Builder isn't blocked).
- Doing it inline in this director-note (which is what "Director authors a state-file-alignment edit in this round" would mean) blurs the substance ↔ orchestration line — director-notes are decisions, state files are durable knowledge, those are different artifacts.

**Specific edits Synthesizer r-005 should make** (recording here so r-005 doesn't re-derive):

State `§2 D2 Auth` table: change the rows so `better-auth | kinde | supabase` are all marked `M1 (shipped via cf-team and the 3 team templates)` instead of `deferred v0.3`; keep `@aihu/auth` row at `M2 (gated on RFC #56 RATIFY)`; keep `Clerk | Lucia` at `deferred v0.3+` (genuinely not in v0.2.0 per arch-6 §11 IS-NOT line 3). Update the **Compatibility** sub-paragraph: "v0.2.0 ships better-auth as the default for team templates per arch-6 §13 Q3 RESOLVED; @aihu/auth re-evaluates for v0.2.1 if RFC #56 ratifies."

State `§3.1 (v0.2.0 M1) Locked choices` table: change `D2 Auth` row from `None` to `better-auth (cf/vercel/fly-team) · None (cf-solo)` to reflect the curated-5 actual phasing.

State `§3.2 (v0.2.1 M2) Add` list: drop the `D2: @aihu/auth (post RFC #56 RATIFY)` and `D2: better-auth (third-party)` adds (they shipped in M1) — add only the v0.2.1-tier auth changes (e.g. *"D2: @aihu/auth joins the {better-auth, kinde, supabase} prompt list once RFC #56 ratifies"*).

State `§6 R-CT-07` row: rewrite mitigation to: *"RESOLVED 2026-05-05 (arch-6 §13 Q2): separate `@aihu/templates-*` family locked from day one. `@aihu/cli` declares a templates *contractVersion range* (B1.1 `template-manifest.ts` `cliRange`); template packages publish on independent SemVer. Five M1 packages: `@aihu/templates-cf-team`, `-vercel-team`, `-fly-team`, `-cf-solo`, `-cf-full-agent`."*

These four edits + a "Round 004" / "Round 005" appendix paragraph close the state file against shipped reality. Synthesizer r-005's prompt should cite this section verbatim.

---

## Anti-pattern check (B1.2 + B1.2.1)

- **Did Builder revise targets?** **No.** Verifier confirmed: manifest validates against `TemplateManifest` type from B1.1, all 4 §13 RESOLUTIONS honored (Q1 vendor-distinct paths, Q2 separate `@aihu/templates-*` package, Q3 3-provider prompt + better-auth default, Q4 team persona promoted into M1 with monorepo+moon shape).
- **Sample-level failures hidden by aggregate?** **No.** Verifier ran 4 pipeline-behavioral variants (auth=better-auth/kinde/supabase + agentSurface=none + starter=empty), all five passed — every conditional-file inclusion is symmetric with its inclusion. Each was its own line in the audit table, not bucketed.
- **Acceptance items silently deferred?** **Partially — and now closed.** Builder β/γ both noted typecheck issues in their reports but didn't apply the brief's TYPECHECK NOTE option (a) or (b) — that's how F-1 leaked through to PR. PR #83 (B1.2.1 patch) closed it via approach (a)-equivalent: `packages/templates/moon.yml` opts the directory out of inherited tasks. **Mitigation for B1.3: explicit "do not surface a build-system regression as 'pre-existing local-env issue' without verifying on origin/main first" line in the brief.**
- **Work nature shifted?** **No.** Same Mode-2 build, still cli-templates, still arch-6 spec.
- **Iteration ceiling?** Round 4 of 5 in arch-6 §10's projection (B1.1 = 1, B1.2 β/γ = 2, B1.2.1 patch = 3, this director-note routing = 4). After B1.3 lands, that's 5 of 5 — at the hard-stop boundary. **Surface to user only if B1.3 fails.** B1.3 is mostly testing + changesets, low intrinsic risk; should close in one Builder pass given the tight brief.
- **Surface to user?** **No.** Non-blockers route via this note; B1.3 brief is bounded; iteration counter still healthy with one round of headroom.

---

## Refined brief for B1.3 (Team Lead pastes this verbatim)

```
ROLE: Builder · ROUND: B1.3 · TOPIC: cli-templates · MODE: 2

INPUTS (do not re-derive):
- docs/roadmap/arch-6-cli-templates.md §5 (compile-after-scaffold harness),
  §7.3 (backward-compat snapshot), §8.1-8.11 (acceptance), §10 Round B1
  ("Initial changeset entry for @aihu/cli@0.2.0 and
  @aihu/templates-cf-team@0.2.0"), §13 Q3 RESOLVED (3-provider auth)
- packages/cli/src/scaffold-pipeline.ts (CONTRACT LOCKED — do NOT modify)
- packages/cli/src/template-manifest.ts (do NOT modify)
- packages/cli/src/templates-registry.ts (already includes
  '@aihu/templates-cf-team' — do NOT modify)
- packages/cli/src/bin.ts (current state writes
  'STUB: new pipeline not yet wired in B1.1' for known templates;
  this round wires the actual dispatch — see deliverable 1)
- packages/templates/cf-team/template.config.ts (in main; manifest's
  appPeerDeps + appPeerDepsConditional are authoritative for the harness)
- packages/templates/cf-team/template/ tree (in main; the 22-file
  scaffold the harness must produce)
- .github/workflows/plan-a.yml (the canonical CI gate; extend, do NOT
  duplicate)
- AGENTS.db: agents_search "cli-templates B1.2 verifier" + "cli-templates
  round 004" returns prior context.

WORKTREE: fresh worktree at c:/git/fellwork/aihu-b1.3 on branch
  feat/cli-templates-b1.3 (off main; main contains B1.1 + B1.2 + B1.2.1).

DELIVERABLES (5 files + 3 inline edits + 1 CI extension):

1. packages/cli/src/bin.ts — wire the real pipeline dispatch (~30 LOC edit)
   - When --template <T> resolves via resolveTemplateName: import the
     template package's template.config.ts via dynamic import(), call
     resolveTemplate → mergeOptions → enumerateFiles → readSubstituteWrite
     → runPostInstall → printNextSteps from scaffold-pipeline.ts.
   - Use realFileSystem + realSpawner from scaffold-pipeline.ts (the
     injection seam B1.1 established).
   - Replace the existing "STUB: new pipeline not yet wired in B1.1"
     stderr write with the actual call.
   - Preserve all backward-compat behavior from B1.1: --no-interactive,
     --use-defaults, --options-json, --no-git flag handling, fall-through
     to legacy scaffoldApp() when --template doesn't resolve.
   - bun run test packages/cli/tests/cli.test.ts must still exit 0
     (44 legacy tests preserved).

2. packages/cli/tests/scaffold-and-compile.test.ts (~150 LOC)
   - Vitest suite using it.each over the 3 auth providers
     ['better-auth', 'kinde', 'supabase'] for the cf-team template.
   - For each: mktemp dir, invoke the new bin.ts dispatch with
     --template cf-team --no-interactive --use-defaults
     --options-json '{"auth":"<provider>"}', then assert:
       a. `bun install --frozen-lockfile` exits 0 (NOTE: in CI this is
          slow; the test should set BUN_INSTALL_CACHE_DIR + use
          --backend=copyfile if Windows).
       b. `bun run typecheck` exits 0
       c. `bun run build` exits 0
       d. only the chosen provider's auth file lands in src/auth/
       e. only the chosen provider's .env.example file lands
       f. .mcp.json present (default agentSurface=minimal)
       g. live-counter.aihu present (default starter=live-counter)
   - Test must skip on Windows if known-flaky (document the skip with
     a TODO referencing R-CT-01 in state §6).
   - Tests should NOT depend on network (use the workspace template
     package via bun's workspace: protocol).

3. packages/cli/tests/legacy-snapshot.test.ts (~80 LOC)
   - Backward-compat snapshot test per arch-6 §7.3 + §8.8.
   - Invoke `bun packages/cli/src/bin.ts app legacy-snapshot --pm bun`
     into a mktemp dir.
   - Diff the produced tree against
     packages/cli/tests/legacy-snapshot.golden/ (CHECK IN: golden
     files representing today's `aihu app foo` output, byte-identical).
   - Test fails if any byte differs — this is what the brief means by
     "byte-identical to today's output".
   - On first run, the harness writes the golden tree if it doesn't
     exist; subsequent runs diff. (Mirror the existing snapshot pattern
     in the repo if there is one — search for `*.golden/` or
     `*.snapshot/` first.)

4. .changeset/cli-templates-v0.2.0.md
   - Front-matter:
     ---
     '@aihu/cli': minor
     '@aihu/templates-cf-team': minor
     ---
   - Body: one paragraph summarizing the v0.2.0 milestone:
     "Adds the @aihu/templates-* family as a separate package family
      (per arch-6 §13 Q2 RESOLVED). @aihu/cli ships the template-manifest
      contract, scaffold pipeline, conditional-eval evaluator, hand-rolled
      prompts library, and KNOWN_TEMPLATES baked registry.
      @aihu/templates-cf-team is the first published template — Cloudflare
      Workers + bun workspaces + moon + better-auth (default) | kinde |
      supabase. Backward-compatible: `aihu app foo` (no flags) produces
      byte-identical output to today."

5. packages/templates/cf-team/template/README.md.tmpl — add a "Setup"
   section addressing F-5 (~20 lines)
   - After scaffold, instruct user:
     "Copy `apps/web/.env.example.<provider>` to `apps/web/.env`
      and fill in your auth provider's credentials. The
      `.env.example.<provider>` file is provider-suffixed so the
      template can ship all three example shapes — only the chosen
      provider's file lands in your scaffold; rename it to `.env`
      to use it."
   - Document the v0.2.1 followup inline as a comment:
     "<!-- Future: pipeline-rename will drop the .<provider> suffix
      automatically; v0.2.1. -->"

INLINE EDITS (small, in deliverables 1–5's commits or a separate doc commit):

A. docs/roadmap/arch-6-cli-templates.md §2.3 — change the 5
   '@aihu/runtime': '^1.0.0' (etc.) entries in `appPeerDeps` to
   '^0.2.0' to match shipped reality (per F-4 disposition).

B. docs/roadmap/arch-6-cli-templates.md §2.6 — replace the 6-line
   locked example with the shape that actually compiles:

   ```aihu
   @state {
     appName: string = '__APP_NAME__'
   }

   @template {
     <span class="aihu-expose-stub">{{ appName }}</span>
   }

   @agent {
     $expose appName as readonly
     $describe appName "The scaffolded application's display name"
   }
   ```

   This guarantees the §2.6 lock ("at least one @expose block") AND
   compiles against the current arbor binding model. B2 templates
   reference §2.6 directly.

C. packages/templates/cf-team/template.config.ts — add `'@aihu/server'`
   to `appPeerDeps` (one line, value `'^0.2.0'`) per F-3 disposition.
   (The `apps/web/package.json.tmpl` already lists it; this reconciles
   manifest with reality.)

CI EXTENSION (deliverable 6):

6. .github/workflows/plan-a.yml — extend the existing `check` job's
   step list to run `bun run test packages/cli/tests/scaffold-and-compile.test.ts`
   AND `bun run test packages/cli/tests/legacy-snapshot.test.ts` after
   the existing typecheck step.
   - Do NOT create a new job. Extend the `check` job.
   - Add a `timeout-minutes: 25` if not already set on the job.
   - On Windows runners: skip scaffold-and-compile (CI matrix-level skip;
     match the test-level skip from deliverable 2).

ACCEPTANCE (Bash-runnable):

  bun run test packages/cli/tests/scaffold-and-compile.test.ts  # exit 0 (3 providers green)
  bun run test packages/cli/tests/legacy-snapshot.test.ts        # exit 0
  test -f .changeset/cli-templates-v0.2.0.md
  jq -e '."@aihu/cli" == "minor"' .changeset/cli-templates-v0.2.0.md \
    || head -10 .changeset/cli-templates-v0.2.0.md   # front-matter present
  grep -q 'scaffold-and-compile' .github/workflows/plan-a.yml    # CI wired
  grep -q "Setup" packages/templates/cf-team/template/README.md.tmpl
  grep -q "'\^0\.2\.0'" docs/roadmap/arch-6-cli-templates.md     # §2.3 amended
  grep -q '\$describe appName' docs/roadmap/arch-6-cli-templates.md  # §2.6 amended
  jq -e '.appPeerDeps."@aihu/server"' \
    packages/templates/cf-team/template.config.ts                # F-3 reconciled

  # Backward-compat hard contract:
  bun run test packages/cli/tests/cli.test.ts  # 44 legacy tests still green
  bun run typecheck  # exit 0

DO NOT TOUCH (out of scope):
- DO NOT add a "render appPeerDeps + appPeerDepsConditional into emitted
  package.json" pipeline pass. F-3's static-template duplication is
  v0.2.1's job; comment in state file as v0.2.1 followup if you must,
  do not implement now. The pipeline contract is locked.
- DO NOT add a `rename` field to `conditionalFiles`. F-5's pipeline-rename
  enhancement is v0.2.1's job; the README addendum (deliverable 5) is the
  v0.2.0 fix.
- DO NOT add the OTHER 4 templates (vercel-team, fly-team, cf-solo,
  cf-full-agent). Those are arch-6 §10 Round B2.
- DO NOT add README autogen integration (`tier: 'template'` in
  PACKAGE_TIERS). That's arch-6 §10 Round B3.
- DO NOT modify scaffold-pipeline.ts, template-manifest.ts,
  conditional-eval.ts, prompts.ts, or templates-registry.ts. These are
  the locked B1.1 contract.
- DO NOT add Tailwind / Drizzle / Playwright / GitLab CI / Fly adapter
  surfaces. See arch-6 §11 IS-NOT-IN-V0.2.0.

PROCESS:
- One commit per deliverable is fine; fewer is fine; more is fine.
  What matters is acceptance passes at the final commit.
- After each commit, run `bun run typecheck && bun run test packages/cli/`.
  If either fails, fix before next commit.
- IMPORTANT: if you observe `bun run typecheck` failing after your edits,
  RUN `git diff origin/main` AND READ THE OUTPUT before claiming
  "pre-existing local-env issue" — verify on a clean origin/main
  checkout that the same typecheck does NOT fail there. F-1 in B1.2
  was exactly this class of regression hidden under that label.
- After the final commit, push to origin/feat/cli-templates-b1.3 and STOP.
  Do NOT open a PR — Team Lead handles that.
- Report STATUS: DONE | PARTIAL | BLOCKED with file count, test count,
  and CI exit status.

TIME BUDGET (informational):
~30-45 min wall-clock. The harness (deliverable 2) is the only piece
with real I/O time (bun install per provider × 3 = ~90s in CI; locally
~30s with cache). Legacy-snapshot test is comparison-only, fast.
Changeset is a 10-line markdown file. Spec edits are 4 lines total.
CI extension is 5-10 YAML lines.

If at the 45-min mark deliverables 1+2+3 aren't passing locally,
surface immediately with what's committed; do NOT keep iterating
silently against `bun install` flakiness on Windows — a Windows-only
skip is acceptable per R-CT-01.

UNCERTAINTY:
- If the legacy snapshot turns out to be > a few KB different from
  today's output (e.g. because B1.1's bin.ts edit introduced any byte-
  level drift), STOP and surface. The "byte-identical" contract is
  load-bearing.
- If `bun run test scaffold-and-compile.test.ts` passes 2 of 3 providers
  and one fails on a real install error (e.g. @kinde-oss/kinde-typescript-sdk
  has dropped from npm), surface immediately — do NOT silently downgrade
  the gate. Director will route accordingly.
- If `.github/workflows/plan-a.yml` doesn't have a `check` job by that
  exact name, search for the equivalent (it might be `lint-and-test`,
  `build`, or `ci`) and extend whatever the canonical typecheck-running
  job is. Surface in STATUS report.
```

---

## Iteration counter status

**4 of 5.** B1.3 is the final round in the arch-6 §10 projection for v0.2.0.

| Round | Phase | Outcome |
|---|---|---|
| 1 | Director scope (PR #76) → Architect arch-6 (PR #77) → Builder B1 stall (no PR) | spec landed; B1 silent stall |
| 2 | Director re-cut B1 → B1.1/B1.2/B1.3 (PR #78) → Builder B1.1 (PR #79) → Verifier PASS (PR #80) | pipeline machinery in main |
| 3 | Director r-003 (PR #81) → Synthesizer (PR #82) → Builder B1.2 (PR #84 sneaky-merge of deliverable + verifier-report) | template content in main; PARTIAL on F-1 |
| 3a | Builder B1.2.1 patch (PR #83) | F-1 + F-6 closed; main green |
| **4** | **Director r-004 (this note) — F-2/F-3/F-4/F-5 routing + B1.3 brief** | **(now)** |
| 5 | Builder B1.3 → Verifier B1.3 → Synthesizer r-005 closes v0.2.0 | (next) |

After B1.3 lands the milestone closes. If B1.3 fails (Verifier returns NEEDS_FIX or Builder produces a partial), surface to user — that's the iteration ceiling and we genuinely need a re-spec or de-scope conversation. If B1.3 passes (high confidence given the bounded brief and that 3 of the 4 prior cuts under-ran their projection), the next director-note opens v0.2.1 with a rolled-over followup list (F-3 conditional-deps, F-5 pipeline-rename, R-CT-09 fly-adapter resolution, B2 broaden-to-5, B3 README autogen).

---

## Continuity check

- **Round 001 (PR #76)** — state-cli-templates.md authored.
- **Round 002a (PR #77)** — arch-6-cli-templates.md landed.
- **Round 002b (PR #78)** — director-note 002 (B1 stall + re-cut).
- **Round 002c (PR #79)** — Builder B1.1 (pipeline machinery; 138 tests green).
- **Round 002d (PR #80)** — Verifier B1.1 PASS.
- **Round 003 (PR #81)** — director-note 003 (B1.1 PASS routing + B1.2 brief).
- **Round 003a (PR #82)** — Synthesizer captures B1.1 findings.
- **Round 003b (PR #84)** — Builder B1.2 + Verifier PARTIAL (sneaky-merged the deliverable along with the audit).
- **Round 003c (PR #83)** — Builder B1.2.1 patch (F-1 + F-6 closed).
- **Round 004 (this note)** — F-2/F-3/F-4/F-5 dispositions + B1.3 brief + state-file deferral to r-005.
- **AGENTS.db state at session start:** 5+ records on `topic:cli-templates`. This note adds another.

---

*Substance only. Branch names, dispatch mechanics, worktree creation, and merge sequencing belong to the Team Lead.*
