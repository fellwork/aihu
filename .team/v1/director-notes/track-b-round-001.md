# Director Note — Track B Round 1
**Date:** 2026-04-30
**Track:** `track-b`
**Topic:** v1 Context + Data packages
**Plans in scope:** 2.1 (`@aihu/context`) + 2.2 (`@aihu/data`)
**Branch:** `feat/v1-context-data` (not yet created)
**Round:** 1 (session start)

---

## 1. Priority order

**2.1 must land before 2.2.** `@aihu/data`'s `createResource` depends on context injection to discover its cache store; this is a hard import-time dependency. There is no viable way to stub `@aihu/context` out and ship `@aihu/data` independently.

**However**, the following 2.2 work can proceed in parallel with 2.1 build:
- Type design for `DataState<T>` and `ResourceOptions<T>` — these have no dependency on the context runtime, only on `@aihu/signals` shapes.
- SSR dehydration interface design: `{ ssr: true }` opt-in flag, serialized key format, `__aihu_data__` script tag shape.
- Package scaffold (package.json, tsconfig, rolldown config, moon.yml) for `packages/data/` — infra-only, no source yet.

The Scout and Architect can work on 2.2 design artefacts while the Builder implements 2.1.

---

## 2. OQ assessment

### OQ-V3: Context propagation — DOM attribute traversal vs. custom element registry

**Spec recommendation:** DOM attribute traversal (walk `element.closest('[data-aihu-ctx]')` or similar).

**Assessment: BLOCKS BUILD — Architect pass required.**

The propagation mechanism has a critical SSR incompatibility. During `renderToString` in `packages/server/src/ssr.ts`, there is no DOM. The server-side render path is a plain tree walk over a `{ kind: 'branch' | 'leaf', ... }` object graph — `document`, `Element.closest`, and `parentNode` do not exist. DOM attribute traversal cannot work for SSR context propagation.

Three alternatives exist and the spec does not adjudicate between them:

| Option | SSR safe? | Complexity |
|---|---|---|
| A. Implicit stack (module-level `ContextStack` during render) | Yes — same pattern as React's context | Medium — need push/pop protocol |
| B. Explicit context map threaded through render arguments | Yes — purely functional | High — changes `renderToString` signature |
| C. DOM attribute traversal only; SSR context not supported in v1 | Partial — only breaks SSR for context-bearing components | Low — acceptable if SSR+context is explicitly out of scope for v1 |

The spec does not state whether SSR + context is a v1 requirement. This is an authorial product decision. **An Architect cannot make this call; it requires a Team Lead adjudication before the Builder starts.**

Specific question to surface: "Must `renderToString` support components that call `inject()` in v1?"

### OQ-V4: `createResource` cache — module-level singleton vs. context-provided store

**Spec recommendation:** context-provided store.

**Assessment: SUFFICIENT to build against, with one clarification needed.**

Context-provided store is the correct choice for SSR isolation: each `renderToString` call gets its own context tree and thus its own cache instance. A module-level singleton would bleed across concurrent requests in a Worker or Node multi-request scenario.

The one clarification the Builder needs before starting 2.2: what is the cache key? The spec presumably uses the resource identity (the `fetcher` function reference, or an explicit key string), but this is not stated in the prompt. This is a minor spec gap, not a blocker for 2.1 — but the Architect must specify it before 2.2 Builder work begins.

**OQ-V4 resolution recommendation:** context-provided cache store, keyed by an explicit string `key` field on `ResourceOptions<T>`. Justification: function-reference keys are not serialization-friendly; string keys enable dehydration.

### OQ-V6: SSR dehydration — opt-in vs. automatic

**Spec recommendation:** opt-in (`{ ssr: true }` in `ResourceOptions`).

**Assessment: SUFFICIENT to build against. No Architect pass needed.**

Opt-in is clearly correct for v1: automatic dehydration would require the SSR renderer to know which resources exist, which requires either a global registry (SSR-unsafe) or threading resource discovery through the render tree. Both are more complex than a simple opt-in flag.

The integration point with the existing `ssr.ts` is already wired: `SsrOptions.serializer?: () => Record<string, unknown>` is the injection point. A `renderToString` caller can pass `serializer: () => resourceStore.dehydrate()` to emit the `<script id="__aihu_state__">` tag. This path works today; 2.2 just needs to provide a `dehydrate()` method on the context-provided store.

One gap: the spec must define the JSON shape inside `__aihu_state__`. A keyed object (`{ resources: { [key]: DataState<T> } }`) is the obvious choice but needs to be locked in by the Architect before the Builder writes the dehydration tests.

---

## 3. Spec gaps (plan 2.1 / 2.2)

The `.team/v1/` directory does not exist at session start — no `spec-v1-architecture.md` or `plan-v1-roadmap.md` are present on disk. All spec and plan files for Track B must be created before or during this session.

Given the prompt description of plan 2.1 and 2.2, the following gaps will block a Builder:

### Plan 2.1 (@aihu/context) gaps

1. **`createContext<T>` signature** — Is the token opaque (`ContextToken<T>`) or a string key? The injection lookup mechanism depends on this. If DOM traversal is selected, it's a data-attribute key (string). If stack-based, it's a symbol or object reference. Blocked by OQ-V3 resolution.

2. **`provide()` call site** — Where in the component lifecycle is `provide()` called? The `MountScope` doesn't expose a hook for pre-mount injection. Is `provide()` called inside a `mount()` callback, before `mount()`, or is it a decorator on a `Node`? This needs a concrete example in the spec.

3. **`inject()` call site** — Is `inject()` synchronous and available anywhere in a component's `setup` function? Or is it restricted to specific lifecycle phases? This matters for SSR: if `inject()` is called during `renderToString`'s tree-walk, the context must be available at that moment.

4. **Error behavior** — What happens when `inject()` is called and no provider exists? Throw? Return `undefined`? Return a default value specified at `createContext` time? Must be specified.

5. **Multiple providers** — Does `provide()` shadow or merge with a parent provider for the same token? Shadow (innermost wins) is the conventional answer, but the spec must say so.

### Plan 2.2 (@aihu/data) gaps

1. **Cache key type** — See OQ-V4 above. Needs an explicit `key: string` on `ResourceOptions<T>`.

2. **`DataState<T>` transition model** — What are the allowed states and transitions? Minimum: `{ status: 'pending' }`, `{ status: 'resolved', data: T }`, `{ status: 'error', error: unknown }`. Does a resolved resource go back to `pending` on refetch? Is there a `refreshing` state?

3. **`createResource` return type** — Returns a `Signal<DataState<T>>`? Or a richer object with `.refetch()`, `.mutate()`? The spec must state this explicitly; it determines the entire consumer API.

4. **Dehydration JSON shape** — See OQ-V6 above. Must be specified before dehydration tests are written.

5. **Fetcher function signature** — `(key: string) => Promise<T>` or `() => Promise<T>`? If key-based, the key is passed in. This determines the full resource consumer API.

---

## 4. New package setup checklist

Both `packages/context/` and `packages/data/` are brand-new. Based on the existing package patterns (`packages/signals/`, `packages/arbor/`, `packages/server/`), each new package needs:

- [ ] `packages/{name}/package.json` — `name`, `version: "0.0.0"`, `type: "module"`, `main`/`module`/`types` pointing to `./dist/index.js` / `./dist/index.d.ts`, `exports` map, `files: ["dist"]`, `sideEffects: false`, `scripts: { build, typecheck }`, and for `@aihu/data` a `dependencies: { "@aihu/context": "workspace:*", "@aihu/signals": "workspace:*" }`
- [ ] `packages/{name}/tsconfig.json` — extends `../../tsconfig.base.json`, `rootDir: "."`, `outDir: "dist"`, `noEmit: true`, includes `src/**/*.ts` and `tests/**/*.ts`
- [ ] `packages/{name}/rolldown.config.ts` — standard ESM config with `dts()` plugin, `minify: true`, input `src/index.ts`
- [ ] `packages/{name}/moon.yml` — `language: typescript`, `layer: library`
- [ ] `packages/{name}/src/index.ts` — public surface barrel
- [ ] `packages/{name}/tests/` — empty directory (vitest discovers from root config's `include` glob)
- [ ] `vitest.config.ts` — add `'@aihu/context'` and `'@aihu/data'` aliases in `resolve.alias` map
- [ ] `package.json` (root) — size-limit entry in `.size-limit.json` (if separate) or `"size-limit"` key — the root `package.json` currently has no `size-limit` key; the `bun run size` script uses `@size-limit/preset-small-lib` and reads from `.size-limit.json`. Check if a separate `.size-limit.json` exists; if so, add entries. See §10 of the v1 spec for the bundle budget for each package.
- [ ] `packages/{name}/dist/` — created by first build; do not create manually

**Note on size-limit**: The root `package.json` does not have a `"size-limit"` key. The `bun run size` command reads from a separate config. The size-limit entries already exist at root level (the `ls` output showed the JSON blob). The Builder must add entries for `@aihu/context` and `@aihu/data` in whatever file that config lives in (likely `.size-limit.json` or `package.json` — the Scout must confirm).

---

## 5. Scout brief

The Scout must verify the following before the Architect writes a spec and the Builder starts:

### 5a. Signal primitive usage patterns
- Read `packages/signals/src/index.ts` and at least one consumer (`packages/arbor/src/mount.ts`, `packages/runtime/src/define-component.ts`) to confirm: is `effect()` used for reactive subscriptions inside component setup? How does a v0 component consume a signal today? This confirms whether `inject()` returning a `Signal<T>` is the right shape.
- Confirm whether `$state()` / `State<T>` from signals is used anywhere beyond its definition. If unused by any package, it may serve as a model for `DataState<T>`.

### 5b. Export patterns
- All existing `packages/*/src/index.ts` use barrel re-exports. Confirm this is the expected pattern for `@aihu/context` and `@aihu/data`.
- Confirm that `@aihu/context` should NOT depend on `@aihu/arbor` (no DOM types, no `Node`/`Branch`/`Leaf`). Context must be DOM-free to support SSR.
- Confirm that `@aihu/signals` is the only v0 dependency for `@aihu/context`.

### 5c. SSR dehydration extensibility
- Read `packages/server/src/ssr.ts` (already read by Director) and confirm: the `SsrOptions.serializer?: () => Record<string, unknown>` field is the injection point for data dehydration. The `__aihu_state__` script tag is already emitted if `serializer` is provided. No changes to `ssr.ts` are needed for the basic dehydration path — the store just needs to implement `() => Record<string, unknown>`.
- Confirm whether `packages/server/src/data.ts` already exists (`packages/server/src/index.ts` exports `defineLoader` from it). Read `defineLoader`'s shape — this is the existing server-side data loading primitive. `@aihu/data`'s `createResource` is the *client*-side counterpart; they must be compatible in naming/shape conventions.

### 5d. MountScope lifecycle
- Confirm from `packages/arbor/src/mount.ts` that `mount()` accepts no options object today (no context parameter). If context propagation uses DOM traversal, no changes to `mount()` are needed. If stack-based, `mount()` must accept an optional context map or the context system must push/pop around `mount()` externally.
- Confirm whether `AgentContext` (the `_frozenAgent` stub on `MountScope`) is intended to become the v1 context carrier, or whether context is a separate system.

### 5e. Vitest aliases
- Confirm the exact format of the alias entries in `vitest.config.ts` (already verified by Director: `new URL('./packages/signals/src/index.ts', import.meta.url).pathname` pattern). New aliases will follow this exact form.

---

## 6. Builder brief — Round 1 (Plan 2.1: @aihu/context)

This brief is contingent on OQ-V3 being resolved by the Architect (see §2 and §7 below). If OQ-V3 is not resolved, the Builder cannot start.

Assuming the Architect selects **Option A (implicit stack)**:

### Acceptance criteria for @aihu/context v1

**AC-1: Package scaffold**
- `packages/context/package.json` per §4 checklist
- `packages/context/tsconfig.json` per §4 checklist
- `packages/context/rolldown.config.ts` per §4 checklist
- `packages/context/moon.yml` per §4 checklist
- `vitest.config.ts` alias added: `'@aihu/context': new URL('./packages/context/src/index.ts', import.meta.url).pathname`

**AC-2: Public API surface**
```typescript
// packages/context/src/index.ts exports:
export function createContext<T>(defaultValue?: T): ContextToken<T>
export function provide<T>(token: ContextToken<T>, value: T): void
export function inject<T>(token: ContextToken<T>): T | undefined
// or: inject<T>(token: ContextToken<T>, defaultValue: T): T  — see spec gap §3.1.4
export function runWithContext<T>(ctx: ContextMap, fn: () => T): T  // if stack-based
```

**AC-3: SSR compatibility**
- `inject()` works during `renderToString`'s synchronous tree walk (no DOM access)
- No `window`, `document`, or `Element` references in any `@aihu/context` source file
- `provide()` / `inject()` work in a Node.js environment with no DOM polyfill

**AC-4: Tests**
- Minimum 8 vitest tests in `packages/context/tests/`
- Cover: create/provide/inject round-trip; inject with no provider returns default; inject with nested providers returns innermost; context is scoped to a render subtree (not leaked across siblings); SSR-environment test (no `window`)

**AC-5: Build**
- `bun run build` (in `packages/context/`) exits 0
- `bun run typecheck` exits 0
- `bun run test` (root) still passes all pre-existing tests

**AC-6: Bundle budget** (from spec §10 — to be confirmed by Architect)
- `@aihu/context` dist must be within the v1 bundle budget (Architect to specify; expected ~500 B gzip based on the primitive nature of the API)

---

## 7. Go/no-go

**NO-GO for Builder dispatch. Architect pass required first.**

The single blocking issue is **OQ-V3**. The Builder cannot write a single line of `@aihu/context` implementation without knowing the propagation mechanism, because the propagation mechanism determines:
- Whether `provide()` writes to a DOM attribute or a module-level stack
- Whether `inject()` reads from `Element.closest()` or a stack lookup
- Whether `runWithContext()` exists at all
- Whether `mount()` in `@aihu/arbor` needs any change
- Whether `renderToString()` in `@aihu/server` needs any change

**Recommended sequence:**
1. **Scout** → run brief §5c and §5d; confirm `defineLoader` shape, confirm `AgentContext` intent, confirm `mount()` options (1 session, can run now)
2. **Team Lead** → adjudicate OQ-V3 SSR question: is SSR+context in scope for v1? (1 decision)
3. **Architect** → write `spec-v1-architecture.md` §7 (`@aihu/context`) encoding OQ-V3 resolution, `provide/inject` lifecycle, error behavior, default values, and `ContextToken<T>` type definition
4. **Builder** → scaffold `packages/context/` and implement per AC-1 through AC-6

**Scout can dispatch immediately.** Architect and Builder are blocked on OQ-V3 adjudication.
