---
"@aihu/compiler": minor
"@aihu/runtime": minor
---

Fix server/universal `@agent` builds: lower `@state` macros and enable headless dispatch.

Previously the server/universal path (`emit_options_form`) did **not** run `process_state_body`, so `$prop`/`$action`/`$computed` were emitted as raw JS labeled statements and the module-scope `__agentBinding` referenced undeclared symbols — any real compiled `@agent` component was undrivable server-side (only the browser capability-bridge path worked).

`@agent` SFC emission is now unified on the function form (which already lowers macros and handles props/magna/`$auth`/form/aria), and `emit_options_form` is removed. For the server, the compiler injects an in-setup `_registerAgentServerBinding(ctx.element, …)` (new in `@aihu/runtime`, mirroring the client's `_registerAgentDispatcher`) that registers a full per-instance `LiveBinding` — with the live setup-scope reads/writes/actions plus `scope`/`rateLimit` — into arbor's `componentInstanceRegistry`. So `@aihu/agent-service`'s gate (`getRegistry`) can drive a real compiled component **headless** (no browser bridge).

The compiler emits `import { …, _registerAgentServerBinding } from '@aihu/runtime'`, so these publish in lockstep. The client/bridge path (`_registerAgentDispatcher`, opaque-ID dispatcher, client-elided raw `__agentBinding`) and the `batch`-returns-value / `$prop` `.set(v)` fixes are preserved. Proven by `packages/agent-server/tests/headless-compiled-dispatch.test.ts`, which compiles a real SFC `--target server` and drives it.
