---
'@aihu/compiler': minor
---

`expose:` is now the agent opt-in. An `@agent` block is no longer required.

Every agent artifact was gated on the presence of an `@agent` block. That
contradicted the documented contract (`docs/site/authoring-agents.md`: "No
`@agent` block needed") and had a concrete consequence: the `aihu create`
scaffold and `cookbook/agent-weather.aihu` both write `expose:` and `describe:`
with no `@agent` block, and both compiled to **zero** agent artifacts. The
scaffold's own comment that "`$action` is the single source of truth for the
agent surface" was false at the compiler level.

A component is now agent-enabled when it exposes anything. `@agent` keeps its
v2 job: carrying policy (`$scope`, `$rate-limit`). A component with exposed
members and no block gets no policy — unscoped and unthrottled, which is what
declaring nothing means.

This does not widen the exposed surface. `expose: { read: true }` is already an
explicit, per-member opt-in, and unexposed members remain excluded. Requiring a
second opt-in only made the first one silently inert. A component that exposes
nothing stays inert whether or not it declares `@agent`.

**Behavior change to expect:** any component with `expose:` and no `@agent`
block now emits `registerAgentMetadata`, `__agentBinding`, the server binding
registration, and a manifest on server/universal builds — and, on client builds,
the narrow opaque-ID dispatcher needed by the capability bridge. That last one
is new client-side weight for such components, where previously there was none.
Ten components in `cookbook/` and `examples/` are affected, including
`live-counter`, `todo-mvc`, and `weather-card`.

If a component should NOT be agent-reachable, remove `expose:` from its
entries — that is now the only switch, rather than one of two that had to agree.
