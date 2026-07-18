# @aihu/agent-server

## 0.3.1

### Patch Changes

- Updated dependencies [[`514336d`](https://github.com/fellwork/aihu/commit/514336da5892c29e9e02d7a6391bb06c62d688c3)]:
  - @aihu/arbor@2.0.0

## 0.3.0

### Minor Changes

- [#374](https://github.com/fellwork/aihu/pull/374) [`6a0d8e4`](https://github.com/fellwork/aihu/commit/6a0d8e426fa2ab53c37fa5d1d4e6ae63ca671e0d) Thanks [@srmcguirt](https://github.com/srmcguirt)! - add `create-aihu --template agent` + publish `@aihu/agent-server`

  - **New opt-in `agent` template** (`create-aihu --template agent`, or option 4 in the
    wizard): the headline aihu thesis made runnable. A durable on-screen `<task-list>`
    Web Component that BOTH a human and an external AI agent drive — the agent reaches the
    same visible instance over `@aihu/agent-server`'s capability bridge (server = policy
    gate, browser = sole executor). Two-process app (Bun bridge server + Vite, client-target
    compiler). Verified end-to-end: typing in the input AND an external
    `curl /agent/call` both append to the same live instance; unexposed actions are rejected.
  - **`@aihu/agent-server` first publish** (added to the release allowlist). Includes the
    fix that lets `createAgentServer`'s `node` mount path stand up its own server-side DOM
    internally (no consumer jsdom/`createHost` glue) when the runtime has no `document`.

  The bridge in the template is unauthenticated (local dev/demo); the generated server
  warns against exposing it to untrusted networks.

## 0.2.0

### Minor Changes

- [#320](https://github.com/fellwork/aihu/pull/320) [`a54ca1b`](https://github.com/fellwork/aihu/commit/a54ca1b8874583a0301e84c91f2d25713908e41f) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Add @aihu/agent-server: a server-mediated capability bridge for live agent dispatch. The compiler emits a narrow opaque-ID client dispatcher (not the raw `__agentBinding`); the browser mounts the real visible component and registers it; the server holds all policy (auth/scope/rate-limit via @aihu/agent-service) and forwards only approved invocations to the browser over a WebSocket bridge. The opaque-ID dispatcher exposes no policy, so the server-side gate is the sole enforcement point.

  - New package `@aihu/agent-server` — `createAgentServer`, `createComponentMcpServer`/`serveComponentMcp` (lazy MCP SDK), `createBridgeClient` (browser), opaque-ID helpers, and the bridge protocol types + `BRIDGE_PROTOCOL_VERSION`.
  - `@aihu/agent-service` — drive a server-mounted component over the bridge.
  - `@aihu/compiler` — emit the client-safe opaque-ID agent dispatcher.

  Follow-up hardening (WS auth/origin checks, server→client invocation signing) is deferred per the go-public eng review.

### Patch Changes

- Updated dependencies [[`a54ca1b`](https://github.com/fellwork/aihu/commit/a54ca1b8874583a0301e84c91f2d25713908e41f)]:
  - @aihu/agent-service@0.2.0
  - @aihu/arbor@1.0.0
