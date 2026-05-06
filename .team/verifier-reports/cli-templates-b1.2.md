# Verifier-report · cli-templates B1.2 · 2026-05-05

**Branch:** `feat/cli-templates-b1.2` (HEAD `0eb746c`)
**Audit mode:** Round B1.2 · Mode 2 · bidirectional + sample-based
**Verifier worktree:** `c:/git/fellwork/aihu-b1.2-verify` (fresh; clean checkout)

---

## STATUS: PARTIAL

Deliverables landed in their entirety: 25 new files under
`packages/templates/cf-team/`, manifest validates against `TemplateManifest`,
the 6-stage pipeline correctly enumerates files for every option-matrix
variant tested, zero out-of-scope creep.

**One real surface blocks PASS:** the new `packages/templates/` directory
is picked up by moon's `packages/*` projects glob as a phantom moon project
with no `tsconfig.json`/`package.json` of its own. The inherited
`templates:typecheck` task runs `tsc --noEmit` against the workspace root
and surfaces ~50 pre-existing typecheck errors across sibling packages
(adapter-cloudflare, adapter-vercel, agent-a2a, agent-acp, app, data,
server) — errors that DO NOT show up on `main` because there is no phantom
project there. **`bun run typecheck` exits non-zero on this branch and
exits zero on main** (verified by removing `packages/templates/` and re-
running). This is the typecheck workaround the brief explicitly anticipated
under "TYPECHECK NOTE — option (a) or (b)"; Builder did neither and did not
surface it in any commit message.

CI failure is mechanical: `.github/workflows/plan-a.yml` runs
`bun run typecheck` as the canonical gate. Merging B1.2 to main as-is
will red the CI pipeline.

---

## Acceptance results

### Package shell — ALL PASS

| Check | Result |
|---|---|
| `packages/templates/cf-team/` exists | ✓ |
| `package.json` | ✓ |
| `template.config.ts` | ✓ |
| `README.md` | ✓ |
| `.name == "@aihu/templates-cf-team"` | ✓ |
| `.private == false` | ✓ |
| `.publishConfig.access == "public"` | ✓ |
| `.peerDependencies."@aihu/cli"` present | ✓ (`^0.2.0`) |

### β scope (top-level template/) — ALL PASS

| File | Result |
|---|---|
| `template/package.json.tmpl` | ✓ |
| `template/README.md.tmpl` | ✓ |
| `template/tsconfig.json` | ✓ |
| `template/biome.json` | ✓ |
| `template/moon.yml.tmpl` | ✓ |
| `template/.gitignore` | ✓ |
| `template/.mcp.json` | ✓ (matches arch-6 §2.5 exact content byte-for-byte) |
| `template/wrangler.toml.tmpl` | ✓ |
| `template/.github/workflows/ci.yml.tmpl` | ✓ |
| `template/.github/workflows/deploy.yml.tmpl` | ✓ |
| `template/packages/shared/package.json.tmpl` | ✓ |

### γ scope (apps/web/) — ALL PASS

| File | Result |
|---|---|
| `apps/web/package.json.tmpl` | ✓ |
| `apps/web/src/main.ts` | ✓ |
| `apps/web/src/app.aihu` | ✓ |
| `apps/web/src/components/live-counter.aihu` | ✓ (with `$expose count` per §2.6) |
| `apps/web/src/agent/expose.aihu` | ✓ (see finding F-2 below) |
| `apps/web/src/auth/better-auth.ts` | ✓ |
| `apps/web/src/auth/kinde.ts` | ✓ |
| `apps/web/src/auth/supabase.ts` | ✓ |
| `apps/web/.env.example.better-auth` | ✓ |
| `apps/web/.env.example.kinde` | ✓ |
| `apps/web/.env.example.supabase` | ✓ |

**Total: 22 deliverable files + package shell (3 files) = 25 files added.**

### Workspace install — PASS

`bun install` exits 0; lockfile resolves cleanly. 1564 packages installed.

### Workspace typecheck — **FAIL**

`bun run typecheck` exits 1. Failure is `templates:typecheck` task (a
phantom moon project pinned at `packages/templates/`). Surfaced ~50 errors
across sibling packages (adapter-cloudflare, adapter-vercel, agent-a2a,
agent-acp, app, data, server, plus root-level `tests/bun-setup.ts` and
`tests/manual-demo/server.ts`). **All of these errors are present on
`main` *latently*** but never surfaced because there is no phantom project
there to trigger an unconfigured `tsc --noEmit` over the world.

**Verification:** removed `packages/templates/` on a stash, re-ran
`bun run typecheck` → exits 0 (26 tasks completed, 22 cached).

### Manifest validates against `TemplateManifest` type — PASS

```
manifest valid: name=@aihu/templates-cf-team
contractVersion=1
cliRange=^0.2.0
overridable.auth.choices=["better-auth","kinde","supabase"]
overridable.auth.default=better-auth
conditionalFiles.length=9
postInstall.length=3
appPeerDeps keys=5
appPeerDepsConditional keys=3
```

`validateManifest()` returns the typed manifest with no errors. All §13 Q3
shape (3-provider auth, default better-auth) is in place. All 9 expected
conditional entries present (live-counter + .mcp.json + expose.aihu + 3
auth.ts + 3 .env.example).

---

## Bidirectional audit — Under-implementation (sample-based)

### Sampled checks — ALL PASS

- ✓ `template.config.ts` has `auth` overridable with all 3 choices and
  default `better-auth` (matches arch-6 §13 Q3 RESOLVED).
- ✓ `conditionalFiles` lists all 9 expected entries (verified via
  manifest validator + by reading the file).
- ✓ `template/.mcp.json` content matches arch-6 §2.5 byte-for-byte (Q3 lock).
- ✓ `template/apps/web/src/agent/expose.aihu` includes `$expose appName as
  readonly` — the locked guarantee from §2.6 is met (see F-2 for the shape
  expansion finding).
- ✓ `template/apps/web/src/auth/{better-auth,kinde,supabase}.ts` are all
  standalone — no cross-imports between providers; each file stands alone
  as a single-provider module.
- ✓ `template/apps/web/package.json.tmpl` lists all 5 expected `@aihu/*`
  runtime deps (runtime, arbor, signals, router, adapter-cloudflare).

## Bidirectional audit — Over-implementation creep

### Out-of-scope checks — ALL PASS (zero creep)

- ✓ No scaffold-and-compile harness added (B1.3's job).
- ✓ No changeset entries added (B1.3's job).
- ✓ `git diff origin/main -- packages/cli/src/scaffold-pipeline.ts` empty.
- ✓ `git diff origin/main -- packages/cli/src/templates-registry.ts` empty.
- ✓ `git diff origin/main -- packages/cli/src/bin.ts` empty.
- ✓ Only `cf-team/` template created (no vercel-team / fly-team / cf-solo /
  cf-full-agent — those are B2's job).
- ✓ No CHANGELOG.md added to the cf-team package.
- ✓ Builder β/γ honored the OUT-OF-SCOPE list verbatim.

---

## Pipeline behavioral check — PASS (all 5 variants)

Ran `enumerateFiles()` against the real `template/` tree (22 files) and
the merged manifest+options. Walked the FS to produce the
`templateFiles: string[]` input that the pipeline expects.

| Variant | files | .mcp.json | expose | better-auth.ts | kinde.ts | supabase.ts | env.better-auth | env.kinde | env.supabase | live-counter |
|---|---:|---|---|---|---|---|---|---|---|---|
| **default** (auth=better-auth, agentSurface=minimal, starter=live-counter) | 18 | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | ✓ |
| auth=kinde override | 18 | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ | ✓ | ✗ | ✓ |
| auth=supabase override | 18 | ✓ | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | ✓ | ✓ |
| agentSurface=none override | 16 | ✗ | ✗ | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | ✓ |
| starter=empty override | 17 | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ |

All conditional file inclusion logic works as the brief specifies. Every
exclusion is symmetric — flipping a switch turns the right files on and
off without leaking.

---

## CLI test suite — PASS (138/138 from B1.1)

| Test file | Tests | Result |
|---|---:|---|
| `template-manifest.test.ts` | 13 | ✓ |
| `conditional-eval.test.ts` | 28 | ✓ |
| `scaffold-pipeline.test.ts` | 27 | ✓ |
| `prompts.test.ts` | 17 | ✓ |
| `templates-registry.test.ts` | 9 | ✓ |
| `cli.test.ts` (legacy) | 44 | ✓ |
| **Total CLI** | **138** | **✓** |
| `dev-build.test.ts` | 3 | 2 fail (pre-existing — `aihu-compile.exe` ENOENT, unrelated to B1.2) |

B1.1's contract is intact. No CLI behavioral regression.

---

## Findings to flag for Director r-004

### F-1 (BLOCKER) — Phantom moon project at `packages/templates/`

**Surface:** Moon's `packages/*` projects glob in `.moon/workspace.yml`
matches `packages/templates/` (which now exists because Builder added
`packages/templates/cf-team/`). Moon registers `templates` as a project
with id `templates`, root `packages/templates`, source `packages/templates`,
language `typescript`, layer `library`. Inherited tasks (`build`,
`typecheck`) fire against this directory expecting `tsconfig.json` /
`rolldown.config.ts` / `package.json` / `src/**/*` — none of which exist.

**Effect:** `bunx moon run templates:typecheck` runs `bun run tsc --noEmit`
inside `packages/templates/` with no tsconfig, so tsc walks up to the root
tsconfig and ends up trying to typecheck the entire repo with the wrong
include set. Surfaces ~50 latent errors across sibling packages.

**Why this is a B1.2 surface (not pre-existing):** the moon project glob
+ inherited tasks model means simply *creating* the `packages/templates/`
directory creates a new moon project. `main` does not have this directory
and so does not run this phantom typecheck.

**The brief explicitly anticipated this** under "TYPECHECK NOTE — option
(a) or (b)" and asked Builder to surface if neither was clean. Neither
was applied; nothing was surfaced. This is exactly the case the brief
flagged for Director routing.

**Two minimal fixes (Director picks):**
- (a) Add `.moon/tasks/tasks.yml` exclusion or set `language: 'unknown'`
      / `layer: 'unknown'` for `packages/templates` via a
      `packages/templates/moon.yml` that opts-out of the inherited
      typecheck task.
- (b) Restructure: move `cf-team/` up so it lives at `packages/templates-cf-team/`
      (matches the arch-6 §1.5 naming convention `@aihu/templates-cf-team`
      for the package — the directory parent `templates/` is purely
      organizational and arguably should not exist at all). This is the
      cleaner long-term fix because it also pre-empts the same problem
      when B2 adds the other 4 templates.

Recommend (b) — it converges the file-system layout with the package
naming convention and removes the phantom-project class of bugs entirely.

### F-2 (NON-BLOCKER) — `expose.aihu` extends the §2.6 locked example

`packages/templates/cf-team/template/apps/web/src/agent/expose.aihu` adds
a `@state { appName: string = '__APP_NAME__' }` block plus a `$describe`
declaration on top of the locked §2.6 example. The locked example is:

```aihu
@template { <span class="aihu-expose-stub">{{ appName }}</span> }
@agent { $expose appName as readonly }
```

The Builder-shipped version:

```aihu
@state { appName: string = '__APP_NAME__' }
@template { <span class="aihu-expose-stub">{{ appName }}</span> }
@agent {
  $expose appName as readonly
  $describe appName "The scaffolded application's display name"
}
```

The §2.6 example doesn't show *where* `appName` comes from (no @state
block), and the Builder reasonably infers that without a state declaration
the SFC would not compile. Adding `$describe` is genuinely additive value
— not creep, but a small spec-deviation worth flagging because it's not
literally what §2.6 prints. Director can decide whether to:
- (i) accept as-is (Builder's reading is more correct than the prose
      example),
- (ii) update arch-6 §2.6 to match what shipped,
- (iii) trim back to the literal example (loses the @state block — likely
       breaks the SFC compile).

Recommend (ii) — the shipped shape is what a real SFC needs.

### F-3 (NON-BLOCKER) — `apps/web/package.json.tmpl` lists `@aihu/server` (extra) and lists ALL 3 auth providers unconditionally

Two sub-surfaces, both flagged in Builder γ's commit message:

1. **`@aihu/server` dep is in `apps/web/package.json.tmpl`** but is not
   in `template.config.ts`'s `appPeerDeps` (the manifest declares 5 deps,
   the emitted package.json has 6). Either the template package.json
   should drop `@aihu/server` or `appPeerDeps` should add it. The current
   state means the manifest's view of "what runtime deps the user gets"
   diverges from what they actually get. (γ's report flagged this
   explicitly.)

2. **All 3 auth providers (better-auth, @kinde-oss/kinde-typescript-sdk,
   @supabase/supabase-js) are emitted unconditionally** in
   `apps/web/package.json.tmpl`. The manifest's `appPeerDepsConditional`
   correctly gates them, but the static `package.json.tmpl` lists all 3.
   Per arch-6 §2.3, the CLI should be emitting *only* the chosen
   provider's dep into the user's package.json — but B1.2's static
   template ships all 3.

   This is partially the Builder's job (the template needs a way to
   pre-stamp deps based on overrides) and partially the pipeline's
   (B1.1's `readSubstituteWrite` doesn't currently do dep-injection — it
   does literal string replace). **The cleanest path is for B1.3 (the
   harness round) to add a "render appPeerDeps + chosen
   appPeerDepsConditional into the user's package.json" step.** Until
   then, the user gets all 3 auth-package node_modules even though only
   one auth file lands. Disk-bloat issue at runtime, not a compile
   failure.

   Recommend punt to B1.3 — outside B1.2's scope.

### F-4 (INFORMATIONAL) — `appPeerDeps` pinned to `^0.2.0`, not `^1.0.0`

Builder γ flagged this in their report. Arch-6 §2.3 example shows
`'@aihu/runtime': '^1.0.0'` etc.; B1.2 shipped `^0.2.0`. Builder's
inline comment defends the choice:

> Aihu framework runtime peer deps. Pinned to ^0.2.0 because the framework
> is shipping its v0.2.0 alpha alongside the CLI templates and the package
> names must resolve against npm at scaffold time. Bumps to ^1.0.0 land
> when the framework cuts its 1.0.

This is reasonable — the §2.3 example is aspirational (post-1.0). At
scaffold time `^1.0.0` would resolve to nothing on npm because the
framework is still 0.x. **Defer to Director on whether to keep the
override or update arch-6 §2.3 to show `^0.2.0` until 1.0 cuts.**

### F-5 (INFORMATIONAL) — `.env.example.<provider>` retains the provider suffix

Builder γ flagged this. The conditional file path is literally
`.env.example.better-auth` (or `.kinde` / `.supabase`); after scaffold,
the user has e.g. `apps/web/.env.example.better-auth`. They must rename
to `.env` themselves. The README / post-install steps don't currently
print this instruction. Either:
- Drop the suffix in a post-substitution rename step (would need
  pipeline change → outside B1.2)
- Document the rename in `template/README.md.tmpl` (in scope, simple add)
- Add it to `printNextSteps` output (B1.3-shaped pipeline change)

Recommend documenting in README + B1.3 punt for the rename step.

### F-6 (INFORMATIONAL) — Branch hasn't merged synth round-003 changes

`feat/cli-templates-b1.2` was forked from PR #81 (the round-003 director
note) before PR #82 (the synth) merged. So `git diff origin/main` shows
the synth edits to `state-cli-templates.md` (-47 lines) and
`docs/roadmap/arch-6-cli-templates.md` (-2 / +1 line) as "removed". This
is a pure branching artifact — when B1.2 merges into main, git will
combine the parallel changes correctly. **Mention to Team Lead before
landing the merge** so they don't get confused by the diff stats.

---

## Recommendation

**Re-dispatch Builder for a tiny patch round (B1.2.1)** — single fix
covering F-1 only. Recommended approach (b) — restructure
`packages/templates/cf-team/` → `packages/templates-cf-team/` so the
phantom moon project goes away entirely. This is mechanical (a `git mv`
+ update of the `templates-registry.ts` registry constant if it points
at `packages/templates/cf-team` — verify whether B1.1 hardcoded the
sub-path).

If Director prefers (a) — opt-out moon.yml at `packages/templates/`
declaring the directory as a non-buildable container — that's also a
~10-line fix.

**F-2/F-3/F-4/F-5 are non-blocking.** Director r-004 can route them:
- F-2 → fold into Synthesizer's arch-6 §2.6 update (or accept as-is).
- F-3 → punt the conditional-dep emission to B1.3 (pipeline-shaped fix).
- F-4 → accept Builder's reading + update arch-6 §2.3 to show `^0.2.0`.
- F-5 → quick README addendum (within B1.2.1's blast radius if we're
  patching anyway).

Do **not** dispatch Director r-004 for a substantive re-spec — the spec
is fine. F-1 is implementation creep that the brief explicitly
anticipated; the right action is a small Builder patch, not a Director
re-direction.

---

## Iteration counter

Round 003a (this audit). Iteration counter: **3 of 5** in arch-6 §10's
projection. After F-1 patches (one Builder pass), B1.2 closes at 3 of 5
— still under-running the projection, banking budget for B1.3 and B2.
