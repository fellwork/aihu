# @aihu/magna

aihu bridge for Magna GraphQL: a dependency-free fetch wrapper, reactive resource composition over [`@aihu-plugin/data`](/docs/api-reference), and per-request JWT relay. The browser-safe root entry (`@aihu/magna`) carries the runtime helpers; the node-only build-time pipeline lives at the `@aihu/magna/codegen` subpath so the root entry stays free of `node:fs`.

## Install

```bash
npm install @aihu/magna
# or
bun add @aihu/magna
```

Runtime dependencies: `@aihu/signals`, `@aihu/plugin`, `@aihu/context`, and `@aihu-plugin/data`. `@aihu/magna-gqlmin` is an optional dependency used for SDL minification at build time — when it is absent the codegen pipeline gracefully skips minification.

## Entry points

| Import | Surface | Notes |
|--------|---------|-------|
| `@aihu/magna` | Browser-safe | `MagnaFetchToken`, `createMagnaFetch`, `createMagnaResource`, `useMagnaSubscription`, and the public types. |
| `@aihu/magna/codegen` | Node-only (build-time) | `beforeCompile` — the SDL validation/codegen pipeline. Pulls in `node:fs`; do not import from a browser bundle. |

## API overview

| Name | Kind | Entry | Description |
|------|------|-------|-------------|
| `createMagnaFetch` | function | root | Build a typed, dep-free GraphQL POST wrapper with JWT relay. |
| `createMagnaResource` | function | root | Create a reactive `Resource<T>` from an operation + optional variables signal. |
| `useMagnaSubscription` | function | root | Subscription handle. v0.1 degraded shim — no streaming yet. |
| `MagnaFetchToken` | injection token | root | Compiler-emitted `inject(MagnaFetchToken)` token for the fetch wrapper. |
| `magna` | function | `/codegen` (see note) | Plugin factory wiring the SDL pipeline into `beforeCompile`. |
| `beforeCompile` | function | `/codegen` | Build-time SDL validation/codegen hook (advanced). |

The `magna()` plugin factory wires the build pipeline through the `beforeCompile` hook; register it in `defineAihuConfig`. The build-time hook code is exported from the node-only `@aihu/magna/codegen` subpath.

## Functions

### createMagnaFetch

```typescript
function createMagnaFetch(options: MagnaPluginOptions): MagnaFetch
```

Returns a typed GraphQL fetch function bound to `options`. JWT relay: it calls `options.getToken?.()` per request and adds the `Authorization` header when the getter returns a non-null string (omitting it entirely on `null`). Static `options.headers` are merged first so callers can override. Network failures throw; GraphQL-level errors are returned inside the response envelope.

### createMagnaResource

```typescript
function createMagnaResource<T>(
  fetch: MagnaFetch,
  operation: string,
  variables?: Signal<Readonly<Record<string, unknown>> | null>,
  options?: ResourceOptions<T>,
): MagnaResource<T>
```

Creates a reactive Magna GraphQL resource. When the `variables` signal changes, the resource automatically re-fetches; a `null` variables value puts the resource into idle state (no fetch). `options` is forwarded to `createResource` (`initialData`, `dehydrate`, `store`). Returns a `Resource<T>` (`state`, `refetch`, `invalidate`).

### useMagnaSubscription

```typescript
function useMagnaSubscription<T>(): MagnaSubscriptionHandle<T>
```

Returns a degraded subscription handle in v0.1 — `state` always holds `null`, `close` is an idempotent no-op, and `degraded` is always `true`. A warn-once message is emitted on first call. Real WebSocket/SSE streaming arrives in a later release; branch on `handle.degraded` to stay forward-compatible.

### magna (`/codegen`)

```typescript
function magna(options: MagnaPluginOptions): Plugin
```

Plugin factory that wires the SDL validation pipeline into the aihu `beforeCompile` build hook so typed GraphQL bindings are generated (or gracefully skipped) at build time.

## Types

| Name | Description |
|------|-------------|
| `MagnaPluginOptions` | `url`, `schemaPath` (default `schema.graphql`), `headers`, `gitRev`, `getToken: () => string | null` for per-request JWT relay, and a `fetch` override. |
| `MagnaFetch` | The typed GraphQL fetch function returned by `createMagnaFetch`. |
| `MagnaResource<T>` | Alias of `Resource<T>` from `@aihu-plugin/data`. |
| `MagnaSubscriptionHandle<T>` | `{ state, close, degraded }`. `degraded` is always `true` in v0.1. |
| `MagnaBuildContext` | Extended `BuildContext` passed to the `beforeCompile` hook. |
| `MagnaJwtRelay` | Documentation artifact describing SSR `requireAuth → getToken` and client cookie-backed `ScopeSignal` relay. Never instantiated at runtime. |

## Usage

Register the plugin in your aihu config:

```typescript
// aihu.config.ts
import { magna } from '@aihu/magna/codegen'
import { defineAihuConfig } from '@aihu/server'

export default defineAihuConfig({
  plugins: [magna({ url: process.env.MAGNA_GRAPHQL_URL! })],
})
```

Then drive reactive queries at runtime:

```typescript
import { createMagnaFetch, createMagnaResource } from '@aihu/magna'
import { signal } from '@aihu/signals'

const fetch = createMagnaFetch({
  url: 'https://magna.example.com/graphql',
  getToken: () => readSessionToken(), // per-request JWT relay
})

const [vars] = signal({ id: '42' })
const resource = createMagnaResource(fetch, '{ user { id name } }', vars)
```

## How it relates

JWT relay ties into [`@aihu/auth`](/docs/packages/auth): in SSR contexts `requireAuth(req)` yields the token wrapped in a `getToken` closure, and on the client a cookie-backed `ScopeSignal` feeds `getToken` a live value.
