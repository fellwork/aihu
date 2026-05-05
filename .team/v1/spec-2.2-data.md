# Spec 2.2 — `@aihu/data` Plan

**Status:** READY FOR BUILDER
**Date:** 2026-04-30
**Plan:** 2.2
**Package:** `@aihu/data`
**Branch:** `feat/v1-data` (sequential after Plan 2.1 merge)
**Depends on:** Plan 2.1 (`@aihu/context`) merged to `main`

---

## 0. Summary

`@aihu/data` is the signal-native, backend-agnostic data fetching primitive for aihu v1. It exposes a single public function — `createResource` — that wraps any `(key: string) => Promise<T>` fetcher in a reactive `Resource<T>` object backed by a shared, context-injectable cache store. Resources dehydrate to JSON at SSR time and rehydrate on the client without a second network round-trip.

This is a Layer 3 (Surface) browser package. It ships in every app that uses async data. Its size budget is **500 B gzip**.

---

## 1. Package overview

### 1.1 Problem

Components need to load async data reactively — re-fetching when a key changes, skipping the fetch when the key is absent, and sharing cached results across siblings. Without a standard primitive, every component reinvents this logic, and SSR rehydration is impossible.

### 1.2 What `@aihu/data` provides

- `createResource<T>` — reactive data resource backed by a signal-reactive key
- `DataState<T>` — five-state discriminated union modelling all async lifecycle states
- `Resource<T>` — the return type: state signal + imperative controls (`refetch`, `invalidate`)
- `ResourceStore` — the cache backing store interface
- `createResourceStore()` — factory for the default in-memory store
- `ResourceStoreToken` — context token for store injection via `@aihu/context`
- `createResourceSerializer(store)` — SSR dehydration helper for `SsrOptions.serializer`

### 1.3 Dependency graph

```
@aihu/data
  ├── @aihu/signals   (signal, effect, Signal type)
  └── @aihu/context   (inject, ContextToken — for ResourceStoreToken injection)
```

These are the **only two dependencies**. `@aihu/data` does NOT import from `@aihu/server`, `@aihu/arbor`, `@aihu/runtime`, or any Layer 4 package. The hard package boundary is maintained: `@aihu/data` is a browser-safe package; `@aihu/context` is also browser-safe.

### 1.4 What `@aihu/data` does NOT provide

- Fetch adapters — those live in `@aihu/data-fetch` (separate package, separate plan)
- WebSocket / streaming adapters — `fromWebSocket()` is a future adapter; `@aihu/data` reserves the `'streaming'` state in `DataState<T>` as a forward-compatibility slot only
- SSR rendering integration — `@aihu/data` provides `createResourceSerializer`; wiring it into `renderToString` is the application's responsibility via `SsrOptions.serializer`

---

## 2. Public API surface

The following TypeScript definitions are the complete public surface of `@aihu/data`. They are locked — the Builder must not deviate from these signatures.

### 2.1 `DataState<T>` — five-state discriminated union

```typescript
/**
 * All possible states of a reactive resource.
 *
 * Discriminated on `status`. Consumers should exhaustively match all five
 * cases; the `streaming` case should be handled as a default/fallthrough
 * until streaming adapters are available in v1+.
 */
export type DataState<T> =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'ready';     readonly data: T }
  | { readonly status: 'error';     readonly error: unknown }
  | { readonly status: 'streaming'; readonly data: T; readonly done: false }
```

### 2.2 `Resource<T>` — resource handle

```typescript
/**
 * The object returned by createResource. Combines a reactive state signal
 * with imperative controls.
 *
 * .state is a Signal<DataState<T>> — read it inside effects and templates
 * exactly as any other signal (value[0]() to get the current state).
 */
export interface Resource<T> {
  readonly state: Signal<DataState<T>>
  /** Immediately trigger a new fetch for the current key, bypassing cache. */
  refetch(): void
  /**
   * Mark the cached entry stale. Does NOT trigger an immediate fetch.
   * The next refetch() call or key-signal change will perform a fresh fetch.
   */
  invalidate(): void
}
```

### 2.3 `ResourceOptions<T>`

```typescript
export interface ResourceOptions<T> {
  /**
   * Initial value surfaced as { status: 'ready', data: initialData } before
   * the first fetch completes. If omitted, the resource starts as { status: 'idle' }.
   */
  initialData?: T
  /**
   * When true, this resource is included in the SSR dehydration payload
   * emitted by createResourceSerializer(). Default: false.
   */
  dehydrate?: boolean
  /**
   * Cache store to use. When omitted, createResource attempts to inject
   * ResourceStoreToken from @aihu/context; if that also yields undefined,
   * the module-level default singleton store is used.
   */
  store?: ResourceStore
}
```

### 2.4 `createResource<T>` — the primary API

```typescript
/**
 * Create a reactive data resource.
 *
 * @param key      Reactive signal whose string value is the cache key.
 *                 null or undefined → resource stays idle (no fetch fired).
 *                 When the signal changes to a new string, the resource
 *                 automatically fetches the new key.
 * @param fetcher  Any (key: string) => Promise<T>. Backend-agnostic.
 *                 Called with the resolved key string at fetch time.
 * @param options  Cache store, dehydration flag, initial data.
 */
export function createResource<T>(
  key: Signal<string | null | undefined>,
  fetcher: (key: string) => Promise<T>,
  options?: ResourceOptions<T>,
): Resource<T>
```

### 2.5 `ResourceStore` — cache store interface

```typescript
export interface ResourceStore {
  get(key: string): DataState<unknown> | undefined
  set(key: string, state: DataState<unknown>): void
  delete(key: string): void
  entries(): IterableIterator<[string, DataState<unknown>]>
}

/** Create a new in-memory ResourceStore. */
export function createResourceStore(): ResourceStore
```

### 2.6 `ResourceStoreToken` — context injection token

```typescript
/**
 * Context token for the ResourceStore.
 * Inject in component setup: const store = inject(ResourceStoreToken)
 * Provide at app root:       provide(ResourceStoreToken, createResourceStore())
 */
export const ResourceStoreToken: ContextToken<ResourceStore>
```

`ResourceStoreToken` is created via `createContext<ResourceStore>()` (imported from `@aihu/context`) at module load time. It has no default value — `inject(ResourceStoreToken)` returns `undefined` when no store is provided, which causes `createResource` to fall back to the module-level singleton.

### 2.7 `createResourceSerializer` — SSR dehydration

```typescript
/**
 * Returns a serializer function compatible with SsrOptions.serializer.
 * The serializer emits all store entries that are:
 *   (a) status === 'ready', AND
 *   (b) marked with { dehydrate: true } in their ResourceOptions.
 *
 * Dehydration-eligible entries are tracked by the store at registration
 * time (see §6.2 for the tracking mechanism).
 *
 * Usage:
 *   const store = createResourceStore()
 *   await renderToString(app, {
 *     serializer: createResourceSerializer(store),
 *   })
 */
export function createResourceSerializer(store: ResourceStore): () => Record<string, unknown>
```

---

## 3. State machine

### 3.1 State definitions

| State | Meaning | Has `.data` | Has `.error` |
|---|---|---|---|
| `idle` | Key is null/undefined; no fetch attempted | No | No |
| `loading` | Fetch in-flight | No | No |
| `ready` | Fetch succeeded; data is current | Yes | No |
| `error` | Fetch failed | No | Yes |
| `streaming` | Reserved; never produced by v1 `createResource` | Yes | No |

### 3.2 Transitions

```
                    key becomes non-null
                    (or key changes to new value)
idle ─────────────────────────────────────────────► loading
  ▲                                                     │
  │ key becomes null/undefined                          │ fetch resolves
  │                                                     ▼
  │                              ┌──────────────── ready ◄──────────────┐
  │                              │                  │                   │
  │                              │ refetch()        │ invalidate()      │
  │                              │                  │ (stays ready,     │ fetch
  │                              │                  │  marks stale)     │ resolves
  │                              └─────────► loading◄──────────────────┘
  │                                               │
  │                                               │ fetch rejects
  │                                               ▼
  │                                            error
  │                                               │
  │                                               │ refetch()
  └───────────────────────────────────────────────┘
```

### 3.3 Transition rules — exact state per operation

| Operation | Pre-state | Post-state | Notes |
|---|---|---|---|
| Key signal → non-null | `idle` | `loading` | Fetch starts |
| Key signal → different non-null | `ready` / `error` | `loading` | Previous cached entry discarded from signal state; new key's store entry used |
| Key signal → null / undefined | any | `idle` | In-flight fetch result is discarded |
| Fetch resolves (success) | `loading` | `ready` | Store entry updated |
| Fetch rejects | `loading` | `error` | Store entry updated |
| `refetch()` | `ready` / `error` / `loading` | `loading` | Immediately starts a new fetch for the current key, bypassing the cache entry |
| `invalidate()` | `ready` | `ready` (stale) | The signal state does NOT change; only an internal stale flag is set in the store entry. The next `refetch()` or key-signal change will fetch fresh |
| `invalidate()` called on non-ready state | any | no change | No-op |

### 3.4 Streaming state

`{ status: 'streaming' }` is part of the `DataState<T>` union for forward compatibility with `fromWebSocket()` and `fromReadableStream()` adapters planned for v1+. Standard `createResource` with a `Promise<T>` fetcher **never** transitions to `'streaming'`.

**Builder instruction:** Do NOT implement any code path that emits `{ status: 'streaming' }` in `createResource`. The type must be present in the union for exhaustive matching and future adapters, but no runtime logic in this package produces it.

---

## 4. Internal implementation guide

### 4.1 Module structure

```
packages/data/src/
  index.ts       — public barrel (all exports)
  resource.ts    — createResource implementation
  store.ts       — ResourceStore interface, createResourceStore, ResourceStoreToken
  serializer.ts  — createResourceSerializer
  types.ts       — DataState<T>, Resource<T>, ResourceOptions<T>
```

### 4.2 `createResource` internals

`createResource` uses `effect()` from `@aihu/signals` to watch the key signal and manage the fetch lifecycle.

**Pseudocode — internal implementation guide:**

```typescript
import { signal, effect } from '@aihu/signals'
import type { Signal } from '@aihu/signals'
import { inject } from '@aihu/context'
import { ResourceStoreToken, createResourceStore } from './store.ts'
import type { DataState, Resource, ResourceOptions } from './types.ts'

// Module-level default singleton store
let _defaultStore: ResourceStore | null = null
function getDefaultStore(): ResourceStore {
  if (_defaultStore === null) _defaultStore = createResourceStore()
  return _defaultStore
}

export function createResource<T>(
  key: Signal<string | null | undefined>,
  fetcher: (key: string) => Promise<T>,
  options?: ResourceOptions<T>,
): Resource<T> {
  // 1. Resolve the cache store
  //    Priority: options.store > inject(ResourceStoreToken) > module singleton
  const store: ResourceStore =
    options?.store ??
    inject(ResourceStoreToken) ??
    getDefaultStore()

  // 2. Determine initial state
  const initialState: DataState<T> =
    options?.initialData !== undefined
      ? { status: 'ready', data: options.initialData }
      : { status: 'idle' }

  // 3. Create the state signal
  const [getState, setState] = signal<DataState<T>>(initialState)

  // 4. Stale flag — set by invalidate(), cleared on each new fetch
  let _stale = false

  // 5. Active fetch guard — prevents a stale Promise from overwriting newer state
  let _fetchId = 0

  // 6. Register this resource with the store if dehydrate: true
  //    (Store tracks dehydration eligibility separately from cache entries)
  if (options?.dehydrate === true) {
    store.setDehydratable?.(/* resource reference — see §6.2 */)
  }

  // 7. Watch the key signal via effect()
  //    effect() runs immediately and re-runs whenever key[0]() changes.
  const disposeEffect = effect(() => {
    const currentKey = key[0]()

    if (currentKey == null) {
      // Null/undefined key → idle
      setState({ status: 'idle' })
      return
    }

    // Check if a ready cache entry exists and is not stale
    const cached = store.get(currentKey)
    if (cached !== undefined && cached.status === 'ready' && !_stale) {
      setState(cached as DataState<T>)
      return
    }

    // Start a new fetch
    _stale = false
    const fetchId = ++_fetchId
    setState({ status: 'loading' })

    fetcher(currentKey).then(
      (data) => {
        if (fetchId !== _fetchId) return   // superseded by a newer fetch
        const next: DataState<T> = { status: 'ready', data }
        store.set(currentKey, next as DataState<unknown>)
        setState(next)
      },
      (error: unknown) => {
        if (fetchId !== _fetchId) return
        const next: DataState<T> = { status: 'error', error }
        store.set(currentKey, next as DataState<unknown>)
        setState(next)
      },
    )
  })

  // 8. Build and return the Resource<T> handle
  return {
    state: [getState, () => { throw new Error('Resource state is read-only') }] as unknown as Signal<DataState<T>>,
    refetch(): void {
      const currentKey = key[0]()
      if (currentKey == null) return
      _stale = true   // force bypass of cache check in next effect run
      // Re-trigger the effect by deleting the store entry, then manually fetching
      store.delete(currentKey)
      _fetchId++
      const fetchId = _fetchId
      setState({ status: 'loading' })
      fetcher(currentKey).then(
        (data) => {
          if (fetchId !== _fetchId) return
          const next: DataState<T> = { status: 'ready', data }
          store.set(currentKey, next as DataState<unknown>)
          setState(next)
          _stale = false
        },
        (error: unknown) => {
          if (fetchId !== _fetchId) return
          const next: DataState<T> = { status: 'error', error }
          store.set(currentKey, next as DataState<unknown>)
          setState(next)
          _stale = false
        },
      )
    },
    invalidate(): void {
      const currentKey = key[0]()
      if (currentKey == null) return
      const current = store.get(currentKey)
      if (current?.status !== 'ready') return
      // Mark stale but do NOT change the signal state — UI still shows ready data
      _stale = true
      // Mark the store entry stale without removing it
      store.setStale?.(currentKey)   // optional store method — see §5.3
    },
    dispose(): void {
      disposeEffect()
    },
  }
}
```

**Key invariants the Builder must uphold:**

1. The `_fetchId` guard is mandatory. Without it, a slow fetch for key `"A"` could overwrite the result of a fast fetch for key `"B"` that came after.
2. `effect()` runs synchronously once on creation. If the key is already non-null and a cache entry exists and is fresh, the resource initializes to `ready` without firing the fetcher.
3. `invalidate()` must NOT change `getState()`. The signal stays `ready` — the stale flag is internal. This allows UIs to continue showing the last known data while a background refetch is pending.
4. The `dispose()` method (not on the `Resource<T>` interface but on the internal handle) calls `disposeEffect()` to stop watching the key signal. This must be exposed so tests and component teardown can release effects. See §8 (test 12) for the dispose test.

> **Architect note on `Resource<T>` interface vs. `dispose()`:** The `Resource<T>` interface defined in §2.2 does not include `dispose()`. This is intentional — `dispose()` is not part of the public contract (component teardown is handled by the framework effect lifecycle). However, `createResource` should return an object that has a `dispose()` method accessible via internal typing or an extended interface. The Builder should define an internal `ResourceHandle<T>` that extends `Resource<T>` with `dispose(): void`, and return `ResourceHandle<T>` from `createResource`'s implementation while the public return type is `Resource<T>`.

### 4.3 Store resolution priority

```
1. options.store             (explicit, highest priority)
2. inject(ResourceStoreToken) from @aihu/context  (context-provided)
3. module-level singleton    (fallback, lowest priority)
```

The `inject(ResourceStoreToken)` call happens at `createResource` invocation time (i.e., during component setup), not lazily at fetch time. This matches `@aihu/context`'s model: injection is synchronous and scoped to the setup call.

### 4.4 Key-signal change behaviour

When `key[0]()` changes from `"A"` to `"B"` during an `effect()` re-run:

1. The effect sees the new value `"B"`.
2. `_fetchId` is incremented — any in-flight fetch for `"A"` whose Promise resolves later will be a no-op (stale fetch guard).
3. The store is checked for a cached entry at key `"B"`.
4. If a fresh entry exists, the state is set to `ready` immediately from cache.
5. If not, state transitions to `loading` and a new fetch for `"B"` fires.

The store entry for `"A"` is NOT deleted from the store on key change — it remains cached for potential future use by other resources or if the key reverts to `"A"`.

---

## 5. Cache store

### 5.1 `ResourceStore` interface

```typescript
export interface ResourceStore {
  /** Get the cached state for a key, or undefined if not cached. */
  get(key: string): DataState<unknown> | undefined
  /** Write a state entry into the cache. */
  set(key: string, state: DataState<unknown>): void
  /** Delete a cache entry (used by refetch() to force a fresh load). */
  delete(key: string): void
  /** Iterate all entries (used by createResourceSerializer). */
  entries(): IterableIterator<[string, DataState<unknown>]>
}
```

### 5.2 `createResourceStore()`

```typescript
export function createResourceStore(): ResourceStore {
  const _map = new Map<string, DataState<unknown>>()
  return {
    get: (key) => _map.get(key),
    set: (key, state) => { _map.set(key, state) },
    delete: (key) => { _map.delete(key) },
    entries: () => _map.entries(),
  }
}
```

This is a plain `Map`-backed implementation. No eviction, no TTL, no LRU in v1. Store size is bounded by the application's usage patterns.

### 5.3 Stale tracking

The `ResourceStore` interface does not include `setStale`/`getStale` methods — staleness is an internal detail of `createResource`. The `_stale` flag is a closure variable scoped to each `createResource` call, not a store property. This keeps the `ResourceStore` interface simple and focused on cache I/O.

`invalidate()` sets `_stale = true` in the closure. The next `refetch()` call or key-signal change will bypass the cache check because `_stale` is tested before using the store entry.

### 5.4 `ResourceStoreToken`

```typescript
import { createContext } from '@aihu/context'
import type { ResourceStore } from './store.ts'

export const ResourceStoreToken = createContext<ResourceStore>()
```

No default value is provided. `inject(ResourceStoreToken)` returns `undefined` when no store is provided via `provide()`. `createResource` falls through to the module singleton in that case.

### 5.5 Context injection pattern

Application root (example wiring):

```typescript
import { provide } from '@aihu/context'
import { createResourceStore, ResourceStoreToken } from '@aihu/data'

// In the root component's setup():
const store = createResourceStore()
provide(ResourceStoreToken, store)
```

All descendant `createResource` calls that do not specify `options.store` will inject this store and share the same cache. Multiple resources with the same key string will share the same cached result.

SSR wiring (via `runWithContext`):

```typescript
import { runWithContext } from '@aihu/context'
import { createResourceStore, ResourceStoreToken, createResourceSerializer } from '@aihu/data'
import { renderToString } from '@aihu/server'

const store = createResourceStore()
const contextMap = new Map()
contextMap.set(ResourceStoreToken._id, store)

const html = await runWithContext(contextMap, () =>
  renderToString(appComponent, {
    serializer: createResourceSerializer(store),
  }),
)
```

---

## 6. SSR dehydration

### 6.1 Overview

During SSR, resources with `{ dehydrate: true }` in their `ResourceOptions` are fetched server-side and their `ready` results are embedded in the HTML as JSON. On the client, `createResource` checks the dehydrated store before firing the fetcher — if a matching `ready` entry is found, the resource starts as `ready` with no network round-trip.

### 6.2 Dehydration tracking

`createResourceSerializer` needs to know which store entries were created with `{ dehydrate: true }`. Since `ResourceStore.entries()` returns all entries and not all should be serialized, a tracking mechanism is needed.

**Implementation approach:** `createResource` maintains a separate module-level (or store-scoped) `Set<string>` of keys registered for dehydration. When `options.dehydrate === true`, the resolved key string is added to this set after the first successful fetch. `createResourceSerializer` uses this set to filter `store.entries()`.

The cleanest implementation is to pass a `dehydratableKeys: Set<string>` alongside the store, with `createResourceStore()` returning an object that bundles both:

```typescript
// Extended internal type (not part of the public ResourceStore interface)
export interface ResourceStoreWithMeta extends ResourceStore {
  /** Keys whose ready state should be included in SSR dehydration. */
  readonly dehydratableKeys: Set<string>
  /** Register a key as dehydration-eligible. Called by createResource when dehydrate: true. */
  markDehydratable(key: string): void
}

export function createResourceStore(): ResourceStoreWithMeta {
  const _map = new Map<string, DataState<unknown>>()
  const dehydratableKeys = new Set<string>()
  return {
    get: (key) => _map.get(key),
    set: (key, state) => { _map.set(key, state) },
    delete: (key) => { _map.delete(key) },
    entries: () => _map.entries(),
    dehydratableKeys,
    markDehydratable: (key) => { dehydratableKeys.add(key) },
  }
}
```

The `ResourceStore` public interface (§5.1) does not include `dehydratableKeys` or `markDehydratable` — these are on `ResourceStoreWithMeta`, the concrete return type of `createResourceStore()`. `createResourceSerializer` accepts `ResourceStoreWithMeta` (which is a `ResourceStore` subtype). Callers using the `ResourceStore` interface without these methods will produce a serializer that emits nothing (safe degradation).

### 6.3 `createResourceSerializer` implementation

```typescript
export function createResourceSerializer(
  store: ResourceStore,
): () => Record<string, unknown> {
  return () => {
    const resources: Record<string, unknown> = {}
    const meta = store as Partial<ResourceStoreWithMeta>
    const eligible = meta.dehydratableKeys ?? new Set<string>()
    for (const [key, state] of store.entries()) {
      if (state.status === 'ready' && eligible.has(key)) {
        resources[key] = state
      }
    }
    return { resources }
  }
}
```

### 6.4 Dehydration JSON shape

```json
{
  "resources": {
    "/api/user/1": { "status": "ready", "data": { "id": 1, "name": "Alice" } },
    "/api/config":  { "status": "ready", "data": { "theme": "dark" } }
  }
}
```

The JSON is emitted into the `<script type="application/json" id="__aihu_state__">` block already present in `packages/server/src/ssr.ts` via the `SsrOptions.serializer` hook.

Only `{ status: 'ready' }` entries are emitted. Resources that are `loading`, `error`, or `idle` at serialization time are skipped.

### 6.5 Client rehydration

On the client, before the first `createResource` effect runs, the application reads the dehydrated store from `__aihu_state__` and pre-populates its `ResourceStore`:

```typescript
// Client entry point (application code, not a @aihu/data concern):
import { createResourceStore, ResourceStoreToken } from '@aihu/data'
import { provide } from '@aihu/context'

const store = createResourceStore()

// Hydrate from SSR state
const ssrStateEl = document.getElementById('__aihu_state__')
if (ssrStateEl) {
  const { resources } = JSON.parse(ssrStateEl.textContent ?? '{}')
  for (const [key, state] of Object.entries(resources ?? {})) {
    store.set(key, state as DataState<unknown>)
  }
}

provide(ResourceStoreToken, store)
```

When `createResource` initializes, it finds the pre-populated cache entry and starts as `ready` without firing the fetcher. This is the zero-rehydration-fetch guarantee.

**Note:** `@aihu/data` does not implement the client-side hydration bootstrap — that belongs to the application entry point or a future `@aihu/data-hydration` helper. The Builder must document this boundary clearly in code comments.

---

## 7. Resolved open questions (OQ-D1 through OQ-D5)

The following questions were open at spec-writing time. They are resolved here and encoded in the implementation guide above.

### OQ-D1: Signal import source

`createResource` imports `signal` and `effect` from `@aihu/signals`. This is the **only reactive dependency**. No other package is used for reactivity. The `Signal<T>` type (the `readonly [Read<T>, Write<T>]` tuple) is also imported from `@aihu/signals`.

Resolved: `@aihu/data` imports `signal`, `effect`, and the `Signal` type from `@aihu/signals`. `@aihu/context` is the only other dependency (for `inject` and `ContextToken`). No other dependencies.

### OQ-D2: `refetch()` and `invalidate()` semantics

**`invalidate()` state transition:**
- Pre-state: `ready` (any other state: no-op)
- Post-state: `ready` — the signal state is UNCHANGED. Only the internal `_stale` flag is set to `true`.
- Effect: the next call to `refetch()` or the next key-signal change will bypass the cache check and fire a fresh fetch.
- Rationale: keep the UI stable. Showing stale data with a background refresh is preferable to a flash of `loading`.

**`refetch()` state transition:**
- Pre-state: any (including `idle` — but if key is null, refetch is a no-op)
- Post-state: `loading` immediately, then `ready` or `error` after fetch resolves.
- Effect: `_fetchId` is incremented, the store entry for the current key is deleted (or overwritten), and a new fetch is initiated immediately.
- Rationale: `refetch()` is an explicit user action ("reload this data now"). Going back to `loading` is correct.

**Summary:**

| Operation | Signal state change | Store effect | Triggers fetch? |
|---|---|---|---|
| `invalidate()` | None (stays `ready`) | Sets `_stale = true` | No — deferred to next `refetch()` or key change |
| `refetch()` | `→ loading → ready\|error` | Deletes + re-writes entry | Yes — immediately |

### OQ-D3: Context token name

The context token is exported as:

```typescript
export const ResourceStoreToken: ContextToken<ResourceStore>
```

This name is descriptive and matches the `*Token` naming convention established by `@aihu/context`'s `ContextToken<T>` type. It is exported from `packages/data/src/index.ts` as part of the public barrel.

### OQ-D4: `@aihu/data` → `@aihu/context` dependency

Confirmed acceptable. Both `@aihu/data` and `@aihu/context` are browser packages at Layer 2/3. The dependency goes upward in the layer graph (data at Layer 3 depends on context at Layer 2), which is permitted by the hard rules in `spec-v1-architecture.md §1`.

The hard boundary ("browser packages don't import server packages") is maintained: `@aihu/data` does not import from `@aihu/server` or any Layer 4 package.

### OQ-D5: Streaming state in v1

Confirmed: the `'streaming'` state is in `DataState<T>` for forward compatibility only. Standard `createResource` with a `(key: string) => Promise<T>` fetcher **never** produces `{ status: 'streaming' }` in v1. Streaming adapters (`fromWebSocket`, `fromReadableStream`) are planned for v1+ and will live in separate packages.

**Builder instruction (binding):** Do NOT implement any code path in `createResource` that sets `status: 'streaming'`. The type must be present in the union. No runtime logic may emit it in this package.

---

## 8. Package infra checklist

Follow `@aihu/context` as the exact structural model. All files below must be created from scratch.

### 8.1 `packages/data/package.json`

```json
{
  "name": "@aihu/data",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "sideEffects": false,
  "scripts": {
    "build": "rolldown -c",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@aihu/signals": "workspace:*",
    "@aihu/context": "workspace:*"
  }
}
```

No `./ssr` export — `createResourceSerializer` is in the main barrel. SSR callers import it as `import { createResourceSerializer } from '@aihu/data'`.

### 8.2 `packages/data/tsconfig.json`

Mirror `packages/context/tsconfig.json` exactly:

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

### 8.3 `packages/data/rolldown.config.ts`

Single entry point (no `./ssr` split):

```typescript
import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

export default defineConfig([
  {
    input: 'src/index.ts',
    output: {
      dir: 'dist',
      format: 'esm',
      sourcemap: true,
      minify: true,
    },
    plugins: [dts()],
  },
])
```

### 8.4 `packages/data/moon.yml`

```yaml
# yaml-language-server: $schema=https://moonrepo.dev/schemas/project.json
language: typescript
layer: library
dependsOn:
  - signals
  - context
```

### 8.5 `vitest.config.ts` — alias entry

Add to the `resolve.alias` map in the root `vitest.config.ts`:

```typescript
'@aihu/data': new URL('./packages/data/src/index.ts', import.meta.url).pathname,
```

### 8.6 `.size-limit.json` — new entry

Add to `.size-limit.json`:

```json
{
  "name": "@aihu/data",
  "path": "packages/data/dist/index.js",
  "limit": "500 B",
  "gzip": true
}
```

Budget rationale: fetching logic (effect setup, fetch lifecycle, store integration) is more code than context's pure map operations. The architecture spec target is ~400 B; the budget includes 100 B headroom. At 500 B gzip this is still far below any competing data primitive.

---

## 9. Test specification

Minimum 12 tests in `packages/data/tests/resource.test.ts`. All tests must pass under the jsdom environment (default). Tests 9–10 should use `/* @vitest-environment node */` where helpful to prove SSR path is DOM-free.

### Test list

**T1: idle state when key is null**
```
createResource(signal(null), fetcher) → state is { status: 'idle' }
fetcher is never called
```

**T2: loading state when key becomes non-null**
```
const [getKey, setKey] = signal<string | null>(null)
const resource = createResource([getKey, setKey], slowFetcher)
setKey('/api/test')
// Before fetcher resolves: state is { status: 'loading' }
```

**T3: ready state after successful fetch**
```
fetcher resolves with { id: 1 }
await microtask flush
state is { status: 'ready', data: { id: 1 } }
```

**T4: error state after failed fetch**
```
fetcher rejects with new Error('fail')
await microtask flush
state is { status: 'error', error: Error('fail') }
```

**T5: refetch triggers a new fetch**
```
resource starts ready with data A
resource.refetch()
state transitions to loading, then resolves to ready with data B
fetcher was called twice total
```

**T6: invalidate marks stale without immediate refetch**
```
resource is ready with data A
resource.invalidate()
state is still { status: 'ready', data: A }  // unchanged
fetcher call count is still 1  // no new fetch
// After resource.refetch():
state → loading → ready with data B
fetcher called a second time
```

**T7: key signal change triggers new fetch; previous key result discarded**
```
createResource(keySignal, fetcher)
keySignal changes from '/api/a' to '/api/b'
state transitions to loading for key '/api/b'
if '/api/a' fetch resolves after key change, its result is discarded (no state update)
final state is ready with data for '/api/b'
```

**T8: store injection via context**
```
const store = createResourceStore()
const contextMap = new Map([[ResourceStoreToken._id, store]])
runWithContext(contextMap, () => {
  const resource = createResource(keySignal, fetcher)
  // resource uses the provided store, not the singleton
  // after fetch: store.get('/api/test') returns { status: 'ready', data: ... }
})
```

**T9: dehydration — createResourceSerializer emits only ready + dehydrate:true entries**
```
const store = createResourceStore()
store.set('/api/a', { status: 'ready', data: 'alpha' })
store.markDehydratable('/api/a')
store.set('/api/b', { status: 'ready', data: 'beta' })  // not dehydratable
store.set('/api/c', { status: 'error', error: new Error() })
store.markDehydratable('/api/c')  // error — should not be serialized

const serializer = createResourceSerializer(store)
const result = serializer()
// result.resources has exactly one key: '/api/a'
// '/api/b' absent (no markDehydratable)
// '/api/c' absent (status !== 'ready')
```

**T10: SSR — state is pre-loaded from dehydrated data (no refetch if key matches)**
```
// Simulate pre-hydrated store (as client entry point would set up)
const store = createResourceStore()
store.set('/api/user/1', { status: 'ready', data: { id: 1, name: 'Alice' } })

const resource = createResource(signal('/api/user/1'), fetcher, { store })
// state is immediately { status: 'ready', data: { id: 1, name: 'Alice' } }
// fetcher was NOT called
```

**T11: multiple resources share the same store (same key → same cached result)**
```
const store = createResourceStore()
const r1 = createResource(signal('/api/shared'), fetcher, { store })
const r2 = createResource(signal('/api/shared'), fetcher, { store })
await fetch resolves for r1
// r2.state[0]() is also { status: 'ready', data: ... }
// fetcher was called only ONCE (r2 found the cached entry from r1)
```

**T12: dispose of createResource stops the key-watching effect**
```
const resource = createResource(keySignal, fetcher)
resource.dispose()   // internal dispose — stops the key-watching effect
keySignal changes to a new value
// fetcher is NOT called after dispose
// state does not change after dispose
```

---

## 10. Do-not-break list

The following packages must not be modified as part of the Plan 2.2 PR. Any required changes to these packages are out of scope and must be raised as separate work items:

| Package | Constraint |
|---|---|
| `@aihu/signals` | No changes to `signal`, `effect`, `computed`, `batch`, `untrack` signatures or semantics |
| `@aihu/arbor` | No changes |
| `@aihu/runtime` | No changes |
| `@aihu/context` | No changes to `createContext`, `provide`, `inject`, `runWithContext`, `setSsrContextMap`, `clearSsrContextMap` |
| `@aihu/server` | No changes — `SsrOptions.serializer` is an existing hook; `@aihu/data` wires into it from application code, not from within `@aihu/server` |
| `@aihu/agent` | No changes |
| `@aihu/agent-readiness` | No changes |
| `packages/server/src/stream-types.ts` | The existing `DataSource<T>` in this file is a different interface (used by `renderToStream` for suspension boundaries). `@aihu/data`'s `Resource<T>` is a different, richer type. The Builder must NOT rename or alias these to each other. Both coexist. The server's `DataSource<T>` is a stream-suspension contract; `@aihu/data`'s `Resource<T>` is a fetch-state + controls object. The name is different by design; the two types are unrelated. |

### Note on `stream-types.ts` type distinction

`packages/server/src/stream-types.ts` defines a `DataSource<T>` interface for the server's streaming suspension model (`status: 'pending' | 'ready' | 'error'`, plus `onReady(cb)`). This is a different, narrower interface than `@aihu/data`'s `Resource<T>`. They serve different purposes.

- The server's `DataSource<T>` is internal to `@aihu/server` and used by `renderToStream`.
- `@aihu/data`'s `Resource<T>` is public and used by application components.

Because `@aihu/data` does not import from `@aihu/server`, there is no runtime collision. TypeScript callers who import both will see two distinct types with distinct names (`DataSource<T>` vs `Resource<T>`) and no aliasing is required.

---

## 11. Alignment with `spec-v1-architecture.md §6`

The architecture spec (`§6.2`) shows a `ResourceOptions<T>` with `staleTime`, `cacheTime`, and `equals` fields. These are **not included in the Plan 2.2 implementation**. The director-notes/track-b-round-002.md §4 is the authoritative source for this plan; the architecture spec was written before the detailed options surface was resolved.

The Plan 2.2 `ResourceOptions<T>` (§2.3 above) uses:
- `initialData` (not `initialValue` from arch spec) — matches director-notes §4 resolved shape
- `dehydrate` (not `ssr` from arch spec OQ-V6) — matches director-notes §4 Gap 4 decision
- `store` — new, replaces the implicit singleton from the arch spec

`staleTime`, `cacheTime`, and `equals` are deferred to a future plan. The `_stale` flag in `invalidate()` covers the explicit-invalidation use case for v1 without TTL complexity.

---

*Plan 2.2 — Architect: Claude Sonnet 4.6, 2026-04-30. Status: READY FOR BUILDER (pending Plan 2.1 merge to main).*
