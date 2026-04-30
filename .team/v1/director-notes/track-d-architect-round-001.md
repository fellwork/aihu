# Track D Architect — Director Brief, Round 001
**Date:** 2026-04-30
**Audience:** Track B builder (`@scribe/context`, `@scribe/data`) and Track C builder (`renderToStream`, SSR dehydration)
**Source spec:** `.team/v1/spec-v1-architecture-ratified.md` §12

Read this brief before starting implementation. Each section gives the ratified decision plus the exact API implication you must implement. If anything below conflicts with a future track spec, the track spec takes precedence — surface the conflict before building.

---

## 1. OQ-V1 — Bundle Budget (affects all tracks)

**Decision:** No aggregate budget raise. Targeted per-package adjustments to `.size-limit.json` only.

**Exact changes required to `.size-limit.json` before any v1 package builds:**

```json
// Change existing @scribe/agent row:
{ "name": "@scribe/agent", "path": "packages/agent/dist/index.js", "limit": "200 B", "gzip": true }

// Add new rows:
{ "name": "@scribe/context", "path": "packages/context/dist/index.js", "limit": "300 B", "gzip": true }
{ "name": "@scribe/data",    "path": "packages/data/dist/index.js",    "limit": "600 B", "gzip": true }
```

The existing `@scribe/arbor` (2048 B), `@scribe/signals` (1700 B), and `@scribe/runtime` (1024 B) limits are unchanged. The v1 arbor reconciler (~500 B added) still fits within the existing 2048 B limit with 219 B to spare.

**BLOCKER (do before any build):** `@scribe/agent` is currently 156 B gz but its limit is 100 B — the size gate is broken today. Raise to 200 B and investigate the 156 B actual (the phase-5 spec projected ~72 B; the gap suggests either an unexpected dependency or missing minification).

**Measured actual sizes at ratification (2026-04-30):**
- `@scribe/signals`: 1600 B gz
- `@scribe/arbor`: 1329 B gz
- `@scribe/runtime`: 504 B gz
- `@scribe/agent`: 156 B gz

---

## 2. OQ-V3 — Context Propagation (Track B: `@scribe/context`)

**Decision:** Render-scoped context map passed via `SsrOptions`. DOM attribute traversal rejected. Module-level singleton rejected.

### Browser client API

`@scribe/context` is a browser package. It must not import from `@scribe/server`.

```typescript
// packages/context/src/index.ts

export type ContextKey<T> = { readonly _brand: 'ContextKey'; readonly _type: T; readonly _default?: T }

export function createContext<T>(defaultValue?: T): ContextKey<T>

export function provide<T>(key: ContextKey<T>, value: T): void
// Stores value in the active mount scope's context map.
// Must be called during component setup (inside mount() execution).
// Throws if called outside an active mount scope.

export function inject<T>(key: ContextKey<T>): T | undefined
// Walks the mount scope chain to find the nearest provide() for key.
// Returns defaultValue (from createContext) if none found.
// Must be callable both during mount() (browser) and during renderToString (SSR).
```

### Required hook in `@scribe/arbor`

`provide`/`inject` need a context map per mount scope. Track B must coordinate with Track A to add a minimal hook to `mount.ts`. The least-invasive approach: `MountScope` gets an optional internal `_contextMap` field (not public, `/** @internal */`). `@scribe/context` accesses it via a module-level slot (`_activeContextMap`) parallel to `_activeMountDisposers`.

Track B must not modify `@scribe/arbor/src/mount.ts` unilaterally. Raise this coordination need in the Track A builder brief.

### SSR API (critical for Track C)

`@scribe/server/src/ssr.ts` `SsrOptions` gains one new optional field:

```typescript
export interface SsrOptions {
  // ... existing fields (head, hydratable, serializer) unchanged ...

  /**
   * Context map for SSR. Values provided here are visible to inject() calls
   * during renderToString/renderToStream execution.
   *
   * Must be a fresh Map per request — never reuse across concurrent requests.
   * Pass via createContext keys; values are looked up by key identity.
   *
   * @example
   * const UserCtx = createContext<User>()
   * const html = await renderToString(Page, {
   *   head: { title: 'Home' },
   *   contextMap: new Map([[UserCtx, currentUser]]),
   * })
   */
  readonly contextMap?: ReadonlyMap<unknown, unknown>
}
```

`@scribe/context` exports a package-internal function called by `renderToString`/`renderToStream`:

```typescript
/**
 * @internal — called by @scribe/server renderToString/renderToStream only.
 * Sets the request-scoped context map for SSR inject() lookups.
 * MUST be cleared (called with null) after rendering completes, even on error.
 */
export function _setSsrContextMap(map: ReadonlyMap<unknown, unknown> | null): void
```

`renderToString` in `ssr.ts` calls `_setSsrContextMap(opts.contextMap ?? null)` before rendering and `_setSsrContextMap(null)` in a `finally` block after. This is the ONLY way the server layer may interact with `@scribe/context` — via this exported function. The server does NOT import `@scribe/context` directly (that would violate the hard boundary). Instead, `renderToString` accepts this function as an optional injection:

```typescript
export interface SsrOptions {
  // ...
  readonly contextMap?: ReadonlyMap<unknown, unknown>
  /**
   * Injected context setup from @scribe/context.
   * When provided, called with contextMap before render and with null after.
   * @internal — injected by framework bootstrap, not user-facing.
   */
  readonly _contextSetter?: (map: ReadonlyMap<unknown, unknown> | null) => void
}
```

Users who use `@scribe/context` bootstrap once at app startup:
```typescript
import { _setSsrContextMap } from '@scribe/context'
// In renderToString calls:
renderToString(Page, { contextMap: myMap, _contextSetter: _setSsrContextMap })
```

The framework wrapper (vite plugin or app bootstrap helper) should hide this from end users.

### What NOT to do

- Do NOT traverse DOM parent nodes / `closest()` / `parentElement` chains. This breaks SSR.
- Do NOT use a module-level `Map` that persists across requests. This causes data leaks under concurrent load.
- Do NOT import `@scribe/server` from `@scribe/context`. Hard boundary violation.

---

## 3. OQ-V4 — `createResource` Cache (Track B: `@scribe/data`)

**Decision:** Context-provided store. Module-level singleton rejected.

### Exact API implication

`createResource` uses `inject()` from `@scribe/context` to find the cache store. The public surface:

```typescript
// packages/data/src/index.ts

export interface CacheStore {
  get(key: string): unknown | undefined
  set(key: string, value: unknown, ttl?: number): void
  delete(key: string): void
  clear(): void
}

export interface ResourceOptions<T> {
  /**
   * Cache key. When provided, the cache store (from CacheContext) is used.
   * When absent, resource is not cached — refetch on every mount.
   */
  key?: string
  /** Initial value while loading. */
  initialValue?: T
  /**
   * When true: this resource's resolved value is included in SSR dehydration output.
   * Default: false. See OQ-V6 rationale.
   * SECURITY: Only set true for data that is safe to serialize into public HTML.
   */
  dehydrate?: boolean
}

export interface Resource<T> {
  readonly data: Signal<T | undefined>
  readonly loading: Signal<boolean>
  readonly error: Signal<Error | undefined>
  refetch(): void
}

/** Context key for the cache store. Inject at app root or route handler level. */
export const CacheContext: ContextKey<CacheStore>

/** Create a cache store instance. */
export function createCache(options?: { ttl?: number }): CacheStore

export function createResource<T>(
  fetcher: () => Promise<T>,
  options?: ResourceOptions<T>,
): Resource<T>
```

### Initialization pattern

**Browser (app root):**
```typescript
// App root component or app.ts bootstrap:
import { provide } from '@scribe/context'
import { createCache, CacheContext } from '@scribe/data'

provide(CacheContext, createCache({ ttl: 60_000 }))
```

**SSR (route handler):**
```typescript
import { createCache, CacheContext } from '@scribe/data'

// Fresh cache per request:
const cache = createCache()
const html = await renderToString(Page, {
  contextMap: new Map([[CacheContext, cache]]),
  _contextSetter: _setSsrContextMap,
})
// Optionally extract dehydration state from cache:
const state = cache.getDehydratedState()
```

### Default behavior (no cache provided)

When `inject(CacheContext)` returns `undefined` (no `provide` above), `createResource` creates a component-scoped ephemeral cache — just a local `Map` that lives for the component's lifetime. Resources still work; they just do not share state with other resources or persist after unmount.

### What NOT to do

- Do NOT store a `Map` at module top level in `data.ts`. This is shared across SSR requests.
- Do NOT import `@scribe/server`. Hard boundary.
- Do NOT make `CacheContext` a module-level singleton `Map`. The context injection IS the cache.

---

## 4. OQ-V6 — SSR Dehydration (Track C: `renderToStream`, Track B: `@scribe/data`)

**Decision:** Opt-in per resource (`{ dehydrate: true }`). Automatic serialization rejected on security grounds.

### Track C implications (renderToStream / renderToString)

The existing `serializer?: () => Record<string, unknown>` field in `SsrOptions` is the correct hook. v1 fills in the real serializer. Track C must:

1. Collect dehydration state from the cache store (accessible via the `contextMap` passed in `SsrOptions`).
2. Emit the state as `<script type="application/json" id="__scribe_state__">` before `</body>`.

The `serializer` field should be deprecated in favor of extracting state directly from the cache store, but for backward compatibility it stays. The `v1 serializer` implementation:

```typescript
// Inside renderToString, after content is built:
const cacheStore = opts?.contextMap?.get(CacheContext) as CacheStore | undefined
const dehydrated = cacheStore?.getDehydratedState() ?? {}
// Only entries from resources with { dehydrate: true } are in getDehydratedState()
```

`getDehydratedState()` must exist on `CacheStore` (Track B adds it). It returns only entries that were marked `{ dehydrate: true }` by their `createResource` call.

### Client-side rehydration

The client reads `document.getElementById('__scribe_state__')?.textContent`, parses it, and calls `cache.hydrateFrom(parsedState)` before mounting. The framework bootstrap helper wraps this. Out of scope for this brief — Track B defines the rehydration API.

### Security constraint (CRITICAL)

The state script emitted by `renderToString`/`renderToStream` must ONLY contain data from resources with `{ dehydrate: true }`. There must be no mechanism for accidental serialization of resources without that flag. Track C builder must confirm this invariant in the verifier brief: "only resources with dehydrate:true appear in __scribe_state__."

---

## 5. OQ-V2 — `<agent>` Block Grammar (advisory, non-blocking)

**Decision:** YAML-style DSL as primary, auto-derivation as fallback. TypeScript annotations rejected.

This decision is advisory for C-5 (not building in current sprint). Tracks A, B, C are not affected. No action required.

---

## 6. Items that must be SURFACED to the user before Tracks B or C can proceed

**SURFACE-1 (HIGH): `@scribe/arbor` hook coordination.**
`@scribe/context`'s `provide`/`inject` need a context-map slot inside `MountScope` (or alongside the scope-collector). Track B cannot implement the browser client context model without this arbor change, and Track A owns `@scribe/arbor`. This is a cross-track dependency that requires explicit coordination. Either:
- (a) Track A adds the context hook as part of its reconciler work, or
- (b) The user decides that `@scribe/context` accesses a separate module-level variable in `@scribe/context` itself (not in arbor), with the limitation that nested `mount()` calls share a single flat context chain.

Option (b) is simpler and avoids touching arbor. Option (a) is correct for deeply nested trees. **User input needed: which option?**

**SURFACE-2 (MEDIUM): `getAllAgentMetadata()` must be added to `@scribe/agent`.**
The agent-readiness `GET /llms.txt` auto-generation path is currently disabled because this function does not exist. It should be added in a minor version bump alongside or before v1 builds. This is not a Track A/B/C concern — it is a standalone `@scribe/agent` addition. The user should decide whether this lands before or alongside v1 track work.

**SURFACE-3 (LOW, but investigate now): `@scribe/agent` size gate is broken.**
The limit is 100 B but the actual built size is 156 B. `bun run size` would currently fail. Before any v1 build runs CI, the agent limit must be raised to 200 B and the overrun investigated. This is a 3-line `.size-limit.json` change but should be confirmed by whoever owns the agent package.

---

*Track D Architect brief complete. Tracks B and C may proceed with the decisions above. Surface the three items above before starting implementation.*
