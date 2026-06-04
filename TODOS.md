# TODOS

## Deferred from go-public eng review (2026-06-02)

### WS capability-bridge auth/origin hardening (v1.x)
- **What:** Add origin checks + WS authentication to the agent-server capability bridge so only the trusted server process can send approved action invocations to a browser-owned component instance, and only authorized viewers can connect to the state stream.
- **Why:** The bridge topology's entire security argument is that the server is the *sole* policy-enforcement point and the *only* thing that can invoke the client-side opaque-ID dispatcher. A demo bridge that trusts localhost is fine for the launch recording, but in production an unauthenticated WS channel is an open remote-control surface for every mounted component.
- **Context:** Chosen topology (go-public design) is a server-mediated capability bridge: compiler emits a narrow opaque-ID client dispatcher (NOT the raw `__agentBinding`), the browser mounts the real visible component and registers that dispatcher, and the server (holding auth/scope/rate-limit via `getAllAgentMetadata()` + agent-service) forwards only approved invocations over WS. The dispatcher exposes no policy info, so the server-side gate is load-bearing.
- **Depends on:** the capability bridge + compiler opaque-ID dispatcher landing first.
- **Start at:** `@aihu/agent-server` (new package) WS handler; reuse `@aihu/auth` for viewer/session checks; enforce server→client invocation signing or a shared per-session bridge token.

### ~~`$action`/`$computed`/`$prop` dispatcher lowering (CLIENT/bridge path)~~ — FIXED (branch fix/agent-action-computed-lowering)
- **Resolved:** Two real bugs in the client/bridge dispatcher path, fixed + tested:
  - `$action` return value was swallowed — `batch(fn): void` discarded `fn()`'s result, so `return batch(() => { … return X })` returned `undefined`. Fixed: `batch<T>(fn): T` now returns the callback value (`@aihu/signals`; behavioral test in `batch.test.ts`).
  - `$prop` write invoker emitted `(v) => { name = v }` (reassigns the `const` binding → throws, never reaches the signal). Fixed: emits `(v) => name.set(v)` across all three sites (server `__agentBinding`, client `__agentDispatcher` export, in-setup `_registerAgentDispatcher`). Compiler test `agent_prop_write_uses_setter_and_action_returns_value`.
  - Reads (`() => computed()` / `() => prop()`) were already correct.
- **Net:** the capability-bridge (client) path now supports reading computed/prop, driving actions WITH return values, and writing props — so the demo can read/drive signals directly instead of via the `serialize()` snapshot workaround.

### `@state` collection macros are NOT lowered in the SERVER/universal build (separate, deeper bug)
- **What:** Discovered while fixing the above. For `--target server`/universal, the compiler emits the `@state` body's `$prop:`/`$action:`/`$computed:` blocks **verbatim as raw JS labeled statements** instead of lowering them (to `ctx.props.x` / `function name(){…}` / `computed(…)`). The emitted `__agentBinding` then references `bump`, `label`, etc. that are never declared — so the **headless server-side dispatch path (`__agentBinding` without a bridge) is broken for any real compiled `@agent` component.** Only the CLIENT (elide_agent) path lowers correctly.
- **Why it hasn't bitten yet:** the T6 demo + `@aihu/agent-server` tests drive components over the **bridge (client) path**, and the agent-service unit tests use **hand-built** `agentBinding` objects — so the compiler's server-side lowering was never exercised end-to-end. The launch demo is unaffected. But "use `createAgentServer` headless (no browser) against a compiled component" would fail today.
- **Context:** `packages/compiler/src/codegen/emit.rs` — the server/universal `emit()` path does not run the collection-macro lowering that the client `elide_agent` path runs. Repro: `aihu-compile --stdin --tag t --target server < comp.aihu` and inspect the `setup(ctx)` body — the `$prop:`/`$action:` blocks appear unlowered.
- **Depends on:** nothing; compiler fix. Bigger blast radius than the client-path fix — touches the core setup-body lowering, so scope carefully.

### agent-service gate authorizes by tag, not action name (minor)
- **What:** `handleToolCall`/`authorize` confirm a live binding exists for the TAG but don't re-validate the action name against that binding. An unknown action on a registered tag passes the gate and surfaces as a loud `503 BRIDGE_ERROR` from the browser-side opaque-ID desync rather than a clean `404 no action`.
- **Why:** Cosmetic/UX correctness — the call is still rejected loudly without mutating state (the security invariant holds), but the code is misleading. A real MCP client would prefer a `404`.
- **Context:** `packages/agent-service/src/agent-service.ts` `runGate` step 1 (the live-binding branch checks `typeof binding.callAction === 'function'`, not action membership). Low priority; documented in the agent-server tests.
- **Depends on:** nothing.
