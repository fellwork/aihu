# spec-2.1-context.md — `@aihu/context` Implementation Spec

**STATUS: READY FOR BUILDER**

**Date:** 2026-04-30
**Author:** Architect (Track B, Round 2)
**Branch:** `feat/v1-context`
**PR scope:** `packages/context/` (new), `packages/server/src/ssr.ts` (additive), `packages/runtime/src/define-component.ts` (additive), root `vitest.config.ts` (alias), `.size-limit.json` (new row)
**References:**
- `.team/v1/director-notes/track-b-round-002.md` (primary brief)
- `.team/v1/scout-report-track-b.md` (infra patterns)
- `.team/v1/spec-v1-architecture-ratified.md` (OQ-V3 decision)

---

## §1 Summary

`@aihu/context` is a new aihu package providing typed context propagation across component trees. It offers the `createContext` / `provide` / `inject` triad familiar from React, Vue, and Solid, adapted to aihu's custom-element runtime and SSR model.

**What it does:**
- Creates opaque typed tokens (`ContextToken<T>`) that uniquely identify a context value kind.
- Provides values into the active context map during component `setup()` via `provide()`.
- Injects the nearest provided value for a token via `inject()`.
- Supports SSR through an explicit context map passed before the render walk begins.
- Exports `runWithContext(map, fn)` as a convenience wrapper for SSR callers.

**What it does NOT do:**
- No DOM traversal. Zero references to `window`, `document`, `Element`, `parentElement`, or any DOM API.
- No `@aihu/arbor` coupling. The package does not import from arbor.
- No automatic reactivity on context changes. If a caller wants reactive context, they provide a `Signal<T>` as the context value. The context system itself is not reactive — it is a synchronous map lookup during setup.
- No parent-to-child context propagation threading through nested components in the browser at v1. Each component receives its own fresh context map during setup; cross-component provider/inject works only when both components are in the same setup call chain (SSR), or when the parent explicitly sets up context in the same synchronous window (see §5). DOM-hierarchy-based inheritance (walk `parentElement` to find the nearest `provide`) is deferred to v1.1.
- No `ContextError` throw on missing provider. `inject()` returns `undefined` (or the `createContext` default) silently. Application code that requires a provider must check the return value.

---

## §2 Package structure

### Package identity

```
name:     @aihu/context
location: packages/context/
```

### Dependencies

`@aihu/context` has **zero runtime dependencies**. It does not import from `@aihu/signals`, `@aihu/arbor`, or any other aihu package.

Rationale: The context system operates exclusively on a `Map<symbol, unknown>` (standard JS built-in). It never reads or writes reactive signals internally. If a caller stores a `Signal<T>` as a context value by calling `provide(token, mySignal)`, the context system is transparent to that — it stores and returns the tuple unchanged. No signal primitives are needed inside `@aihu/context`.

The `Signal` type from `@aihu/signals` appears in documentation and examples but is never imported in the context package source.

### `package.json` shape

```json
{
  "name": "@aihu/context",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./ssr": {
      "types": "./dist/ssr.d.ts",
      "import": "./dist/ssr.js"
    }
  },
  "files": ["dist"],
  "sideEffects": false,
  "scripts": {
    "build": "rolldown -c",
    "typecheck": "tsc --noEmit"
  }
}
```

No `dependencies` field. (Mirrors `@aihu/signals/package.json` exactly, with the addition of the `./ssr` export condition.)

### Bundle budget

- **Target:** 200 B gz
- **Hard limit:** 300 B gz
- Entry in `.size-limit.json`:
  ```json
  {
    "name": "@aihu/context",
    "path": "packages/context/dist/index.js",
    "limit": "300 B",
    "gzip": true
  }
  ```

Note: At the time of writing, `.size-limit.json` already has `@aihu/agent` at `200 B` (F-1 was pre-fixed at HEAD). The Builder adds only the `@aihu/context` row.

### vitest alias entry

Add to `vitest.config.ts` `resolve.alias`:
```typescript
'@aihu/context': new URL('./packages/context/src/index.ts', import.meta.url).pathname,
```

---

## §3 Public API — TypeScript interfaces

### `packages/context/src/types.ts`

```typescript
/**
 * Opaque token identifying a context value kind.
 * Created by `createContext<T>()`. Used as a key in ContextMap.
 *
 * The `_id` symbol is unique per `createContext()` call — two calls with
 * the same type parameter T produce distinct tokens that never interfere.
 *
 * The leading underscore signals "do not access directly"; consumers should
 * only pass tokens to `provide()` and `inject()`.
 */
export interface ContextToken<T> {
  readonly _id: symbol
  readonly _default: T | undefined
}

/**
 * The context map type. Maps token identity symbols to provided values.
 *
 * Used for both the browser module-level active-map slot and for SSR
 * explicit maps constructed by callers before passing to renderToString.
 *
 * Key is the token's `_id` symbol (not the token object itself), which
 * avoids the reference-identity concern of using objects as Map keys
 * across module boundaries.
 */
export type ContextMap = Map<symbol, unknown>
```

### `packages/context/src/index.ts` (public barrel)

```typescript
export type { ContextToken, ContextMap } from './types.ts'

/**
 * Create a new context token with an optional default value.
 *
 * Each call produces a distinct token even for the same type T.
 * The optional defaultValue is returned by inject() when no provider
 * is active and no value was provided for this token.
 *
 * @example
 *   export const ThemeToken = createContext<string>('light')
 *   export const UserToken = createContext<User>()  // no default
 */
export function createContext<T>(defaultValue?: T): ContextToken<T>

/**
 * Provide a value for the given token in the currently active context map.
 *
 * MUST be called synchronously during a component setup() invocation
 * (browser) or during a runWithContext / renderToString call (SSR).
 * Calling provide() outside these windows is a no-op (the value is
 * discarded because no map is active).
 *
 * If multiple provide() calls use the same token within one component's
 * setup(), the last write wins (Map.set semantics).
 *
 * @example
 *   // In a parent component's setup():
 *   provide(ThemeToken, 'dark')
 */
export function provide<T>(token: ContextToken<T>, value: T): void

/**
 * Inject the nearest provided value for the given token.
 *
 * Reads from the currently active context map. Returns the provided value
 * if one exists, the token's default value if one was given to createContext,
 * or undefined if neither.
 *
 * Never throws. If inject() is called outside of an active context window
 * (outside setup() or outside runWithContext), it returns the token default
 * or undefined — it does NOT throw.
 *
 * MUST be called synchronously during setup() or the SSR render walk.
 * Storing inject()'s result and reading it later is fine; calling inject()
 * itself after setup() returns undefined/default because no map is active.
 *
 * @example
 *   const theme = inject(ThemeToken)  // 'dark' | string | undefined
 */
export function inject<T>(token: ContextToken<T>): T | undefined

/**
 * Run fn with the given context map active for the duration of the call.
 *
 * This is the recommended SSR integration pattern:
 *
 *   const html = await runWithContext(map, () => renderToString(component))
 *
 * The map is installed before fn() is called and cleared after fn()
 * returns — even if fn() throws. The previous SSR map (if any) is
 * restored after the call.
 *
 * Primary API for SSR callers. contextSetup hook in SsrOptions is the
 * escape hatch for cases where the caller cannot wrap renderToString.
 */
export function runWithContext<R>(map: ContextMap, fn: () => R): R
```

### `packages/context/src/ssr.ts` (not in main barrel)

```typescript
/**
 * Set the SSR context map. Called by renderToString/renderToStream before
 * the virtual tree walk begins, and called with null after.
 *
 * This function is exported from the `@aihu/context/ssr` subpath, NOT
 * from the main `@aihu/context` barrel. @aihu/server accesses it only
 * via the contextSetup callback in SsrOptions (the application entry point
 * imports it directly from @aihu/context/ssr and passes it as the callback).
 * This preserves the hard boundary: @aihu/server never imports from
 * @aihu/context at the module level.
 *
 * @internal — for use by @aihu/server integration and runWithContext only
 */
export function setSsrContextMap(map: ReadonlyMap<symbol, unknown> | null): void
```

### Internal module-level slots

Both slots live in `packages/context/src/state.ts` (not exported):

```typescript
// Active context map during a synchronous component setup() invocation.
// Non-null only while a setup() function is executing (browser path).
// Set by the runtime's _setContext wiring before setup(), cleared after.
let _activeMap: ContextMap | null = null

// SSR context map set by setSsrContextMap() / runWithContext().
// Non-null only during a renderToString/renderToStream call.
// Takes precedence over _activeMap when both are non-null (SSR wins).
let _ssrMap: ReadonlyMap<symbol, unknown> | null = null
```

---

## §4 Implementation details

### `createContext<T>(defaultValue?)`

```typescript
export function createContext<T>(defaultValue?: T): ContextToken<T> {
  return {
    _id: Symbol(),
    _default: defaultValue,
  }
}
```

Each call allocates a new `Symbol()` — no arguments, so no global symbol registry. Two calls with the same `T` always produce distinct tokens. Tokens are plain object literals with no prototype magic; they are valid `Map` keys but the implementation uses their `_id` symbol as the actual key (not the object reference) to survive cross-realm scenarios.

### `provide<T>(token, value)`

```typescript
export function provide<T>(token: ContextToken<T>, value: T): void {
  // SSR map takes precedence. During SSR the server controls the map;
  // component setup() calls provide() normally and it writes into the
  // SSR map (which the server constructed before renderToString began).
  const map = (_ssrMap !== null ? _ssrMap : _activeMap) as ContextMap | null
  if (map === null) {
    // Called outside any active window — no-op. Does NOT throw.
    // Dev-mode warning is recommended but not required by this spec.
    return
  }
  map.set(token._id, value)
}
```

Note on SSR map mutability: `setSsrContextMap` accepts `ReadonlyMap<symbol, unknown> | null`. However, `provide()` needs to write into it. The caller of `setSsrContextMap` in the SSR path is expected to pass a mutable `Map`. The cast `as ContextMap | null` is intentional — the `ReadonlyMap` type on `setSsrContextMap`'s parameter is a documentation hint, not a runtime enforcement. If the caller passes a frozen map and `provide()` is called, it will throw a TypeError from `Map.prototype.set` on a read-only receiver — that is the caller's responsibility. Practically, `runWithContext` always passes a mutable `Map` it constructs, and the `contextSetup` hook pattern guides callers to do the same.

### `inject<T>(token)`

```typescript
export function inject<T>(token: ContextToken<T>): T | undefined {
  const map = _ssrMap !== null ? _ssrMap : _activeMap
  if (map !== null && map.has(token._id)) {
    return map.get(token._id) as T
  }
  return token._default
}
```

No throw. No effect registration. Purely synchronous lookup.

### `setSsrContextMap(map)`

```typescript
// packages/context/src/ssr.ts
import { setActiveState } from './state.ts'

export function setSsrContextMap(map: ReadonlyMap<symbol, unknown> | null): void {
  setActiveState({ ssrMap: map })
}
```

`state.ts` exposes a minimal internal setter for `_ssrMap`:

```typescript
// packages/context/src/state.ts

let _activeMap: ContextMap | null = null
let _ssrMap: ReadonlyMap<symbol, unknown> | null = null

export function getActiveMap(): ContextMap | null { return _activeMap }
export function getSsrMap(): ReadonlyMap<symbol, unknown> | null { return _ssrMap }
export function setActiveMap(map: ContextMap | null): void { _activeMap = map }
export function setSsrMap(map: ReadonlyMap<symbol, unknown> | null): void { _ssrMap = map }
```

(The Builder may inline these into the consuming files if the overhead of a second module is measurable in the size budget. The split is shown here for clarity of responsibility.)

### `clearSsrContextMap()`

This function is NOT separately exported. The pattern is `setSsrContextMap(null)` to clear. Callers that want a named clear can use the pattern shown in §6 (`finally { setSsrContextMap(null) }`). `runWithContext` handles the clear automatically.

### `runWithContext<R>(map, fn)`

```typescript
export function runWithContext<R>(map: ContextMap, fn: () => R): R {
  const prev = getSsrMap()
  setSsrMap(map)
  try {
    return fn()
  } finally {
    setSsrMap(prev)
  }
}
```

Note: `runWithContext` saves and restores the previous SSR map rather than unconditionally setting to `null` on exit. This makes nested `runWithContext` calls safe (each restores its predecessor's map). In practice, nesting should be rare in SSR, but the implementation is correct for it.

---

## §5 Runtime integration

### The open decision: runtime-activates-map (chosen)

The Director offered two paths (director note §5.2). This spec selects **Option A: runtime-activates-map**.

Rationale:
- Zero arbor changes needed. No new file in `packages/arbor/`.
- `@aihu/context` remains dependency-free (no arbor import needed).
- The runtime (`@aihu/runtime`) already uses the `_setMount` injection pattern for wiring arbor. Extending it with `_setContext` is symmetric and keeps all cross-package wiring in one place.
- Scout finding B2 confirms `@aihu/arbor` is DOM-coupled; importing from it in a context package would violate the DOM-free constraint.

### The `_setContext` injection pattern

`packages/runtime/src/define-component.ts` gains a new injectable pair, exactly mirroring `_setMount`:

```typescript
// New module-level slots (alongside existing _mount)
type SetContextMapFn = (map: Map<symbol, unknown> | null) => void

let _setContextMap: SetContextMapFn | null = null

/**
 * Inject the setActiveContextMap function from @aihu/context.
 * Must be called once at app boot, alongside _setMount.
 *
 * If not called, context is simply unavailable (provide/inject no-op).
 * This keeps @aihu/context optional — apps that don't use context
 * skip this wiring entirely.
 *
 * Wiring:
 *   import { setActiveMap } from '@aihu/context/src/state'
 *   import { _setContext } from '@aihu/runtime/src/define-component'
 *   _setContext(setActiveMap)
 *
 * @internal
 */
export function _setContext(fn: SetContextMapFn): void {
  _setContextMap = fn
}
```

### Modified `connectedCallback` in `defineComponent`

```typescript
connectedCallback(): void {
  if (_mount === null) {
    throw new RuntimeError(
      'SCR-R0002',
      '_setMount(mount) must be called once at app boot before defineComponent elements connect',
    )
  }
  const host: ShadowRoot | Element = this.shadowRoot ?? this
  const ctx: SetupContext = { host, element: this }

  // Activate a fresh context map for this component's setup() window.
  // inject() calls inside setup() read from this map.
  // provide() calls inside setup() write into this map.
  const contextMap = new Map<symbol, unknown>()
  _setContextMap?.(contextMap)
  try {
    const tree = setup(ctx)
    this[SCOPE] = _mount(tree, host)
  } finally {
    // Always clear — even if setup() throws, no map should remain active.
    _setContextMap?.(null)
  }
}
```

### V1 constraint: no parent-to-child context threading

At v1, each component's `connectedCallback` creates a **fresh, empty** `Map<symbol, unknown>` for its setup window. There is no mechanism for a parent component's provided values to flow into a child component's setup.

Concretely: if `ParentComponent` calls `provide(ThemeToken, 'dark')` in its setup, and `ChildComponent` calls `inject(ThemeToken)` in its setup, the child receives `undefined` (or the token default). The two setup invocations happen in separate `connectedCallback` calls, each with their own fresh map.

**v1.1** will address this by threading the parent's context map through to child setup via a DOM walk (`closest('[data-aihu-ctx]')`) or by the runtime tracking the currently mounted scope's context map in a parent chain. This is explicitly out of scope for Plan 2.1.

**What does work at v1:**
- SSR context: the server builds a full map and all `inject()` calls during the render walk read from it.
- `runWithContext`: a single synchronous execution window where `provide()` and `inject()` share the same map.
- Single-component context: a component that calls both `provide(token, value)` and `inject(token)` in the same setup function (e.g., to read a default and then override it) — both see the same active map.

**Document this constraint to users**: `inject()` during browser component setup only returns a value if `provide()` was called in the same component's setup, or if a global context was set up via `runWithContext` wrapping the entire mount tree. The full "ancestor provide, descendant inject" pattern requires v1.1.

### App boot wiring

An app that uses context must wire up `_setContext` alongside `_setMount`:

```typescript
// app/boot.ts
import { mount } from '@aihu/arbor'
import { _setMount, _setContext } from '@aihu/runtime/src/define-component'
import { setActiveMap } from '@aihu/context/src/state'

_setMount(mount)
_setContext(setActiveMap)
```

If `_setContext` is not called, context simply does not activate during setup — `provide()` and `inject()` silently no-op (no map is active). Applications that do not use context pay zero overhead.

---

## §6 SSR integration

### `SsrOptions` gains two new optional fields

In `packages/server/src/ssr.ts`, `SsrOptions` receives:

```typescript
export interface SsrOptions {
  // ... existing fields unchanged ...

  /**
   * Context map for SSR rendering. Values in this map are available to
   * inject() calls made during the synchronous renderToString tree walk.
   *
   * Callers may also use runWithContext() from @aihu/context to wrap
   * renderToString instead of using this field — both patterns are valid.
   *
   * @example
   *   const map = new Map()
   *   map.set(ThemeToken._id, 'dark')
   *   await renderToString(component, { contextMap: map })
   */
  readonly contextMap?: ReadonlyMap<unknown, unknown>

  /**
   * Optional hook called immediately before the render walk begins.
   * Use to call setSsrContextMap() when you cannot use contextMap directly.
   *
   * This hook preserves the hard package boundary: @aihu/server never
   * imports @aihu/context at the module level. The application entry
   * point imports setSsrContextMap from @aihu/context/ssr and passes
   * it wrapped in this callback.
   *
   * @example
   *   import { setSsrContextMap } from '@aihu/context/ssr'
   *   await renderToString(component, {
   *     contextSetup: () => setSsrContextMap(myMap),
   *   })
   */
  readonly contextSetup?: () => void
}
```

Both fields are additive and backward-compatible. Existing callers that pass neither field see no behavior change.

### `renderToStream` call sequence (context wiring)

`renderToString` currently delegates to `renderToStream`. The context wiring must be applied before `renderToStream`'s `ReadableStream` `start()` callback runs. Since the `start()` callback is synchronous (it is called synchronously inside the `ReadableStream` constructor), the context setup can happen just before the `renderToStream` call:

```typescript
// Updated renderToString pseudo-code showing context wiring:
export async function renderToString(
  component: ComponentDescription,
  opts?: SsrOptions,
): Promise<string> {
  // Install context before the stream walk begins.
  // The stream's start() callback is synchronous, so this window covers it.
  if (opts?.contextMap) {
    opts.contextSetup?.()  // contextSetup fires first if both provided
    // Note: if contextSetup already called setSsrContextMap, contextMap
    // is ignored. Document this: contextSetup takes precedence over contextMap
    // if both are provided (contextSetup is the escape hatch).
  } else {
    opts?.contextSetup?.()
  }

  const stream = renderToStream(component, opts)
  const reader = stream.getReader()
  const chunks: string[] = []
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
    // Clear SSR context after render completes — prevents cross-request leakage.
    // @aihu/server does NOT import setSsrContextMap directly.
    // Clearing is the responsibility of the contextSetup caller (who set it).
    // The recommended pattern (runWithContext) handles this automatically via finally.
  }
  return chunks.join('')
}
```

**Recommended primary pattern for SSR callers** — `runWithContext`:

```typescript
import { runWithContext } from '@aihu/context'
import { renderToString } from '@aihu/server'

const map = new Map()
map.set(ThemeToken._id, 'dark')
map.set(UserToken._id, currentUser)

// runWithContext installs the map, calls the fn, and always clears on exit.
const html = await runWithContext(map, () => renderToString(component, opts))
```

This is the **primary documented API** because:
- It composes with any async operation, not just `renderToString`.
- The caller manages the map's lifetime explicitly.
- No changes to `renderToString` are required for the basic use case.
- `@aihu/server` does not need to import anything from `@aihu/context`.

The `contextSetup` hook in `SsrOptions` is the **escape hatch** for situations where the caller cannot wrap `renderToString` in a function (e.g., when using a third-party framework adapter that calls `renderToString` internally).

### Hard boundary preservation

`@aihu/server` **never imports from `@aihu/context`** at the module level. The `contextSetup` hook pattern means the application entry point does the import and the server just calls the callback. The `contextMap` field is typed as `ReadonlyMap<unknown, unknown>` — a standard TypeScript built-in type, no cross-package import needed.

The package dependency graph remains:

```
@aihu/context    ← no deps
@aihu/server     ← no @aihu/context import (uses callback injection only)
```

---

## §7 Constraints

### Calling constraints

**`inject()` only works during setup.** Specifically, `inject()` returns a meaningful value only when called during the synchronous execution window where a context map is active:
- Browser: inside a `setup(ctx)` call initiated by `connectedCallback` (after `_setContext` wiring is in place).
- SSR: inside a synchronous `renderToString` tree walk, or inside the `fn` argument to `runWithContext`.

Calling `inject()` after `setup()` returns (e.g., storing it in a `setTimeout` callback, or calling it from inside a signal `effect()`) returns `undefined` or the token default. **This is not a programming error that throws** — it is silent. Callers who need the injected value in an effect should capture it during setup:

```typescript
// Correct: capture during setup, use in effect
const theme = inject(ThemeToken)  // captured synchronously
effect(() => {
  document.body.dataset.theme = theme ?? 'light'
})

// Wrong: inject() inside effect always returns undefined
effect(() => {
  const theme = inject(ThemeToken)  // always undefined — no map active here
})
```

**`provide()` outside an active window is a no-op.** It does not throw. There is no dev-mode warning at v1 (can be added later).

### DOM freedom constraint

`@aihu/context` source files must contain **zero references to**:
- `window`
- `document`
- `Element`, `HTMLElement`, `ShadowRoot`, `Node`
- `parentElement`, `closest`, `getAttribute`, `setAttribute`
- Any browser global

This constraint enables `@aihu/context` to run in Workers, Deno, Bun, and pure Node.js without any polyfills or `jsdom`. Tests 9 and 10 (see §8) must use `/* @vitest-environment node */` to mechanically verify this.

### No arbor import

`@aihu/context` source must have **zero imports from `@aihu/arbor`**. Not even `import type`. The only context-adjacent arbor change in this plan is the addition of `_setContext` to `@aihu/runtime/src/define-component.ts`, which `@aihu/runtime` owns.

### Nested component isolation (v1)

Parent-to-child context propagation through the DOM hierarchy is not implemented at v1. Each component's setup window uses a fresh map. This is documented as a v1.1 deliverable. Do not attempt to implement DOM-walk-based injection in this PR.

---

## §8 Tests

**File:** `packages/context/tests/context.test.ts`
**Minimum:** 10 test cases
**Framework:** vitest

### Test case list

**T1 — Token identity**
```typescript
it('createContext returns a distinct token on each call', () => {
  const t1 = createContext<string>()
  const t2 = createContext<string>()
  expect(t1).not.toBe(t2)
  expect(t1._id).not.toBe(t2._id)
})
```

**T2 — Basic provide + inject round-trip**
```typescript
it('provide + inject round-trip returns the provided value', () => {
  const token = createContext<string>()
  const map = new Map<symbol, unknown>()
  runWithContext(map, () => {
    provide(token, 'hello')
    expect(inject(token)).toBe('hello')
  })
})
```

**T3 — inject with no provider and no default returns undefined**
```typescript
it('inject with no provider and no default returns undefined', () => {
  const token = createContext<string>()
  const map = new Map<symbol, unknown>()
  runWithContext(map, () => {
    expect(inject(token)).toBeUndefined()
  })
})
```

**T4 — inject returns createContext default when no provider**
```typescript
it('inject returns createContext default when no provider is in scope', () => {
  const token = createContext<string>('default-value')
  const map = new Map<symbol, unknown>()
  runWithContext(map, () => {
    expect(inject(token)).toBe('default-value')
  })
})
```

**T5 — Shadow behavior: second provide for same token overwrites first**
```typescript
it('second provide for same token overwrites first (innermost wins)', () => {
  const token = createContext<number>()
  const map = new Map<symbol, unknown>()
  runWithContext(map, () => {
    provide(token, 1)
    provide(token, 2)
    expect(inject(token)).toBe(2)
  })
})
```

**T6 — Two separate tokens with same type do not interfere**
```typescript
it('two separate tokens for same T do not interfere', () => {
  const t1 = createContext<string>()
  const t2 = createContext<string>()
  const map = new Map<symbol, unknown>()
  runWithContext(map, () => {
    provide(t1, 'alpha')
    provide(t2, 'beta')
    expect(inject(t1)).toBe('alpha')
    expect(inject(t2)).toBe('beta')
  })
})
```

**T7 — runWithContext: values available inside fn, cleared after**
```typescript
it('runWithContext: values available inside fn, cleared after fn returns', () => {
  const token = createContext<string>()
  const map = new Map<symbol, unknown>([[token._id, 'inside']])

  let insideValue: string | undefined
  runWithContext(map, () => {
    insideValue = inject(token)
  })

  expect(insideValue).toBe('inside')
  expect(inject(token)).toBeUndefined()  // cleared after
})
```

**T8 — runWithContext: map cleared even when fn throws**
```typescript
it('runWithContext: map is cleared even when fn throws', () => {
  const token = createContext<string>()
  const map = new Map<symbol, unknown>([[token._id, 'value']])

  expect(() => {
    runWithContext(map, () => {
      throw new Error('test error')
    })
  }).toThrow('test error')

  // Map must be cleared even after throw
  expect(inject(token)).toBeUndefined()
})
```

**T9 — SSR path via setSsrContextMap (node environment)**
```typescript
/* @vitest-environment node */
it('SSR: inject reads from map set by setSsrContextMap', () => {
  const token = createContext<string>()
  const map = new Map<symbol, unknown>([[token._id, 'ssr-value']])

  setSsrContextMap(map)
  try {
    expect(inject(token)).toBe('ssr-value')
  } finally {
    setSsrContextMap(null)
  }
})
```

**T10 — SSR path cleared after setSsrContextMap(null) (node environment)**
```typescript
/* @vitest-environment node */
it('SSR: inject returns undefined/default after setSsrContextMap(null)', () => {
  const token = createContext<string>('fallback')
  const map = new Map<symbol, unknown>([[token._id, 'ssr-value']])

  setSsrContextMap(map)
  setSsrContextMap(null)

  // Should fall back to createContext default after clear
  expect(inject(token)).toBe('fallback')
})
```

### Additional recommended tests (beyond the 10 required)

- **T11** — `provide()` called outside any active window (no map) is a no-op and does not throw.
- **T12** — Nested `runWithContext` calls: inner map restored to outer map on exit; outer map active again after inner completes.
- **T13** — `inject()` called outside any active window (no `runWithContext`, no `setSsrContextMap`) returns token default.

---

## §9 Package infra checklist

The Builder must create all items marked [CREATE] and modify items marked [MODIFY].

### `packages/context/` — new directory [CREATE]

```
packages/context/
  package.json          [CREATE — see §2]
  tsconfig.json         [CREATE — see below]
  rolldown.config.ts    [CREATE — see below]
  moon.yml              [CREATE — see below]
  src/
    index.ts            [CREATE — public barrel]
    types.ts            [CREATE — ContextToken<T>, ContextMap]
    state.ts            [CREATE — _activeMap, _ssrMap slots + getters/setters]
    ssr.ts              [CREATE — setSsrContextMap, exported as @aihu/context/ssr]
  tests/
    context.test.ts     [CREATE — 10+ test cases from §8]
```

### `packages/context/tsconfig.json` [CREATE]

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "dist",
    "noEmit": true
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

Note: no `"lib"` override. `@aihu/context` is DOM-free, so inheriting the base `lib: ["ES2022", "DOM", "DOM.Iterable"]` is fine — having the DOM types available does not mean the code uses them. The no-DOM constraint is enforced by the test environment (T9, T10) and code review, not by tsconfig.

### `packages/context/rolldown.config.ts` [CREATE]

```typescript
import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

export default defineConfig({
  input: {
    index: 'src/index.ts',
    ssr: 'src/ssr.ts',
  },
  output: {
    dir: 'dist',
    format: 'esm',
    sourcemap: true,
    minify: true,
  },
  plugins: [dts()],
})
```

Two entry points (`index` and `ssr`) produce `dist/index.js` + `dist/index.d.ts` and `dist/ssr.js` + `dist/ssr.d.ts`, matching the `exports` map in `package.json`.

### `packages/context/moon.yml` [CREATE]

```yaml
# yaml-language-server: $schema=https://moonrepo.dev/schemas/project.json
language: typescript
layer: library
```

No `dependsOn` because `@aihu/context` has zero workspace dependencies. (If the dependency on `@aihu/signals` were added for types, `dependsOn: ['signals']` would be needed, but it is not needed at v1.)

### Root `vitest.config.ts` [MODIFY]

Add to `resolve.alias` block:

```typescript
'@aihu/context': new URL('./packages/context/src/index.ts', import.meta.url).pathname,
```

### Root `.size-limit.json` [MODIFY]

Add one row (agent limit fix was already applied at HEAD):

```json
{
  "name": "@aihu/context",
  "path": "packages/context/dist/index.js",
  "limit": "300 B",
  "gzip": true
}
```

### `packages/server/src/ssr.ts` [MODIFY — additive only]

Add two optional fields to `SsrOptions` (exact TypeScript in §6). No existing fields changed. `StreamOptions` in `stream-types.ts` extends `SsrOptions` (`export interface StreamOptions extends SsrOptions {}`), so both `renderToString` and `renderToStream` gain the new fields automatically.

The `renderToString` function body gains context setup logic (exact pseudo-code in §6). The `renderToStream` function body is unchanged — context setup happens in `renderToString` before the stream starts.

### `packages/runtime/src/define-component.ts` [MODIFY — additive only]

Add `_setContext(fn)` injection function and extend `connectedCallback` to activate/clear the context map around `setup()` invocation. See §5 for exact TypeScript.

`_setContext` is internal-but-exported (same pattern as `_setMount`). It is NOT added to `packages/runtime/src/index.ts`.

### Do-not-break list

The Builder must NOT modify:
- `packages/signals/` — any file
- `packages/arbor/` — any file (zero arbor changes needed with the runtime-activates-map choice)
- `packages/runtime/src/index.ts` — the public barrel (only `src/define-component.ts` is modified)
- `packages/runtime/src/define-element.ts` — not touched
- `packages/server/src/index.ts` — existing exports unchanged

---

## §10 Size estimate

### Source line count estimate

| File | Estimated lines |
|---|---|
| `src/types.ts` | ~15 lines |
| `src/state.ts` | ~20 lines |
| `src/index.ts` | ~55 lines |
| `src/ssr.ts` | ~15 lines |
| **Total source** | **~105 lines** |

### Bundle size estimate

The implementation is 4 functions + 2 module-level variables + 1 plain-object factory. No loops, no recursion, no imports. Minified and gzipped:

- `createContext`: allocates a plain object with 2 fields → ~30 B gz
- `provide`: one conditional + one `Map.set` → ~25 B gz
- `inject`: one conditional + one `Map.get` + default return → ~30 B gz
- `runWithContext`: save/restore + try/finally → ~35 B gz
- Module slots + exports boilerplate → ~40 B gz
- **Estimated total: ~160 B gz**

This is well within the 200 B target and comfortably under the 300 B hard limit.

The `ssr.ts` entry (just `setSsrContextMap`) adds ~20 B gz if loaded, but it is a separate chunk loaded only when the SSR path is used. It does not count against the main barrel's limit.

### Budget verdict

Target: 200 B gz. Estimate: ~160 B gz. Hard limit: 300 B gz. **Fits.**

---

## Appendix: Dependency graph after Plan 2.1

```
@aihu/signals          ← no deps
    ↑
@aihu/arbor            ← depends on signals
    ↑
@aihu/runtime          ← _setMount dep on arbor (injected); _setContext dep on context (injected)
    ↑
@aihu/agent            ← no deps
@aihu/context          ← no deps  ← NEW

════════════ HARD BOUNDARY ════════════

@aihu/server           ← no @aihu/context import (contextSetup callback pattern)
    ↑
@aihu/agent-readiness  ← depends on @aihu/server + @aihu/agent
```

`@aihu/context` sits above the hard boundary with zero imports from any other aihu package. `@aihu/server` remains below the hard boundary and never imports from `@aihu/context`.

---

*Track B Architect, 2026-04-30. Plan 2.1 spec complete. Ready for Builder dispatch.*
