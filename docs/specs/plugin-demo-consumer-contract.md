# `@aihu/plugin-demo` — Consumer Contract

> **DRAFT — pending A2 review** (round 1 of M2-A3, 2026-05-27)

**Owner:** A3 Architect · **Consumer:** A2 (EX-11 — `@aihu/plugin-demo` package)
**Source:** arch-3 §5 M2 phased delivery · A3 round-1 Director note §3.5

---

## Purpose

`@aihu/plugin-demo` is the canonical proof-of-life for the plugin API. It
must exercise every entry point a real plugin uses (macros, middleware,
transforms, route-handler factories, runtime exports, build hooks) without
domain logic — its only job is to prove the contract holds end-to-end. A2
ships it as part of EX-11 and the test suite blocks M2 closeout when any
pattern fails.

This contract pins which patterns the demo MUST exercise, in what shape,
and what the round-2 Builder owes for "complete." It does NOT prescribe
demo content (a Builder may pick a `$greeting` macro that lowers to a
`<span>Hello</span>` block — fine — as long as every required pattern is
exercised somewhere in the package).

---

## Required patterns

### 1. `definePlugin({...})` registration

```ts
import { definePlugin, type Plugin } from '@aihu/plugin'

export function demo(options?: DemoOptions): Plugin { /* … */ }
```

What to show:
- A macro contribution (`Macro` per `packages/plugin/src/index.ts:140-151`)
  with `name`, `validIn`, `lowering`. Validation optional but recommended.
- A middleware contribution (`Middleware` per
  `packages/plugin/src/index.ts:178-183`) — `name`, `stage`, `handler`.
- A transform contribution (`Transform` per
  `packages/plugin/src/index.ts:167-170`) at any stage.

### 2. Route-handler factory export

```ts
import type { RouteHandler } from '@aihu/server'

export function createDemoRoutes(config: DemoOptions): {
  readonly demoEndpoint: RouteHandler
} { /* … */ }
```

What to show:
- Follows the canonical pattern from
  `packages/plugin-agent-readiness/src/vite-plugin.ts:43-142`
  (`createAgentReadinessRoutes`).
- Returns a record of `RouteHandler` typed against `@aihu/server`.
- Consumer app wires via `defineRoute('/<path>', demoRoutes.demoEndpoint)`
  inside `createRequestRouter`.

### 3. Runtime export from package entry point

```ts
// packages/plugin-demo/src/index.ts
export { demo } from './plugin.ts'                  // build-time factory
export { createDemoRoutes } from './routes.ts'      // route-handler factory
export { createDemoRuntime } from './runtime.ts'    // runtime API
export type { DemoOptions, DemoResource } from './types.ts'
```

What to show:
- Runtime function (e.g., `createDemoRuntime`) exported directly from
  package entry — matches the precedent set by `@aihu-plugin/data` at
  `packages/plugin-data/src/index.ts:21-25` (`createResource`,
  `createResourceStore`, `ResourceStoreToken` — all direct package
  exports, NOT plugin-contract slot contributions).
- Has at least one reactive surface using `@aihu/signals` so the runtime
  side actually participates in the framework's reactive contract.

### 4. Consumer app wiring

```ts
// apps/<demo>/aihu.config.ts
import { defineAihuConfig } from '@aihu/server'
import { demo } from '@aihu/plugin-demo'

export default defineAihuConfig({
  plugins: [demo({ /* options */ })],
})
```

```ts
// apps/<demo>/src/routes.ts (illustrative)
import { createRequestRouter, defineRoute } from '@aihu/server'
import { createDemoRoutes } from '@aihu/plugin-demo'

const demoRoutes = createDemoRoutes({ /* options */ })

export const router = createRequestRouter({
  routes: [
    defineRoute('/__demo/ping', demoRoutes.demoEndpoint),
  ],
})
```

What to show:
- Use `defineAihuConfig` from `@aihu/server` (per
  `packages/server/src/config.ts:150-155`).
- Register `demo()` in `plugins: []`.
- Wire route handlers via `defineRoute` + `createRequestRouter` (per
  `packages/server/src/router.ts:34-90`).

### 5. Test exercising build-time AND runtime

```ts
import { describe, expect, test } from 'vitest'
import { demo, createDemoRoutes, createDemoRuntime } from '@aihu/plugin-demo'

describe('@aihu/plugin-demo', () => {
  test('definePlugin shape is valid', () => {
    const plugin = demo()
    // assert plugin.__aihu_plugin === true, plugin.namespace stable, etc.
  })

  test('createDemoRoutes returns RouteHandler-shaped handlers', async () => {
    const routes = createDemoRoutes({ /* … */ })
    const res = await routes.demoEndpoint(new Request('http://x/__demo/ping'), {
      params: {}, url: new URL('http://x/__demo/ping'),
    })
    // assert response status / body
  })

  test('createDemoRuntime drives a signal end-to-end', () => {
    // runtime exercise
  })
})
```

What to show:
- One test asserts the plugin object validates (`validatePlugin` returns
  `{ ok: true }`).
- One test invokes a route handler with a `Request` + minimal
  `RouteContext` and asserts the response.
- One test exercises the runtime export with `@aihu/signals` reads/writes.

---

## File layout expectation

```
examples/plugin-demo/                 # consumer app (A2 EX-11 ships this)
├── aihu.config.ts                  # registers demo() in plugins: []
├── package.json                      # depends on @aihu/plugin-demo, @aihu/server
├── src/
│   ├── routes.ts                     # wires createDemoRoutes into createRequestRouter
│   └── main.ts                       # app entry (illustrative — may be empty/placeholder)
└── README.md                         # how to run, what to expect

packages/plugin-demo/                  # the plugin itself
├── package.json                       # name @aihu/plugin-demo, version 0.1.0
├── install-manifest.json              # per docs/specs/plugin-install-manifest.md
├── src/
│   ├── index.ts                       # public exports per Pattern 3 above
│   ├── plugin.ts                      # definePlugin({...}) factory
│   ├── routes.ts                      # createDemoRoutes
│   ├── runtime.ts                     # createDemoRuntime
│   └── types.ts                       # DemoOptions etc.
├── tests/
│   └── plugin-demo.test.ts            # per Pattern 5
└── tsconfig.json
```

**Note on consumer app location:** `examples/` (not `apps/`) is the
recommended directory — `apps/` is reserved for production consumer apps
like `apps/docs`. A2 may select `apps/plugin-demo/` if their EX-11 spec
already commits to that path; either is acceptable.

---

## Acceptance criteria (what A2 ships for EX-11)

A2's EX-11 deliverable satisfies this contract when:

- [ ] `packages/plugin-demo/src/index.ts` exports a `demo` factory returning
      a valid `Plugin` (`validatePlugin(demo())` returns `{ ok: true }`).
- [ ] The plugin's `contributes` field exercises macros, middleware, AND
      transforms (all three; at least one entry each).
- [ ] `createDemoRoutes(config)` exists, returns at least one `RouteHandler`,
      and is wired into the example app's `createRequestRouter`.
- [ ] A runtime export from the package entry point uses `@aihu/signals` —
      proves Pattern 3 (runtime exports = plain ESM, no plugin-contract slot).
- [ ] `examples/plugin-demo/aihu.config.ts` registers `demo()` via
      `defineAihuConfig({ plugins: [demo()] })`.
- [ ] Test suite passes (`bun run test`) AND exercises build-time
      (`validatePlugin`), route-handler (Request → Response), and runtime
      (signal read/write) surfaces.
- [ ] `packages/plugin-demo/install-manifest.json` exists per
      `docs/specs/plugin-install-manifest.md` (Appendix A) so `aihu add
      @aihu/plugin-demo` (when A4 lands) works end-to-end.
- [ ] No non-`@aihu/*` runtime dependencies (dep-free thesis).
- [ ] Package is server / build-only OR adds a `.size-limit.json` row
      if it ships any browser-eligible runtime code. (Recommended:
      keep the demo runtime trivially small and add a row only if needed.)

A2 owns the implementation; A3 owns the contract. Round-2 Architect
dispatch reviews A2's first draft and amends this spec where the contract
proved under-specified.

---

**End of DRAFT spec.** A2 reviews this before EX-11 implementation lands;
round-2 A3 Architect dispatch may amend pending A2 feedback.
