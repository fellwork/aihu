---
"@aihu/cli": patch
"@aihu/templates-cf-team": patch
---

fix(cli-templates): bring all scaffolder grammar to v1 (compiler@0.4.0) so a freshly scaffolded project compiles clean

Every scaffold path previously emitted stale grammar that the v1 compiler rejects, so each new aihu project started broken:

- `create-aihu` / `aihu app` (`packages/cli/src/index.ts`): `$on:click={…}` (C305) → `$on.click={…}`; `{{ count }}` → `{count}`.
- `aihu app` legacy + `APP_INDEX_SCRIBE` (`commands/app.ts`, `templates/app.ts`): bare `$prop name: T = d` → collection-form `$prop: { name: { default, type } }`; `{{ name }}` → `{name}`.
- `aihu component` (`index.ts`): comment-only `<div>` body ("expected tag name") → a real heading element.
- `@aihu/templates-cf-team` (`live-counter.aihu`, `expose.aihu`, `app.aihu`): bare `@state` entries → collection-form `$prop`/`$action`; removed `@agent { $expose / $describe }` (C440) → per-entry `expose:` / `describe:` on `@state` macros (the v2 agent surface); `{{ … }}` → `{ … }`.

Adds a scaffold-AND-compile guard (`scaffold-compile-clean.test.ts`) that scaffolds every path and runs the current `aihu-compile` on each emitted `.aihu`, asserting zero compile errors — the regression class the prior file-presence harness silently passed.
