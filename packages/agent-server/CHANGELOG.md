# @aihu/agent-server

## 0.4.0

### Minor Changes

- [#435](https://github.com/fellwork/aihu/pull/435) [`30ed2b5`](https://github.com/fellwork/aihu/commit/30ed2b51c215512f840b113afaa1636378e31407) Thanks [@srmcguirt](https://github.com/srmcguirt)! - `describe:` now reaches agents. The compiler emits `registerAgentMetadata`.

  `$action` / `$prop` / `$computed` entries have accepted a `describe:` key since the
  v2 macro vocabulary landed — it was parsed, validated, and parser-tested, then
  dropped. It reached no emitted artifact, so MCP tools shipped with a synthesized
  description ("Invoke the `bump` action on a live `<tag>` instance.") regardless of
  what the author wrote.

  Two independent breaks, both fixed:

  - The compiler **never emitted `registerAgentMetadata` anywhere**, so the
    `@aihu/agent` registry that `@aihu/agent-server`'s `buildToolDefinitions` reads
    was empty in every real app. `registry.ts`'s doc comment described a wire that
    was never built. Server and universal builds now emit
    `registerAgentMetadata({ tag, state, actions })` at module scope. The payload is
    pure data — it closes over no setup locals, unlike `__agentBinding` — so it is
    safe there and readable on import without a live instance. Client builds elide
    it along with the rest of the agent surface.

  - `emit_manifest` read only the retired **v1** `@agent { input / action }`
    keywords, so a v2 component's `agent-manifest.json` came out with empty
    `inputs` and `actions`. It now derives from the same `collect_agent_members`
    walk that feeds `__agentBinding` and the registry, so the sidecar cannot drift
    from the live surface again. It also gained a `state` key mirroring the
    registry payload.

  `ActionSchema` gains an optional `describe`. `buildToolDefinitions` prefers the
  authored text over its synthesized string, for both action tools and state-read
  tools — the state map's values were previously ignored entirely.

  Descriptions are collected only for members that clear the `expose` gate, so an
  unexposed member's prose (which may describe internals) never reaches a public
  artifact.

  Not covered: MCP `inputSchema` is still `args: { type: 'array' }`. Real parameter
  schemas need handler-signature extraction and are tracked separately.

- [#450](https://github.com/fellwork/aihu/pull/450) [`e01f19d`](https://github.com/fellwork/aihu/commit/e01f19d70eabe867b8b8c310a6928b9576461cf0) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Security fix ([#420](https://github.com/fellwork/aihu/issues/420)): rate-limit keys and scope checks derive from a signature-VERIFIED JWT principal.

  Rate-limit keys were `${userId}:${tag}` with `userId` caller-supplied over MCP and never cross-checked against the JWT `sub`, so a caller reset its own quota by rotating `userId`; the scope check likewise consulted unverified claims, so a forged `scope` claim bypassed `$scope`.

  - `@aihu/agent-service` (minor — optional interface member): `AuthPlugin.verify?(jwt) → Promise<VerifiedClaims | null>` is the single verified-claims source for BOTH the rate-limit key (`sub:tag`) and the scope gate; the gate is now async end-to-end and FAILS CLOSED (401) when a scoped/rate-limited tool meets a plugin that cannot verify. New `authDiscoveryUrl` option: 401 envelopes carry the deployment's auth-discovery URL so refused agents know where to obtain a credential.
  - `@aihu/auth` (minor): `@aihu/auth/server` exports `verifyJwt` and `createVerifiedAuthPlugin({ jwtSecret })` — the `crypto.subtle` HMAC path backing `verify`. The decode-only `createAuthPlugin` remains but cannot serve scoped/rate-limited tools.
  - `@aihu/agent-server` (minor): the MCP boundary forwards only the `jwt` credential from caller-supplied `context`; caller identity (`userId`) is dropped, never forwarded as authoritative. `authDiscoveryUrl` is threaded through and surfaced in MCP 401 error text.

  Behavior change: callers that relied on caller-supplied identity to satisfy scoped/rate-limited tools (i.e. spoofing callers, or deployments without a verifying auth plugin) are now refused with 401 — this is the security fix. Un-scoped, un-rate-limited tools are unaffected.

### Patch Changes

- Updated dependencies [[`30ed2b5`](https://github.com/fellwork/aihu/commit/30ed2b51c215512f840b113afaa1636378e31407), [`889830d`](https://github.com/fellwork/aihu/commit/889830d907e83b7d74dc8e64503d8bb4b4711812), [`549448c`](https://github.com/fellwork/aihu/commit/549448cd042ba89b94ddb291be741f015c3d0d9c), [`e01f19d`](https://github.com/fellwork/aihu/commit/e01f19d70eabe867b8b8c310a6928b9576461cf0)]:
  - @aihu/agent@0.2.0
  - @aihu/agent-service@0.3.0

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
