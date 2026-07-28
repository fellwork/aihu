# Authoring Agents

aihu is agent-first by design. Every `.aihu` SFC can declare an `@agent` block, and the Rust compiler emits both a Web Component and a `<tag>.agent-manifest.json` sidecar (aihu's own shape — not an MCP `.mcp.json` document) from the same source file. The result is a three-layer stack — component-level `@agent` declarations, the `@aihu/agent` static registry, and the `@aihu/agent-service` live execution engine — that lets an aihu app be made callable by MCP-compatible AI agents once the agent surface is wired up (the discovery and serving pieces are opt-in, not automatic — see §6 and §10).

---

## 1. Overview: aihu's agent-first design

### Three layers

| Layer | Package | Role |
|---|---|---|
| `@agent` block | `.aihu` SFC | Per-component declaration of exposed state and actions |
| Registry | `@aihu/agent` | Compile-time metadata store, keyed by custom-element tag |
| Service | `@aihu/agent-service` | Live-binding dispatch — routes agent tool calls to DOM signal graph |

### Key properties

- **Agent code is fully elided from client builds.** When compiling with `BuildTarget.Client`, the `@agent` block produces a `// [client build] @agent block elided` comment and zero runtime bytes. Agent schemas never reach the browser bundle.
- **The Rust compiler emits a `<tag>.agent-manifest.json` sidecar** for every SFC with an exposed agent surface (`expose:` on `@state` entries, or a legacy `@agent` block) — one file per component, including on client builds. The schema is derived directly from `describe:` and `expose:` metadata in `@state` entries. This is aihu's own shape, not `.mcp.json`; `@aihu-plugin/agent-readiness` reads it to build `llms.txt` and the MCP server card — see §7.
- **Live-binding (v0.3.0+)** wires agent tool calls to the actual signal graph of mounted components, so an AI agent invoking `live-counter/increment` triggers the same reactive path as a user clicking the button.

---

## 2. The `@agent` block (macro-vocabulary v2 syntax)

In macro-vocabulary v2 (RATIFIED 2026-05-05), agent metadata moves _into_ `@state` collection entries. The `@agent` block is now a minimal cross-cutting block that holds only `$scope` and `$rate-limit`.

The old v1 forms (`$expose`, `$expose.write`, agent-bare-`$action`, `$describe`) are rejected by the v2 parser with error code **C440**. Use the codemod to upgrade existing `.aihu` files.

### v2 pattern: metadata on `@state` entries

```
@state {
  import { signal } from '@aihu/signals'
  const [count, setCount] = signal(0)

  $prop: {
    count: {
      default: 0,
      type: "number",
      describe: "The current counter value",
      expose: { read: true },
    }
  }

  $action: {
    increment: {
      describe: "Add 1 to counter",
      expose: { read: true, write: true },
      handler: () => setCount(count() + 1),
    }
    decrement: {
      describe: "Subtract 1 from counter",
      expose: { read: true, write: true },
      handler: () => setCount(count() - 1),
    }
  }
}

@agent {
  $scope "authenticated"
}
```

The `expose:` key accepts `{ read: true }` (read-only tool) or `{ read: true, write: true }` (callable action). The `describe:` key is the human-readable description surfaced in the MCP tool schema.

### `@agent` block grammar (v2)

```
@agent {
  $scope <string-literal>   // optional — access scope claim required in JWT
  $rate-limit <integer>     // optional — requests per minute
}
```

Both directives are optional; the entire block may be omitted if no scope or rate limiting is needed. Exposure and description metadata live on `@state` entries, not inside `@agent`.

### Minimal `@agent` block (scope only)

```
@agent {
  $scope "authenticated"
}
```

### No `@agent` block needed

If you only want MCP tools with no scope or rate-limit enforcement, you do not need to write an `@agent` block at all. Adding `expose:` to `@state` entries is sufficient to generate the MCP tool schema.

### Real example: `live-counter.aihu`

```
@state {
  import { signal } from '@aihu/signals'
  const [count, setCount] = signal(0)

  $action: {
    increment: {
      describe: 'Add 1 to the counter',
      expose: { read: true, write: true },
      handler: () => setCount(count() + 1),
    },
    decrement: {
      describe: 'Subtract 1 from the counter',
      expose: { read: true, write: true },
      handler: () => setCount(count() - 1),
    },
    reset: {
      describe: 'Reset the counter to 0',
      expose: { read: true, write: true },
      handler: () => setCount(0),
    },
  }
}
```

No `@agent` block is needed here — these actions are exposed publicly with no scope restriction.

---

## 3. `@aihu/agent` — the registry layer

The `@aihu/agent` package is the compile-time metadata registry. The Rust compiler emits a `registerAgentMetadata()` call at the top level of every compiled `.aihu` module that has exposed state or actions. Module evaluation populates the registry.

### Public API

```typescript
import {
  registerAgentMetadata, // emitted by compiler — do not call directly
  getAgentMetadata,      // look up a single component by tag
  getAllAgentMetadata,    // enumerate the full registry (used by adapters)
} from '@aihu/agent'
```

### `AgentMetadata` shape

```typescript
interface AgentMetadata {
  tag: string                              // custom-element tag name
  describes?: string                       // top-level description (MCP prompt)
  state?: Record<string, string>           // exposed signal names → descriptions
  actions?: Record<string, ActionSchema>   // exposed action names → schemas
  [key: string]: unknown                   // unknown fields preserved (spec §9.1)
}
```

The compiler emits a frozen object. `getAgentMetadata(tag)` returns it by reference. `getAllAgentMetadata()` returns an array snapshot of all registered entries, used by adapters like `@aihu/agent-a2a` that need the full registry without knowing tags in advance.

### When to call these directly

You typically do not call `registerAgentMetadata` — the compiler does. You may call `getAgentMetadata` or `getAllAgentMetadata` in server code (route handlers, adapters) to read the compile-time manifest.

---

## 4. `@aihu/agent-service` — the execution layer

`@aihu/agent-service` bridges the compile-time `AgentMetadata` registry and the live component instance registry into a single service that MCP clients can call.

### Creating a service

```typescript
import { createAgentService } from '@aihu/agent-service'
import { getAllAgentMetadata } from '@aihu/agent'

const service = createAgentService({
  manifests: getAllAgentMetadata(),
  // Wire live-binding registry from @aihu/arbor (v0.3.0+)
  getRegistry: () => componentInstanceRegistry,
  // Optional: scope enforcement
  authPlugin: myAuthPlugin,
  // Optional: rate limiting
  rateLimitPlugin: myRateLimitPlugin,
})
```

### `AgentServiceOptions`

| Field | Type | Description |
|---|---|---|
| `manifests` | `AgentMetadata[]` | Explicit metadata list. |
| `getRegistry` | `() => Map<string, LiveBinding[]>` | Getter for the live instance registry from `@aihu/arbor/mount`. Required for live dispatch. |
| `authPlugin` | `AuthPlugin` | Scope enforcement. Required when any component uses `$scope`. |
| `rateLimitPlugin` | `RateLimitPlugin` | Rate-limit enforcement. Optional. |

### `AgentService` methods

```typescript
interface AgentService {
  getManifest(): AgentManifest
  handleToolCall(toolName: string, params: unknown, requestContext?: RequestContext): Promise<unknown>
  asMiddleware(): (req: Request) => Promise<Response | null>
}
```

- **`getManifest()`** — returns the aggregated MCP manifest listing all tools.
- **`handleToolCall(toolName, params, ctx)`** — routes `"<tag>/<action>"` to the live binding. Tool name format: `"live-counter/increment"`.
- **`asMiddleware()`** — returns a fetch-API middleware that handles `POST /__aihu/tools/call` with `{ tool, params }` JSON body. Returns `null` for non-matching requests (pass-through compatible).

### Using as middleware

```typescript
import { createRouter, defineRoute } from '@aihu/server'

const router = createRouter({
  routes: [
    defineRoute('/api/*', (req) => service.asMiddleware()(req)),
    ...appRoutes,
  ],
})
```

---

## 5. Live-binding — the `$live` directive

Live-binding (v0.3.0, spec APPROVED 2026-05-05) is the mechanism that makes `@agent` blocks operational rather than decorative.

### What live-binding is

When a component with exposed state or actions mounts, the `mount()` path in `@aihu/arbor` detects the `__agentBinding` export on the server artifact and constructs a `LiveBinding` object. This object is registered in a module-level `componentInstanceRegistry` keyed by the component's tag name.

```typescript
interface LiveBinding {
  rootId: number           // unique mount ID
  tag: string              // component tag
  getSignal(name): unknown
  setSignal(name, value): void
  callAction(name, args): Promise<unknown>
  scope(): string | null
  rateLimit(): string | null
  dispose$: () => boolean  // called on unmount
}
```

When an agent calls `handleToolCall('live-counter/increment', {})`, the service:

1. Looks up `live-counter` in `componentInstanceRegistry`.
2. Checks `$scope` — returns 403 if the JWT lacks the required claim.
3. Checks `$rate-limit` — returns 429 if quota is exhausted.
4. Calls `binding.callAction('increment', [{}])`.
5. The action runs through the same reactive signal path as a user click, and the DOM updates immediately.

### The `$guard` primitive

`$guard` blocks an agent action when a condition fails. Declare it on an action in `@state`:

```
$action: {
  checkout: {
    describe: "Complete the purchase",
    expose: { read: true, write: true },
    handler: () => processCheckout(),
    // guard: cartItems().length > 0  // (v1.1 syntax — see live-binding spec §4)
  }
}
```

Guards are evaluated before the action handler runs. A guard failure returns a structured error to the agent without executing the action.

### SSR and headless considerations

A server-rendered `LiveBinding` is ephemeral — it lives only for the duration of the SSR request. For persistent stateful agent interactions (multi-turn conversations, cart mutations, collaborative state), the component must be client-hydrated. A client-mounted `LiveBinding` is long-lived for the page session.

### Security invariants

- **Error ordering (timing-channel protection):** `handleToolCall` always returns errors in order: 404 (no instance) → 401 (missing auth) → 403 (scope denied) → 429 (rate limited). Reordering is forbidden — serving 429 before 403 would leak binding existence to unauthorized callers.
- **Fail-closed for missing auth:** If `authPlugin` is not registered and a component declares `$scope`, `handleToolCall` returns `{ error: 'AUTH_MISSING' }` (HTTP 401). The component is never served without an active auth plugin.
- **`componentInstanceRegistry` is module-private.** Only the `mount()` call path can register bindings. Plugins and request handlers cannot inject entries.
- **`__agentBinding` is elided from client bundles.** This is a compiler guarantee enforced by the split-bundle compilation (Block Structure Spec §11.5).

---

## 6. `@aihu-plugin/agent-readiness` — discovery and MCP compliance

`@aihu-plugin/agent-readiness` generates the four standard agent-discovery endpoints: `llms.txt`, `llms-full.txt`, `/.well-known/mcp/server-card.json`, and `robots.txt`.

### Router wiring (server/edge)

```typescript
import { createAgentReadinessRoutes } from '@aihu-plugin/agent-readiness'
import { createRouter, defineRoute } from '@aihu/server'

const ar = createAgentReadinessRoutes({
  name: 'My App',
  version: '1.0.0',
  summary: 'What this app does for AI agents',
  endpoint: 'https://myapp.example.com/mcp',
  llmsSections: [
    {
      title: 'Docs',
      links: [
        { title: 'API Reference', url: '/llms-full.txt', description: 'Full API docs' },
      ],
    },
  ],
})

const router = createRouter({
  routes: [
    defineRoute('/llms.txt', ar.llmsTxt),
    defineRoute('/llms-full.txt', ar.llmsFullTxt),
    defineRoute('/.well-known/mcp/server-card.json', ar.mcpServerCard),
    defineRoute('/robots.txt', ar.robotsTxt),
    ...appRoutes,
  ],
})

export default { fetch: router }
```

Each handler is a pure function that generates fresh content on every request. No global state.

### `AgentReadinessConfig` fields

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Required. App name — appears as the H1 in `llms.txt`. |
| `version` | `string` | Semver string for the MCP server card. |
| `summary` | `string` | Blockquote summary in `llms.txt`. |
| `endpoint` | `string` | MCP server URL. Required for `server-card.json` generation. |
| `llmsSections` | `LlmsTxtSection[]` | Custom sections in `llms.txt`. |
| `llmsOptional` | `LlmsTxtLink[]` | Links in the `## Optional` section. |
| `aiAgents` | `'allow-all' \| 'deny-all' \| RobotsRule[]` | AI bot policy for `robots.txt`. Default: `'allow-all'`. |
| `sitemap` | `string` | Sitemap URL appended to `robots.txt`. |
| `auth` | `McpAuthConfig` | Optional OAuth 2.0 config for the MCP server card. |
| `skills` | `AgentSkill[]` | Manually declared MCP skills. |

### With OAuth 2.0 (opt-in)

```typescript
const ar = createAgentReadinessRoutes({
  name: 'My App',
  endpoint: 'https://myapp.example.com/mcp',
  auth: {
    type: 'oauth2',
    authorizationUrl: 'https://auth.example.com/authorize',
    tokenUrl: 'https://auth.example.com/token',
    scopes: ['mcp:read', 'mcp:write'],
  },
})
```

The generated MCP server card advertises **only** the authorization-server issuer origin (derived from `tokenUrl`) as `auth.authorizationServer` — not the full authorization/token URLs or scopes, and never client secrets. It deliberately does **not** advertise `/.well-known/oauth-authorization-server` (RFC 8414) or `/.well-known/oauth-protected-resource` (RFC 9728) documents; consumers perform their own RFC 8414 discovery from the issuer.

### Vite integration (dev + build)

Use `viteAgentReadinessIntegration()` for Vite-based apps. In dev, it serves all four endpoints as Vite middleware. In build, it emits them as static assets.

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import { viteAgentReadinessIntegration } from '@aihu-plugin/agent-readiness'

export default defineConfig({
  plugins: [
    viteAgentReadinessIntegration({
      name: 'My App',
      endpoint: 'https://myapp.workers.dev/mcp',
      summary: 'Component-driven app with agent tools',
    }),
  ],
})
```

Note: `viteAgentReadinessIntegration()` does NOT inject routes into `createRouter` automatically. For server-side route wiring, use `createAgentReadinessRoutes()` separately.

> `agentReadiness()` is a deprecated alias for `viteAgentReadinessIntegration()`. It will be removed in v1.0.

---

## 7. Compiler-emitted agent manifest

The Rust compiler emits a `<tag>.agent-manifest.json` sidecar alongside the compiled JS for every SFC that has exposed state or actions. The shape is aihu's own — it is **not** an MCP `.mcp.json` document. It is derived from `describe:` and `expose:` metadata in `@state` entries.

`@aihu-plugin/agent-readiness` consumes these sidecars — pass `agentManifestDir` to `viteAgentReadinessIntegration` and the `## Components` section of `llms.txt` plus the MCP server card's skills are derived from them. This is the only source that works on a **client** build, where `registerAgentMetadata(...)` is elided and the runtime registry is therefore empty. The sidecar may carry policy (`scope`, `rateLimit`, `streamOutput`); the reader copies only `tag` / `describes` / `state` / `actions` / `extract`, so policy never reaches the served documents. The operational agent surface remains carried by the `registerAgentMetadata(...)` module-scope call (§3) and the `__agentBinding` server export (below).

### Emitted manifest for `live-counter.aihu`

Given the live-counter example from §2, the compiler emits approximately:

```json
{
  "tools": [
    {
      "name": "live_counter",
      "tag": "live-counter",
      "inputs": {},
      "actions": {
        "increment": { "returns": {}, "describe": "Add 1 to the counter" },
        "decrement": { "returns": {}, "describe": "Subtract 1 from the counter" },
        "reset": { "returns": {}, "describe": "Reset the counter to 0" }
      },
      "state": {}
    }
  ]
}
```

The `__agentBinding` server export, emitted alongside the client Web Component, wires the schema to the live signal graph:

```typescript
// server artifact — never reaches the client bundle
export const __agentBinding = {
  tag: 'live-counter',
  actions: {
    increment: (args) => increment(),
    decrement: (args) => decrement(),
    reset: (args) => reset(),
  },
  reads: {},
  writes: {},
  scope: undefined,
  rateLimit: undefined,
}
```

This export is completely absent from the client artifact — its absence is validated by CI (check for any `__agentBinding` string reference in client bundle output).

---

## 8. `@aihu/mcp` — the MCP stdio server

`@aihu/mcp` exposes an MCP stdio server with two built-in tools that help AI coding agents work with aihu.

### CLI usage

```bash
aihu mcp serve
```

Starts an MCP stdio server. The process stays alive until stdin closes (the MCP host disconnects).

### Built-in tools

| Tool | Description |
|---|---|
| `aihu_example` | Returns canonical `.aihu` SFC snippets from the cookbook matching a natural-language intent. |
| `aihu_validate` | Compiles a `.aihu` source string using the Rust compiler and returns compiled TypeScript or structured diagnostics. |

### `aihu_example`

```json
{
  "name": "aihu_example",
  "inputSchema": {
    "type": "object",
    "properties": {
      "intent": { "type": "string", "description": "Natural-language description of component pattern" },
      "tags": { "type": "array", "items": { "type": "string" }, "description": "Optional keyword tags" }
    },
    "required": ["intent"]
  }
}
```

Example call: `{ "intent": "counter with signal and action" }` returns the canonical counter SFC.

### `aihu_validate`

```json
{
  "name": "aihu_validate",
  "inputSchema": {
    "type": "object",
    "properties": {
      "source": { "type": "string", "description": "Full .aihu SFC source to compile" },
      "filename": { "type": "string", "description": "Optional virtual filename for diagnostics" }
    },
    "required": ["source"]
  }
}
```

Returns compiled TypeScript on success, or structured diagnostic errors (code, message, line/col) on failure. Use this to verify `.aihu` source before writing to disk.

### Programmatic usage

```typescript
import { createServer, startServer } from '@aihu/mcp'

// Start the server (blocks until stdin closes)
await startServer()

// Or create without connecting (for testing)
const server = createServer()
```

### MCP client configuration

To add the aihu MCP server to Claude Code or another MCP client:

```json
{
  "mcpServers": {
    "aihu": {
      "command": "aihu",
      "args": ["mcp", "serve"]
    }
  }
}
```

---

## 9. A2A protocol adapter (and the deprecated ACP adapter)

aihu ships one in-tree protocol adapter for agent-to-agent communication.

### `@aihu/agent-a2a` — Agent2Agent (A2A) protocol

`mountA2aAdapter` wraps an `AgentService` with the [A2A Protocol Specification v1.0.1](https://a2a-protocol.org/v1.0.1/specification) JSON-RPC 2.0 binding:

```typescript
import { mountA2aAdapter } from '@aihu/agent-a2a'

const a2a = mountA2aAdapter(service, {
  prefix: '',                              // URL prefix for all routes. Default: ''
  name: 'my-app',                          // Agent name in the agent card
  url: 'https://my-app.example.com/a2a',   // Absolute endpoint URL advertised in the card
  resolveAuth: (req) => getAuthState(req), // RequestContext per request (tier-0 attribution)
  // taskStore: myStore,                   // Swap the default in-memory TaskStore
})

// Wire the middleware
const router = createRouter({
  routes: [
    defineRoute('/*', async (req) => {
      const res = await a2a.asMiddleware()(req)
      return res ?? notFound()
    }),
  ],
})
```

Routes exposed:

| Method | Path | Description |
|---|---|---|
| `GET` | `/.well-known/agent-card.json` | A2A agent card (spec §4.4.1): `supportedInterfaces`, `capabilities`, `skills` |
| `POST` | `/a2a` | JSON-RPC 2.0 endpoint: `SendMessage`, `SendStreamingMessage` (SSE), `GetTask`, `ListTasks`, `CancelTask`, `SubscribeToTask`, `GetExtendedAgentCard` |

Every exposed action is an A2A skill with id `"<tag>/<action>"`. A `Message` invokes one with a data part — `{ "data": { "skill": "x-counter/increment", "params": { … } } }` — or a text part whose text is the skill id. Results persist to a `TaskStore` (in-memory by default, injectable), so `GetTask`/`ListTasks`/`CancelTask` are real; `SendStreamingMessage` streams JSON-RPC-wrapped `StreamResponse` frames over SSE, and terminality is the task state (no `[DONE]` sentinel).

> **Breaking change (semver-major):** the 0.1.x REST wire (`POST /a2a/tasks/send`, `POST /a2a/tasks/sendSubscribe`, `GET /.well-known/agent.json`, `body.message` as a `"tag/action"` string) is removed.

### `@aihu/agent-acp` — deprecated; use A2A

**`@aihu/agent-acp` is deprecated — use `@aihu/agent-a2a`.** The ACP protocol (BeeAI ACP) merged into A2A under the Linux Foundation in August 2025, so there is no independent ACP spec left to target. The package is frozen at `0.1.x`: it still compiles and its routes (`GET /.well-known/acp-agent`, `POST /acp/messages`) still respond, but no further features will land. Migrate by mounting `mountA2aAdapter` on the same service instance.

---

## 10. Agent compliance checklist

> **🚧 Opt-in, not "by contract."** These capabilities are **not** shipped by every aihu app automatically. The `llms.txt` / `llms-full.txt` / server-card / `robots.txt` endpoints require the `@aihu-plugin/agent-readiness` integration (§6). The A2A routes require mounting the adapter (§9). `aihu mcp serve` is a separate authoring stdio server (§8), **not** an app endpoint. Treat this as a checklist of what you can enable, not a description of defaults.

| Capability | Endpoint / command | Standard | How to enable |
|---|---|---|---|
| llms.txt discovery | `GET /llms.txt` | [llmstxt.org](https://llmstxt.org) | agent-readiness (§6) |
| llms-full.txt | `GET /llms-full.txt` | llmstxt.org | agent-readiness (§6) |
| MCP Server Card | `GET /.well-known/mcp/server-card.json` | aihu shape (not MCP-spec) | agent-readiness (§6) |
| robots.txt | `GET /robots.txt` | RFC 9309 | agent-readiness (§6) |
| A2A agent card | `GET /.well-known/agent-card.json` | [A2A v1.0.1](https://a2a-protocol.org/v1.0.1/specification) | `mountA2aAdapter` (§9) |
| A2A JSON-RPC endpoint | `POST /a2a` | A2A v1.0.1 §9 (JSON-RPC 2.0 binding) | `mountA2aAdapter` (§9) |
| Authoring MCP stdio server | `aihu mcp serve` | MCP SDK | CLI (§8) — authoring helper only |

### isitagentready.com checklist

The full checklist at [isitagentready.com](https://isitagentready.com) verifies:

- `llms.txt` present and parseable (H1 name, optional blockquote, H2 sections, link format)
- `robots.txt` includes explicit `Allow: /` for major AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Googlebot-Extended, CCBot, anthropic-ai, Google-Extended, Bytespider, cohere-ai)
- MCP server card present at `/.well-known/mcp/server-card.json` and valid against the aihu `McpServerCard` shape (this is aihu's own shape, **not** an MCP spec — SEP-1649 is closed)
- MCP endpoint responds to tool calls

### AI bot policy in `robots.txt`

The default `aiAgents: 'allow-all'` policy emits explicit `Allow: /` rules for every bot in `AI_BOT_LIST`. To deny all AI bots:

```typescript
createAgentReadinessRoutes({
  name: 'My App',
  aiAgents: 'deny-all',  // User-agent: *\nDisallow: /
})
```

To customize per-bot:

```typescript
createAgentReadinessRoutes({
  name: 'My App',
  aiAgents: [
    { userAgent: 'GPTBot', allow: ['/'] },
    { userAgent: 'ClaudeBot', allow: ['/'] },
    { userAgent: '*', disallow: ['/private/'] },
  ],
})
```

### Security notes

- `$scope` declarations are a security control, not a DX annotation. Always install `@aihu/auth` when using scoped `@agent` blocks.
- Audit all `@agent` blocks in third-party `.aihu` templates before production deployment. Review `$scope`, `expose: { read: true }`, and `expose: { read: true, write: true }` declarations for privilege escalation risks.
- Client bundles must never contain `__agentBinding`. Add a CI step: `grep '__agentBinding' dist/client/*.js && exit 1` to enforce this.
