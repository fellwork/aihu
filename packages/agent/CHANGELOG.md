# @aihu/agent

## 0.2.0

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
