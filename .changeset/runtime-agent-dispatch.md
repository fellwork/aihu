---
"@aihu/runtime": minor
---

Add the per-element agent-dispatch registry (`_registerAgentDispatcher` / `_takeAgentDispatcher`, from `agent-dispatch.ts`). The compiler injects a `_registerAgentDispatcher(ctx.element, …)` call into each `@agent` component's setup body and imports it from `@aihu/runtime`; the browser capability-bridge client (`@aihu/agent-server`) reads the per-instance dispatcher via `_takeAgentDispatcher`.

This MUST publish in lockstep with the matching `@aihu/compiler` release. Without this bump, the released compiler emits `import { …, _registerAgentDispatcher } from '@aihu/runtime'` against the previously published runtime (0.1.8), which does not export the symbol — so any compiled `@agent` component would fail to resolve it.
