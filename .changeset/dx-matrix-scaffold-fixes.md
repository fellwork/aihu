---
'@aihu/cli': patch
'@aihu/templates-cf-team': patch
---

Fix four scaffold DX-matrix failures found via the CI matrix that exercises every built-in template across bun/npm/pnpm/yarn:

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
