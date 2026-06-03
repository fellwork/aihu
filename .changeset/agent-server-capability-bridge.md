---
"@aihu/agent-server": minor
"@aihu/agent-service": minor
"@aihu/compiler": minor
---

Add @aihu/agent-server: a server-mediated capability bridge for live agent dispatch. The compiler emits a narrow opaque-ID client dispatcher (not the raw `__agentBinding`); the browser mounts the real visible component and registers it; the server holds all policy (auth/scope/rate-limit via @aihu/agent-service) and forwards only approved invocations to the browser over a WebSocket bridge. The opaque-ID dispatcher exposes no policy, so the server-side gate is the sole enforcement point.

- New package `@aihu/agent-server` — `createAgentServer`, `createComponentMcpServer`/`serveComponentMcp` (lazy MCP SDK), `createBridgeClient` (browser), opaque-ID helpers, and the bridge protocol types + `BRIDGE_PROTOCOL_VERSION`.
- `@aihu/agent-service` — drive a server-mounted component over the bridge.
- `@aihu/compiler` — emit the client-safe opaque-ID agent dispatcher.

Follow-up hardening (WS auth/origin checks, server→client invocation signing) is deferred per the go-public eng review.
