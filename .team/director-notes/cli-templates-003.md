# Director-note · cli-templates · round 003 · 2026-05-05

**Trigger:** Builder B1.1 PASS. PR #79 (`feat(cli): cli-templates B1.1 — pipeline scaffolding`) merged to main at `9a8c160`; Verifier audit PR #80 merged at `d18ac1c` with verdict PASS. Six commits on `feat/cli-templates-b1`, every acceptance line satisfied, 138 tests green (94 new + 44 legacy), zero out-of-scope creep across all six audit dimensions. The pipeline machinery now lives in `main`.

**On-thesis assessment:** **The round-002 cut was correct.** Subdividing B1 → B1.1/B1.2/B1.3 along the natural pipeline / template-content / harness seam let B1.1 close cleanly in one Builder pass with no Builder ↔ Verifier loop. The Verifier explicitly recommended *NOT* sending back for round 2. Spine continues exactly per the round-002 plan; nothing about arch-6 or the cut needs revisiting. Continue to B1.2.

**Routing for synthesis:** **Synthesizer SHOULD fire this round.** B1.1 produced substantive findings worth promoting:
1. **The CLI ↔ template contract is now concrete in code** — `TemplateManifest` type + `validateManifest()`, the 6-stage pipeline, the strict-subset `evalWhen` evaluator, the hand-rolled `node:readline` prompts library, the `KNOWN_TEMPLATES` baked registry. Every B1.2+ template package will compile against this contract; future arch decisions about the template surface should cite the source files, not arch-6 §2.3 alone.
2. **The security boundary on `evalWhen` is tested** — 28 tests including explicit rejection-path coverage for function calls, member access, arithmetic, single `=`, escape sequences, unterminated strings, unmatched parens. R-CT-05 supply-chain risk on `when`-expression evaluation is now empirically closed for the implemented operator set.
3. **Spawner / FileSystem injection seam is established** — `realFileSystem` / `realSpawner` defaults plus `Map<path,content>`-backed test fakes. Future B1.2/B1.3 work that needs to spawn `bun install` or write fixtures has a typed seam to consume.

**Priority:** B1.2 (cf-team template content) next. Sequenced behind it: B1.3 (smoke harness + auth-provider matrix + initial changesets). B2/B3 unchanged from arch-6 §10.

**Scope signal:** **continue.** Same Mode-2 build, same iteration counter advances by 1 (now **2 of 5** in arch-6 §10's projection). No surface-to-user; no re-spec.

---

## Anti-pattern check (B1.1)

- **Did Builder revise targets?** **No.** Builder cited the round-002 brief verbatim. Six commits, every acceptance line satisfied. Verifier audit confirmed.
- **Were there sample-level failures hidden by aggregate?** **No.** Every test file ran cleanly: 13/13 manifest, 28/28 conditional-eval, 27/27 pipeline, 17/17 prompts, 9/9 registry, 44/44 legacy. No "94 of 95 passing" smoothing.
- **Were any acceptance items silently deferred?** **No.** Out-of-scope items (cf-team package, e2e harness, changesets, `create.ts` edits) were *honored*, not skipped. The Verifier's over-implementation audit confirmed none of them landed.
- **Has work nature shifted?** **No.** Still Mode 2 build. Still cli-templates topic. arch-6 spec unchanged.
- **Is the same defect class hitting the iteration ceiling?** **No.** Round 2 of 5 in projection; B1.1 cleanly closed in one Builder pass after the r-002 re-cut. No loop.
- **Surface to user?** **No.** Continuity OK; the iteration ceiling is healthy.

---

## Findings to fold into B1.2 (Verifier-surfaced; non-blocking)

1. **Spawner / FileSystem injection seam (heads-up, not a requirement).** Builder B1.1 added `realFileSystem` / `realSpawner` as injectable defaults inside `scaffold-pipeline.ts`. B1.2 doesn't directly *use* the pipeline at runtime — it ships static template content — but if B1.2 needs to write any test fixtures or spawn a sanity-check `bun install`, prefer the abstraction over bare `fs`/`child_process` so the seam stays consistent. Not load-bearing for B1.2; just don't bypass it.

2. **Pre-commit hook README churn.** Every B1.1 commit touched ~26 files because `sync-readme.ts` runs in the pre-commit hook and refreshes 23 package READMEs (commit-hash watermark + size-budget measurements). For B1.2 — which adds a NEW package with a NEW README — this means each commit will continue to touch ~26 files. **Recommended posture: accept the churn (option b).** Don't add cleanup work to a content-only round; the diff that matters is the new `packages/templates/cf-team/` tree, and reviewers can scope to it. Track "pre-commit hook should skip when only template files change" as a v0.2.1 follow-up — not B1.2's job.

---

## Refined brief for B1.2 (Team Lead pastes this verbatim)

```
ROLE: Builder · ROUND: B1.2 · TOPIC: cli-templates · MODE: 2

INPUTS (do not re-derive):
- docs/roadmap/arch-6-cli-templates.md §1.3 (curated 5), §2 (template package
  layout, all subsections), §2.3 (template.config.ts shape — copy fields
  exactly), §2.5 (locked .mcp.json content), §2.6 (locked @expose example),
  §13 Q3 RESOLVED (3-provider auth conditional file sets)
- packages/cli/src/template-manifest.ts (the TemplateManifest type B1.2's
  template.config.ts must satisfy)
- packages/cli/src/templates-registry.ts (KNOWN_TEMPLATES already includes
  '@aihu/templates-cf-team' — DO NOT modify)
- packages/cli/src/scaffold-pipeline.ts (the contract is locked; DO NOT
  modify; placeholder set is __APP_NAME__/__APP_DESCRIPTION__/__APP_VERSION__/
  __AIHU_VERSION__/__TEMPLATE_NAME__/__SCAFFOLD_DATE__)
- examples/live-counter/ (source for the live-counter starter file)
- AGENTS.db: agents_search "cli-templates B1.1 verifier" + "cli-templates
  round 002" returns prior context.

WORKTREE: fresh worktree at c:/git/fellwork/aihu-b1.2 on branch
  feat/cli-templates-b1.2 (off main; main contains B1.1).

DELIVERABLES (one new workspace package):

packages/templates/cf-team/
├── package.json           ← @aihu/templates-cf-team@0.2.0
├── template.config.ts     ← matches arch-6 §2.3 shape exactly; auth as
│                            overridable {better-auth, kinde, supabase}
│                            per §13 Q3
├── README.md              ← short hand-written stub; sync-readme can
│                            regenerate later (do NOT block on autogen)
└── template/              ← copied to user's project at scaffold time
    ├── package.json.tmpl              (placeholders: __APP_NAME__,
    │                                    __APP_DESCRIPTION__, __APP_VERSION__,
    │                                    __AIHU_VERSION__)
    ├── README.md.tmpl
    ├── tsconfig.json
    ├── biome.json
    ├── moon.yml.tmpl                  (monorepo+moon shape)
    ├── .gitignore
    ├── .mcp.json                      (LOCKED content from §2.5; conditional
    │                                    on agentSurface !== 'none')
    ├── wrangler.toml.tmpl             (Cloudflare-vendor file)
    ├── .github/workflows/
    │   ├── ci.yml.tmpl
    │   └── deploy.yml.tmpl
    ├── apps/web/
    │   ├── package.json.tmpl
    │   ├── src/main.ts
    │   ├── src/app.aihu
    │   ├── src/components/
    │   │   └── live-counter.aihu      (conditional: starter === 'live-counter')
    │   ├── src/auth/
    │   │   ├── better-auth.ts         (conditional: auth === 'better-auth')
    │   │   ├── kinde.ts               (conditional: auth === 'kinde')
    │   │   └── supabase.ts            (conditional: auth === 'supabase')
    │   ├── src/agent/
    │   │   └── expose.aihu            (conditional: agentSurface !== 'none';
    │   │                                content per §2.6)
    │   ├── .env.example.better-auth   (conditional: auth === 'better-auth')
    │   ├── .env.example.kinde         (conditional: auth === 'kinde')
    │   └── .env.example.supabase      (conditional: auth === 'supabase')
    └── packages/shared/
        └── package.json.tmpl          (stub workspace package — empty
                                         exports; just so monorepo shape
                                         is honest)

PACKAGE.JSON shape (cf-team package itself, NOT the template/package.json.tmpl):
{
  "name": "@aihu/templates-cf-team",
  "version": "0.2.0",
  "private": false,
  "publishConfig": { "access": "public" },
  "description": "Cloudflare Workers + monorepo (bun workspaces + moon) team template for Aihu",
  "main": "./template.config.ts",
  "types": "./template.config.ts",
  "files": ["template", "template.config.ts", "README.md"],
  "sideEffects": false,
  "peerDependencies": { "@aihu/cli": "^0.2.0" },
  "dependencies": {},
  "devDependencies": {}
}
(No `bin` field — see arch-6 §2.2 rejection of per-template bin entries.)

TEMPLATE.CONFIG.TS shape: copy arch-6 §2.3 example verbatim. The key cells:
  fixed: { vendor: 'cloudflare', persona: 'team', repo: 'monorepo-moon',
           lint: 'biome', ci: 'gh-actions-commitlint', test: 'vitest' }
  overridable.auth: { choices: ['better-auth','kinde','supabase'],
                      default: 'better-auth' }
  overridable.starter: { choices: ['live-counter','empty'], default: 'live-counter' }
  overridable.agentSurface: { choices: ['minimal','none'], default: 'minimal' }
  overridable.css: { choices: ['style-block'], default: 'style-block' }
  overridable.initGit: { choices: [true,false], default: true }
  conditionalFiles: per §2.3 (full list, all 9 entries — live-counter,
                    .mcp.json, expose.aihu, 3 auth.ts files, 3 .env.example files)
  postInstall: [{kind:'pm-install'}, {kind:'git-init', when:'initGit'},
                {kind:'lint-fix', allowFailure:true}]
  appPeerDeps: per §2.3 (5 @aihu/* runtime deps pinned to ^1.0.0)
  appPeerDepsConditional: per §2.3 (3 auth-provider deps gated on `when`)

ACCEPTANCE (Bash-runnable):

  test -d packages/templates/cf-team/template
  test -f packages/templates/cf-team/template.config.ts
  test -f packages/templates/cf-team/package.json
  jq -e '.name == "@aihu/templates-cf-team"' \
    packages/templates/cf-team/package.json
  jq -e '.private == false' packages/templates/cf-team/package.json
  jq -e '.publishConfig.access == "public"' \
    packages/templates/cf-team/package.json
  bun install                     # workspace resolves cleanly
  bun run typecheck               # exit 0

  # Hand check (Builder runs locally; reports tree count + key file presence):
  bun packages/cli/src/bin.ts app smoke-cf-team --template cf-team
  # NOTE: in B1.1, --template cf-team writes "STUB: new pipeline not yet
  # wired" to stderr — that is correct B1.1-era behavior. For B1.2's hand
  # check, instead invoke the pipeline functions directly via a tiny
  # one-shot script (bun run -e "...") that calls resolveTemplate +
  # mergeOptions + enumerateFiles + readSubstituteWrite from the new
  # packages/templates/cf-team/template.config.ts and a synthetic
  # FileSystem fake → confirm:
  #   1. .mcp.json appears in the file list when agentSurface=minimal (default)
  #   2. .mcp.json is excluded when agentSurface=none
  #   3. Only better-auth.ts appears in src/auth/ when auth=better-auth (default)
  #   4. live-counter.aihu appears when starter=live-counter (default)

TYPECHECK NOTE:
  template/ files contain placeholders (__APP_NAME__, etc.) so they may not
  strictly typecheck without substitution. If `bun run typecheck` fails
  *only* on placeholder substitution issues inside template/, that's
  expected — template/ files are static text, not modules. Either:
    (a) exclude packages/templates/cf-team/template/** from the workspace
        tsconfig include glob (preferred — they aren't part of the build), OR
    (b) configure the cf-team package.json with a tsconfig.json that doesn't
        include template/.
  Surface in the STATUS report if (a) requires touching the root tsconfig
  and feels like creep — Director will route accordingly.

OUT OF SCOPE — DO NOT do these in B1.2:
- Do NOT add the scaffold-and-compile harness (B1.3 owns that).
- Do NOT add changeset entries (B1.3 owns that).
- Do NOT modify packages/cli/src/scaffold-pipeline.ts (the contract is locked).
- Do NOT modify packages/cli/src/templates-registry.ts (already includes
  '@aihu/templates-cf-team').
- Do NOT modify packages/cli/src/bin.ts dispatch (that's B1.3's seam — wiring
  the stub to actually invoke the pipeline against a resolved package).
- Do NOT write the OTHER 4 templates (vercel-team, fly-team, cf-solo,
  cf-full-agent) — that's arch-6 §10 round B2.
- Do NOT run a real `bun install` of the user-side template — manual sanity
  check via the one-shot pipeline script is enough.
- Do NOT add a CHANGELOG.md to the cf-team package (changesets generate it).

PROCESS:
- Make commits at convenient seams (one per template/ subtree if that fits;
  fewer is also fine). What matters is the directory exists in one push and
  acceptance passes.
- After each commit, run `bun run typecheck`. If it fails for non-template
  reasons, fix before next commit.
- Each commit will touch ~26 files due to the sync-readme pre-commit hook
  refreshing existing READMEs — this is expected and not a violation.
  Reviewer scope is the new packages/templates/cf-team/ tree.
- After the final commit, push to origin/feat/cli-templates-b1.2 and STOP.
  Do NOT open a PR — Team Lead handles that.
- Report STATUS: DONE | PARTIAL | BLOCKED with file count.

TIME BUDGET (informational):
~30-45 min wall-clock. If at 30 min the template/ tree isn't fully
populated, surface immediately with what's committed — do NOT keep going
silently.

UNCERTAINTY:
- If any arch-6 reference is ambiguous, prefer the simpler reading and note
  in STATUS. Do not invent new spec.
- If the sync-readme pre-commit hook misbehaves on the new package
  (e.g. tries to autogen a README before the package is recognized), use
  `git commit --no-verify` for the bootstrap commit only and surface in
  STATUS. Do not disable the hook globally.
- If the typecheck workaround for template/ files requires editing the root
  tsconfig in a way that feels like creep, surface and let Director route.
```

---

## Synthesizer task (this round)

Update topic-summary state to reflect B1.1 closing clean. Specific edits:

1. **`state-cli-templates.md`** — append to "Continuity / handoff state" (or wherever the round-2 record lives) a one-paragraph round-3 entry: *"Round 003: B1.1 complete (PR #79); pipeline machinery in main; CLI ↔ template contract concrete in code; injection seam established; security-boundary on `evalWhen` empirically tested. Iteration counter 2 of 5. B1.2 dispatched on fresh worktree."*

2. **`docs/roadmap/arch-6-cli-templates.md` §10** — mark Round B1.1 ✅ in the implementation map. Either add a small "Status" column or annotate the B1 sub-entries inline. Do NOT rewrite §10's structure; just add the status flag.

3. **`docs/roadmap/arch-6-cli-templates.md` §1.3** — add a one-line note: *"B1.1 (PR #79) supplied the @aihu/cli-side contract (TemplateManifest type, scaffold pipeline, conditional-eval, prompts, registry) that every @aihu/templates-* package in the curated 5 will conform to."*

4. **AGENTS.db** — write a `round-summary` chunk capturing items 1-3 above with topic=cli-templates, layer=delta, kind=director-note (or round-summary), confidence ~0.92.

This is enough; do not over-polish the state file.

---

## Continuity check

- **Round 001 (PR #76)** — state-cli-templates.md authored (11-dim matrix; 4 surface questions answered).
- **Round 002a (PR #77)** — arch-6-cli-templates.md landed (893 lines, 13 sections, 4 §13 RESOLUTIONS).
- **Round 002b (PR #78)** — director-note 002 (B1 stall diagnosis + B1 → B1.1/B1.2/B1.3 re-cut).
- **Round 002c (PR #79)** — Builder B1.1 shipped pipeline machinery (5 src + 5 test files + bin.ts edit; 138 tests green).
- **Round 002d (PR #80)** — Verifier B1.1 PASS report.
- **Round 003 (this note)** — routes Synthesizer; refines brief for B1.2.
- **Iteration counter:** 2 of 5 ping-pong rounds in arch-6 §10's projection. B1.1 closed in one Builder pass with no Verifier round-trip — that's an *under-run* against the projection, banking budget for B1.2/B1.3/B2.
- **AGENTS.db state at session start:** 4 prior records on `topic:cli-templates` (round 001 director-note 408960901; round 002 arch-spec 1790932701; round 002b governance director-note 3960243669; B1.1 verifier-report 1826345075). This note adds a fifth.

---

*Substance only. Branch names, dispatch mechanics, worktree creation, and merge sequencing belong to the Team Lead.*
