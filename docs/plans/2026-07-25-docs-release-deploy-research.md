# How well-run OSS projects rebuild and deploy docs after a release

**Date:** 2026-07-25
**Question:** aihu wants `apps/docs` (Cloudflare Pages, `aihu.dev`) to rebuild after a release
completes. A candidate implementation adds `on.workflow_run` keyed to the release workflow.
Is that what mature JS-framework monorepos actually do?

**Method:** read the raw workflow YAML (and hosting config) in each project's GitHub repo.
Every claim below is cited to a file. Where a project's deploy is driven by a hosting
provider's Git integration configured outside the repo, that is stated explicitly and marked
as inferred from the in-repo hosting config rather than from a workflow.

**Headline:** of the 13 projects surveyed, **zero** deploy their docs off a release event.
Twelve deploy on push to the docs' default branch, fully decoupled from releases. One
(Turborepo) touches docs from the release workflow — and even there it does *not* rebuild;
it re-points a DNS alias at a deployment that already existed. `workflow_run` appears six
times across these repos and **never once for a docs deploy** — it is used exclusively for
"report on a run that just finished" bots.

---

## Comparison table

| Project | Docs location | Deploy trigger | Category | File / URL | Versioned docs? | How versions reach install snippets |
|---|---|---|---|---|---|---|
| **Astro** | Separate repo `withastro/docs` | `push` to `[main, v4, v5, v6, v7]` + `pull_request`; deploys via `cloudflare/wrangler-action` | **(f)** decoupled | [`withastro/docs/.github/workflows/deploy.yml:3-6, 45-55`](https://github.com/withastro/docs/blob/main/.github/workflows/deploy.yml) | Yes — one branch per major, each deployed separately | Snippets are unversioned (`astro@latest`); reference docs regenerated **nightly** by cron, not on release ([`nightly.yml:3-6`](https://github.com/withastro/docs/blob/main/.github/workflows/nightly.yml)) |
| **Astro (release side)** | — | `release.yml` fires a `repository_dispatch` `release-published` after changesets publishes | **(e)** but not to docs | [`withastro/astro/.github/workflows/release.yml:119-124`](https://github.com/withastro/astro/blob/main/.github/workflows/release.yml) | — | No workflow in `withastro/astro` or `withastro/docs` listens for `release-published` — the only `repository_dispatch` consumer in the org's two repos is `merge-main-to-next.yml`. The event is for external listeners, **not** a docs rebuild. |
| **Vite** | In-repo `docs/` (VitePress) | Netlify Git integration on push; build skipped by an `ignore` script | **(f)** decoupled | [`vitejs/vite/netlify.toml:5-8`](https://github.com/vitejs/vite/blob/main/netlify.toml) + [`scripts/docs-check.sh`](https://github.com/vitejs/vite/blob/main/scripts/docs-check.sh) | Yes — prior majors linked out to `v2.vite.dev` etc. via a generated `versionLinks` list | **Read from `package.json` at build time**: `import packageJson from '../../packages/vite/package.json'` → `viteVersion` → nav badge `v${viteVersion}` and `__VITE_VERSION__` define ([`docs/.vitepress/config.ts:14-17, 252, 592`](https://github.com/vitejs/vite/blob/main/docs/.vitepress/config.ts)) |
| **Vitest** | In-repo `docs/` (VitePress) | Netlify Git integration on push; `ignore` gate | **(f)** decoupled | [`vitest-dev/vitest/netlify.toml:1-4`](https://github.com/vitest-dev/vitest/blob/main/netlify.toml) | Version switcher in nav; single live site | **Read from `package.json` at build time**: `import { version } from '../../package.json'` → `__VITEST_VERSION__`, nav `v${version}` ([`docs/.vitepress/config.ts:11, 83, 205`](https://github.com/vitest-dev/vitest/blob/main/docs/.vitepress/config.ts)) |
| **Svelte / SvelteKit** | Separate repo `sveltejs/svelte.dev` | No deploy workflow in repo → Vercel Git integration on push to `main` (inferred: repo has only `ci.yml`, `autofix.yml`, `docs-preview-*.yml`, `sync-*.yml`) | **(g)** separate repo, **(f)** trigger | [`sveltejs/svelte.dev/.github/workflows/`](https://github.com/sveltejs/svelte.dev/tree/main/.github/workflows) | Single always-latest site | Docs content synced by **`workflow_dispatch` only** ([`sync-docs.yml:4-16`](https://github.com/sveltejs/svelte.dev/blob/main/.github/workflows/sync-docs.yml)); package version metadata refreshed by a **weekly cron** that opens a PR ([`sync-packages.yml:3-6, 25-37`](https://github.com/sveltejs/svelte.dev/blob/main/.github/workflows/sync-packages.yml) — "Automatically fetch latest packages metadata from NPM & GitHub") |
| **Solid** | Separate repo `solidjs/solid-docs` (docs.solidjs.com) | No deploy workflow; repo has `netlify.toml` → Netlify Git integration | **(g)** + **(f)** | [`solidjs/solid-docs`](https://github.com/solidjs/solid-docs) — workflows are only `autofix.yml`, `orama_sync.yml`, `static_checks.yml` | Single site | Unverified in detail; no release-coupled workflow exists in either `solidjs/solid` (single `main-ci.yml`) or `solidjs/solid-docs` |
| **Lit** | Separate repo `lit/lit.dev` | Google Cloud Build trigger on push to `main` → Cloud Run | **(g)** + **(f)** | [`lit/lit.dev/cloudbuild-main.yaml`](https://github.com/lit/lit.dev/blob/main/cloudbuild-main.yaml) ("lit.dev Cloud Build config for **main branch auto deployment**") | Single site | `lit.dev` installs `lit` and `@lit/*` as **semver-range npm deps** of the site itself ([`packages/lit-dev-content/package.json`](https://github.com/lit/lit.dev/blob/main/packages/lit-dev-content/package.json) — `"@lit/context": "^1.1.0"` etc.); a rebuild picks up whatever npm resolves |
| **Lit (release side)** | — | `release.yaml` is `on: push: branches: [main]` (changesets action). **No** docs step, no dispatch, no `lit.dev` reference anywhere in it | — | [`lit/lit/.github/workflows/release.yaml:3-6`](https://github.com/lit/lit/blob/main/.github/workflows/release.yaml) | — | — |
| **Nuxt** | In-repo `docs/`, rendered by separate site repo | `push` to `[main, 4.x, 3.x]` **with `paths: docs/**`** → `curl` a deploy webhook | **(f)** decoupled, paths-filtered | [`nuxt/nuxt/.github/workflows/docs-deploy.yml:3-9, 20-22`](https://github.com/nuxt/nuxt/blob/main/.github/workflows/docs-deploy.yml) | Yes — one branch per major | Second webhook for the marketing site on the same trigger ([`notify-nuxt-website.yml:2-11`](https://github.com/nuxt/nuxt/blob/main/.github/workflows/notify-nuxt-website.yml)). `release.yml` contains no docs step. |
| **Vue** | Separate repo `vuejs/docs` | Netlify Git integration; the repo's **only** workflow is `automerge.yml` | **(g)** + **(f)** | [`vuejs/docs/netlify.toml`](https://github.com/vuejs/docs/blob/main/netlify.toml) | Yes — v2 docs are a separate site; search facet `version:v3` | Snippets unversioned; CDN examples point at `vue@3` style specifiers |
| **React Router** | Separate repo `remix-run/react-router-website` | `push` to `main` with `paths-ignore: README.md` → deploy to Fly | **(g)** + **(f)** | [`remix-run/react-router-website/.github/workflows/deploy.production.yml:1-11`](https://github.com/remix-run/react-router-website/blob/main/.github/workflows/deploy.production.yml) | Yes — the site serves docs **per git ref** pulled from the source repo | The `docs.yml` in `remix-run/react-router` is a **generator**, not a deploy: `push` to `main` on `packages/**/*.ts(x)` → typedoc/jsdoc → **commits markdown back to main** ([`docs.yml:3-11, 48-65`](https://github.com/remix-run/react-router/blob/main/.github/workflows/docs.yml)) |
| **TanStack** | Separate repo `TanStack/tanstack.com` (Cloudflare, `wrangler.jsonc`) | No deploy workflow → CF/Vercel Git integration on push | **(g)** + **(f)** | [`TanStack/tanstack.com`](https://github.com/TanStack/tanstack.com) — workflows are `autofix`, `docs-links`, `pr`, `zizmor` | Yes — per-version doc routes | **Weekly cron** bumps the site's own deps: `pnpm up "@tanstack/*" --latest` then commits ([`update-tanstack-deps.yml:3-7, 35, 57-64`](https://github.com/TanStack/tanstack.com/blob/main/.github/workflows/update-tanstack-deps.yml)). Release-agnostic. |
| **Turborepo** | In-repo (`apps/`), Vercel project `turbo-site` | Vercel Git integration on every push ([`vercel.json`](https://github.com/vercel/turborepo/blob/main/vercel.json) disables it only for `benchmark-data` / `gh-pages`); the **release workflow then aliases** | **(d)** partial — alias job inside release | [`vercel/turborepo/.github/workflows/turborepo-release.yml:658-718`](https://github.com/vercel/turborepo/blob/main/.github/workflows/turborepo-release.yml) — job `alias-versioned-docs` | **Yes** — `v2-5-4.turborepo.dev` per release | See "the Turborepo exception" below |
| **Biome** | Separate repo `biomejs/website` | `repository_dispatch` from `biomejs/biome` on a **cron**, not a release → opens + auto-merges a sync PR → push deploys the site | **(e)** but cron-driven | [`biomejs/biome/.github/workflows/repository_dispatch.yml:3-6, 96-107`](https://github.com/biomejs/biome/blob/main/.github/workflows/repository_dispatch.yml) → [`biomejs/website/.github/workflows/synchronize.yaml:9-10, 67-81`](https://github.com/biomejs/website/blob/main/.github/workflows/synchronize.yaml) | Single site | Sync job runs codegen with a literal `version: "0.0.0"` ([`synchronize.yaml:61-65`](https://github.com/biomejs/website/blob/main/.github/workflows/synchronize.yaml)) — the site deliberately does not pin a release version |

### Category tally

| Category | Count | Projects |
|---|---|---|
| (a) `workflow_run` off the release workflow | **0** | — |
| (b) `on: release: types: [published]` | **0** | — |
| (c) tag push `v*` | **0** for docs | Vite's `release-tag.yml` is tag-triggered but only creates a GitHub Release |
| (d) step inside the release workflow | **1 (partial)** | Turborepo — aliases, does not rebuild |
| (e) `repository_dispatch` from a release job | **0.5** | Astro dispatches but nothing consumes it; Biome dispatches on a **cron**, not a release |
| **(f) decoupled — push to main** | **12 of 13** | Astro, Vite, Vitest, Svelte, Solid, Lit, Nuxt, Vue, React Router, TanStack, Turborepo, Biome |
| (g) docs in a separate repo | **8 of 13** | Astro, Svelte, Solid, Lit, Vue, React Router, TanStack, Biome |

---

## Q2 — How common is "fully decoupled, every push to main"?

**Universal: 12 of 13.** Every project surveyed deploys docs on a push to the docs' default
branch, with no release coupling whatsoever. Turborepo also deploys this way; its release
workflow adds an alias on top.

Two variants of the same idea:

1. **CI-owned deploy** — Astro runs `cloudflare/wrangler-action` from
   [`deploy.yml`](https://github.com/withastro/docs/blob/main/.github/workflows/deploy.yml)
   on push. Nuxt curls a webhook from
   [`docs-deploy.yml`](https://github.com/nuxt/nuxt/blob/main/.github/workflows/docs-deploy.yml).
   React Router's website deploys to Fly from
   [`deploy.production.yml`](https://github.com/remix-run/react-router-website/blob/main/.github/workflows/deploy.production.yml).
2. **Host-owned deploy** — Vite, Vitest, Vue, Solid, TanStack, Lit have *no* deploy workflow
   at all; the hosting provider's Git integration watches the branch. Vite/Vitest express
   their "paths filter" as a Netlify `ignore` command instead of a GitHub `paths:` key.

**Why does this suffice?** Three reasons, all observable in the source:

- **Install snippets carry no version number.** Astro says `astro@latest` (180 code hits for
  `astro@latest` in `withastro/docs`). aihu's own docs are the same — every snippet in
  `apps/docs/src/content/docs` is a bare `bun add @aihu/<pkg>`, with no pinned version.
  If the snippet has no version in it, a post-release rebuild changes nothing.
- **Where a version *is* displayed, it is read at build time from the repo's own
  `package.json`** — see Vite and Vitest rows above. The changesets version-bump commit that
  writes the new number to `package.json` **is itself a push to main**, so the ordinary
  push-triggered deploy already picks it up. No release event is needed; the release
  *is* a main push.
- **Where the docs must track the published artifact, projects use a clock, not an event.**
  Astro regenerates reference docs on a **nightly** cron
  ([`nightly.yml:3-6`](https://github.com/withastro/docs/blob/main/.github/workflows/nightly.yml)).
  TanStack bumps `@tanstack/*` to `--latest` **weekly**
  ([`update-tanstack-deps.yml:5-7`](https://github.com/TanStack/tanstack.com/blob/main/.github/workflows/update-tanstack-deps.yml)).
  svelte.dev refreshes npm package metadata **weekly**
  ([`sync-packages.yml:4-5`](https://github.com/sveltejs/svelte.dev/blob/main/.github/workflows/sync-packages.yml)).
  Biome dispatches to its website **Mon/Wed/Fri**
  ([`repository_dispatch.yml:5-6`](https://github.com/biomejs/biome/blob/main/.github/workflows/repository_dispatch.yml)).
  These are all cases where the docs *do* depend on published state — and every one of them
  chose a cron over a release trigger, because a cron is stateless, self-healing, and cannot
  be skipped by a failed or partial release.

---

## Q3 — Does anyone use `workflow_run` for this?

**No.** `workflow_run` appears six times across the surveyed repos. Every occurrence is the
same pattern — *comment on / notify about a run that just finished* — and none deploy docs:

| Repo | File | What it does |
|---|---|---|
| `withastro/astro` | `merge-fix.yml` | post-CI merge helper |
| `withastro/docs` | [`deploy-preview.yml:3-6`](https://github.com/withastro/docs/blob/main/.github/workflows/deploy-preview.yml) | comments the preview URL on a PR after `Deploy` finishes |
| `lit/lit` | `benchmarks-report.yaml`, `sizecheck-report.yaml` | comment benchmark / size results on PRs |
| `vuejs/core` | `size-report.yml` | comment size diff on PRs |
| `remix-run/react-router` | `pr-actions.yml` | PR automation |
| `vercel/turborepo` | [`docs-alias-failure-notification.yml:10-23`](https://github.com/vercel/turborepo/blob/main/.github/workflows/docs-alias-failure-notification.yml) | Slack alert when the docs alias step **fails** |

That is the canonical, correct use of `workflow_run`: it is the safe substitute for
`pull_request_target` when you need elevated permissions to report on an untrusted (fork) PR
build. It is a *reporting* trigger, not a *deployment* trigger.

**Which gotchas actually bite.** The surveyed workflows demonstrate the workarounds, which
is the clearest evidence the gotchas are real:

- **Checkout defaults to the default-branch head, not the triggering SHA.** Both
  `workflow_run` consumers that need artifacts avoid `actions/checkout` entirely.
  `withastro/docs/deploy-preview.yml` uses
  `actions/download-artifact` with `run-id: ${{ github.event.workflow_run.id }}` to pull
  metadata the upstream run uploaded. Turborepo's notifier is explicit about it in a code
  comment: *"Fetch version.txt via the API at the exact commit of the failed run instead of
  checking out the branch. This avoids checking out a ref by name (the staging branch may
  already be deleted...)"*
  ([`docs-alias-failure-notification.yml:25-29`](https://github.com/vercel/turborepo/blob/main/.github/workflows/docs-alias-failure-notification.yml)).
  **This is the gotcha that bites hardest for aihu**: aihu's release is a `v*` **tag** push.
  A `workflow_run` job that runs `actions/checkout@v4` with no `ref:` will check out
  `main`'s head — which may already contain post-tag commits — so the "post-release" docs
  build would not be building the released tree.
- **Fires on completion regardless of conclusion.** Real; both Astro and Turborepo guard with
  `github.event.workflow_run.conclusion == '...'`. The in-flight aihu patch already does
  this, so this one is handled.
- **Runs the workflow file from the default branch.** Real, and it means the trigger cannot
  be tested on a PR — you must merge to main before you can find out whether it fires. Note
  Astro's extra guard `github.event.workflow_run.event == 'pull_request'`, needed precisely
  because a `workflow_run` cannot distinguish upstream trigger types otherwise.
- **Does not inherit `paths:` filters.** Real, and here it is actually the *point* — it is
  why the pattern looks attractive. But see the recommendation: there is a cheaper way to get
  the same effect.
- **Extra failure mode not in the brief:** `workflow_run` only fires for workflows on the
  **default branch**, and the `workflows:` key matches on the **`name:` field**, not the
  filename. Renaming aihu's release workflow (currently
  `name: Release aihu-compile binaries`) silently breaks the chain with no error anywhere.

---

## Q4 — Do these projects version their docs?

Mixed, and it matters less than expected because **nobody snapshots docs at release time**.

- **Branch-per-major (most common)** — Astro deploys `main, v4, v5, v6, v7`
  ([`deploy.yml:5`](https://github.com/withastro/docs/blob/main/.github/workflows/deploy.yml));
  Nuxt deploys `main, 4.x, 3.x`
  ([`docs-deploy.yml:6-9`](https://github.com/nuxt/nuxt/blob/main/.github/workflows/docs-deploy.yml)).
  Each branch is an independently, continuously deployed always-latest site for that major.
  The "version" boundary is a long-lived branch, not a release snapshot.
- **Per-ref rendering** — reactrouter.com serves docs read from git refs of the source repo,
  so new versions appear without a site rebuild. TanStack does the same shape across
  versioned doc routes.
- **Per-release alias** — Turborepo alone mints `v2-5-4.turborepo.dev` per release, and does
  it by aliasing an existing deployment, not by building a snapshot.
- **Single always-latest** — Vitest, Lit, Biome, svelte.dev, Solid.

Nobody runs Docusaurus-style `docs:version` snapshots on release. So "rebuild the docs after
a release" is not a pattern these projects have; the closest analogue is Turborepo's alias,
which is a routing change, not a rebuild.

---

## Q5 — How do docs get accurate version numbers in install snippets? (the crux)

Ranked by how often it appears:

1. **They don't have version numbers.** Dominant. Astro's snippets are `astro@latest`
   (180 hits). Vue/Lit/Biome install snippets are bare package names. **aihu is already in
   this category** — every install snippet under `apps/docs/src/content/docs` is
   `bun add @aihu/<pkg>` with no version. The only two version strings in aihu's docs are
   prose status notes (`apps/docs/src/content/docs/guides/styling.md:7` says
   `@aihu/css-engine@0.1.0`; `guides/primitives.md:5` says `@aihu/primitives@0.0.1`) — neither
   is an install snippet, and neither is auto-updated by any trigger, so a release-coupled
   rebuild would not fix them anyway.
2. **Read from `package.json` at build time.** Vite
   ([`config.ts:14-17`](https://github.com/vitejs/vite/blob/main/docs/.vitepress/config.ts))
   and Vitest ([`config.ts:11`](https://github.com/vitest-dev/vitest/blob/main/docs/.vitepress/config.ts)).
   **Critically, both then make sure a version bump re-triggers the build by naming the
   version-bearing files in the deploy filter** — Vitest's `netlify.toml` ignore command is
   `git diff --quiet $CACHED_COMMIT_REF $COMMIT_REF docs/ package.json pnpm-lock.yaml`, and
   Vite's `scripts/docs-check.sh` diffs `docs package.json pnpm-lock.yaml netlify.toml
   packages/vite/package.json scripts/docs-check.sh`. That is the exact problem aihu is
   trying to solve, solved with a **paths filter**, not a release trigger.
   **aihu already does the build-time read** (`apps/docs/build.ts:297-302` reads
   `packages/runtime/package.json` into the nav version badge) but has *not* done the
   corresponding filter widening — see the recommendation.
3. **The docs site depends on the packages as ordinary npm deps.** lit.dev carries
   `"@lit/context": "^1.1.0"` etc. and picks up new versions on rebuild.
4. **A cron refreshes the resolved versions.** TanStack's weekly `pnpm up "@tanstack/*"
   --latest`; svelte.dev's weekly npm-metadata sync.

**Bottom line for Q5:** there is no project in this set where the correctness of a docs page
depends on a rebuild being chained to a release event.

---

## The Turborepo exception, read carefully

Turborepo is the only project that touches docs from the release workflow, and what it does
is instructive because it is *not* a rebuild:

```yaml
# .github/workflows/turborepo-release.yml
# 8. Alias versioned docs (e.g., v2-5-4.turborepo.dev)
...
  alias-versioned-docs:
    name: "Alias Versioned Docs"
```

The job installs the Vercel CLI, **finds the deployment Vercel already built for the release
SHA** (`vercel list turbo-site --scope=vercel -m githubCommitSha="${SHA}" --status=READY`),
and points a subdomain at it (`vercel alias set "${DEPLOYMENT_URL}" "${ALIAS}"`)
([`turborepo-release.yml:689-718`](https://github.com/vercel/turborepo/blob/main/.github/workflows/turborepo-release.yml)).

Three lessons:

- Even the one project that couples docs to release **relies on continuous push-based
  deploys** to have produced the artifact. The release job consumes a deployment; it does not
  create one.
- The coupling is **inside the release workflow as a job**, category (d) — not `workflow_run`.
  That gives it the release's `SHA` and version directly, with no cross-workflow SHA problem.
- They still built a `workflow_run` **failure notifier** on top
  ([`docs-alias-failure-notification.yml`](https://github.com/vercel/turborepo/blob/main/.github/workflows/docs-alias-failure-notification.yml)),
  which tells you this step is flaky enough in practice to need paging.

---

## Recommendation for aihu

### The honest answer

**Most projects don't do this, and aihu already gets ~86% of the intended behaviour by
accident. The right fix is to make that deliberate, not to add a new trigger.**

The current filter in `.github/workflows/deploy-docs.yml` (origin/main) is:

```yaml
paths:
  - 'apps/docs/**'
  - 'packages/arbor/**'
  - 'packages/compiler/**'
  - 'packages/plugin-agent-readiness/**'
  - 'packages/server/**'
  - '.github/workflows/deploy-docs.yml'
```

Measured against every `chore(release): version packages` merge in aihu's history
(49 commits on `origin/main`):

| | Count |
|---|---|
| Version-PR merges that **already** matched the paths filter and deployed docs | **42 / 49** |
| Version-PR merges that matched nothing and did **not** deploy docs | **7 / 49** |

The 42 match incidentally, because changesets rewrites the dependency tables in
`packages/*/README.md` — so almost any release touches `packages/arbor/README.md` or
`packages/compiler/README.md` and trips the filter. Example: `e54b72b5`
("version packages (#530)") was a `@aihu/use`-only release, and the *only* file in it that
matched the filter was `packages/arbor/README.md`.

The 7 misses are the interesting ones. `3823e4ec` ("version packages (#380)") touched only:

```
.changeset/agent-template-durable.md, README.md,
packages/cli/{CHANGELOG.md,README.md,package.json},
packages/create-aihu/{CHANGELOG.md,README.md,package.json},
scripts/__package-inventory.json
```

None of that matches, so the docs did not rebuild — for a **`@aihu/cli` + `create-aihu`
release**, i.e. precisely the release whose docs pages (`installation.md`, `packages/cli.md`)
a reader is most likely to be following verbatim.

So the real defect is not "docs are uncoupled from releases." It is that the coupling exists
but is **accidental and unreliable**: it depends on whether changesets happened to touch one
of five enumerated packages. That is a paths-filter bug, and it wants a paths-filter fix.

#### aihu is already running the Vite/Vitest pattern — it just isn't in the filter

`apps/docs/build.ts:297-302` does exactly what Vite's and Vitest's VitePress configs do:

```ts
const runtimePkgJson = JSON.parse(
  await readFile(join(__dir, '../../packages/runtime/package.json'), 'utf8'),
)
const runtimeVersion: string = runtimePkgJson.version ?? '0'
const indexDist = indexSrc
  .replace('./dist/docs.js', './docs.js')
  .replace('>v0<', `>v${runtimeVersion}<`)
```

The site's version badge is **read from `packages/runtime/package.json` at build time**
(also applied to every prerendered page at `build.ts:360`). This is the single piece of
aihu's docs whose correctness genuinely depends on rebuilding after a version bump — and
**`packages/runtime/**` is not in the `deploy-docs.yml` paths filter.**

Historically it has never gone stale: every version-packages commit that bumped
`packages/runtime/package.json` also happened to touch one of the five filtered packages
(0 misses across all 49). But that is luck, not design. A runtime-only release would ship a
site whose version badge still reads the previous version, and no trigger in the repo would
notice.

This is the strongest argument for the paths-filter fix and against `workflow_run`: the one
version-sensitive artefact aihu has is keyed to a **file in the tree**, so the correct
trigger is **that file changing**, which is a `push` + `paths` concern. A release-completion
event is a strictly worse proxy for "the version string in `packages/runtime/package.json`
changed."

### Preferred fix: widen the paths filter (Vite/Vitest pattern)

Add the version-bearing paths to the existing `push:` filter, exactly as Vite and Vitest do
in their Netlify ignore commands:

```yaml
paths:
  - 'apps/docs/**'
  - 'packages/*/package.json'      # every changesets version bump; incl. the
                                   # runtime version read by build.ts:297
  - 'packages/*/CHANGELOG.md'      # release notes surfaced in docs
  - 'README.md'                    # rewritten by the version PR
  # ... existing entries
```

`packages/*/package.json` alone closes all 7 historical misses, because a changesets version
PR by definition bumps at least one `package.json`. This turns a 42/49 accidental hit rate
into 49/49 by construction, **and** makes the `runtimeVersion` badge's dependency explicit —
one line, no new trigger semantics.

Cited precedent: Vitest gates on `docs/ package.json pnpm-lock.yaml`
([`netlify.toml:4`](https://github.com/vitest-dev/vitest/blob/main/netlify.toml)); Vite gates
on `docs package.json pnpm-lock.yaml netlify.toml packages/vite/package.json`
([`scripts/docs-check.sh`](https://github.com/vitejs/vite/blob/main/scripts/docs-check.sh)).

Trade-offs:

- **+** No new workflow, no new trigger semantics, testable on a PR, cannot silently break on
  a workflow rename.
- **+** Fires at the version-PR merge — which is when the version numbers actually change in
  the tree. That is what the docs render from.
- **−** Fires *before* the `v*` tag and npm publish (aihu stage 2 of 4, not stage 4). If any
  docs page asserts "version X is live on npm," the site is briefly ahead of the registry —
  minutes to hours. Given aihu's snippets are unversioned `bun add @aihu/<pkg>`, this is
  currently a non-issue.
- **−** Also fires on `chore: bump` style commits that aren't real releases. Harmless — a
  docs deploy is idempotent and cheap.

### If the tag/publish moment genuinely matters

Two options that are strictly better than `workflow_run`:

1. **Add `push: tags: ['v*']` to `deploy-docs.yml`** (category (c)). One line, same workflow,
   same guards, and — decisively — `actions/checkout` defaults to **the tag's SHA**, so you
   build the released tree. This solves the single worst `workflow_run` gotcha for free.
   Trade-off: it fires when the tag lands, which is *before* `release.yml` finishes building
   binaries and publishing to npm. If the docs need the npm-published state (e.g. a page that
   fetches from the registry), this is too early.
2. **Add a final `deploy-docs` job inside `release.yml`** (category (d), the Turborepo shape),
   `needs:` the publish jobs, guarded on non-dry-run. Runs strictly after publish, has the
   release version in scope, no cross-workflow SHA problem, and its failure is visible in the
   release run rather than in an orphan run nobody watches. Trade-off: duplicates the docs
   build steps or requires factoring `deploy-docs.yml` into a `workflow_call` reusable
   workflow — the cleanest version of this, and how you'd get "release then docs" without
   `workflow_run` at all.

### On the in-flight `workflow_run` patch

**It is not the pattern mature projects use, and it carries a specific, load-bearing bug for
aihu's shape.** Zero of 13 projects use it for docs; all six `workflow_run` uses in these
repos are PR-reporting bots. The conclusion guard in the patch is correct as far as it goes,
but the patch's `actions/checkout` will check out **`main`'s head, not the released tag's
SHA** unless it explicitly passes `ref: ${{ github.event.workflow_run.head_sha }}` — and
because aihu releases from a `v*` tag, main can have moved on. Turborepo's own comment
documents dodging exactly this. Secondary risks: the `workflows: ["Release aihu-compile
binaries"]` key matches on the workflow **`name:` field**, so any rename breaks the chain
silently; the trigger cannot be exercised from a PR because `workflow_run` only runs the
default-branch copy of the file; and `release.yml` has `workflow_dispatch` dry-run and canary
paths that also "complete successfully," so the guard needs to exclude them
(`github.event.workflow_run.event == 'push'` at minimum).

**Ordered recommendation:** (1) widen the paths filter — it fixes the real, demonstrated gap
and matches Vite/Vitest; (2) if you also want a tag-time build, add `push: tags: ['v*']` to
the same workflow; (3) only if the docs must observe post-publish npm state, factor
`deploy-docs.yml` into a `workflow_call` and invoke it as a final job in `release.yml`.
Do not ship `workflow_run` — it is the one option that buys nothing the others don't, while
adding a silent-breakage surface and a wrong-SHA checkout.

---

## Sources

All URLs point at the default branch as read on 2026-07-25.

- https://github.com/withastro/docs/blob/main/.github/workflows/deploy.yml
- https://github.com/withastro/docs/blob/main/.github/workflows/deploy-preview.yml
- https://github.com/withastro/docs/blob/main/.github/workflows/nightly.yml
- https://github.com/withastro/astro/blob/main/.github/workflows/release.yml
- https://github.com/vitejs/vite/blob/main/netlify.toml
- https://github.com/vitejs/vite/blob/main/scripts/docs-check.sh
- https://github.com/vitejs/vite/blob/main/docs/.vitepress/config.ts
- https://github.com/vitejs/vite/blob/main/.github/workflows/release-tag.yml
- https://github.com/vitest-dev/vitest/blob/main/netlify.toml
- https://github.com/vitest-dev/vitest/blob/main/docs/.vitepress/config.ts
- https://github.com/sveltejs/svelte.dev/blob/main/.github/workflows/sync-docs.yml
- https://github.com/sveltejs/svelte.dev/blob/main/.github/workflows/sync-packages.yml
- https://github.com/lit/lit/blob/main/.github/workflows/release.yaml
- https://github.com/lit/lit.dev/blob/main/cloudbuild-main.yaml
- https://github.com/lit/lit.dev/blob/main/packages/lit-dev-content/package.json
- https://github.com/nuxt/nuxt/blob/main/.github/workflows/docs-deploy.yml
- https://github.com/nuxt/nuxt/blob/main/.github/workflows/notify-nuxt-website.yml
- https://github.com/vuejs/docs/blob/main/netlify.toml
- https://github.com/remix-run/react-router/blob/main/.github/workflows/docs.yml
- https://github.com/remix-run/react-router-website/blob/main/.github/workflows/deploy.production.yml
- https://github.com/TanStack/tanstack.com/blob/main/.github/workflows/update-tanstack-deps.yml
- https://github.com/vercel/turborepo/blob/main/.github/workflows/turborepo-release.yml
- https://github.com/vercel/turborepo/blob/main/.github/workflows/docs-alias-failure-notification.yml
- https://github.com/vercel/turborepo/blob/main/vercel.json
- https://github.com/biomejs/biome/blob/main/.github/workflows/repository_dispatch.yml
- https://github.com/biomejs/website/blob/main/.github/workflows/synchronize.yaml
- https://github.com/solidjs/solid-docs
