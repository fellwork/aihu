# @aihu/agent-a2a

Wraps an `AgentService` with the [Agent2Agent (A2A) Protocol Specification v1.0.1](https://a2a-protocol.org/v1.0.1/specification) JSON-RPC 2.0 binding. The adapter serves the spec agent card and a JSON-RPC endpoint, persists tasks to a swappable store, streams over SSE, and integrates with any fetch-API server via a single middleware function.

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
| `createInMemoryTaskStore` | function | The default in-memory `TaskStore` (also exported for reuse) |
| `A2aAdapter` | interface | Object returned by `mountA2aAdapter` |
| `A2aAdapterOptions` | interface | Options accepted by `mountA2aAdapter` |
| `TaskStore` | interface | Persistence boundary for tasks (`get`/`save`/`list`) |
| `Task`, `Message`, `Part`, `AgentCard`, … | types | A2A v1.0.1 data-model types (camelCase JSON, ProtoJSON enums) |

## Functions

### mountA2aAdapter

```typescript
function mountA2aAdapter(
  service: AgentService,
  options?: A2aAdapterOptions,
): A2aAdapter
```

Creates an A2A adapter that wraps the given `AgentService`. The returned `A2aAdapter` exposes an `asMiddleware()` method that returns a fetch-API handler function. The handler returns a `Response` for any path it owns, and `null` for paths it does not recognize — allowing you to chain multiple adapters or fall through to a 404 handler.

**Parameters**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `service` | `AgentService` | Yes | The agent service instance to wrap. Obtained from `createAgentService` in `@aihu/agent-service`. |
| `options` | `A2aAdapterOptions` | No | Optional configuration. See `A2aAdapterOptions`. |

**Returns** `A2aAdapter` — the configured adapter.

## Types

### A2aAdapterOptions

```typescript
interface A2aAdapterOptions {
  prefix?: string
  name?: string
  description?: string
  version?: string
  url?: string
  taskStore?: TaskStore
  resolveAuth?: (req: Request) => RequestContext | Promise<RequestContext>
}
```

**Fields**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `prefix` | `string` | No | URL prefix prepended to all route paths. Default: `''`. |
| `name` | `string` | No | Agent name in the agent card. Default: `'aihu-agent-service'`. |
| `description` | `string` | No | Agent description in the agent card. |
| `version` | `string` | No | Agent version in the agent card. Default: `'1.0.0'`. |
| `url` | `string` | No | Absolute public URL of the JSON-RPC endpoint, advertised in `supportedInterfaces[0].url`. Defaults to the relative `{prefix}/a2a`; production cards should set it (the spec requires an absolute HTTPS URL). |
| `taskStore` | `TaskStore` | No | Swap the task store. Default: a per-adapter in-memory store. |
| `resolveAuth` | `(req) => RequestContext` | No | Per-request auth resolver — the tier-0 attribution injection point. Absent or throwing resolvers degrade to an explicit anonymous context, which still fails closed on scoped bindings. |

### TaskStore

```typescript
interface TaskStore {
  get(id: string): Task | undefined | Promise<Task | undefined>
  save(task: Task): void | Promise<void>
  list(): Task[] | Promise<Task[]>
}
```

Persistence boundary for tasks, making `GetTask` / `ListTasks` / `CancelTask` implementable. Inject a KV- or DB-backed implementation for durable deployments.

## Routes

The middleware returned by `asMiddleware()` owns the following paths (relative to `prefix`):

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/.well-known/agent-card.json` | A2A agent card (spec §4.4.1): `name`, `description`, `version`, `supportedInterfaces` (`JSONRPC`, protocol version `1.0`), `capabilities` (`streaming: true`, `pushNotifications: false`), and a `skills` array derived from the service manifest. |
| `POST` | `/a2a` | JSON-RPC 2.0 endpoint. Methods: `SendMessage`, `SendStreamingMessage` (SSE), `GetTask`, `ListTasks`, `CancelTask`, `SubscribeToTask`, the push-notification config methods (`-32003`), `GetExtendedAgentCard` (`-32007`). |

All other paths return `null` from the middleware.

## Invoking a skill

Every exposed aihu action is an A2A skill with id `"<tag>/<action>"`. A `Message` invokes one with a **data part**:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "SendMessage",
  "params": {
    "message": {
      "messageId": "m-1",
      "role": "ROLE_USER",
      "parts": [{ "data": { "skill": "x-counter/increment", "params": { "by": 2 } } }]
    }
  }
}
```

or with a text part whose text is the skill id (params then come from the first data part, if any). The response is `{ "result": { "task": { … } } }`; the dispatch result rides in `task.artifacts[0].parts[0].data`.

Gate verdicts map onto task state: 401 `AUTH_REQUIRED` → `TASK_STATE_AUTH_REQUIRED` (resumable — re-send with `message.taskId` and credentials), 403 `SCOPE_DENIED` → `TASK_STATE_REJECTED`; the full gate envelope (`error`, `code`) is carried in a status-message data part for audit.

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
  name: 'my-app',
  url: 'https://my-app.example.com/a2a',
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

## Migrating from 0.1.x

The 0.1.x wire is removed (semver-major):

| 0.1.x | Now |
|---|---|
| `GET /.well-known/agent.json` | `GET /.well-known/agent-card.json` |
| `POST /a2a/tasks/send` with `{ taskId?, message: "tag/action", params }` | `POST /a2a` JSON-RPC `SendMessage` with a `Message` (`parts`) |
| `POST /a2a/tasks/sendSubscribe`, SSE ending `data: [DONE]` | `POST /a2a` JSON-RPC `SendStreamingMessage`; frames are JSON-RPC responses, terminality is the task state |
| `{ taskId, status: 'completed', result }` response | `{ result: { task } }` with `TASK_STATE_*` states and artifacts |
