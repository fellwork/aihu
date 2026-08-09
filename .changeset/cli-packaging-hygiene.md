---
'@aihu/cli': minor
'create-aihu': patch
'@aihu/templates-cf-team': patch
---

Export `@aihu/cli/template-manifest`, and declare the Node floor both bins require.

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
