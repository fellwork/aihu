---
'@aihu/app': minor
'@aihu/cli': minor
---

Config lives in `vite.config.ts`; the CLI reads it from there

The scaffold no longer emits a separate `aihu.config.ts`. Everything aihu is
configured with goes inline on `viteAihuPlugin({...})` in `vite.config.ts`, and
non-Vite consumers read it back from there.

A second config file is justified exactly as long as something other than Vite
needs the config and cannot parse the Vite config. That was SvelteKit's stated
reason for `svelte.config.js` in 2022 — the language server had to know your
preprocessors and does not run Vite. SvelteKit then removed the reason rather
than living with it: once the language server could read `vite.config.js`, the
second file became optional, and SvelteKit 3 makes the Vite config the required
location.

**New in `@aihu/app`:**

- `viteAihuPlugin()` registers an `aihu:config` marker plugin carrying the
  evaluated config on a public `api` handle.
- `loadAihuConfig(root)` reads it back through Vite's own `loadConfigFromFile`
  — no build. Returns the config, its source path, Vite's dependency list, and
  every registered aihu module's options.
- `declareAihuModule()` + `collectAihuModules()`: the contract by which any
  package becomes readable by the CLI and the language server without a central
  registry to update.
- `viteAihuPlugin()` now validates its inline argument. Only `defineConfig` did
  before, so the path every example uses was unvalidated. Unknown keys throw
  with a keypath and a did-you-mean.
- New options that previously required abandoning `viteAihuPlugin` and wiring
  the underlying plugin by hand: `dir.components`, `compiler.islands`,
  `compiler.target`, `build.bundler`, `dev.*`, `typecheck.*`.

**In `@aihu/cli`:** `aihu build` and `aihu dev` each had a private loader that
dynamic-imported `aihu.config.ts` with its own local interface. They now share
one loader that prefers `vite.config.ts` and falls back to `aihu.config.ts`, so
existing projects keep working.

**Also:** the scaffolded config declares no MCP `endpoint`. The previous one
pointed `endpoint` at the server card's own URL, publishing a card that
advertised zero tools and named the discovery document as its own transport.
A static client build has no process to serve MCP, so no card is emitted.
