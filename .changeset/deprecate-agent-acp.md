---
'@aihu/agent-acp': minor
---

**DEPRECATED — use `@aihu/agent-a2a` instead** (#428).

The ACP protocol this package targeted (BeeAI ACP) merged into the A2A protocol
under the Linux Foundation in August 2025 — its maintainers migrated, and there
is no independent ACP spec left to conform to. (The "ACP" name now belongs to
Zed's unrelated editor↔agent Agent Client Protocol, which this package never
implemented; the package had also accumulated three conflicting name expansions
across its own docs.)

The package is frozen at `0.1.x`: it still compiles, its routes still respond,
and the AT1 tier-0 `RequestContext` attribution remains intact and tested — but
no further features will land. `package.json` now carries a `deprecated` notice;
run `npm deprecate @aihu/agent-acp` at publish time with the same message.

**Migration:** mount `mountA2aAdapter` from `@aihu/agent-a2a` on the same
`AgentService`. The A2A adapter implements the A2A v1.0.1 JSON-RPC binding and
accepts the same `resolveAuth` injection point.

The ~293 lines of tests that validated the adapter's invented wire shape were
deleted (not rewritten — they locked in a shape with no spec behind it). The
attribution/argument-threading suite (`tests/attribution.test.ts`) is kept in
full.
