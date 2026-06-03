# @aihu/agent-server

Server-mediated **capability bridge** for live agent dispatch. The browser mounts the real, visible component and registers a narrow opaque-ID dispatcher (emitted by the compiler — not the raw `__agentBinding`). The server holds all policy — auth, scope, rate-limit — via `@aihu/agent-service`, and forwards only approved action invocations to the browser over a WebSocket bridge. The client dispatcher exposes no policy information, so the server is the sole enforcement point.

## Install

```bash
npm install @aihu/agent-server
# or
bun add @aihu/agent-server
```

`@aihu/agent-service` is a required peer dependency — install it alongside this package.

## API overview

### Server

- `createAgentServer(options)` — the core factory. Mounts a component server-side, exposes its actions to an MCP client through the agent-service security gate, and forwards approved invocations to a connected browser bridge. No MCP SDK import.
- `createComponentMcpServer(options)` / `serveComponentMcp(options)` — wrap the agent server as an MCP endpoint. The MCP SDK is imported lazily, so it is only loaded when you import from this barrel.

### Browser bridge client

- `createBridgeClient(options)` — the browser-side client (T3) that connects to the server bridge, registers the mounted component's opaque-ID dispatcher, and executes approved invocations against the live instance.
- Types: `BridgeClient`, `BridgeClientOptions`, `AgentDispatcher`.

### Opaque IDs

- `opaqueActionId(...)` / `opaqueActionIdForTool(...)` — derive the opaque action identifier the client dispatcher is keyed on (no tag/action/policy leakage).
- `parseToolName(toolName)` — split an MCP tool name into its components.

### Protocol

- `BRIDGE_PROTOCOL_VERSION` plus the bridge message types — the WebSocket contract the browser bridge client implements against.

## Security note

The bridge's security argument is that the server is the *only* thing that can invoke the client-side dispatcher. The opaque-ID dispatcher carries no policy, so the server-side gate (`@aihu/agent-service`) is load-bearing. WS authentication and origin checks for the bridge channel are a planned v1.x hardening follow-up; do not expose an unauthenticated bridge to untrusted networks.
