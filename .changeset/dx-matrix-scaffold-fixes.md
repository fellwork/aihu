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
