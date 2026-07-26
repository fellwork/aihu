# @aihu/templates-cf-team

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
