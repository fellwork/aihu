---
"@aihu/compiler": minor
---

Add `wasm_compile_client` to the WASM build — a client-target sibling of `wasm_compile`. It runs the compile pipeline with `BuildTarget::Client`, so a `.aihu` component with an `@agent` block lowers to the policy-free `__agentDispatcher` plus the per-instance `_registerAgentDispatcher(ctx.element, …)` wiring (and elides the server `__agentBinding`). Browser playgrounds can now compile a component CLIENT-SIDE and drive the mounted instance over the capability bridge via `@aihu/runtime` `_takeAgentDispatcher` — used by the docs agent-drive stage. `wasm_compile` (universal target) is unchanged.
