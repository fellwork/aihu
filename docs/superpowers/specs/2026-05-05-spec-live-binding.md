# Live-Binding Architecture — `@aihu/arbor` + `@aihu/agent-service`

**Status:** APPROVED per Directive 3 (2026-05-05); pending security review for RATIFICATION
**Spec version:** 0.1.0-draft
**Phase:** M1 (critical path — gates all M2+ plugin tool calls)
**Author:** Architect A3
**Date:** 2026-05-05
**Depends on:** `@aihu/arbor` (stable v1.0), `@aihu/agent-service` (stable v1.0), `@aihu/agent` (stable v1.0)
**Consumes:** Block Structure Spec §11.5 (split-bundle compilation), Macro Vocabulary Spec §5 (`@agent` block macros), Plugin Contract Spec §6.5 (server-side contributions)
**Source:** `docs/roadmap/arch-3-plugins.md` §3 (all design originates there; citations explicit throughout)
**Related specs:** Plugin Contract Spec, Macro Vocabulary Spec

> **Ratification note:** This RFC is APPROVED per `docs/roadmap/_user-directives.md` Directive 3 (2026-05-05): "Live-binding RFC — APPROVED. Proceed with arch-3 §3 architecture." RATIFICATION is pending mandatory security review of the `componentInstanceRegistry` surface (`docs/roadmap/SUMMARY.md` §6, HIGH risk, arch-3 R3). No M2 plugin ships before ratification. This spec moves from APPROVED to RATIFIED once security review signs off.

---

## §0 Status

| Field | Value |
|---|---|
| RFC status | APPROVED (Directive 3); RATIFIED pending security review |
| Blocking | All M2+ plugin tool calls; `$scope` enforcement; `$rate-limit` enforcement |
| Security review | Required before M2 ships (SUMMARY.md §6 HIGH) |
| Implementation milestone | M1 (week 1–2) |

**Dependencies on other specs:**
- Block Structure Spec §11.5 — split-bundle compilation: `__agentBinding` is a server-artifact emission (§3 of this spec)
- Macro Vocabulary Spec §5 — `$scope`, `$rate-limit`, `$action`, `$expose` in `@agent` block; live-binding makes these macros operationally real, not decorative
- Plugin Contract Spec §6.5.3 — middleware contributions: `@aihu/auth` before-handler middleware injects JWT claims into request context consumed by `handleToolCall` dispatch (§5, §6)

**Conflict surface check:** No language conflicts found between this spec and the existing ratified quartet (block-structure, template-attribute-syntax, macro-vocabulary, plugin-contract). The `$scope` and `$rate-limit` macros in Macro Vocabulary Spec §5.4–5.5 are documented as parsed-but-not-enforced; this spec specifies their enforcement mechanism. This is an additive specification of runtime behavior for existing syntax, not a language change.

---

## §1 Motivation

### Current state

`handleToolCall` in `packages/agent-service/src/agent-service.ts` returns `{ stub: true, result: null }` (scout-aihu §1E). The stub is intentional — deferred as Plan 5.3 pending the live-binding design (scout-aihu §4G). The consequence: every `@agent` block in every deployed Aihu app is a dead surface. `$scope` declarations are parsed by the compiler but never checked at runtime. `$rate-limit` declarations are parsed but no counter exists. Agents receive only the `AgentMetadata` compile-time registry — they cannot read live signal values or invoke component actions. The `@aihu/agent` registry maps `tag → AgentMetadata` at compile time; no map of `tag → live component instance` exists anywhere in the runtime.

`AgentContext` in `packages/arbor/src/types.ts:127` is a frozen sentinel `{ _brand: 'AgentContext' }` (arch-3 §3.1). `MountScope.agent` returns it. It carries no live state.

### Why live-binding is the M1 keystone

Arch-3 §0 Non-Negotiable #2 states it directly: "all agent tool plugins are dead weight until live-binding is real." The plugin matrix in arch-3 §1 marks five of seven planned v1.1 plugins as requiring live-binding: `@aihu/search`, `@aihu/auth`, `@aihu/agent-acp-ext`, `@aihu/magna`, and `@aihu/commerce`. Every meaningful agent interaction — scope-gated reads, rate-limited tool calls, cart mutations, ACP skill dispatch — routes through `handleToolCall`. Until live-binding is real, the agent surface advertised by MCP Server Card, A2A, and ACP is a facade.

SUMMARY.md §1 strategic outcome #4: "Every `@agent` block in every deployed Aihu app becomes a live, secure, rate-limited tool callable by MCP-compatible AI agents." This outcome is impossible without the protocol specified here. Arch-3 closing note: "Live-binding (§3) is the M1 keystone. No M2 plugin ships before live-binding RFC ratifies + `handleToolCall` is real."

---

## §2 The Protocol

*All four steps source from arch-3 §3.2.*

### §2.1 Instance registry

A module-level registry is added to `@aihu/arbor` (`packages/arbor/src/mount.ts`):

```typescript
const componentInstanceRegistry: Map<string, LiveBinding[]> = new Map()
```

The key is the component `tag` string (matching `AgentMetadata.tag` from `@aihu/agent`). The value is an ordered list of `LiveBinding` objects — one per mounted component instance that has an `@agent` block. M2 uses `bindings[0]`; M3 introduces an `instanceId` parameter mapping to `rootId` (arch-3 §3.2, arch-3 R5).

### §2.2 The `LiveBinding` interface

*Verbatim from arch-3 §3.2:*

```typescript
interface LiveBinding {
  rootId: number
  tag: string
  getSignal(name: string): unknown
  setSignal(name: string, value: unknown): void
  callAction(name: string, args: unknown[]): Promise<unknown>
  scope(): string | null
  rateLimit(): string | null
  dispose$: () => boolean
}
```

Field semantics:
- `rootId` — unique numeric ID for this mounted component instance; matches arbor's internal `MountScope.rootId`
- `tag` — the component tag string; duplicates the registry key for self-contained identification
- `getSignal(name)` — returns the current value of a signal declared in `@state` and exposed via `$expose` in `@agent`
- `setSignal(name, value)` — writes a signal exposed via `$expose.write` in `@agent`; goes through the same batched-reactive path as user-driven writes
- `callAction(name, args)` — invokes an action exposed via `$action` in `@agent`; returns a Promise resolving to the action's return value
- `scope()` — returns the scope string from the `$scope` declaration (e.g. `'authenticated'`), or `null` if no `$scope` is declared
- `rateLimit()` — returns the rate-limit string from the `$rate-limit` declaration (e.g. `'100/min'`), or `null` if no `$rate-limit` is declared
- `dispose$` — called by arbor's unmount path; removes this binding from the registry; returns `true` if found and removed, `false` if already disposed (idempotent)

### §2.3 Lifecycle: mount registers, unmount disposes

When `mount()` in `packages/arbor/src/mount.ts` materializes a component that exports `__agentBinding` on its server artifact (arch-3 §3.2 Step 2), it:

1. Constructs a `LiveBinding` object wiring the component's reactive closure to the interface
2. Appends the binding to `componentInstanceRegistry.get(tag) ?? []`
3. Registers cleanup via `onCleanup` that calls `dispose$()` on unmount

The dispose pattern (arch-3 §3.2 Step 3):

```typescript
function registerLiveBinding(binding: LiveBinding): void {
  const existing = componentInstanceRegistry.get(binding.tag) ?? []
  componentInstanceRegistry.set(binding.tag, [...existing, binding])
  onCleanup(() => {
    binding.dispose$()
    const current = componentInstanceRegistry.get(binding.tag) ?? []
    const updated = current.filter(b => b.rootId !== binding.rootId)
    if (updated.length === 0) {
      componentInstanceRegistry.delete(binding.tag)
    } else {
      componentInstanceRegistry.set(binding.tag, updated)
    }
  })
}
```

After unmount, no stale binding remains in the registry. Stale-binding prevention is a primary mitigation for the `componentInstanceRegistry` security surface (arch-3 R3, SUMMARY.md §6).

---

## §3 Compiler Emission

*Source: arch-3 §3.2 Step 2.*

The `@agent` block compiler pass emits a named export `__agentBinding` into the **server artifact only** (Block Structure Spec §11.5 split-bundle compilation). The shape, illustrated with the canonical `weather-card` example (arch-3 §3.2):

```typescript
export const __agentBinding = {
  tag: 'weather-card',
  actions: { fetchForecast: (args) => fetchForecast() },
  reads: { location: () => location, forecast: () => forecast },
  writes: { location: (v) => { location = v } },
  scope: 'authenticated',
  rateLimit: '100/min',
}
```

Field derivation rules:
- `tag` — the component's registered tag name (from `registerAgentMetadata` or derived from filename)
- `actions` — one entry per `$action name` declaration in the `@agent` block (Macro Vocabulary Spec §5.3); each function captures the component's reactive closure
- `reads` — one entry per `$expose name` declaration in the `@agent` block (Macro Vocabulary Spec §5.1); read-only getter
- `writes` — one entry per `$expose.write name` declaration (Macro Vocabulary Spec §5.2); write function assigns directly into the signal, triggering normal reactive propagation
- `scope` — the string argument from `$scope` (Macro Vocabulary Spec §5.4), or `undefined` if absent
- `rateLimit` — the string argument from `$rate-limit` (Macro Vocabulary Spec §5.5), or `undefined` if absent

`__agentBinding` is elided from the client artifact (arch-3 §3.2). Client bundles have no reference to signal closures or the instance registry. This is load-bearing for the security model (§6): only the server-side component materialization path can populate the registry.

---

## §4 `AgentContext` Evolution

### §4.1 Current sentinel

`packages/arbor/src/types.ts:127` currently holds a frozen sentinel object (arch-3 §3.1). `MountScope.agent` returns it. It carries no live state and was an intentional placeholder pending this design (scout-aihu §4G).

### §4.2 Evolved interface

*Source: arch-3 §3.3.*

```typescript
// v1.1 — packages/arbor/src/types.ts:127
export interface AgentContext {
  readonly _brand: 'AgentContext'
  readonly rootId: number
  readonly tag: string
  readonly readSignal: (name: string) => unknown
  readonly writeSignal: (name: string, value: unknown) => void
  readonly callAction: (name: string, args: unknown[]) => Promise<unknown>
}
```

The `_brand` field is preserved for type-narrowing compatibility. The five new fields directly mirror `LiveBinding`'s corresponding members, populated from the binding constructed at mount time. `readSignal` maps to `LiveBinding.getSignal`; `writeSignal` to `setSignal`; `callAction` to `callAction`.

### §4.3 Backward compatibility guarantee

*Source: arch-3 §3.3 — "Backward compatible — callers check `'rootId' in agent`."*

Code that previously accessed only `agent._brand` continues to work. The canonical guard for v1.1 code:

```typescript
if ('rootId' in agent) {
  // v1.1+ live AgentContext — agent.readSignal(...) is safe
} else {
  // v1.0 sentinel — no @agent block or not yet client-hydrated
}
```

All internal `@aihu/*` packages that interact with `AgentContext` MUST use this guard. Plugin authors and app code SHOULD use it. The guard is the backward compatibility contract.

---

## §5 `handleToolCall` Dispatch Algorithm

*Source: arch-3 §3.2 Step 4 — pseudocode reproduced as the canonical spec.*

```typescript
// packages/agent-service/src/agent-service.ts
async handleToolCall(
  toolName: string,
  params: Record<string, unknown>,
  requestContext: RequestContext,
): Promise<ToolCallResult> {
  // 1. Parse tool name into tag + action
  const [tag, action] = toolName.split('/')
  if (!tag || !action) {
    return { error: `malformed tool name: ${toolName}`, code: 400 }
  }

  // 2. Resolve live instance (arch-3 §3.2)
  const bindings = componentInstanceRegistry.get(tag) ?? []
  if (bindings.length === 0) {
    return { error: `no live instance: ${tag}`, code: 404 }
  }
  const binding = bindings[0]  // M2: first instance; M3 adds instanceId param

  // 3. Scope check — requires @aihu/auth before-handler to have populated requestContext
  const requiredScope = binding.scope()
  if (requiredScope !== null) {
    if (!checkScope(requiredScope, requestContext)) {
      return { error: 'unauthorized', code: 403 }
    }
  }

  // 4. Rate-limit check — sliding-window, key: {userId}:{tag} (arch-3 §3.4)
  const rateSpec = binding.rateLimit()
  if (rateSpec !== null) {
    const key = `${requestContext.userId}:${tag}`
    if (!checkRateLimit(rateSpec, requestContext, key)) {
      return { error: 'rate_limited', code: 429 }
    }
  }

  // 5. Action dispatch — actions table is the allowlist (arch-3 §3.2)
  if (action in binding.actions) {
    return { result: await binding.callAction(action, [params]) }
  }

  // 6. Signal read — __read pseudo-action for $expose reads
  if (action === '__read') {
    const signalName = params.name as string
    const value = binding.getSignal(signalName)
    return { result: value }
  }

  // 7. No match
  return { error: `no action: ${action}`, code: 404 }
}
```

**Critical invariants:**
- Steps 3 and 4 execute before any action dispatch. No path from a valid tool name reaches action execution without passing scope and rate-limit checks.
- The `actions` table (from `__agentBinding.actions`) is the sole allowlist. Agents cannot invoke actions not declared in `$action`.
- `checkScope` and `checkRateLimit` are injected as constructor dependencies of `AgentService`, maintaining the dep-free thesis within `@aihu/agent-service` itself.
- The actual implementation MUST wrap responses in the MCP protocol JSON-RPC 2.0 envelope for consistency with the existing `mcp-server-card-schema` compliance suite (scout-aihu §3C). The simplified shape above is for specification readability only.

---

## §6 Security Model

*Source: arch-3 §3.4.*

### §6.1 Per-call authentication

Every `handleToolCall` invocation requires a valid JWT in request context. `@aihu/auth`'s `before-handler` middleware (Plugin Contract Spec §6.5.3) runs before any route handler and injects `JwtClaims` into `requestContext`. Absent, expired, or invalid JWT: middleware returns 401 before `handleToolCall` is reached.

### §6.2 Scope enforcement

`binding.scope()` returns the string argument of `$scope` declared in the `@agent` block (Macro Vocabulary Spec §5.4). `checkScope` evaluates this against `requestContext.claims` using `@aihu/auth`'s scope definitions registered in `aihu.config.ts`. `$scope authenticated` becomes operationally enforced — not decorative syntax. Prior to this spec, `$scope` was parsed but never evaluated at runtime.

### §6.3 Rate-limit enforcement

`binding.rateLimit()` returns the rate string from `$rate-limit` (Macro Vocabulary Spec §5.5). `checkRateLimit` uses a sliding-window counter keyed on `{userId}:{tag}` (arch-3 §3.4). The counter implementation is sourced from `@aihu/scraping`'s in-process rate limiter. The tighter of the component-level `$rate-limit` and any scope-level default wins. Prior to this spec, `$rate-limit` was parsed but no counter existed.

### §6.4 Instance isolation

M2 dispatches to `bindings[0]` — the first mounted instance of the tagged component. This is appropriate because agent-interactive components are typically page-level singletons (arch-3 R5: "M2 uses first live instance. Most agent components are page-level singletons"). M3 introduces an optional `instanceId` parameter mapping to `LiveBinding.rootId` for multi-instance dispatch. The M3 design requires a separate RFC (§8.1).

### §6.5 Action sanitization

The `__agentBinding.actions` object is the allowlist, constructed by the compiler from `$action` declarations in the `@agent` block (arch-3 §3.2). No runtime mechanism exists for external callers to inject entries into the actions table. An agent invoking `weather-card/internalMethod` where `internalMethod` is not in `$action` declarations receives `{ error: 'no action: internalMethod', code: 404 }`.

### §6.6 Registry write access

`componentInstanceRegistry` is module-private in `packages/arbor/src/mount.ts`. Only the `mount()` path — executing compiled component server artifacts — can call `registerLiveBinding`. External callers, plugins, and request handlers cannot push entries into the registry directly. This is a primary mitigation for arch-3 R3 and SUMMARY.md §6 HIGH risk: "Only `mount()` registers; external callers cannot."

---

## §7 SSR Consideration

*Source: arch-3 §3.5.*

A server-rendered `LiveBinding` is **ephemeral** — it lives only for the duration of the SSR request that materializes the component. Once the response is sent and the component's reactive closure is garbage-collected, `onCleanup` disposes the binding. No `LiveBinding` persists across SSR requests.

**Consequences for agent interactions:**

1. **Stateless reads during SSR:** An agent that calls `handleToolCall` while a component is SSR'd on the same server process will find a binding. Stateless reads (e.g. reading a page's current `location` signal) work correctly. The binding lifetime is bounded by the SSR request duration.

2. **Persistent stateful interactions require client hydration:** Any agent interaction that reads or mutates live component state across multiple turns — shopping cart management, multi-step form state, real-time collaborative state — requires a client-hydrated component. A client-mounted `LiveBinding` is long-lived for the page session.

3. **M3 headless mount pattern:** Arch-3 §3.5 notes that M3 will specify a dedicated server-side headless mount endpoint for long-lived server-side agent sessions without a browser. The design of this pattern is an open question (§8.2). This spec does not specify it.

---

## §8 Open Questions

### §8.1 Multi-instance dispatch UX (M3 design needed)

M2 dispatches to `bindings[0]`. The `instanceId` parameter planned for M3 (arch-3 R5) maps to `LiveBinding.rootId`, but how an agent caller discovers valid `rootId` values is unspecified. Candidate approaches: a `__list` pseudo-action returning mounted instance IDs; per-instance MCP `resources/list` entries; `AgentManifest` extension. A separate M3 RFC is required before implementation.

### §8.2 SSR headless mount pattern (M3 spec)

The mechanism for mounting a component server-side outside an SSR request — to maintain a long-lived binding for a server-side agent session — is not yet designed. Arch-3 §3.5 defers this to M3. A separate spec is required before M3 implementation.

### §8.3 Error response format consistency with JSON-RPC

The dispatch pseudocode in §5 uses `{ error, code }` for readability. The actual implementation must emit MCP protocol JSON-RPC 2.0 error objects for consistency with the `mcp-server-card-schema` compliance suite (scout-aihu §3C). The mapping from internal error codes to JSON-RPC error codes should be specified before implementation to prevent per-engineer interpretation divergence.

---

## §9 Acceptance Criteria

Before this RFC moves from APPROVED to RATIFIED, the following gates must clear.

**Security review gate (mandatory — SUMMARY.md §6 HIGH):**

The security review must verify:
- (a) `componentInstanceRegistry` write access is restricted to the `mount()` path; no external injection path exists
- (b) No execution path from tool name to action dispatch bypasses scope check and rate-limit check
- (c) Stale-binding prevention via `dispose$` and `onCleanup` is correct under concurrent mount/unmount
- (d) `__agentBinding` is absent from client bundles in all build configurations (universal, client-only, server-only)

**Integration test gates (all must be green before M2 ships — arch-3 §5 M1):**

| # | Test scenario | Expected outcome |
|---|---|---|
| (a) | `handleToolCall('weather-card/fetchForecast', {}, ctx)` with valid JWT; `weather-card` mounted | Returns real signal value from live component |
| (b) | Same call; no JWT or expired JWT | Returns 401 |
| (c) | Same call; rate limit for `{userId}:weather-card` exceeded | Returns 429 |
| (d) | Same call; no `weather-card` instance mounted | Returns `{ error: 'no live instance: weather-card', code: 404 }` |
| (e) | `handleToolCall('weather-card/notAnAction', {}, ctx)` with valid JWT; component mounted | Returns `{ error: 'no action: notAnAction', code: 404 }` |
| (f) | `weather-card` has `$scope 'admin'`; JWT carries `'user'` claims | Returns 403 |

**Compiler gate:**

A compiler test fixture for a component with:
```
@agent {
  $action fetchForecast
  $expose location, forecast
  $expose.write location
  $scope authenticated
  $rate-limit "100/min"
}
```
Must emit `__agentBinding` with the exact shape from §3 in the server artifact, and must emit no `__agentBinding` reference in the client artifact.

---

## §10 Implementation Map

*Source: arch-3 Appendix: File Map — cited exactly.*

### Create

- `packages/auth/` — `@aihu/auth` plugin: JWT middleware, `checkScope`, `requireAuth`, `requireScope`, scope definitions, `<$guard>` wiring
- `packages/scraping/` — `@aihu/scraping` plugin: sliding-window rate limiter, `checkRateLimit`, bot detection middleware
- `packages/seo/`, `packages/magna/`, `packages/search/`, `packages/commerce/`, `packages/agent-acp-ext/` — gated on live-binding ratification per arch-3 §3 closing note

### Modify

**`packages/agent-service/src/types.ts`** — Add `LiveBinding` interface (§2.2) and `InstanceRegistry` type alias:
```typescript
export type InstanceRegistry = Map<string, LiveBinding[]>
```

**`packages/arbor/src/mount.ts`** — Add module-level `componentInstanceRegistry: InstanceRegistry`; implement `registerLiveBinding(binding)` with `onCleanup` disposer pattern (§2.3); detect `__agentBinding` on component server artifact at mount time; populate `MountScope.agent` with live `AgentContext` when `__agentBinding` present (arch-3 §3.2).

**`packages/arbor/src/types.ts` (line 127)** — Evolve `AgentContext` from frozen sentinel to the full interface specified in §4.2 (arch-3 §3.3). `_brand` field preserved.

**`packages/agent-service/src/agent-service.ts`** — Replace `handleToolCall` stub with the dispatch algorithm from §5. Inject `checkScope` and `checkRateLimit` as constructor dependencies (arch-3 §3.2, §3.4).

**`@aihu/compiler` `@agent` block codegen** — Emit `__agentBinding` export into server artifact; elide from client artifact. The emission runs as the `@agent` block compiler pass (arch-3 §3.2 Step 2, Block Structure Spec §11.5).

**`docs/superpowers/specs/2026-05-02-spec-macro-vocabulary.md`** — After ratification, append note to §5 (`@agent` block macros §5.4, §5.5) that `$scope` and `$rate-limit` are operationally enforced per this spec. Macro syntax and lowering unchanged.

### Reference (read-only, arch-3 Appendix)

- `crates/magna-build/src/extension.rs` — Tier-1 SchemaExtension (consumed by `@aihu/magna` bridge)
- `crates/magna-serv/src/{jwt,rls}.rs` — auth integration pattern reference
- `crates/magna-remote/src/lib.rs` — Tier-3 webhook pattern
- `crates/magna-gqlmin/src/napi.rs` — build-time JS bridge
- `crates/magna-subscriptions/src/publisher.rs` — NOTIFY wire format

---

## §11 Sign-off

Spec is binding once RATIFIED. Changes prior to ratification are tracked as amendments to the draft. Changes post-ratification require an amendment with spec version bump, following the pattern established in the existing spec quartet.

**Spec version:** 0.1.0-draft
**APPROVED:** 2026-05-05 (Directive 3, `docs/roadmap/_user-directives.md`)
**RATIFIED:** pending security review (SUMMARY.md §6 HIGH)
**Security reviewer:** TBD
**Approved by:** User (Directive 3, 2026-05-05)

---

*Live-binding (§3) is the M1 keystone. No M2 plugin ships before this RFC ratifies and `handleToolCall` is real. — arch-3-plugins.md closing note*
