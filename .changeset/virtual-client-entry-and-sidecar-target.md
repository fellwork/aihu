---
'@aihu/app': minor
'@aihu/cli': minor
'@aihu/tsc': minor
'@aihu/compiler': patch
'@aihu/language-server': patch
---

Eliminate the need for a scaffolded `src/main.ts` in the common case, and fix a real typecheck/build divergence uncovered along the way.

- `@aihu/app`: `viteAihuPlugin()` gained an `aihu-entry` sub-plugin
  (`packages/app/src/entry.ts`) that serves `virtual:aihu-entry` — a
  byte-identical stand-in for the old boilerplate `src/main.ts`
  (`import { createApp } from '@aihu/app/client'; createApp()`) — and
  injects its `<script>` tag into `index.html` whenever no real
  `src/main.ts` exists on disk. A project that needs `createApp(options)`
  (`provide`, `outletId`, a non-default `head`) still writes a real
  `src/main.ts`, which makes the virtual entry step aside entirely (full
  eject, not a partial override — mirrors how framework-owned client entries
  work elsewhere, and keeps `provide` where comparable frameworks keep it:
  code, not declarative config, since it holds live values that can't be
  serialized into generated source).
- `@aihu/cli`: `appMainTs`/`appIndexHtml` (the `minimal`/`docs` templates)
  stop emitting `src/main.ts` and its `<script>` tag — the virtual entry
  above covers it. `AGENTS.md`'s generated project-map table updated to
  match.
- `@aihu/compiler`: `compileSidecar()` gained a `target` option
  (`'client' | 'server' | 'universal'`), mirroring what `transform()` already
  passes as `--target`. Previously the sidecar (the type-check surface
  `aihu-tsc` and the language server hand to TypeScript) always compiled
  against the binary's `universal` default regardless of what a project's
  `vite.config.ts` actually configured — a real divergence, since `--target`
  changes what the sidecar is derived from (e.g. a `target: 'client'` build
  elides server-only artifacts). `islands`/`shadowMode` are deliberately NOT
  added here: both are JS-side post-processing on the runtime JS output only
  and have no bearing on the sidecar's types.
- `@aihu/tsc`: `run()`/`aihu-tsc` now read `AihuConfig.compiler.target` and
  `AihuConfig.typecheck.strictTemplates` from the project's `vite.config.ts`
  (new `loadTscProjectConfig()`, invoked from `bin/aihu-tsc.mjs` since
  `run()` itself stays synchronous) and thread `target` into `compileSidecar`
  — closing the gap above for the common `"typecheck": "aihu-tsc"` scaffold
  script, which is invoked with no flags and had no other way to see that
  config.
- `@aihu/language-server`: reads the same `compiler.target` from the
  workspace root (best-effort — a client that gives no workspace root, or a
  project with no `vite.config.ts`, behaves exactly as before), so editor
  diagnostics match `aihu-tsc`'s and CI's.
