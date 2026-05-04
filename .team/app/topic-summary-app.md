# Topic Summary — @scribe/app V0

**Date:** 2026-05-04
**Status:** Planning complete (S1-S3, A1-A4). Pending user sign-off on 4 open questions before Builder dispatch.

---

## 1. Goal

`@scribe/app` V0 ships a single package that eliminates all userland bootstrap boilerplate from scribe SPA projects. Today's `examples/blog-router/src/main.ts` is 44 lines of pure framework ceremony — router instantiation, outlet lookup, render loop, click interceptor, popstate listener, and 404 fallback — none of it user logic. After V0, `src/main.ts` becomes two lines (`import { createApp } from '@scribe/app/client'` / `createApp()`), `vite.config.ts` collapses to `plugins: [scribe()]`, and the CLI scaffold stops exposing `_setMount`/`_setSignal` internal APIs in generated code.

---

## 2. V0 Scope Boundary

**IN V0:**
- `@scribe/app` package with two entry points: main (build/config) and `/client` (browser runtime)
- `defineConfig(config: ScribeConfig): ScribeConfig` — typed identity with lightweight validation
- `ScribeConfig` interface: `dir`, `output` (spa only), `plugins`, `runtimeConfig`, `app.head`, `vite`, `agentReadiness`
- `scribe()` Vite plugin composer — returns `Plugin[]` composing compiler + router + agent-readiness sub-plugins
- `viteAppPlugin()` — resolves `virtual:scribe-config` virtual module at build/dev time
- `createApp(): void` — full SPA bootstrap (outlet lookup, router wiring, render loop, click interceptor, popstate, 404 fallback)
- Route param protocol: flat per-attribute `setAttribute` replacing old JSON `route` blob
- `MatchResult.pathname` addition to `@scribe/router`
- `RouteSidecar.params` addition to `@scribe/router`
- `.size-limit.json` row for `packages/app/dist/client.js` (400 B, peers excluded)
- CLI scaffold update: `appMainTs()` emits 2-line `createApp()` call; scaffold `vite.config.ts` uses `scribe()`
- `blog-router` example migration: 44-line `main.ts` replaced; `vite.config.ts` updated

**DEFERRED to V1+:**
- `output` modes other than `'spa'` (`ssr`, `static`, `hybrid`)
- `loadConfigFromFile` auto-reading of `scribe.config.ts` (V1 via Vite's `loadConfigFromFile` utility)
- `createApp(overrides?)` optional argument / `AppInstance` return type with `navigate()`/`destroy()`
- Adapters (`ScribeConfig.adapter` field)
- `_injectAutoWiring` removal from compiler plugin (gated on `__SCRIBE_APP__` build define)
- `@scribe/server`/`@scribe/app` config unification
- `private` runtimeConfig enforcement (server-only; V0 accepts but ignores)

---

## 3. Package Structure

**Location:** `packages/app/`

```
packages/app/
  src/
    index.ts          — exports: defineConfig, type ScribeConfig, type ScribeAppConfig, viteAppPlugin
    client.ts         — exports: createApp(): void  (browser-only, DOM APIs)
    config.ts         — ScribeConfig interface, ScribeConfigError, defineConfig validation
    types.ts          — ScribeAppConfig interface (used by virtual:scribe-config shape)
    vite-plugin.ts    — scribe() composer + viteAppPlugin() factory
    virtual.d.ts      — ambient declare module 'virtual:scribe-config'
  package.json        — exports map: "." → dist/index.js, "./client" → dist/client.js
                        peerDeps: @scribe/router, @scribe/arbor, @scribe/signals, @scribe/runtime
                        devDeps: @scribe/agent-readiness (type-only in config.ts)
                        sideEffects: false
  rolldown.config.ts  — two entry points; all workspace deps external
  tsconfig.json       — inherits root
  moon.yml            — copy from packages/plugin/moon.yml
```

**Size policy:** `@scribe/app/client` is browser-eligible. `.size-limit.json` row: path `packages/app/dist/client.js`, limit `400 B` gzip, ignoring peer packages. The main entry (`dist/index.js`) is build-time only — no size row (per `.size-limit.README.md` policy).

---

## 4. Key Design Decisions

**ScribeConfig shape (A1)**
Flat top-level fields with semantic sub-objects. `output: 'spa'` is the only valid V0 value — `defineConfig` throws `ScribeConfigError('INVALID_OUTPUT_MODE')` for anything else. No Zod dependency; inline validation only. `vite` passthrough field type is `Omit<UserConfig, 'plugins'>` — prevents plugin duplication. `plugins` field holds user Vite plugins appended after framework plugins. `agentReadiness` field is the A2-required opt-in hook.

**`scribe()` return type: `Plugin[]` (A2)**
Three structurally independent plugins (compiler, router, agent-readiness) each with their own `name`, hooks, and lifecycle. Merging into one plugin object requires internal hook multiplexing with no benefit. Returning `Plugin[]` is idiomatic — Vite flattens it, Nuxt/Analog use the same pattern, and the plugin inspector shows three named entries (debugging advantage, not penalty).

**Agent readiness: opt-in via `agentReadiness` field (A2)**
`viteAgentReadinessIntegration` requires `{ name: string }` — no safe default. When `agentReadiness` is absent or `false`, a no-op plugin named `'scribe-agent-readiness-disabled'` is substituted.

**Config reading: inline-only for V0 (A2)**
Auto-reading `scribe.config.ts` at `plugins:[]` evaluation time is synchronous — `loadConfigFromFile` is async. Config lives inline in `vite.config.ts` via `scribe(config?)`. `scribe.config.ts` is a user-facing authoring convention that reaches the plugin via explicit import, not magic file-reading.

**Outlet: hard `id="outlet"` convention (A3)**
`createApp()` reads `config.outletId ?? 'outlet'`. Missing outlet throws — never silently no-ops. The CLI scaffolder already emits `<div id="outlet"></div>`.

**`createApp()` return: `void` (A3)**
Fire-and-forget for V0. `AppInstance` with `navigate()`/`destroy()` deferred to V1.

**Route param protocol: flat per-attribute vs JSON blob (A4)**
New protocol: one `setAttribute(key, val)` per param — matches Web Component conventions. `mountRoute(match, outlet)` loops `match.params` entries. Compiler reads `$prop` declarations + `@route { params: [...] }` and emits `observedAttributes` + signal wiring. `.route.json` sidecar gains `"params": ["slug"]`.

**`_setMount`/`_setSignal` ownership (A3)**
`createApp()` calls both once at startup. Idempotent (null-guards in `define-component.ts:7,33`). Compiler plugin's `_injectAutoWiring` stays as fallback for V0 — double-call is zero-cost.

---

## 5. Implementation Map

### Files to create

| File | Purpose |
|---|---|
| `packages/app/src/config.ts` | `ScribeConfig`, `ScribeConfigError`, `defineConfig()` |
| `packages/app/src/types.ts` | `ScribeAppConfig` (virtual module shape) |
| `packages/app/src/vite-plugin.ts` | `scribe()` + `viteAppPlugin()` |
| `packages/app/src/client.ts` | `createApp(): void` |
| `packages/app/src/index.ts` | Re-exports |
| `packages/app/src/virtual.d.ts` | Ambient `virtual:scribe-config` declaration |
| `packages/app/package.json` | Exports map, peerDeps, sideEffects: false |
| `packages/app/rolldown.config.ts` | Two entries, all deps external |
| `packages/app/tsconfig.json` | Inherits root |
| `packages/app/moon.yml` | Copy from packages/plugin/moon.yml |

### Files to modify

| File | Change |
|---|---|
| `C:/git/fellwork/scribe/.size-limit.json` | Add `@scribe/app` row: `dist/client.js`, 400 B |
| `packages/router/src/router.ts` | Add `pathname: string` to `MatchResult` |
| `packages/router/src/vite-plugin.ts` | Add `params?: string[]` to `RouteSidecar` |
| `packages/cli/src/index.ts` | Update `appMainTs()` to 2-line `createApp()` |
| `examples/blog-router/src/main.ts` | Replace 44 lines with 2-line `createApp()` import |
| `examples/blog-router/vite.config.ts` | Swap to `scribe()` composed plugin |
| `examples/blog-router/package.json` | Add `@scribe/app` dependency |
| `package.json` (root) | Add `packages/app` to workspace list if explicit |
| Rust compiler | Emit `"params"` array in `.route.json` from `$prop` + `@route` |

---

## 6. Open Questions for User Decision

**Q1 — `createApp()` signature**
A3 specifies zero-arg (reads `virtual:scribe-config`). A1 director note prefers Option B: `createApp(config)` accepts inline config. These are in conflict. Confirm for V0: zero-arg virtual module (A3) or inline-arg (A1 director preference).

**Q2 — Vite plugin name: `scribe()` vs `viteScribePlugin()`**
`scribe()` is terse and matches the framework name. `viteScribePlugin()` is more explicit about the Vite context. This is a public API — confirm the export name.

**Q3 — `adapter` field reservation**
Reserve `adapter?: null` in `ScribeConfig` now (prevents breaking change at V1+) vs keep interface minimal for V0?

**Q4 — `agentReadiness` vs `agent` field name**
A2 recommends `agentReadiness` to avoid confusion with `@scribe/agent` (the registry package). Confirm.

---

## 7. Builder Pre-Conditions

- [ ] User confirms answers to Q1-Q4 above
- [ ] Q1 (createApp signature) is a hard dependency — `src/client.ts` implementation differs substantially
- [ ] A4 Rust compiler change (`"params"` in `.route.json`) can be in the same PR as the JS client
- [ ] Clean baseline: all 620 TS + 232 Rust tests pass before first Builder commit

---

## 8. Do-Not-Break List

- `packages/server/src/config.ts` — do not delete `ScribeConfig`/`defineScribeConfig` (new `defineConfig` lives at `@scribe/app`, not `@scribe/server`)
- `packages/router/src/vite-plugin.ts` — `viteRouterIntegration` must remain directly importable (composition is additive)
- `packages/compiler/js/index.ts` — `_injectAutoWiring` must NOT be removed in V0
- `examples/blog-router/` — must compile and run after migration (primary integration test target)
- All 620 TS + 232 Rust tests must pass post-implementation
- No existing `.size-limit.json` row may increase (new `@scribe/app` row is additive)
- `packages/runtime/src/define-component.ts` null-guards at lines 7 and 33 must stay until `_injectAutoWiring` removal is explicitly approved
