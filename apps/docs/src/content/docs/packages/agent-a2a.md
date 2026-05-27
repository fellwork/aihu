# @aihu/agent-a2a

Wraps an `AgentService` with Agent-to-Agent (A2A) protocol routes. The adapter exposes a discovery card and task-dispatch endpoints that comply with the A2A wire format, and integrates with any fetch-API server via a single middleware function.

## Install

```bash
npm install @aihu/agent-a2a
# or
bun add @aihu/agent-a2a
```

`@aihu/agent-service` is a required peer dependency — install it alongside this package.

## API overview

| Name | Kind | Description |
|------|------|-------------|
| `mountA2aAdapter` | function | Create an A2A adapter around an AgentService |
| `A2aAdapter` | interface | Object returned by `mountA2aAdapter` |
| `A2aAdapterOptions` | interface | Options accepted by `mountA2aAdapter` |

## Functions

### mountA2aAdapter

```typescript
function mountA2aAdapter(
  service: AgentService,
  options?: A2aAdapterOptions,
): A2aAdapter
```

Creates an A2A adapter that wraps the given `AgentService`. The returned `A2aAdapter` exposes an `asMiddleware()` method that returns a fetch-API handler function. Calling `asMiddleware()` multiple times on the same adapter is safe — each call returns a new handler closure over the same service and options.

**Parameters**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `service` | `AgentService` | Yes | The agent service instance to wrap. Obtained from `createAgentService` in `@aihu/agent-service`. |
| `options` | `A2aAdapterOptions` | No | Optional configuration. See `A2aAdapterOptions`. |

**Returns** `A2aAdapter` — the configured adapter.

## Types

### A2aAdapter

```typescript
interface A2aAdapter {
  asMiddleware(): (req: Request) => Promise<Response | null>
}
```

The object returned by `mountA2aAdapter`. Call `asMiddleware()` to obtain a handler that processes incoming requests. The handler returns a `Response` for any path it owns, and `null` for paths it does not recognize — allowing you to chain multiple adapters or fall through to a 404 handler.

**Fields**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `asMiddleware` | `() => (req: Request) => Promise<Response \| null>` | Yes | Returns a fetch-API middleware function. |

---

### A2aAdapterOptions

```typescript
interface A2aAdapterOptions {
  prefix?: string
  name?: string
}
```

Configuration options for `mountA2aAdapter`.

**Fields**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `prefix` | `string` | No | URL prefix prepended to all route paths. Default: `''`. |
| `name` | `string` | No | Agent name included in the discovery card response. Default: `'aihu-agent-service'`. |

## Routes

The middleware returned by `asMiddleware()` owns the following paths (relative to `prefix`):

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/.well-known/agent.json` | A2A agent discovery card. Returns JSON with `name`, `version`, `capabilities`, and a `skills` array derived from the service manifest. |
| `POST` | `/a2a/tasks/send` | Submit a task. Body: `{ taskId?, message: string, params? }`. Returns JSON `{ taskId, status, result \| error }`. |
| `POST` | `/a2a/tasks/sendSubscribe` | Submit a task with SSE streaming response. Same request body as `/a2a/tasks/send`. Returns `text/event-stream` ending with `data: [DONE]`. |

All paths not matching one of these three return `null` from the middleware.

## Usage

```typescript
import { createAgentService } from '@aihu/agent-service'
import { getAllAgentMetadata } from '@aihu/agent'
import { mountA2aAdapter } from '@aihu/agent-a2a'
import { defineRoute, createRequestRouter, notFound } from '@aihu/server'

const service = createAgentService({
  manifests: getAllAgentMetadata(),
})

const a2a = mountA2aAdapter(service, {
  prefix: '',
  name: 'my-app',
})

const router = createRequestRouter({
  routes: [
    defineRoute('/*', async (req) => {
      const res = await a2a.asMiddleware()(req)
      return res ?? notFound()
    }),
  ],
})

export default router
```

The `prefix` option is useful when mounting the adapter under a path namespace, e.g. `prefix: '/api'` shifts all routes to `GET /api/.well-known/agent.json`, `POST /api/a2a/tasks/send`, and `POST /api/a2a/tasks/sendSubscribe`.
