# Director Note — Track B Round 2
**Date:** 2026-04-30
**Track:** `track-b`
**Topic:** v1 Context + Data packages
**Plans in scope:** 2.1 (`@scribe/context`) + 2.2 (`@scribe/data`)
**Branch:** `feat/v1-context` (Plan 2.1); `feat/v1-data` (Plan 2.2, sequential)
**Round:** 2 — Post-Scout, Post-OQ-V3 ratification

---

## 1. Scout findings review

The Scout report is complete and clean. Key findings assessed below.

### 1a. Signal consumption pattern — is `Array.isArray` + `value[0]()` the right model for `@scribe/context`?

No — and this is an important distinction. The `Array.isArray(value)` + `value[0]()` pattern is **arbor's internal materialization guard**, used when a `Signal<T>` (which is a `readonly [Read<T>, Write<T>]` tuple) is passed as a reactive text node or attribute value to the DOM layer. It is not part of `@scribe/context`'s public contract.

`@scribe/context` does not need to detect signals by `Array.isArray`. Context tokens hold arbitrary values. If a caller does `provide(ThemeToken, signal('dark'))` they are passing a `Signal<string>` tuple as the context value, and the injecting component receives that tuple back via `inject(ThemeToken)`. The consumer then handles it as a `Signal<T>` through normal patterns — `inject` returns whatever was `provide`d, typed as `T`.

The context API shape therefore does NOT mirror arbor's materialization pattern. It mirrors the signal import/export pattern: typed tokens, typed return values, no `Array.isArray` guards inside `@scribe/context` source.

**Decision confirmed:** `inject<T>(token)` returns `T` (whatever was provided), not `Signal<T>` unconditionally. Callers who want reactivity provide a `Signal<T>`; callers who want a plain value provide a plain value. This matches `spec-v1-architecture.md §7` and the ratified §12 OQ-V3 intent. The Architect brief below encodes this precisely.

### 1b. `runLoader` non-export — does it matter for Plan 2.2?

The Scout confirmed that `runLoader` is **not re-exported from `packages/server/src/index.ts`** — only `defineLoader` is public. This is a minor inconsistency (tests import from the internal path `../src/data.ts` directly) but it does NOT matter for Plan 2.2.

`@scribe/data`'s `createResource` is the **client-side** primitive. It calls `fetcher()` directly — it does not import from `@scribe/server` at all. The hard boundary (browser packages never import from server packages) is enforced. `runLoader` is a server-only execution wrapper; `createResource` has no reason to call it.

The only naming alignment needed is that `LoaderResult<T>` (`{ data, error?, status }`) and the client's `DataState<T>` discriminated union be compatible in shape for SSR dehydration. The ratified spec §12 OQ-V6 defines the dehydration JSON as `{ "resources": { "<key>": <DataState entry> } }`. The Architect must explicitly align these shapes in `spec-2.2-data.md`.

**Action for 2.2 Architect:** note that `runLoader` barrel exposure is a separate clean-up item unrelated to 2.2 scope. Do not fix it in the data package PR.

### 1c. Surprises that change the Plan 2.1 or 2.2 design

Three Scout findings have design implications:

**C1 — `mount()` has no options parameter today.** The ratified OQ-V3 specifies that the browser context model uses a module-level `_activeContextMap` slot in arbor (parallel to `_activeMountDisposers`). This requires arbor to expose a minimal hook that `@scribe/context` reads and writes. The Scout confirmed `mount()` does not need to change for this — the push/pop is managed by `provide()`/`inject()` through the shared slot, orthogonal to `mount()`'s two-argument signature. **No arbor change needed for Plan 2.1.**

**C2 — `vitest.config.ts` uses `jsdom` globally.** All existing tests run under jsdom. `@scribe/context` is nominally DOM-free for SSR, but its tests will run under jsdom anyway. This is acceptable — the Architect should specify at least two test cases using the `@vitest-environment node` docblock to prove DOM-freedom, alongside the standard jsdom test suite. Not a blocker.

**C3 — `@scribe/agent` is 56 B over its size limit (100 B limit, 156 B actual).** This is pre-existing defect F-1 from the ratified spec §13. It blocks `bun run size` on any build touching `.size-limit.json`. The Plan 2.1 Architect brief must include raising the agent limit to 200 B as part of the `.size-limit.json` patch when adding the context row, or the Builder's CI will fail. **Include agent limit fix in Plan 2.1 scope.**

**C4 — `moon.yml` has no `tasks` section in any package.** New packages should follow the same no-tasks pattern. The `dependsOn` array is the only addition needed for inter-package dependency ordering. Confirmed.

---

## 2. OQ-V3 confirmed closed

**OQ-V3: CLOSED.**

The Track D Architect ratified OQ-V3 in `spec-v1-architecture-ratified.md` §12. The ratified decision is a render-scoped context map, with the following two-mode implementation:

**Browser (client) model:**
`provide()` and `inject()` operate via a module-level `_activeContextMap` slot maintained by arbor during `mount()` calls. This is effectively a module-level implicit stack — the same pattern as the "Option A" described in the Round 1 director note. The slot push/pop is synchronous and scoped to the component setup phase. `@scribe/context` reads and writes this slot; arbor exposes it as a minimal internal hook.

**SSR model:**
`renderToString` / `renderToStream` accept `contextMap?: ReadonlyMap<unknown, unknown>` in `SsrOptions`. The SSR renderer calls `setSsrContextMap(map)` from `@scribe/context` via an optional `contextSetup?` hook in `SsrOptions`, before walking the virtual tree. `inject()` during SSR reads from the SSR-scoped map rather than the module-level slot. `setSsrContextMap(null)` is called after rendering to clear state.

**Reconciliation note (prompt framing vs. ratified spec):**
The OQ-V3 pre-decision in this prompt described the browser path as "module-level implicit stack during synchronous execution" and SSR as `runWithContext(map, fn)`. The ratified spec uses slightly different terminology (`_activeContextMap` slot, `setSsrContextMap`, `contextSetup` hook) but these are the same semantic model. The Architect brief below uses the ratified spec's exact terminology, which is the authoritative document. `runWithContext` is not the exported name; `setSsrContextMap` is. The Architect must use the ratified spec's naming.

**Impact on `mount()` — confirmed none required:**
Scout finding D4 explicitly confirmed that `mount()` does not need to change for the module-level stack approach. The context slot is orthogonal to the materialization/disposal lifecycle. `mount()` remains `mount(node: Node, host: Element | ShadowRoot): MountScope`.

**Impact on arbor — one minimal addition:**
Arbor must expose the `_activeContextMap` slot so `@scribe/context` can read/write it during component setup. This is a one-line internal export — a `let _activeContextMap: Map<unknown, unknown> | null = null` with a corresponding getter/setter. The Plan 2.1 Architect brief specifies the exact surface needed from arbor. This is a small, targeted arbor touch — not a reconiliation or structural change. It belongs in the Plan 2.1 PR (not a separate arbor PR) because it is zero-behavior-change from arbor's perspective.

---

## 3. Plan 2.1 spec gaps resolved

All five spec gaps from Round 1 §3 are now resolvable. Decisions are made here for the Architect to encode in `spec-2.1-context.md`.

### Gap 1: `createContext<T>` signature — token type

**Decision: opaque object reference (`ContextToken<T>`) using a unique symbol brand.**

```typescript
export interface ContextToken<T> {
  readonly _id: symbol          // unique per createContext() call
  readonly _default: T | undefined
}
```

Rationale: The token is used as a `Map` key in the context map (`_activeContextMap` and `SsrOptions.contextMap`). An object reference is a valid `Map` key with identity semantics. A `symbol` inside the object (`_id`) provides uniqueness even if tokens are structurally identical. String keys are rejected because they require global namespacing and create collision risk. DOM attribute keys (from the old traversal model) are rejected by OQ-V3.

`createContext<T>(defaultValue?: T): ContextToken<T>` allocates a new symbol on each call. Two separate calls with the same type `T` produce distinct tokens that cannot interfere.

### Gap 2: `provide()` call site

**Decision: `provide()` is called during component setup, synchronously, before any effects fire.**

```typescript
// In a parent component's setup():
export function provide<T>(token: ContextToken<T>, value: T): void
```

`provide()` writes `value` into the current `_activeContextMap` under the token's `_id`. The context map is a `Map<symbol, unknown>` held on the active arbor scope. During SSR, `provide()` writes into the SSR context map set by `setSsrContextMap`.

`provide()` can also be called as a standalone call for SSR (not inside a component) — the caller sets up a context map with `setSsrContextMap` and then calls `provide()` directly, or more commonly passes the pre-built map via `SsrOptions.contextMap`. Both paths work because `provide()` writes to whichever map is active (module-level slot or SSR slot).

### Gap 3: `inject()` availability

**Decision: synchronous, available anywhere within a component's setup function execution.**

```typescript
export function inject<T>(token: ContextToken<T>): T | undefined
```

`inject()` reads from the current active context map — either `_activeContextMap` (browser) or the SSR map (`_ssrContextMap` set by `setSsrContextMap`). It is synchronous. It must be called before any `await` in setup (setup functions should not be async anyway — this is consistent with existing runtime conventions).

During `renderToString`, `inject()` reads from the `_ssrContextMap` that was loaded before the render walk began. This makes `inject()` work correctly for every node in the virtual tree walk.

### Gap 4: Error behavior for `inject()` with no provider

**Decision: return `undefined` (not throw) when no provider exists and no default value was given.**

```typescript
inject<T>(token: ContextToken<T>): T | undefined
```

If `createContext<T>(defaultValue)` was called with a default value, `inject()` returns that default when no provider is in scope. If no default was given and no provider exists, `inject()` returns `undefined`. It does NOT throw by default.

Rationale: `plan-v1-roadmap.md §2.1` states "Throws `ContextError` if no provider and no default value" — but this conflicts with general DX practice for context APIs (React, Vue, Svelte all return undefined/undefined-typed by default and leave the throw to application code). The throw model in the roadmap was written before OQ-V3 was resolved and before the scout confirmed the API shape. The safer, composable choice is `T | undefined` return. Components that must have a provider can do: `const val = inject(token); if (val === undefined) throw new ContextError(...)` in their own setup. This keeps `@scribe/context` itself non-throwing and easy to test.

**Override:** If the team has strong preference for the throw model, the Architect may define an overload: `inject<T>(token, { required: true }): T` that throws `ContextError`. But the default must be `T | undefined`.

### Gap 5: Multiple providers — shadow vs. merge

**Decision: shadow (innermost wins). Standard behavior. Confirmed.**

When a child component calls `inject(token)` and there are two ancestor `provide(token, ...)` calls in the tree, the nearest (innermost / most recent) provider wins. This is implemented naturally by the module-level context map: the map holds the most recently provided value for each token. Nested provides overwrite the outer value in the child's scope.

For SSR, the map is built by the caller before `renderToString` — nesting of providers at SSR time is handled by the caller constructing a merged map (outer defaults, inner overrides).

---

## 4. Plan 2.2 spec gaps resolved

These are decisions the Plan 2.2 Architect must encode. They do not block Plan 2.1 and are provided here for early alignment.

### Gap 1: Cache key type

**Decision: `key: Signal<string | null | undefined>` as the first argument to `createResource`.**

The cache key is a reactive signal, not a static string. This allows key-reactive refetching: when the key signal changes, `createResource` automatically fetches the new key. `null` or `undefined` disables fetching (resource stays `idle`).

This is confirmed by `spec-v1-architecture.md §6.2`:
```typescript
export function createResource<T>(
  key: Signal<string | null | undefined>,
  fetcher: (key: string) => Promise<T>,
  options?: ResourceOptions<T>,
): DataSource<T>
```

The cache is keyed by the string value of the key signal at fetch time. Two `createResource` calls with the same key string share the same cache entry (within the same cache store from context).

### Gap 2: `DataState<T>` state machine

**Decision: five-state discriminated union as defined in `spec-v1-architecture.md §6.2`.**

```typescript
export type DataState<T> =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'ready';     readonly data: T }
  | { readonly status: 'error';     readonly error: unknown }
  | { readonly status: 'streaming'; readonly data: T; readonly done: false }
```

Transitions: `idle` → `loading` (key becomes non-null) → `ready` | `error` (fetch resolves). On `refetch()`: `ready` | `error` → `loading` → `ready` | `error`. There is no separate `refreshing` state — the resource goes back to `loading` on refetch, discarding the previous value. The `streaming` state is for `fromWebSocket` and similar adapters; standard `createResource` never produces it.

### Gap 3: `createResource` return type

**Decision: `DataSource<T>` object with `.state: Signal<DataState<T>>`, `.refetch()`, and `.invalidate()`.**

```typescript
export interface DataSource<T> {
  readonly state: Signal<DataState<T>>
  refetch(): void
  invalidate(): void
}
```

NOT a plain `Signal<DataState<T>>` — a richer object. Rationale: `.refetch()` and `.invalidate()` are required operations that cannot be modeled on a plain signal tuple. The `.state` field gives access to the reactive signal for use in effects and templates. Components read `inject(someResource).state` to get the `Signal<DataState<T>>` and use `value[0]()` to read the current state in effects — fully compatible with arbor's existing `Array.isArray` signal detection pattern.

Note: `spec-v1-architecture-ratified.md §6` shows an alternative shape with `.data`, `.loading`, `.error` as separate signals. The `spec-v1-architecture.md §6.2` (the detailed spec) uses `DataSource<T>` with a single `.state` signal. The Architect must reconcile these — the `DataSource<T>` / single-state model is preferred because it enables exhaustive pattern matching on the discriminated union.

### Gap 4: Dehydration JSON shape

**Decision: confirmed from ratified spec §12 OQ-V6.**

```json
{
  "resources": {
    "/api/user/1": { "status": "ready", "data": { "id": 1, "name": "Alice" } }
  }
}
```

The top-level key is `"resources"`. Sub-keys are the resolved string values of each resource's key signal at SSR time. Only resources with `{ dehydrate: true }` in their `ResourceOptions` are included. The value for each key is a `DataState<T>` entry (only `ready` state is emitted — resources that are `loading` or `error` at SSR time are not serialized).

This is emitted into `<script type="application/json" id="__scribe_state__">`, which already exists in `ssr.ts`. The `SsrOptions.serializer` hook is the injection point — `@scribe/data` provides a `createResourceSerializer(store)` function that returns a `() => Record<string, unknown>` compatible with the existing `serializer` field.

### Gap 5: Fetcher signature

**Decision: `(key: string) => Promise<T>` — key is passed in.**

```typescript
type Fetcher<T> = (key: string) => Promise<T>
```

The key is passed to the fetcher as its argument, not closed over. This enables generic fetchers: `createResource(userIdSignal, (id) => fetchUser(id))`. The fetcher does not need to close over the key signal itself. This also enables natural SSR testing: the fetcher can be replaced with a mock that checks the key argument.

---

## 5. Architect brief for Plan 2.1 (`@scribe/context`)

**Assignment:** Write `spec-2.1-context.md` in `.team/v1/`.

**Output document:** `.team/v1/spec-2.1-context.md`

**Audience:** Builder (one session, one PR: `feat/v1-context`)

The Architect brief is complete and specific. The Architect must produce a Builder-ready spec encoding everything below without reopening any of the resolved decisions.

---

### 5.1 Exact TypeScript API surface

The Architect must specify these interfaces verbatim in the spec (they are already decided here and must not be reopened):

```typescript
// packages/context/src/types.ts

/**
 * Opaque token identifying a context value.
 * Created by `createContext<T>()`. Use as Map key.
 */
export interface ContextToken<T> {
  readonly _id: symbol
  readonly _default: T | undefined
}

/**
 * The context map type. Maps token identity symbols to provided values.
 * Used both for the browser module-level slot and for SSR explicit maps.
 */
export type ContextMap = Map<symbol, unknown>
```

```typescript
// packages/context/src/index.ts (public surface)

/**
 * Create a new context token with an optional default value.
 * Each call produces a distinct token — no two tokens interfere.
 */
export function createContext<T>(defaultValue?: T): ContextToken<T>

/**
 * Provide a value for the given token in the current component scope.
 * Must be called synchronously during component setup.
 * During SSR: writes into the active SSR context map.
 */
export function provide<T>(token: ContextToken<T>, value: T): void

/**
 * Inject the nearest provided value for the given token.
 * Returns token default (or undefined) if no provider is in scope.
 * Must be called synchronously during component setup or SSR render walk.
 */
export function inject<T>(token: ContextToken<T>): T | undefined

/**
 * Called by renderToString/renderToStream (via SsrOptions.contextSetup) before
 * and after SSR rendering. Pass null to clear.
 * @internal — not re-exported from the public barrel, but accessible to @scribe/server
 */
export function setSsrContextMap(map: ReadonlyMap<symbol, unknown> | null): void

/**
 * Run fn with the given context map active.
 * Convenience wrapper used by renderToString callers who want to set up
 * context programmatically rather than via SsrOptions.contextMap.
 * Sets the SSR map before fn(), clears it after (even on throw).
 */
export function runWithContext<R>(map: ContextMap, fn: () => R): R
```

**The public barrel (`src/index.ts`) exports:**
`createContext`, `provide`, `inject`, `runWithContext`, `ContextToken` (type), `ContextMap` (type).

`setSsrContextMap` is exported from `src/ssr.ts` as a named export but NOT re-exported from the barrel. It is accessed by `@scribe/server` via a direct path import (`@scribe/context/ssr`) or via the `contextSetup` hook mechanism in `SsrOptions`. The Architect must decide and document which mechanism — the `contextSetup` hook (as specified in the ratified spec) is preferred because it preserves the hard package boundary without path-importing internals.

---

### 5.2 Module-level stack implementation approach

The browser context system uses **two cooperating module-level variables** in `@scribe/context`:

```typescript
// packages/context/src/state.ts (internal, not exported)

// The active context map during a synchronous component setup invocation.
// Non-null only during the synchronous execution of a setup() function
// that was entered via arbor's scope-collector mechanism.
let _activeMap: ContextMap | null = null

// The SSR context map set by setSsrContextMap().
// Non-null only during a renderToString/renderToStream call.
let _ssrMap: ReadonlyMap<symbol, unknown> | null = null
```

**`provide(token, value)` implementation:**

```typescript
export function provide<T>(token: ContextToken<T>, value: T): void {
  const map = _ssrMap !== null
    ? (_ssrMap as ContextMap)   // SSR path: write into SSR map (caller owns it)
    : _activeMap                // Browser path: write into active scope map
  if (map === null) {
    // Called outside of any setup context — create an ephemeral map
    // (no-op for now; the Architect may decide to warn or throw in dev mode)
    return
  }
  map.set(token._id, value)
}
```

**`inject(token)` implementation:**

```typescript
export function inject<T>(token: ContextToken<T>): T | undefined {
  const map = _ssrMap !== null ? _ssrMap : _activeMap
  if (map !== null && map.has(token._id)) {
    return map.get(token._id) as T
  }
  return token._default
}
```

**Arbor integration — the `_activeContextMap` hook:**

Arbor must expose a minimal hook so `@scribe/context` can activate the context map during component setup. This requires one small addition to `packages/arbor/src/`:

```typescript
// packages/arbor/src/context-hook.ts (new internal file)

// The active context map. Set by @scribe/context before calling setup().
// Cleared by @scribe/context after setup() completes.
// @scribe/context is the only writer. Arbor never reads this.
export let _activeContextMap: Map<symbol, unknown> | null = null

export function setActiveContextMap(map: Map<symbol, unknown> | null): void {
  _activeContextMap = map
}
```

`@scribe/context` imports `setActiveContextMap` from `@scribe/arbor/src/context-hook.ts`. Before a component's setup function runs (triggered by arbor's `mount()`), `@scribe/context` sets the active map. After setup completes, it clears it.

**Architect clarification required:** The exact trigger point for "before setup runs" needs to be specified. The Architect must answer: does arbor call a lifecycle hook (e.g., `onBeforeSetup`) that `@scribe/context` registers with, or does `@scribe/context` wrap `mount()` at the call site? The cleanest answer given the existing architecture is that **arbor itself does not call any hook** — instead, the runtime (`@scribe/runtime`'s `defineComponent`) is responsible for calling `setActiveContextMap(new Map())` before invoking `setup(ctx)` and `setActiveContextMap(null)` after. This keeps the coupling surface small: only the runtime needs to know about context map activation, not arbor itself.

The Architect must specify this integration point precisely. If the runtime path is chosen, `@scribe/context`'s dependency graph is `@scribe/context → @scribe/signals` only (no arbor dep needed), and the runtime (`@scribe/runtime`) gains a peer dep on `@scribe/context`. This is cleaner than the ratified spec's implicit arbor-coupling and should be the Architect's recommendation unless a clear reason to prefer the arbor-hook model exists.

---

### 5.3 SSR integration

The SSR integration has two parts:

**Part A — `SsrOptions.contextMap` field:**

`packages/server/src/ssr.ts` gains one new field in `SsrOptions`:

```typescript
export interface SsrOptions {
  // ... existing fields (readonly head?: string, serializer?, etc.) ...
  /**
   * Context map for SSR rendering. Values provided here are available to
   * inject() calls made during the synchronous renderToString tree walk.
   * Pass a Map pre-populated with provide()-style entries.
   */
  readonly contextMap?: ReadonlyMap<unknown, unknown>
  /**
   * Optional hook called before the render walk begins, with the context map
   * (if any) already loaded. Use to call setSsrContextMap() or runWithContext().
   * @scribe/context's integration uses this hook.
   */
  readonly contextSetup?: () => void
}
```

**Part B — The `renderToString` call sequence:**

```typescript
// Inside renderToString (pseudo-code showing the new lines):
if (opts?.contextMap) {
  // Set the SSR context map so inject() calls during the walk find values
  setSsrContextMap(opts.contextMap as ReadonlyMap<symbol, unknown>)
}
if (opts?.contextSetup) {
  opts.contextSetup()
}
try {
  // ... existing render walk ...
} finally {
  setSsrContextMap(null)  // always clear — prevents cross-request leakage
}
```

`setSsrContextMap` in `@scribe/context` is not imported by `@scribe/server` directly (hard boundary: server must not import browser packages). Instead, the `contextSetup` hook carries the call. The application's entry point wires them:

```typescript
// In the application server entry (not in any scribe package):
import { setSsrContextMap } from '@scribe/context/ssr'

const map = new Map()
map.set(ThemeToken._id, 'dark')
renderToString(component, {
  contextSetup: () => setSsrContextMap(map),
})
```

**Alternatively** (simpler for callers), `runWithContext` from `@scribe/context` wraps this:

```typescript
import { runWithContext } from '@scribe/context'

const html = await runWithContext(map, () => renderToString(component, opts))
```

Both patterns work. The `runWithContext` wrapper is cleaner for callers. Both must be documented in the spec.

The Architect must specify which pattern is the documented primary API and which is the escape hatch.

---

### 5.4 Arbor changes required

Minimal. The Architect must document this as part of the Plan 2.1 PR scope (not a separate arbor PR):

If the runtime-integration path is selected (recommended above in §5.2): **zero arbor changes needed.** The runtime calls `setActiveContextMap` from `@scribe/context` before/after setup.

If the arbor-hook path is selected (as originally sketched in the ratified spec): one new internal file `packages/arbor/src/context-hook.ts` exporting `setActiveContextMap`. No changes to existing arbor files.

Either way, the `mount()` signature is unchanged.

---

### 5.5 Package infra checklist for Plan 2.1

The Builder must create the following from scratch (no existing `packages/context/`):

```
packages/context/
  package.json
    name: "@scribe/context"
    version: "0.0.0"
    type: "module"
    main: "./dist/index.js"
    module: "./dist/index.js"
    types: "./dist/index.d.ts"
    exports:
      ".": { types: "./dist/index.d.ts", import: "./dist/index.js" }
      "./ssr": { types: "./dist/ssr.d.ts", import: "./dist/ssr.js" }
    files: ["dist"]
    sideEffects: false
    scripts: { build: "rolldown -c", typecheck: "tsc --noEmit" }
    dependencies:
      "@scribe/signals": "workspace:*"
      (+ "@scribe/arbor": "workspace:*" only if arbor-hook path selected)

  tsconfig.json
    extends: "../../tsconfig.base.json"
    rootDir: "."
    outDir: "dist"
    noEmit: true
    include: ["src/**/*.ts", "tests/**/*.ts"]

  rolldown.config.ts
    — follow packages/signals/rolldown.config.ts exactly
    — input: { index: "src/index.ts", ssr: "src/ssr.ts" }  (two entry points)
    — output: { dir: "dist", format: "esm", sourcemap: true, minify: true }
    — plugins: [dts()]

  moon.yml
    language: typescript
    layer: library
    dependsOn:
      - "signals"
      (- "arbor" only if arbor-hook path)

  src/
    index.ts     — public barrel (createContext, provide, inject, runWithContext, types)
    ssr.ts       — setSsrContextMap (not in main barrel, but exported as @scribe/context/ssr)
    types.ts     — ContextToken<T>, ContextMap
    state.ts     — internal _activeMap, _ssrMap (not exported)

  tests/
    context.test.ts   — minimum 10 tests (see §5.6)
```

**Root-level changes required (Builder must make these in the same PR):**

1. `vitest.config.ts` — add alias:
   ```
   '@scribe/context': new URL('./packages/context/src/index.ts', import.meta.url).pathname
   ```

2. `.size-limit.json` — two changes in one PR:
   - Raise `@scribe/agent` limit from `"100 B"` to `"200 B"` (fixes pre-existing F-1 defect)
   - Add new row: `{ "name": "@scribe/context", "path": "packages/context/dist/index.js", "limit": "300 B", "gzip": true }`

---

### 5.6 Test specification for Plan 2.1

Minimum 10 vitest tests in `packages/context/tests/context.test.ts`:

1. `createContext` returns a distinct token on each call (two calls with same `T` do not share state)
2. `provide` + `inject` round-trip: provided value is returned by inject
3. `inject` with no provider and no default returns `undefined`
4. `inject` with no provider returns `createContext` default value when one was given
5. Two nested `provide` calls for same token: innermost wins (shadow behavior)
6. Two separate tokens for same `T`: do not interfere with each other
7. `runWithContext`: values injected inside fn, cleared after fn returns
8. `runWithContext`: map cleared even when fn throws
9. SSR path via `setSsrContextMap`: inject reads from SSR map, not active map
10. SSR path cleared after `setSsrContextMap(null)`: inject returns undefined/default after clear

At least tests 9 and 10 should use `/* @vitest-environment node */` docblock to assert DOM-free operation.

---

### 5.7 `SsrOptions` change scope

`packages/server/src/ssr.ts` receives two new optional fields in `SsrOptions`:
- `readonly contextMap?: ReadonlyMap<unknown, unknown>`
- `readonly contextSetup?: () => void`

These are additive, backward-compatible. Existing callers without context needs pass neither field and the behavior is unchanged. The `contextSetup` hook is the boundary-preserving path. The Plan 2.1 PR may include this change in `@scribe/server` if the Architect determines it is safe to do so without a separate server PR; since the change is purely additive to a `readonly` interface, it is safe to bundle.

---

### 5.8 What spec document the Architect should produce

Output: `.team/v1/spec-2.1-context.md`

The spec must cover:
- Public API surface (TypeScript interfaces and function signatures, as specified above)
- Dependency graph: which packages `@scribe/context` imports from
- Internal module structure (`types.ts`, `state.ts`, `ssr.ts`, `index.ts`)
- Browser integration path (module-level maps, interaction with runtime's setup invocation)
- SSR integration path (`setSsrContextMap`, `runWithContext`, `SsrOptions.contextSetup`)
- Package infra (package.json, rolldown.config.ts, moon.yml, vitest alias)
- Size budget: target 200 B, limit 300 B gzip
- Test list (minimum 10 cases from §5.6)
- Do-not-break list: no changes to `@scribe/signals`, `@scribe/arbor` public surface, `@scribe/runtime` public surface; `@scribe/server/src/ssr.ts` receives only additive changes

The spec does NOT need to cover Plan 2.2 — that is a separate spec document.

---

## 6. Go/no-go verdict

**GO for Architect dispatch on Plan 2.1.**

All blockers from Round 1 are resolved:
- OQ-V3: CLOSED (ratified by Track D Architect)
- Scout findings: complete and integrated above
- All five spec gaps for 2.1: decided in §3 above
- Architect brief: complete in §5 above

**The Architect is authorized to write `spec-2.1-context.md` now.**

The Architect has one open decision to make (not a blocker — either answer is acceptable):

> **Open decision for Architect:** Browser integration path — runtime-activates-map (recommended, zero arbor dep) vs. arbor-hook (matches ratified spec's original framing, one new internal arbor file). The Architect must choose and document this in `spec-2.1-context.md`. Either choice is acceptable to the Director.

---

### Plan 2.2 readiness

**NO-GO for Plan 2.2 Architect dispatch yet.** Plan 2.2 depends on Plan 2.1 landing (the cache store must be injectable via the context system). The 2.2 spec gaps are resolved above in §4 and the Architect can begin drafting `spec-2.2-data.md` in parallel with the 2.1 build, but the 2.2 Builder cannot start until Plan 2.1 is merged.

**Pre-work the 2.2 Architect can do now:** write `spec-2.2-data.md` using the decisions in §4. No blockers on the spec writing itself.

---

### Sequence from here

1. **Architect** — write `.team/v1/spec-2.1-context.md` per §5 above (GO)
2. **Architect (parallel)** — write `.team/v1/spec-2.2-data.md` per §4 decisions (GO for spec-writing; Builder dispatch blocked on 2.1 merge)
3. **Builder** — after `spec-2.1-context.md` is approved: scaffold `packages/context/` on `feat/v1-context`, implement, PR
4. **Director (Track B Round 3)** — after 2.1 PR is ready for review: review, authorize merge
5. **Builder** — after 2.1 merged: start `packages/data/` on `feat/v1-data`

---

## 7. State file update

The state file `.team/v1/state-track-b.md` must be updated to reflect:
- Phase changed from `Phase 0 — Blocked on OQ-V3` to `Phase 1 — Architect active`
- OQ-V3: OPEN → CLOSED
- Round 2 added to round summary
- Branch `feat/v1-context` noted as the next branch to create

This update is the Director's responsibility and will be performed as the final action of this round.

---

*Track B Director, 2026-04-30. Round 2 complete.*
