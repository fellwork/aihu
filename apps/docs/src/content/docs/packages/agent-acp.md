# @aihu/agent-acp

> **DEPRECATED — use [`@aihu/agent-a2a`](/docs/packages/agent-a2a) instead.** The ACP protocol (BeeAI ACP) merged into the A2A protocol under the Linux Foundation in August 2025; there is no independent ACP spec left to conform to. This package is frozen at `0.1.x` — it still compiles and its routes still respond, but no further features will land. Migrate by mounting `mountA2aAdapter` on the same `AgentService`.

Wraps an `AgentService` with ACP-style routes (a discovery card and a message-routing endpoint) and integrates with any fetch-API server via a single middleware function.

## Install

```bash
npm install @aihu/agent-acp
# or
bun add @aihu/agent-acp
```

`@aihu/agent-service` is a required peer dependency — install it alongside this package.

## API overview

| Name | Kind | Description |
|------|------|-------------|
| `mountAcpAdapter` | function | Create an ACP adapter around an AgentService |
| `AcpAdapter` | interface | Object returned by `mountAcpAdapter` |
| `AcpAdapterOptions` | interface | Options accepted by `mountAcpAdapter` |
| `AcpMessage` | interface | Minimal ACP message shape consumed by the adapter |

## Functions

### mountAcpAdapter

```typescript
function mountAcpAdapter(
  service: AgentService,
  options?: AcpAdapterOptions,
): AcpAdapter
```

Creates an ACP adapter that wraps the given `AgentService`. The returned `AcpAdapter` exposes an `asMiddleware()` method that returns a fetch-API handler function. Tool name resolution checks `parts[0].content.tool` first, then falls back to the `content` string of the incoming `AcpMessage`.

**Parameters**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `service` | `AgentService` | Yes | The agent service instance to wrap. Obtained from `createAgentService` in `@aihu/agent-service`. |
| `options` | `AcpAdapterOptions` | No | Optional configuration. See `AcpAdapterOptions`. |

**Returns** `AcpAdapter` — the configured adapter.

## Types

### AcpAdapter

```typescript
interface AcpAdapter {
  asMiddleware(): (req: Request) => Promise<Response | null>
}
```

The object returned by `mountAcpAdapter`. Call `asMiddleware()` to obtain a handler that processes incoming requests. Returns a `Response` for paths it owns, and `null` for unrecognized paths — allowing chaining with other adapters or a fallthrough 404 handler.

**Fields**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `asMiddleware` | `() => (req: Request) => Promise<Response \| null>` | Yes | Returns a fetch-API middleware function. |

---

### AcpAdapterOptions

```typescript
interface AcpAdapterOptions {
  prefix?: string
  agentId?: string
}
```

Configuration options for `mountAcpAdapter`.

**Fields**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `prefix` | `string` | No | URL prefix prepended to all route paths. Default: `''`. |
| `agentId` | `string` | No | Agent identifier included in the discovery card response. Default: `'aihu-agent-service'`. |

---

### AcpMessage

```typescript
interface AcpMessage {
  role: string
  content: string
  parts?: Array<{ type: string; content: unknown }>
}
```

The minimal ACP message shape expected by the `POST /acp/messages` endpoint. The adapter reads the tool name from `parts[0].content.tool` when present; otherwise it uses `content` as the tool name directly.

**Fields**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `role` | `string` | Yes | Message role (e.g. `'user'`). |
| `content` | `string` | Yes | Tool name fallback — used when `parts[0].content.tool` is absent or empty. |
| `parts` | `Array<{ type: string; content: unknown }>` | No | Optional message parts. When present, `parts[0].content.tool` is checked first for the tool name. |

## Routes

The middleware returned by `asMiddleware()` owns the following paths (relative to `prefix`):

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/.well-known/acp-agent` | ACP agent discovery card. Returns JSON with `agent_id`, `description`, and a `skills` array derived from the service manifest. |
| `POST` | `/acp/messages` | ACP message routing. Accepts an `AcpMessage` body. Resolves tool name from `parts[0].content.tool` first, then from `content`. Returns `{ role: 'agent', content, parts }`. |

All paths not matching one of these two return `null` from the middleware.

## Usage

```typescript
import { createAgentService } from '@aihu/agent-service'
import { getAllAgentMetadata } from '@aihu/agent'
import { mountAcpAdapter } from '@aihu/agent-acp'
import { defineRoute, createRequestRouter, notFound } from '@aihu/server'

const service = createAgentService({
  manifests: getAllAgentMetadata(),
})

const acp = mountAcpAdapter(service, {
  prefix: '',
  agentId: 'my-app',
})

const router = createRequestRouter({
  routes: [
    defineRoute('/*', async (req) => {
      const res = await acp.asMiddleware()(req)
      return res ?? notFound()
    }),
  ],
})

export default router
```

### Combining A2A and ACP adapters

Both adapters can coexist on the same service instance, checked in order:

```typescript
import { mountA2aAdapter } from '@aihu/agent-a2a'
import { mountAcpAdapter } from '@aihu/agent-acp'

const a2a = mountA2aAdapter(service)
const acp = mountAcpAdapter(service)

const mw = async (req: Request): Promise<Response> =>
  (await a2a.asMiddleware()(req)) ??
  (await acp.asMiddleware()(req)) ??
  notFound()
```
