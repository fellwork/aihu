# scribe v1 Architecture Spec — Ratified
**Document:** `.team/v1/spec-v1-architecture-ratified.md`
**Role:** Track D Architect (design only — no builder)
**Date:** 2026-04-30
**Status:** RATIFIED — §12 OQs closed except where noted

---

> **Note to readers:** This is the v1 architecture spec with §12 open questions adjudicated.
> Tracks A, B, and C builders should read §12 for their OQ decisions, then read the
> Track D director brief at `.team/v1/director-notes/track-d-architect-round-001.md`
> for the exact API implications.
>
> The spec sections §1–§11 below are placeholders establishing the document structure.
> The substance of each v1 package is defined in the track-level specs that will follow.
> §12 is fully authored and is the authoritative ratification record.

---

## §1. v1 Scope Overview

v1 closes the five gaps left open after v0 + Round N+1 + Round N+2:

1. **Reconciler** (`when`/`each` in `@scribe/arbor`) — structural reactivity; currently stubs throwing `ArborNotImplementedError`
2. **Context propagation** (`@scribe/context`) — new package; `provide`/`inject` for component trees; SSR-safe
3. **Data / cache layer** (`@scribe/data`) — new package; `createResource` with suspense-friendly cache; SSR dehydration
4. **`<agent>` block grammar** — compiler Track (C-5); advisory only in v1 planning phase
5. **Streaming actions** — server action return type; affects `@scribe/server` and edge adapter patterns

Track B owns `@scribe/context` and `@scribe/data`. Track C owns `renderToStream` and SSR dehydration in `@scribe/server`. Track A owns reconciler additions to `@scribe/arbor`. Track D (this document) owns design ratification only.

---

## §2. Package Inventory

| Package | v0 status | v1 delta |
|---|---|---|
| `@scribe/signals` | shipped | no change |
| `@scribe/arbor` | shipped | +`when`/`each` reconciler |
| `@scribe/runtime` | shipped | +HMR hook |
| `@scribe/agent` | shipped | no change |
| `@scribe/server` | shipped | +`renderToStream`, SSR dehydration |
| `@scribe/agent-readiness` | shipped | no change |
| `@scribe/context` | new | provide/inject |
| `@scribe/data` | new | createResource, cache |
| `@scribe/compiler` (Rust) | in progress | C-3 → C-4 |

---

## §3. AgentManifest Shape (v1 addition)

`@scribe/agent` v1 adds `getAllAgentMetadata()` and `getAgentManifest()` per the forward-compat note in `.team/phase-5/spec-agent.md` §1.4.

```typescript
export interface AgentManifest {
  readonly version: string
  readonly schema: 'scribe-agent-manifest-v1'
  readonly components: Record<string, AgentMetadata>
  readonly generatedAt: string
}

export function getAllAgentMetadata(): AgentMetadata[]
export function getAgentManifest(): AgentManifest
```

This unblocks the agent-readiness `getAllAgentMetadata()` gap documented in `.team/agent-readiness/spec-agent-readiness.md` §7 OQ-3.

---

## §4. Track A — Reconciler (`when`/`each`)

Track A implements the v1 reconciler in `@scribe/arbor/src/structural.ts`. The stubs currently throw `ArborNotImplementedError` immediately. v1 replaces them with keyed diffing reconcilers that:

- `when(cond, grow)`: mounts/unmounts the result of `grow()` when `cond` changes
- `each(list, key, grow)`: keyed list diffing; moves DOM nodes on key-stable reorder; mounts/unmounts on add/remove

Both must integrate with the existing scope-collector (`_activeMountDisposers`) so child scopes are disposed when items are removed. The `_mountEffect` + `pathBase` identity scheme (`.team/phase-3/spec-arbor.md` §2.7) must propagate through reconciler-created child mounts.

Size budget for reconciler: 500 B gz against arbor's existing 719 B headroom. See §12 OQ-V1 for the final budget number.

---

## §5. Track B — Context + Data

See §12 OQ-V3 and OQ-V4 for the ratified designs.

---

## §6. Track B — `@scribe/data` (Data / Cache Layer)

`createResource` is a reactive data primitive. See §12 OQ-V4 for the cache model decision.

```typescript
export function createResource<T>(
  fetcher: () => Promise<T>,
  options?: ResourceOptions<T>,
): Resource<T>

export interface Resource<T> {
  readonly data: Signal<T | undefined>
  readonly loading: Signal<boolean>
  readonly error: Signal<Error | undefined>
  refetch(): void
}
```

---

## §7. Track B — `@scribe/context` (Context Propagation)

`provide`/`inject` for component trees. See §12 OQ-V3 for the ratified propagation model.

```typescript
export function provide<T>(key: ContextKey<T>, value: T): void
export function inject<T>(key: ContextKey<T>): T | undefined
export function createContext<T>(defaultValue?: T): ContextKey<T>
```

---

## §8. Track C — SSR Streaming (`renderToStream`)

`renderToStream` extends `@scribe/server/src/ssr.ts`. Returns `ReadableStream<string>` (or `AsyncIterable<string>` adapter). See §12 OQ-V5 and OQ-V6 for the ratified return type and dehydration model.

---

## §9. Compiler Track Advisory (C-5: `<agent>` block)

See §12 OQ-V2. Advisory only — compiler C-5 is not building in the current sprint.

---

## §10. Bundle Budget

See §12 OQ-V1 for the full ratification including measured current sizes and new-package budget rows.

---

## §11. Dependency Graph (v1)

```
@scribe/signals          ← no deps
    ↑
@scribe/arbor            ← depends on signals
    ↑
@scribe/runtime          ← peer deps: arbor, signals
    ↑
@scribe/agent            ← no deps
@scribe/context          ← peer dep: arbor (for mount scope hook)
@scribe/data             ← depends on: signals; peer dep: context (optional)

════════════ HARD BOUNDARY — ZERO IMPORTS CROSS DOWN ════════════

@scribe/server           ← depends on @scribe/agent (types only)
    ↑
@scribe/agent-readiness  ← depends on @scribe/server + @scribe/agent
```

`@scribe/context` and `@scribe/data` sit above the hard boundary — they are browser packages. They must never import from `@scribe/server`.

---

## §12. Open Questions — Ratification Record

> All six OQs evaluated 2026-04-30 by Track D Architect.
> Supporting evidence: live `gzip` measurements of dist bundles,
> `.size-limit.json`, existing specs, and SSR architecture analysis.

---

### OQ-V1 — Bundle Budget: Raise 4.0 → 5.0 kB gz aggregate?

**Background.** The budget in scribe is enforced per-package, not as a single aggregate. The `.size-limit.json` at time of ratification has four rows with these measured actual sizes (gzip of dist/index.js):

| Package | Limit | Actual gz | Headroom |
|---|---|---|---|
| `@scribe/signals` | 1700 B | 1600 B | 100 B |
| `@scribe/arbor` | 2048 B | 1329 B | 719 B |
| `@scribe/runtime` | 1024 B | 504 B | 520 B |
| `@scribe/agent` | 100 B | 156 B | **-56 B (OVER)** |
| **Existing total** | **4872 B** | **3589 B** | **1283 B** |

The agent package is already 56 B over its 100 B limit. This must be fixed regardless of v1 decisions.

**v1 additions and their homes:**

| Addition | Target package | Estimated gz delta |
|---|---|---|
| `when`/`each` reconciler | `@scribe/arbor` | +500 B |
| Runtime HMR hook | `@scribe/runtime` | +100 B |
| `@scribe/context` (new) | new row | ~200 B |
| `@scribe/data` (new) | new row | ~400 B |

**Post-v1 projected state:**

| Package | Current limit | Current actual | v1 delta | v1 actual | v1 limit needed |
|---|---|---|---|---|---|
| `@scribe/signals` | 1700 B | 1600 B | 0 | 1600 B | 1700 B (unchanged) |
| `@scribe/arbor` | 2048 B | 1329 B | +500 B | ~1829 B | 2048 B (unchanged — fits) |
| `@scribe/runtime` | 1024 B | 504 B | +100 B | ~604 B | 1024 B (unchanged — fits) |
| `@scribe/agent` | 100 B | 156 B | 0 | 156 B | **200 B (must raise)** |
| `@scribe/context` | — | — | +200 B | ~200 B | **300 B (new row)** |
| `@scribe/data` | — | — | +400 B | ~400 B | **600 B (new row)** |
| **v1 total** | | | | **~4789 B** | |

**RATIFIED: Do NOT raise an aggregate budget. Instead, make targeted per-package adjustments to `.size-limit.json`:**

1. Raise `@scribe/agent` limit from `100 B` to `200 B` (current actual is 156 B; new limit gives 44 B headroom and fails fast on scope creep while accommodating the actual implementation)
2. Add `@scribe/context` row: `"limit": "300 B"`, `"gzip": true`
3. Add `@scribe/data` row: `"limit": "600 B"`, `"gzip": true`
4. `@scribe/arbor`, `@scribe/signals`, `@scribe/runtime` limits unchanged

The "aggregate 5.0 kB" framing is rejected because scribe's enforcement is per-package. An aggregate ceiling is meaningless when `@scribe/agent` can blow past its row without any aggregate number catching it (as it already has). Per-package precision is the contract.

**RATIONALE:** The existing arbor and runtime limits absorb v1 additions without change — arbor has 719 B headroom for a 500 B reconciler addition, leaving 219 B buffer; runtime has 520 B headroom for a 100 B HMR hook. New packages get conservative limits that are ~50% above their projected sizes, consistent with the pattern in existing rows. The agent overrun is a pre-existing defect that must be fixed before any v1 build ships; the 200 B limit is grounded in the actual measured size (156 B) rather than invented from assumptions.

**STATUS: CLOSED**

---

### OQ-V2 — `<agent>` Block Grammar: YAML DSL vs. TypeScript Annotations vs. Auto-derived?

**Context.** This OQ affects Compiler track C-5, which is not building in the current sprint. Track D is advisory only. The decision does not block Tracks A, B, or C.

**RATIFIED: Auto-derived as the primary path, with YAML DSL as the explicit-override escape hatch. TypeScript annotations are rejected.**

Specifically:
- **Primary:** The compiler reads `<agent>` block content as YAML-style configuration. Structure:
  ```yaml
  describes: "Human-readable description of what this component does for agents"
  state:
    count: "The current counter value"
  actions:
    increment: "Increment the counter by 1"
  ```
  This maps directly to `AgentMetadata` fields and requires zero TypeScript type inference.
- **Auto-derivation supplement:** When no `<agent>` block is present, the compiler derives a minimal `AgentMetadata` from the component tag name and script-setup exports. This is best-effort; explicit `<agent>` blocks win.
- **TypeScript annotations rejected:** `// @agent:describes "..."` decorators in `<script setup>` couple agent metadata to the code body, making it hard to read as a standalone document. An `<agent>` block is a first-class SFC block, not a comment convention.

**RATIONALE:** YAML is already the project's configuration language (`.moon/tasks.yml`, `moon.yml` files). It is human-readable and machine-parseable without a TypeScript AST. Auto-derivation handles the zero-friction case (no `<agent>` block required). The compiler already has a YAML-shaped type to fill in (`AgentMetadata`); the block content maps field-for-field. This decision is locked for C-5 design but has no impact on the current sprint.

**ADVISORY (non-blocking for Tracks A, B, C).** C-5 architect must confirm or override before C-5 build begins.

**STATUS: CLOSED (advisory)**

---

### OQ-V3 — Context Propagation: DOM Attribute Traversal vs. Custom Element Registry?

**Context.** Track B is building `@scribe/context`. The fundamental question is how `inject()` finds its nearest `provide()` ancestor, and how this works during SSR where there is no DOM.

**RATIFIED: Render-scoped context map passed via options, cleared after each `renderToString`/`renderToStream` call. DOM attribute traversal is rejected.**

The API implications are:

**Browser (client) model:**
`provide(key, value)` registers into a `Map` stored on the active `MountScope`. The scope-collector slot (`_activeMountDisposers` in `mount.ts`) is extended or complemented by a context slot that `@scribe/context` reads during component setup. `inject(key)` walks up the mount scope tree (parent scope chain) to find the nearest `provide` for that key.

This requires arbor to expose a minimal hook: a module-level `_activeContextMap` slot (parallel to `_activeMountDisposers`) that `@scribe/context` can read and write during a `mount()` call. The hard boundary (no server imports in browser packages) is preserved — `@scribe/context` is a browser package.

**SSR model (this is the critical case):**
`renderToString` and `renderToStream` accept a new optional field `contextMap?: Map<ContextKey<unknown>, unknown>` in `SsrOptions`. During server-side rendering there is no DOM and no `mount()` call — the renderer walks a virtual tree as a string. Context values provided during SSR are passed explicitly via this map. The renderer passes the map to `inject()` lookups via a request-scoped variable cleared on each `renderToString` call.

Concretely, `@scribe/server/src/ssr.ts` gains:
```typescript
export interface SsrOptions {
  // ... existing fields ...
  readonly contextMap?: ReadonlyMap<unknown, unknown>
}
```

And `@scribe/context` exports:
```typescript
export function setSsrContextMap(map: ReadonlyMap<unknown, unknown> | null): void
// Called by renderToString/renderToStream before and after rendering
```

This function is in `@scribe/context`, NOT in `@scribe/server`. The server calls it via an injected hook — preserving the hard boundary (server does not import browser packages). The mechanism: `renderToString` accepts an optional `contextSetup?: () => void` hook in `SsrOptions`, which Track C's implementation calls with `setSsrContextMap`.

**Why DOM attribute traversal was rejected:** `renderToString` has no DOM. Any approach that requires traversing `parentElement` or querying `data-` attributes breaks the moment code runs in Workers, Deno, or Bun without JSDOM. Attribute traversal also leaks implementation detail into the serialized HTML.

**Why module-level singleton (option b) was rejected:** A module-level map cleared after each `renderToString` is not safe for concurrent SSR requests. If two requests overlap (two concurrent `renderToString` calls in the same worker), the second call's `setSsrContextMap` overwrites the first's map mid-render. The explicit `contextMap` field in `SsrOptions` is request-scoped by construction — each `Request` handler passes its own map. No shared mutable state.

**RATIONALE:** The render-options approach is the only design that is (a) SSR-safe for concurrent requests, (b) preserves the hard browser/server package boundary, (c) requires no DOM, and (d) is testable in pure unit tests with no environment setup. The browser client model can use the scope-collector slot pattern that already exists in arbor for zero additional complexity.

**STATUS: CLOSED**

---

### OQ-V4 — `createResource` Cache: Module-Level Singleton vs. Context-Provided Store?

**Context.** Track B is building `@scribe/data`. `createResource` wraps async data fetching in a reactive Resource. The cache question is: where does the cache live, and how is it initialized?

**RATIFIED: Context-provided store is the correct model. Module-level singleton is rejected.**

The cache must be injected via context, not stored at module level. `createResource` calls `inject(CacheContext)` to get the cache store. If no cache store is provided (no `provide(CacheContext, store)` above), `createResource` creates a local cache that is component-scoped and discarded on unmount.

The default behavior (no explicit cache provision) is an ephemeral per-resource cache. Apps that want cache sharing or SSR dehydration provide a cache store explicitly:

```typescript
// App root:
provide(CacheContext, createCache({ ttl: 60_000 }))

// Component:
const user = createResource(() => fetchUser(id))
```

For SSR, the cache store is created per-request and passed via the `contextMap` mechanism ratified in OQ-V3.

**Why module-level singleton was rejected:** SSR is the fatal flaw. A module-level cache in an edge runtime is shared across all concurrent requests handled by that runtime instance. Request A's `createResource` for user 1 would populate the cache; Request B's render for user 2 could read user 1's data from the same cache before it expires. This is a data leak / incorrect rendering defect that is impossible to prevent without per-request isolation. Module-level state in SSR is the same class of bug as the context propagation concurrent-request problem rejected in OQ-V3.

The context-provided store is request-scoped by construction — the `provide(CacheContext, store)` call at the route handler level creates a fresh store per request. No shared state across requests.

**Additional benefit:** The context model is testable. Tests can `provide(CacheContext, mockCache)` to inject a known cache, making `createResource` unit-testable without global state cleanup between tests.

**RATIONALE:** Every module-level singleton in SSR is a correctness bomb waiting for concurrent load. The context-provided model costs one `provide` call at the app root (or route handler level for SSR). That is a negligible DX cost for a correctness guarantee that cannot be achieved any other way. This decision is consistent with OQ-V3's rejection of module-level context maps.

**STATUS: CLOSED**

---

### OQ-V5 — Streaming Action Return Type: `AsyncIterable<T>` Only, or Also `ReadableStream<T>`?

**Context.** Track D (spec only for current sprint). `renderToStream` returns a stream of HTML chunks. Server action functions may also return streams (e.g., streaming LLM responses). The question is which stream primitive to use.

**RATIFIED: `AsyncIterable<T>` as the primary type. `ReadableStream<T>` as a conversion utility only.**

`renderToStream` and streaming action functions return `AsyncIterable<string>`. A helper `toReadableStream(iter: AsyncIterable<string>): ReadableStream<string>` is exported from `@scribe/server` for callers that need the Web Streams API shape (e.g., Cloudflare Workers `Response` body).

Reason: `AsyncIterable<T>` is simpler for adapter authors to consume. The pattern `for await (const chunk of stream)` works in every edge runtime without any adapter. `ReadableStream` requires `.getReader()`, manual `reader.read()` loops, and `reader.releaseLock()` / `reader.cancel()` cleanup. For the agent service adapter use case (an agent SDK consuming the stream to pipe to a model), `AsyncIterable<T>` is unambiguously simpler.

Interoperability: `ReadableStream` can be trivially constructed from `AsyncIterable` via `ReadableStream.from()` (available in Node 18+, Deno, Bun) or the `toReadableStream` helper. The reverse (converting `ReadableStream` to `AsyncIterable`) is also trivial. Picking `AsyncIterable` as primary does not foreclose any use case.

**Why not both natively:** Shipping both would require every streaming function to have two overloads or return type that includes both. This doubles the API surface for no gain — consumers can trivially convert. Keeping `AsyncIterable` primary keeps the API minimal and the return type predictable.

**RATIONALE:** Edge runtime parity: `AsyncIterable` is available as a language primitive in all target runtimes without any import. `ReadableStream` is a Web API and while it is available in Workers, Deno, Bun, and Node 18+, its consumer API is verbose. Learning #10 ("runtime packages are in-house; the 4 kB budget is the enforcement mechanism") applies here: the adapter layer must be ours, and the simplest adapter surface wins. `AsyncIterable` is the simpler surface.

**STATUS: CLOSED**

---

### OQ-V6 — SSR Dehydration: Opt-In Per-Resource vs. Automatic?

**Context.** Track C (`renderToStream`) and Track B (`@scribe/data`) are both affected. SSR dehydration serializes resource data into the HTML so the client can rehydrate without re-fetching. The question is whether dehydration is opt-in per resource or automatic for all resources.

**RATIFIED: Opt-in per resource. Automatic is rejected on security grounds.**

Resources are dehydrated only when explicitly marked:

```typescript
const user = createResource(() => fetchUser(id), { dehydrate: true })
```

Without `{ dehydrate: true }`, the resource's resolved data is not serialized into the HTML response. The `renderToStream` / `renderToString` implementation only collects dehydration state from resources that have opted in.

The serialized state is emitted as:
```html
<script type="application/json" id="__scribe_state__">{"resources":{"<key>":"<serialized-value>"}}</script>
```

This is the same mechanism already wired in `ssr.ts` (the `serializer` injection field) — v1 fills in the real serializer replacing the stub.

**Why automatic dehydration was rejected:**

Automatic dehydration would serialize every resource's data into the HTML. The security problem is that resources commonly hold authentication-sensitive data: user profiles, session state, access tokens within a decoded JWT, internal IDs. An accidental call to `createResource(() => getInternalAuditLog(userId))` in a component would automatically serialize audit log data into public HTML. With automatic dehydration, there is no line between "data for the browser" and "data that happens to be loaded during SSR."

Opt-in is explicit: the developer must consciously mark a resource as safe to serialize. This makes security an active choice, not an absence-of-attention-to-a-flag. The cost is one `{ dehydrate: true }` flag per resource that needs it. For most applications, only 2–5 resources at the top level need dehydration (e.g., initial page data); everything else benefits from fresh client-side fetches anyway.

**RATIONALE:** Automatic dehydration optimizes for DX at the expense of security. Opt-in optimizes for security while keeping DX acceptable (one flag per resource). This is consistent with the pattern in `@scribe/server/src/api.ts`'s `serverError` — the spec explicitly requires that production error responses never leak stack traces; the same principle (server data stays on the server until explicitly released) applies to resource dehydration. The Track C builder must treat missing `{ dehydrate: true }` as "do not serialize" — the default must be safe.

**STATUS: CLOSED**

---

## §13. Pre-Ratification Findings (must be addressed before v1 ships)

The following issues were discovered during OQ analysis and are not part of the 6 OQs, but are blockers or must-fix items:

**F-1 (HIGH) — `@scribe/agent` is already over its size budget.**
Current actual: 156 B gz. Current limit in `.size-limit.json`: 100 B. The size gate is currently broken — `bun run size` would fail if run against the current dist. The limit must be raised to 200 B before any v1 work begins, and the reasons for the overrun should be investigated (the expected size was ~72 B per the phase-5 spec; 156 B suggests either a dependency was pulled in or the bundle is not being minified). See `.team/phase-5/spec-agent.md` §3.2.

**F-2 (MEDIUM) — `getAllAgentMetadata()` missing from `@scribe/agent`.**
The agent-readiness `GET /llms.txt` handler skips auto-generation of component sections because `getAllAgentMetadata()` does not exist. This is documented as OQ-3 in `.team/agent-readiness/spec-agent-readiness.md`. A minor version bump to `@scribe/agent` adding this export unblocks full auto-generation. This must land before v1 ships.

**F-3 (LOW) — `MountScope.serialize()` and `MountScope.agent` are stubs.**
Both throw `ArborNotImplementedError` or return a branded empty stub. Sub-projects #6 (SSR serialize) and #7 (agent live-binding) are v1 scope. The dehydration work in OQ-V6 provides the v1 implementation path for `serialize()`.

---

*Ratification complete. Track D Architect, 2026-04-30.*
