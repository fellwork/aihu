# Retro · cli-templates · v0.2.0 milestone closure · 2026-05-05

**Track:** `cli-templates` · **Milestone:** v0.2.0
**Iteration counter:** 5 of 5 (arch-6 §10 hard-stop boundary; milestone engineering-complete)
**Director rounds:** 001 → 002 → 003 → 004 → 005
**Builder sub-rounds:** B1.1 (PASS one-pass) → B1.2 (PARTIAL → patched B1.2.1) → B1.3 (PASS one-pass)
**Verifier reports:** B1.1 PASS · B1.2 PARTIAL → B1.3 PASS
**PR trail:** #75 → #76 → #77 → #78 → #79 → #80 → #81 → #82 → #83 → #84 → #85 → #86 → #87 → #88 → #89

---

## §1 What shipped

### `@aihu/cli@0.2.0`

The CLI half of the contract. All zero-runtime-dep, all hand-rolled.

- `packages/cli/src/template-manifest.ts` — `TemplateManifest` TypeScript
  type + `validateManifest()` runtime guard. The single source of truth
  for the cf-team-style template package shape.
- `packages/cli/src/scaffold-pipeline.ts` — 6-stage pure pipeline:
  `resolveTemplate → mergeOptions → enumerateFiles → readSubstituteWrite
  → runPostInstall → printNextSteps`. First three are pure (manifest-only,
  no I/O); the I/O-touching three inject `FileSystem` / `Spawner` interfaces
  with `realFileSystem` / `realSpawner` defaults plus `Map<path,content>`-
  backed test fakes.
- `packages/cli/src/conditional-eval.ts` — strict-subset `evalWhen`
  evaluator. Recursive-descent over a tiny tokenizer; supports `===`,
  `!==`, `&&`, `||`, `!`, parens, bare identifiers, string/boolean
  literals. **No `eval`, no `Function`, no `vm`.** 28 unit tests
  including explicit rejection of escape-hatches (function calls, member
  access, arithmetic, single `=`, escape sequences, unterminated strings,
  unmatched parens).
- `packages/cli/src/prompts.ts` — hand-rolled `node:readline` library:
  `promptText`, `promptSelect`, `promptYesNo`. Number-fallback for select
  prompts; clear non-TTY error (`"Cannot prompt in a non-TTY shell. Pass
  --no-interactive ..."`). Holds the dep-free thesis against `prompts` /
  `inquirer` / `enquirer`.
- `packages/cli/src/templates-registry.ts` — baked `KNOWN_TEMPLATES`
  registry. Five short-name → package-name mappings (`cf-team`,
  `vercel-team`, `fly-team`, `cf-solo`, `cf-full-agent`). Strict literal-
  union return type from `resolveTemplateName`.
- `packages/cli/src/bin.ts` — `--template <T>` flag dispatch on top of
  the legacy surface. Falls through to `scaffoldApp()` (legacy path) when
  the flag is absent or the registry doesn't resolve. Honors `--no-git`,
  `--no-install`, `--pm`, `--options-json`, `--use-defaults`,
  `--no-interactive`. In B1.1 the new path was a stub-and-exit-0; B1.3
  wired it to call all 6 pipeline stages.
- `packages/cli/tests/scaffold-and-compile.test.ts` — `it.each` over the
  3 auth providers (`better-auth`, `kinde`, `supabase`). Per-provider
  file-presence + cross-provider exclusion + `.env.example.<provider>`
  presence + `.mcp.json` + `live-counter.aihu`. Compile-phase tests
  gated by `AIHU_SCAFFOLD_COMPILE=1` until workspace-resolution path
  lands.
- `packages/cli/tests/legacy-snapshot.test.ts` + 6-file
  `legacy-snapshot.golden/` directory — byte-equality buffer comparison
  against the v0.1.x output of `aihu app foo`. Any drift fails CI
  immediately. First-run bootstrap throws (no silent pass).

### `@aihu/templates-cf-team@0.2.0`

The first template package — Cloudflare Workers + bun-workspaces + moon
monorepo. Vendor-distinct per arch-6 §13 Q1.

- `packages/templates/cf-team/template.config.ts` — manifest matching
  the `TemplateManifest` shape. `cliRange: '^0.2.0'`, `appPeerDeps`
  including `@aihu/server: ^0.2.0` (post B1.3 inline edit C).
- `packages/templates/cf-team/template/` — 22-file template tree:
  - **β scope (top-level + .github/ + packages/shared/):** `package.json.tmpl`,
    `README.md.tmpl`, `tsconfig.json`, `biome.json`, `moon.yml.tmpl`,
    `.gitignore`, `.mcp.json` (LOCKED arch-6 §2.5 byte-stable),
    `wrangler.toml.tmpl`, `.github/workflows/{ci,deploy}.yml.tmpl`,
    `packages/shared/package.json.tmpl`.
  - **γ scope (apps/web/):** `package.json.tmpl`, `src/main.ts`,
    `src/app.aihu`, `src/components/live-counter.aihu` (with `$expose
    count`), `src/agent/expose.aihu` (now arch-6 §2.6-canonical with
    `@state` block + `$describe`), 3 auth-provider client files
    (`auth/{better-auth,kinde,supabase}.ts`), 3 env examples
    (`.env.example.{better-auth,kinde,supabase}`).
- **9 conditional files** (3 auth providers × {auth client, env example} +
  `.mcp.json` + `expose.aihu` + live-counter starter).
- **Default options:** better-auth + minimal agent surface + live-counter
  starter (eats-our-own-dogfood for the EX-01 example).

### Backward-compat acceptance gates

Three concrete gates ship behind the v0.2.0 surface:

1. **`legacy-snapshot.test.ts`** — `aihu app foo` (no flags) byte-frozen
   via 6-file golden snapshot (`index.html`, `package.json`,
   `rolldown.config.ts`, `src/main.ts`, `src/pages/index.aihu`,
   `tsconfig.json`). Buffer-equality; any drift fails CI.
2. **138 cli tests passing** — 44 legacy + 94 new (13 manifest + 28
   conditional-eval + 27 scaffold-pipeline + 17 prompts + 9 registry).
3. **Behavioral end-to-end** across 3 auth providers verified by
   Verifier B1.3 — better-auth ✓, kinde ✓, supabase ✓ as separate
   `it.each` line items, not bucketed pass/fail.

### arch-6 spec amendments

Three inline edits applied during B1.3:

- **§2.3 peer-dep ranges:** 5 `@aihu/*` entries (`runtime`, `arbor`,
  `signals`, `router`, `adapter-cloudflare`) flipped from `^1.0.0` to
  `^0.2.0`. `cliRange` also `^0.2.0`. External `better-auth: ^1.0.0`
  retained.
- **§2.6 expose example** reshaped to add `@state { appName }` block
  + `$describe appName "..."` line — turns the prose-illustrative
  shape into the canonical compile-ready shape against arbor's
  binding model.
- **§13 Q3 RESOLVED** verbatim in the §1.3 prose: cf-team ships with
  3-provider runtime auth prompt, default better-auth.

---

## §2 What worked

### Parallel builders on disjoint subtree branches

Builder β/γ split for B1.2: β owned `template/` top-level + `.github/` +
`packages/shared/`; γ owned the entire `template/apps/web/` subtree.
Builder δ/ε for the B1.2.1 patch round followed the same shape. Both
splits worked cleanly with **zero merge conflicts** because the partition
was on disjoint file-system scopes — the load-bearing subtree boundary,
not a conceptual one. This was the disjoint-disk-region principle from
the orchestration playbook (skill principle #8) applied to template
content. **Recipe holds:** when a content-shaped task has natural subtree
boundaries that don't touch shared root files (`tsconfig.json`,
`package.json`, lockfile), parallel dispatch beats sequential.

### Director r-002 scope re-cut after stall

The original B1 dispatch overscoped (~30 files, multiple subsystems —
pipeline + cf-team + harness + changesets in one shot). Builder created
its worktree, made zero commits, terminated without report. r-002
re-cut along the natural arch-6 §10 dependency seam — pipeline
(B1.1) / template content (B1.2) / harness + changeset (B1.3) — and
each sub-round closed in one Builder pass after r-002 re-cut. **One
Director re-cut beats three Builder retries.** The re-cut cost one
Director round; recursive retry would have burned the entire iteration
budget.

### Byte-frozen legacy-snapshot test as backward-compat strategy

Six golden files, exact-bytes buffer-comparison diff, fail-on-any-byte
differ. This is what made R-CT-06 (the "aihu app foo must remain
byte-identical" hard contract from arch-6 §7.2) a deterministic CI
gate rather than a prose contract in CHANGELOG. **Caught the F-1
phantom moon project class of bug** because the golden tree's exclusion
list forced explicit awareness of which files participate in which
tooling discovery (moon's `packages/*` glob). Future framework features
that touch any code path used by `aihu app foo` either deliberately
update the golden tree (as a reviewable diff with changeset entry
explaining the BC implication) or fail fast in CI.

### CLI ↔ template contract concrete in code (not prose)

`TemplateManifest` (TypeScript type) + `validateManifest()` (runtime
guard) + 6-stage pipeline (`scaffold-pipeline.ts`) = a cf-team-style
template author writes a `template.config.ts` matching the manifest
shape, places files in `template/`, and the pipeline does the rest.
**No glue code per template needed.** B2's four other templates
(vercel-team, fly-team, cf-solo, cf-full-agent) will compile against
this exact same shape — the template surface is empirically reusable
because it's encoded in two concrete things (a type + pipeline functions),
not in arch-6 prose alone. Future arch decisions on the template
surface should cite these source files, not arch-6 §2.3 alone.

### B1.3 brief's "verify-before-claim" reinforcement worked

The B1.2 brief had explicitly anticipated the F-1 phantom-moon-project
class under "TYPECHECK NOTE — option (a)/(b)". Builder β/γ ignored both
options and labeled the failure "pre-existing local-env issue" without
verifying on origin/main. After the leak, Director r-004 added a hard
line to the B1.3 brief: *"do not surface a build-system regression as
'pre-existing local-env issue' without verifying on origin/main first."*
B1.3 closed clean — the reinforcement worked. **The phrase
"pre-existing local-env issue" is now a tripwire** for both Verifier
audits and Director briefs.

### Strict-subset evalWhen evaluator closed R-CT-05 supply-chain risk

28 unit tests including explicit rejection of all escape-hatches. The
decision NOT to depend on `expr-eval` / similar npm packages was
load-bearing for the zero-runtime-dep contract. The hand-rolled
recursive-descent parser is small (~90 LOC) and empirically secure for
the operator set we ship.

---

## §3 What didn't work (and what to do about it)

### B1 stalled silently on first dispatch

**Symptom:** Builder created worktree (`c:/git/fellwork/aihu-b1` on
`feat/cli-templates-b1` off `308600c`), made zero commits, terminated
without report. Worktree was clean post-mortem (`agent never reached
first save`).

**Root cause:** scope, not skill. Original B1 brief asked one Builder to
land 4 new modules + entire cf-team template package + 3-auth scaffold-
and-compile harness + initial changesets — conservatively ~25-30 files /
800-1200 LOC. Likely token-budget exhaustion before first save, or
skill-load distraction before the first Edit/Write.

**Action:** future Builder briefs ≤ 15 files / ≤ 500 LOC per dispatch.
If a brief spans more than one natural conceptual seam (e.g., infra
machinery + domain content), split into sub-rounds before dispatching,
even when the dependency graph allows them sequentially. **Surface
immediately** if mid-dispatch scope appears to creep past 15 files /
500 LOC. Promoted as the "scope-too-big-stall → r-002 re-cut" playbook
(see §4).

### F-1 phantom moon project leaked through B1.2

**Symptom:** Builder β/γ both labeled the typecheck failure
"pre-existing local-env issue" without verifying on origin/main. The
new `packages/templates/cf-team/` directory was picked up by moon's
`packages/*` projects glob as a phantom moon project with no
`tsconfig.json`/`package.json`. Inherited `templates:typecheck` task
ran `tsc --noEmit` against the workspace root and surfaced ~50
pre-existing typecheck errors across sibling packages — errors that
do NOT show up on `main` because the phantom project doesn't exist
there. `bun run typecheck` exits non-zero on this branch and exits
zero on main (verified by removing `packages/templates/` and
re-running). The B1.2 brief had explicitly anticipated this surface;
neither workaround was applied; failure surfaced post-PR.

**Action:** B1.2.1 patch round closed it (PR #83 added `moon.yml`
opt-out for the phantom project). The phrase "pre-existing local-env
issue" is now a tripwire — Verifier audits and future Director briefs
must require `git diff origin/main` + clean-tree re-run BEFORE accepting
that label. Promoted as the "verify-before-claim" anti-pattern (see §4).

### sync-readme.ts commit-sha drift inflates every PR diff

**Symptom:** 24-26 README files in `packages/*/README.md` updated with
refreshed commit-hash watermark and size-budget measurements on every
CLI-touching PR. The autogen runs in pre-commit; it's not a bug per se,
but the diff-noise overwhelms the conceptual scope of small PRs.
Reviewers had to manually scope to the actual diff of substance every
round.

**Action:** v0.2.1 followup. Pre-commit hook should skip `sync-readme.ts`
when only template files / .changeset files / docs change. Alternative:
pin stamp to release tags rather than HEAD commit. F-3 disposition
from B1.3 verifier; routed to v0.2.1 docket.

### PR #84 sneaky-merged the full B1.2 deliverable

**Symptom:** Verifier-report branch for B1.2 was forked off
`feat/cli-templates-b1.2` (the Builder's branch) rather than `main`.
When PR #84 squash-merged, it brought the entire B1.2 deliverable
along with the verifier report. PR #83 (originally for the F-1 +
F-6 patches) became redundant; had to be repurposed for just the
B1.2.1 patches.

**Action:** Verifier worktrees should fork off `main`, not the
Builder's branch. Verifier-report PRs should be scoped to just the
report — they're a read-and-write-prose artifact, not a
piggyback merge vehicle. Document this in the Verifier dispatch
template (followup, v0.2.1 docket repo-hygiene tier).

---

## §4 Earned learnings — for delta → user promotion

Five durable findings from r-005 §"Anti-pattern check" + Step 4
promotion list. Each is empirically grounded in this milestone's
events; each generalizes beyond cli-templates.

### 4.1 `cli-template-contract-pattern` (confidence 0.92)

**Pattern.** When a CLI generates project scaffolds against multiple
template packages, encode the contract as TWO concrete things, not
prose: (a) a TypeScript type (`TemplateManifest`) plus a runtime
validator (`validateManifest()`), and (b) a small set of pure pipeline
functions (`resolveTemplate → mergeOptions → enumerateFiles →
readSubstituteWrite → runPostInstall → printNextSteps`). Templates
become trivially testable in isolation against the manifest type;
the pipeline becomes trivially testable against an in-memory file
map (`Map<path,content>`-backed `FileSystem` / `Spawner` fakes).
Future templates compile against the same shape — the template surface
is empirically reusable.

**When to apply.** Any CLI that is a generator with >1 target
template/preset. Encode the type in `<cli>/src/<x>-manifest.ts`; encode
the pipeline as pure functions with injected I/O seams.

**Cite delta records:** B1.1 verifier report (kind=verifier-report,
chunk_id 1826345075, layer=delta), Director r-005 §"On-thesis
assessment" #5, state-cli-templates.md §"Round 003 update" finding 1.

### 4.2 `parallel-builders-on-disjoint-subtree-branches-recipe` (confidence 0.88)

**Pattern.** When a content-shaped task has natural subtree boundaries
in the file system (e.g., `template/` top-level vs. `template/apps/web/`),
dispatch two (or more) Builders on disjoint subtree branches off the
same parent commit. Merges land cleanly with zero conflicts. β/γ split
for B1.2 (template/ top-level vs apps/web/) worked; δ/ε for the B1.2.1
patch round also worked. **Constraint:** the subtree boundary must be
load-bearing in the file system, not conceptual — if both Builders touch
shared files (root `tsconfig.json`, root `package.json`, lockfile), drop
back to sequential.

**When to apply.** Content-shaped tasks (templates, fixtures, doc trees,
example apps) where the partition is along a load-bearing directory
boundary. Not for code refactors that span shared interfaces.

**Cite delta records:** Director r-005 §"What worked" line 1 (chunk_id
2311562003, layer=delta), Director r-004 (chunk_id 3844775557, layer=delta).

### 4.3 `byte-frozen-legacy-snapshot-pattern` (confidence 0.93)

**Pattern.** For load-bearing backward-compat contracts, ship a checked-in
golden tree (file system snapshot of the pre-change output) plus a
buffer-equality test in CI. Any drift fails CI; deliberate updates
require updating the golden tree as a reviewable diff (with a changeset
entry explaining the BC implication). Beats prose contracts in CHANGELOG
because the gate is mechanical and CI-enforced. The golden-tree exclusion
list also forces explicit awareness of which files participate in which
tooling discovery — surfaces tooling-glob bugs (like F-1's phantom moon
project) early.

**When to apply.** Any user-facing surface with a "must remain backward-
compatible" contract that has a deterministic byte-form (CLI output,
config file shapes, generated code stubs). Not for behavioral contracts
where output varies across environments.

**Cite delta records:** B1.3 verifier report (chunk_id-equivalent,
layer=delta), Director r-005 §"What worked" line 3, arch-6 §7.2
(cli-templates spec, base layer).

### 4.4 `scope-too-big-stall-r-002-re-cut-playbook` (confidence 0.91)

**Pattern.** When a Builder dispatch returns a clean worktree with zero
commits (agent terminated, no surface), the default reflex is "retry
with same brief". The discipline is to **re-cut the brief into smaller
seams first**, not retry. Splitting along natural conceptual seams
(e.g., infrastructure machinery / domain content / cross-cutting
harness) consumes one Director round but prevents recursive failure.
The B1 → B1.1/B1.2/B1.3 re-cut is the case study: original B1 was
~30 files in one shot; the re-cut along arch-6 §10's natural pipeline /
content / harness seams closed each sub-round in one Builder pass.
**One re-cut beats three retries.**

**When to apply.** Any silent Builder stall (worktree clean, no
commits, agent terminated). The re-cut is the first response, not
retry-with-same-brief. Budget Builder dispatches at ≤ 15 files / ≤ 500
LOC per dispatch as the rough ceiling.

**Cite delta records:** Director r-002 (chunk_id 3960243669, layer=delta;
governance correction note), Director r-005 §"What didn't work" #1.

### 4.5 `verify-before-claim-anti-pattern` (confidence 0.95)

**Anti-pattern.** When CI / typecheck / build fails after your edits,
**FIRST verify the same command on a clean origin/main checkout BEFORE
labeling the failure "pre-existing local-env issue".** One
`git diff origin/main` + one re-run on a clean tree resolves >90% of
the ambiguity. The B1.2 → B1.2.1 → B1.3 sequence is the empirical case
study: Builder β/γ both invoked the "pre-existing" label without
verification; F-1 leaked through to PR; B1.2.1 patch round was needed
to close it; Director r-004 added the verify-before-claim discipline
to the B1.3 brief explicitly; B1.3 closed clean. **Future Director
briefs must include verify-before-claim language; future Verifier
audits must check this explicitly.** The phrase "pre-existing local-env
issue" is now a project-wide tripwire.

**When to apply.** Universal. Every Builder, Verifier, and Investigator
who encounters an unexpected CI / build / typecheck failure. The
verification takes < 60 seconds (`git stash && git diff origin/main &&
clean re-run`); the cost of mislabeling is at minimum one extra Builder
round.

**Cite delta records:** Director r-004 (chunk_id 3844775557, layer=delta),
B1.2 verifier report (PARTIAL verdict, layer=delta), Director r-005
§"Anti-pattern check" line 6.

---

## §5 v0.2.1+ docket (followups parked from this milestone)

Categorized; this is the queue Historian transcribes into
`state-cli-templates.md` for r-006's Director.

### From Verifier reports (B1.2 + B1.3)

- **F-3b — conditional-deps render pipeline pass.** Filter
  `apps/web/package.json.tmpl` emitted deps by
  `appPeerDepsConditional` `when` rules so only the chosen auth
  provider's deps land (currently all 3 ship unconditionally — ~15MB
  extra `node_modules`; UX nit, not correctness). Pipeline currently
  uses pure literal-string-replace; this change re-opens §4.4
  "pure functions" contract and needs an Architect note before B-round.
- **F-5b — `conditionalFiles` `rename` field.** Drop the
  `.<provider>` suffix on emit so `.env.example.better-auth` lands as
  `.env.example`. Subsume the `.tmpl`-stripping logic into one unified
  rename pipeline pass. Simultaneously deletes the manual rename prose
  in the cf-team `README.md.tmpl` Setup section (the inline HTML
  comment TODO captures this).
- **F-1 self-running compile gate.** Wire `AIHU_SCAFFOLD_COMPILE` to
  auto-run once `@aihu/* ^0.2.0` are on npm. Currently it's a manual
  pre-publish gate (Team Lead one-shot before tag push).

### From arch-6 §10 round map

- **Round B2 — broaden curated-5 to v0.2.1.** Four more templates:
  `vercel-team`, `fly-team`, `cf-solo`, `cf-full-agent`. Each gets
  the same shape as cf-team (template package + manifest + template
  tree), per arch-6 §1.3.
- **Round B3 — README autogen tier=template.** Wire `sync-readme.ts`
  to recognize `tier: 'template'` so template packages get autogen
  README treatment. Also covers Windows path edge cases that B1.x
  didn't surface (CI was Linux-only for B1.3 compile-phase).

### From Synthesizer surfaces

- **`vscode-aihu` versioning alignment.** `1.0.0` (vscode-aihu) vs
  `0.1.0` (rest of `@aihu/*`). User-flagged.
- **Pre-commit hook should skip when only template files change.**
  Avoids the 24-26 README churn on cli-templates-only PRs (F-3 from
  B1.3 verifier).

### From repo-wide

- **`biome.json` `includes` plural warning** — single-key fix.
- **`biome check:ci` ~30 errors on main** — pre-existing; cleanup pass.
- **scribe → aihu test snapshot remnants** — fellwork-rename leftover
  in compiler tests.
- **`cross` pin restore for aarch64-linux build** — user-flagged.
- **Branch protection script** — `scripts/setup-branch-protection.sh`
  needs to be run once by user.
- **`biome.json` schema migrate** — F-2 from B1.3 (info-only diagnostic;
  `2.4.13` installed, `2.4.14` declared).

### From HOLD set

- **Live-binding RFC #56 implementation** — security review of arch-3
  §9 required first; gates `@aihu/auth` joining the auth prompt list
  (D2 dimension in state file).
- **`<playground-embed>` validation** — gates on v0.2.0 publish + peer
  deps available on npm.

---

**This retro is the Historian's final substance pass for v0.2.0.** Tag
push is Team Lead orchestration after this PR lands. v0.2.1 opens with
the docket above as the Director r-006 input queue.
