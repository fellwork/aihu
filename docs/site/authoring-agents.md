# Authoring Agents

aihu is agent-first. Every `.aihu` component can expose MCP-compatible tools and resources via the `@agent` block. The `@aihu/agent`, `@aihu/agent-service`, and `@aihu/agent-readiness` packages form the agent layer.

## The `@agent` block

Add an `@agent` block to any `.aihu` SFC to expose agent capabilities:

```
@agent {
  $expose greet(name: string) -> { message: string } "Greet a user by name"
  $expose getUser(id: number) -> User "Fetch a user by ID"
  $scope /api
  $rate-limit 100
  $describe "The main application agent"
}
```

### Directives

- **`$expose name(args) -> ReturnType "description"`** — expose a tool or resource. The compiler generates the MCP tool descriptor and wires the implementation to the component's action method of the same name.
- **`$scope path`** — restrict the agent to a specific URL path prefix. Requests outside the scope are rejected.
- **`$rate-limit n`** — limit calls to `n` per minute. The agent service enforces this at runtime.
- **`$describe "text"`** — a human-readable description of the agent. Included in the MCP manifest.

### Client build elision

When compiling with `BuildTarget.Client`, the `@agent` block is fully elided — no manifest JSON is emitted and the JS output contains a `// [client build] @agent block elided` comment. Agent code never reaches the browser bundle.

## `@aihu/agent`

The `@aihu/agent` package provides the registry and registration primitives:

```typescript
import { defineAgent } from '@aihu/agent'

const agent = defineAgent({
  name: 'my-agent',
  tools: [
    {
      name: 'greet',
      description: 'Greet a user',
      inputSchema: { type: 'object', properties: { name: { type: 'string' } } },
      handler: async ({ name }) => ({ message: `Hello, ${name}!` }),
    },
  ],
})
```

`AgentRegistry` holds registered agent definitions. Each `defineAgent` call returns an `AgentDefinition` that can be passed to `AgentService`.

## `@aihu/agent-service`

The `@aihu/agent-service` package adapts agent definitions to a runtime service:

```typescript
import { defineAgentService } from '@aihu/agent-service'
import { myAgent } from './agents/my-agent.ts'

const service = defineAgentService({
  agent: myAgent,
  transport: 'http',
  port: 3001,
})
```

`AgentService` handles request routing, rate limiting, and MCP protocol serialization.

## `@aihu/agent-readiness` — Vite integration

In development and build, use `viteAgentReadinessIntegration()` to wire agent manifests into the Vite build:

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import { viteAgentReadinessIntegration } from '@aihu/agent-readiness'

export default defineConfig({
  plugins: [
    viteAgentReadinessIntegration(),
  ],
})
```

The plugin:

1. Reads `manifest_json` from each compiled SFC that has an `@agent` block.
2. Aggregates tool/resource descriptors into a single `agent-manifest.json` asset.
3. Emits an `llms.txt` file at the root of the output for MCP discovery.

The `llms.txt` and MCP manifest are part of the aihu contract — every aihu application ships them.
