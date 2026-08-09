# @aihu/templates-cf-team

## 3.1.0

### Minor Changes

- [#780](https://github.com/fellwork/aihu/pull/780) [`abfaa6e`](https://github.com/fellwork/aihu/commit/abfaa6e0136cdf9d5f5ce77cc5f8e53c840fd4ce) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Widen every template's `vite` pin from `^6.0.0` to `^6 || ^8`.

  Vite 8 was genuinely unsafe until the OXC strip fix that shipped alongside this:
  vite 8 made esbuild an **optional peer** while still _exporting_
  `transformWithEsbuild`, the compiler's strip chain tested only that the function
  existed, and a **fresh** `^8` install (which has no esbuild at all) therefore
  threw inside the strip and — through a swallowing `catch` — handed rolldown
  un-stripped TypeScript. Every output mode runs a client build, so `spa`,
  `static` and `ssr` all failed. That is fixed at the source rather than pinned
  around: `transformWithOxc` is used whenever present, and a failed strip is now
  fatal instead of silent. Vite 6 cannot regress — it does not export
  `transformWithOxc` at all, so it keeps taking the esbuild branch.

  Measured before widening, four **fresh** installs (no lockfile, no
  `node_modules` — the defect is invisible on an incremental `bun add vite@8`,
  where esbuild survives from the previous resolution), each driven past `build`:

  | template  | vite 6                                                | vite 8 |
  | --------- | ----------------------------------------------------- | ------ |
  | `minimal` | scaffold/install/typecheck/build/dev/preview all pass | same   |
  | `ssr`     | + the built `_worker.js` imports and answers 200      | same   |

  Vite 7 is deliberately **not** in the range. No cell of the scaffold matrix has
  ever installed it, so listing it would be a compatibility claim with nothing
  behind it. `^6 || ^8` names exactly the two majors `ci-ok`'s
  `scaffold-consistency` job builds on every PR.

  The range now lives in one place — `EXTERNAL_RANGES` in
  `scripts/sync-template-versions.ts` — rather than in the four manifests that
  each carried their own copy.

- [#780](https://github.com/fellwork/aihu/pull/780) [`abfaa6e`](https://github.com/fellwork/aihu/commit/abfaa6e0136cdf9d5f5ce77cc5f8e53c840fd4ce) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Stop scaffolding `"latest"` — generate the dependency ranges at release time,
  and gate them.

  Every `@aihu/*` entry a scaffold emitted was the literal string `"latest"`, in
  four separate places (`appPackageJson`, `agentPackageJson`, the plugin scaffold,
  and cf-team's `apps/web/package.json.tmpl`). That is not a version, it is a
  promise to resolve later, and for a scaffolding tool it is three problems at
  once:

  - **Not reproducible.** A project scaffolded today and one scaffolded in six
    months have a byte-identical `package.json` and install two different
    dependency graphs. Neither manifest records which one it was.
  - **Not auditable.** `"latest"` is compatible with every future major, so a
    breaking `@aihu/runtime` publish reaches every existing scaffold on its
    owner's next `install` rather than on an upgrade they chose.
  - **Not reviewable.** No sync mechanism existed, so nothing could be wrong and
    nothing could be checked. Two hand-typed ranges were already dead on arrival
    and nobody had noticed: cf-team's `appPeerDeps` still said `^0.2.0` while
    `@aihu/runtime` was on 6.0.0, and the plugin scaffold's peer said `^0.8.0`
    while `@aihu/plugin` was on 0.1.0. Neither range resolves to anything.

  `scripts/sync-template-versions.ts` now derives one caret range per non-private
  workspace package from that package's own `package.json` and writes
  `packages/cli/src/dep-versions.ts` plus the three cf-team targets. There is no
  curated list to drift out of date: add a package and it appears; bump one and
  its range moves. It runs inside `release:version`, immediately after `changeset
version` sets the versions that release is about to publish — so the ranges a
  published `create-aihu` carries name versions that same release put on npm.

  `check:template-versions` (a new always-on `ci-ok` job) fails when any target
  disagrees with the workspace it was generated from, so a hand edit, or a version
  bump without the regen, cannot ship. Its red path is proven by a negative
  fixture in `check-gate-wiring`, red and green differing in exactly one version
  string.

  A caret rather than an exact pin, deliberately: a scaffold is a starting point,
  and `^6.0.0` lets a new project take `6.0.1` without editing a manifest while
  still refusing `7.0.0`. Prereleases are pinned exactly — `^1.0.0-rc.1` excludes
  `rc.2` but includes `1.0.0`, which is not what anyone means by it.

### Patch Changes

- [#780](https://github.com/fellwork/aihu/pull/780) [`abfaa6e`](https://github.com/fellwork/aihu/commit/abfaa6e0136cdf9d5f5ce77cc5f8e53c840fd4ce) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Fix the stale `template.config.js`, which disabled every conditional file for Node users.

  `loadTemplateConfig` prefers `template.config.ts` and falls through to the
  hand-maintained `template.config.js` whenever the runtime cannot import
  TypeScript — which is **always**, for the published `#!/usr/bin/env node`
  binary. The two files had diverged: the `.js` copy's `conditionalFiles` still
  named post-strip TARGET paths (`apps/web/src/auth/kinde.ts`) instead of the
  `.tmpl` SOURCE paths that exist on disk, and carried none of the F-5b `rename`
  fields.

  Nothing matched, so under Node not one conditional fired. Every `cf-team`
  scaffold:

  - wrote **all three** auth providers' files while installing only the chosen
    provider's SDK, and
  - emitted `.env.example.better-auth` instead of `.env.example`.

  The scaffolded project then failed its own `bun run typecheck` with TS2307 on
  `@kinde-oss/kinde-typescript-sdk` and `@supabase/supabase-js`. This is the
  failure the `scaffold-consistency` CI job records as a moon `HEAD~1` problem;
  that diagnosis was wrong — moon does not consult `HEAD~1` for a plain
  `moon run :typecheck`, and a fresh one-commit scaffold typechecks clean once the
  manifest is fixed. The CI comment is corrected.

  In-repo harnesses run `bun src/bin.ts`, take the `.ts` copy, and never saw any
  of it. A deep-equality parity test over both manifests now guards the pair, plus
  a check that every `conditionalFiles` path names a file that actually exists
  under `template/` — a `when` guarding a path in no tree is not a guard, it is a
  no-op.

- [#780](https://github.com/fellwork/aihu/pull/780) [`abfaa6e`](https://github.com/fellwork/aihu/commit/abfaa6e0136cdf9d5f5ce77cc5f8e53c840fd4ce) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Export `@aihu/cli/template-manifest`, and declare the Node floor both bins require.

  `@aihu/templates-cf-team` imports `import type { TemplateManifest } from
'@aihu/cli/template-manifest'` — the documented contract between the CLI and
  every template package (arch-6 §2.3) — but `@aihu/cli`'s `exports` map had no
  such subpath. It only worked because cf-team's `tsconfig.json` hand-maps the
  specifier to the CLI's source file for local typechecking; a real npm consumer
  typechecking the published template package hit `ERR_PACKAGE_PATH_NOT_EXPORTED`.
  Compounding it, cf-team declared `"dependencies": {}` / `"devDependencies": {}`,
  so `@aihu/cli` was not a declared dependency at all.

  The subpath is now a real export backed by its own build entry
  (`dist/template-manifest.{js,d.ts}`), and cf-team declares `@aihu/cli` as a
  devDependency. The tsconfig `paths` mapping stays so in-repo `moon run :typecheck`
  does not require the CLI to be built first.

  Both `@aihu/cli` and `create-aihu` now declare `"engines": { "node": ">=20.6.0" }`.
  `scaffold-pipeline.ts` calls `import.meta.resolve` synchronously and
  `create-aihu/bin.mjs` calls it unconditionally — both Node 20.6+ only — and
  neither package said so, unlike `@aihu/agent-server`, `@aihu/language-server` and
  `@aihu/server`, which all carry an `engines` field.

  Also removes three dead modules — `src/commands/{page,component,plugin}.ts` —
  drifted duplicates of the live `scaffoldPage`/`scaffoldComponent`/`scaffoldPlugin`
  in `src/index.ts` that `bin.ts` actually imports. Nothing referenced them; they
  had different signatures and different output, so the risk was a future edit
  landing in the copy that never runs.

- [#780](https://github.com/fellwork/aihu/pull/780) [`abfaa6e`](https://github.com/fellwork/aihu/commit/abfaa6e0136cdf9d5f5ce77cc5f8e53c840fd4ce) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Enforce a template's declared `cliRange` / `contractVersion` instead of parsing and ignoring them.

  `validateManifest()` read both fields off every `template.config.ts` and then
  compared them against nothing at all. Because nothing could be wrong, the
  declaration drifted: `@aihu/templates-cf-team` shipped `cliRange: '^0.2.0'`
  against a CLI at 1.2.x, so the only publishable template asserted an
  incompatibility with every CLI able to install it, for six minors, silently.

  `scaffoldFromTemplatePackage` — the single driver both `aihu app --template` and
  `create-aihu` run — now calls `assertTemplateCompatibility()` before any file is
  written or any package installed, and fails in the same loud style as the
  existing `unpublished`/`unknown` template cases: it names the template, both
  versions, and what to do about it. An **unreadable** range fails too; the point
  of enforcing the field is that an unenforceable declaration must not pass.

  The range check is a small hand-rolled module (`semver-range.ts`) rather than a
  new dependency: `@aihu/cli` carries exactly one runtime dependency, no package in
  this repo depends on `semver`, and this is one comparison. It implements the npm
  grammar a manifest realistically writes — caret (including the 0.x rules), tilde,
  comparators, partial/wildcard forms, `||` and space composition — plus the
  prerelease rule that stops `^1.0.0` from matching `2.0.0-beta.1`. A prerelease
  CLI is checked as its release core, so a canary build does not fail every
  template.

  `cf-team`'s range is corrected to `^1.0.0` — the CLI line that actually ships
  `scaffoldFromTemplatePackage` (added in 1.0.1), with a real upper bound so a 2.0
  CLI stops rather than half-scaffolding.

## 3.0.3

### Patch Changes

- [#717](https://github.com/fellwork/aihu/pull/717) [`44698e0`](https://github.com/fellwork/aihu/commit/44698e0e7085bf40939a8543f4df751386bf7d2d) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Fix four scaffold DX-matrix failures found via the CI matrix that exercises every built-in template across bun/npm/pnpm/yarn:

  - `cf-team`: several source files (`main.ts`, the auth provider modules, the
    `.env.example.*` files, both `.aihu` files, and the `shared` package's
    `index.ts`/`index.test.ts`) contained `__APP_NAME__`-style placeholders but
    weren't named `*.tmpl`, so the scaffold pipeline copied them verbatim
    instead of substituting — every scaffolded app failed typecheck with
    `Cannot find module '@__APP_NAME__/shared'`. Renamed to `.tmpl` so
    substitution runs.
  - `minimal`/`docs`: the compiler unconditionally emits `import {
registerAgentMetadata } from '@aihu/agent'` for any component with an
    `$action` block (the scaffolded counter always has one), but `@aihu/agent`
    was never listed in the scaffolded `package.json` — only reachable
    transitively via `@aihu/server`. bun/npm/yarn's hoisted `node_modules`
    papered over this; pnpm's strict resolution failed the build. Added
    `@aihu/agent` as a direct dependency.
  - `full`/`agent`: the `dev` script hardcoded `vite --port 5108` inside a
    `concurrently` sub-command with no argv forwarding, so
    `bun run dev -- --port N --strictPort` never reached vite and dev-server
    probes timed out. Switched to concurrently's `-P`/`{@}` passthrough-
    arguments mode so forwarded args reach the vite sub-command.
  - `full`/`agent`/`cf-team`: `pnpm run typecheck` failed with `error TS2688:
Cannot find type definition file for 'node'` — `@types/node` was missing
    from the scaffolded `devDependencies` (only reachable via hoisting under
    bun/npm/yarn). Added it directly to the `agent`/`full` template and to
    `cf-team`'s `apps/web` and `packages/shared` workspace members.
  - `cf-team`: fixing the placeholder substitution above unmasked several
    deeper, pre-existing gaps once typecheck could actually run —
    `@aihu-plugin/agent-readiness` was imported but never declared as a
    dependency; `packages/shared`'s moon task independently hardcoded
    `tsc --noEmit` (moon tasks bypass `package.json` scripts entirely), which
    silently skipped writing the `dist/index.d.ts` that `apps/web`'s project
    reference needs, and there was no `deps:` ordering between the two
    `typecheck` tasks so they could race even after that was fixed; and
    `apps/web` had no `vite.config.ts`, no `index.html`, and no `vite`
    dependency at all — the client build was never wired up. Added the missing
    dependency, fixed the moon task graph, added a client-only
    `vite.config.ts` + `index.html` (mirroring `examples/cf-adapter`'s
    working pattern), and pointed `wrangler.toml`'s `main` at the Workers
    entry's TS source directly (wrangler bundles it with its own esbuild step)
    instead of a `vite build`-produced file that nothing ever emitted. Removed
    a dead `import './aihu-app.aihu'` from the Workers entry — a `.aihu` file
    has no place in a wrangler-bundled server module, and the component is
    already mounted client-side via `index.html`.
  - The scaffold DX-matrix harness itself (`packages/cli/tests/
scaffold-matrix-e2e.ts`) passed `--port N --strictPort` to every package
    manager the same way, but pnpm forwards the literal `--` separator into
    the child process argv unlike npm/bun (confirmed empirically) — so vite
    saw `-- --port N` and kept its default port, timing out every
    `<template> × pnpm · dev` cell. Added pnpm to the existing yarn special
    case in `pmRunArgs`.

## 3.0.2

### Patch Changes

- [#596](https://github.com/fellwork/aihu/pull/596) [`e7dcd25`](https://github.com/fellwork/aihu/commit/e7dcd250cdf52c49cbbfc9f32ad6dd91af78f889) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Fix unsatisfiable dependency pins — the scaffolded project could not install.

  `apps/web/package.json.tmpl` pinned six `@aihu/*` packages at `^0.2.0`, which
  no longer resolve:

  @aihu/adapter-cloudflare ^0.2.0 -> published 8.0.0
  @aihu/arbor ^0.2.0 -> published 4.0.0
  @aihu/runtime ^0.2.0 -> published 5.0.0
  @aihu/router ^0.2.0 -> published 0.4.2
  @aihu/server ^0.2.0 -> published 0.4.1
  @aihu/signals ^0.2.0 -> published 0.5.0

  `aihu app --template cf-team` therefore produced a project whose very first
  command failed:

  FAILED pm-install: bun install exited with status 1
  error: No version matching "^0.2.0" found for specifier "@aihu/arbor"
  (but package exists)

  Switched to `latest`, matching the convention the agent template already uses.
  Verified end to end outside the monorepo: scaffold completes and
  `bun install` exits 0 with zero resolution errors.

## 3.0.1

### Patch Changes

- [#203](https://github.com/fellwork/aihu/pull/203) [`a6f9b53`](https://github.com/fellwork/aihu/commit/a6f9b536620115e0e3bed8551c165d4634aed7f8) Thanks [@srmcguirt](https://github.com/srmcguirt)! - fix(cli-templates): bring all scaffolder grammar to v1 (compiler@0.4.0) so a freshly scaffolded project compiles clean

  Every scaffold path previously emitted stale grammar that the v1 compiler rejects, so each new aihu project started broken:

  - `create-aihu` / `aihu app` (`packages/cli/src/index.ts`): `$on:click={…}` (C305) → `$on.click={…}`; `{{ count }}` → `{count}`.
  - `aihu app` legacy + `APP_INDEX_SCRIBE` (`commands/app.ts`, `templates/app.ts`): bare `$prop name: T = d` → collection-form `$prop: { name: { default, type } }`; `{{ name }}` → `{name}`.
  - `aihu component` (`index.ts`): comment-only `<div>` body ("expected tag name") → a real heading element.
  - `@aihu/templates-cf-team` (`live-counter.aihu`, `expose.aihu`, `app.aihu`): bare `@state` entries → collection-form `$prop`/`$action`; removed `@agent { $expose / $describe }` (C440) → per-entry `expose:` / `describe:` on `@state` macros (the v2 agent surface); `{{ … }}` → `{ … }`.

  Adds a scaffold-AND-compile guard (`scaffold-compile-clean.test.ts`) that scaffolds every path and runs the current `aihu-compile` on each emitted `.aihu`, asserting zero compile errors — the regression class the prior file-presence harness silently passed.

- Updated dependencies [[`a6f9b53`](https://github.com/fellwork/aihu/commit/a6f9b536620115e0e3bed8551c165d4634aed7f8)]:
  - @aihu/cli@0.5.1

## 3.0.0

### Patch Changes

- Updated dependencies [[`faca280`](https://github.com/fellwork/aihu/commit/faca2804cf62c05ffc90ef867faa2058b5e267ad)]:
  - @aihu/cli@0.5.0

## 2.0.0

### Patch Changes

- Updated dependencies [[`7577bd1`](https://github.com/fellwork/aihu/commit/7577bd10f391b9f3996048371706c9be34b08e2e)]:
  - @aihu/cli@0.4.0

## 1.0.0

### Minor Changes

- [#86](https://github.com/fellwork/aihu/pull/86) [`86af1be`](https://github.com/fellwork/aihu/commit/86af1beb2b34cd0dc270fdd9ad8ba1de4d19de90) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Adds the `@aihu/templates-*` family as a separate package family (per arch-6 §13 Q2 RESOLVED). `@aihu/cli` ships the template-manifest contract, scaffold pipeline, conditional-eval evaluator, hand-rolled prompts library, and `KNOWN_TEMPLATES` baked registry. `@aihu/templates-cf-team` is the first published template — Cloudflare Workers + bun workspaces + moon + better-auth (default) | kinde | supabase. Backward-compatible: `aihu app foo` (no flags) produces byte-identical output to today.

### Patch Changes

- [#94](https://github.com/fellwork/aihu/pull/94) [`8e258e7`](https://github.com/fellwork/aihu/commit/8e258e7b12fbb1ad1a1942d42606fc889dc94f25) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Fix `bunx @aihu/cli --template cf-team` on Windows (Node.js runtime path).

  `bunx` resolves the `#!/usr/bin/env node` shebang and runs the CLI under Node.js,
  which cannot dynamically import `.ts` files. `loadTemplateConfig` was silently
  swallowing the import error and throwing a misleading "file not found" message even
  when `template.config.ts` was present on disk.

  - `@aihu/templates-cf-team`: ship compiled `template.config.js` alongside the
    TypeScript source so Node.js falls back to the JS module. Bun still prefers `.ts`.
  - `@aihu/cli`: surface the last import error in the `loadTemplateConfig` throw
    message so future failures are immediately diagnosable.

- Updated dependencies [[`86af1be`](https://github.com/fellwork/aihu/commit/86af1beb2b34cd0dc270fdd9ad8ba1de4d19de90), [`8e258e7`](https://github.com/fellwork/aihu/commit/8e258e7b12fbb1ad1a1942d42606fc889dc94f25)]:
  - @aihu/cli@0.3.0
