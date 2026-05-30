# Spec: $live binding — Implementation Design (v0.3.0)

**Status:** DRAFT — for Builder dispatch
**Date:** 2026-05-07
**Author:** Live-Binding Architect (read-only research; no source files modified)
**Based on:** RFC #56 (`docs/superpowers/specs/2026-05-05-spec-live-binding.md`) + security review (`docs/superpowers/specs/rfc-56-security-review.md`) + 7 amendments applied (§6.7–§6.11)
**Ratification PR:** #128

---

## RFC summary

`$live` binding (RFC #56) is the mechanism that makes `@agent` blocks in `.aihu` SFCs operationally real rather than decorative. It establishes a module-level `componentInstanceRegistry` (a `Map<string, LiveBinding[]>` in `packages/arbor/src/mount.ts`) that maps component tag names to their mounted instances. When a component with an `@agent` block is mounted, the compiler-emitted `__agentBinding` export is detected at mount time, a `LiveBinding` object is constructed wiring the component's reactive closure into the registry, and the `handleToolCall` dispatcher in `@aihu/agent-service` gains the ability to read signals, write signals, and invoke actions on live component instances. Until this lands, `handleToolCall` returns `{ stub: true, result: null }` and every `@agent` block in every deployed aihu app is a dead surface.

The RFC was approved per Directive 3 (2026-05-05) and ratified after a security review that produced 7 amendments. The amendments address: cross-frame access (§6.7), fail-closed behavior when `@aihu/auth` is absent (§6.1 strengthened), `userId` cardinality for rate-limit keys (§6.3 strengthened), timing-channel invariants (§6.8), registry capacity bounds (§6.9), CSP compatibility (§6.10), and supply-chain / template trust (§6.11). All 7 amendments are incorporated into the ratified spec and are binding on this implementation. The `$scope` and `$rate-limit` macros in `@agent` blocks — parsed but previously unenforced — become operationally enforced through this implementation. Live-binding is the M1 keystone; no M2 plugin (`@aihu/auth`, `@aihu/search`, `@aihu/magna`, `@aihu/commerce`, etc.) ships before this lands.

---

## Architecture layers

### Layer 1 — Compiler changes

**What the parser must handle:**

The `@agent` block parser (`packages/compiler/src/parser/agent_macros.rs`) already handles `$scope` and `$rate-limit` per the v2 form. The v1 per-name macros (`$expose`, `$expose.write`, `$action`, `$describe`) were removed and moved to `@state` collection entries (`expose:` / `describe:` metadata keys). This parser requires no new syntax for live-binding.

The `@state` parser (`packages/compiler/src/parser/state_macros.rs`) already handles the `$action:`, `$computed:`, and `$prop:` collection forms. The `expose: { read: true, write: true }` metadata key in `$prop` and `$computed` entries, and the `expose: { read: true, write: true }` in `$action` entries, are already parsed. No parser changes are needed for `$live` wiring — the signals are exposed through the existing metadata bag.

**What the codegen must emit:**

The codegen (`packages/compiler/src/codegen/emit.rs`) currently detects an `@agent` block and calls `emit_options_form(unit, tag_name, agent)` for server builds, eliding the `@agent` block for client builds (`elide_agent = target == BuildTarget::Client && unit.source.agent.is_some()`). This split-bundle logic is already in place.

What is missing is the `__agentBinding` named export. The `@agent` block codegen pass must emit this export into the **server artifact only**. The shape (from RFC §3):

```typescript
export const __agentBinding = {
  tag: 'weather-card',
  actions: { fetchForecast: (args) => fetchForecast() },
  reads:   { location: () => location, forecast: () => forecast },
  writes:  { location: (v) => { location = v } },
  scope:   'authenticated',    // undefined when $scope absent
  rateLimit: '100/min',        // undefined when $rate-limit absent
}
```

Field derivation rules:
- `tag` — the component's registered tag name (from `tag_name` parameter in `emit()`).
- `actions` — one entry per `$action` collection entry that carries `expose: { read: true }` or `expose: { read: true, write: true }` in its metadata bag. The function captures the compiled action's closure.
- `reads` — one entry per `$prop` or `$computed` entry with `expose: { read: true }` (or `{ read: true, write: true }`). Getter closes over the signal.
- `writes` — one entry per `$prop` entry with `expose: { ... write: true ... }` (writable signal assignment). Also `$action` entries with write: true are action-dispatched, not direct signal assignment.
- `scope` — from `AgentMacroDecl::Scope` in the parsed `@agent` block; `undefined` if absent.
- `rateLimit` — from `AgentMacroDecl::RateLimit` in the parsed `@agent` block; formatted as `'{n}/min'` string; `undefined` if absent.

The `__agentBinding` export is appended after the normal component setup code in the server artifact. It MUST NOT appear in client artifacts (the existing `elide_agent` gate covers this).

**Files that change:**

- `packages/compiler/src/codegen/emit.rs` — add `emit_agent_binding(unit, tag_name, agent)` function that emits the `__agentBinding` export; call it from `emit_options_form` (server path only). Also add a `__agentBinding`-absent assertion to the client artifact fixture test.
- `packages/compiler/src/parser/agent_macros.rs` — no new syntax; verify that `$rate-limit` emits the rate string in the form expected by `handleToolCall` (currently parsed as `u32`; RFC §6.3 uses `'100/min'` string — confirm the string formatting in codegen).
- `packages/compiler/src/types.rs` — add any new fields to `AgentBlock` or `AgentMacroDecl` if needed to carry the derived reads/writes/actions tables into codegen.

**Estimated LOC:**
- `emit.rs`: ~80–120 lines (new `emit_agent_binding` function + fixture test extension).
- `types.rs`: ~10–20 lines if new fields are needed.
- Total: ~100–140 lines of Rust.

---

### Layer 2 — Runtime changes

**New primitives needed:**

In `packages/arbor/src/mount.ts`, the following additions are required:

1. **`LiveBinding` interface** — add to `packages/agent-service/src/types.ts` as specified in RFC §2.2:

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

2. **`componentInstanceRegistry`** — module-level map in `packages/arbor/src/mount.ts`:

```typescript
const componentInstanceRegistry: Map<string, LiveBinding[]> = new Map()
```

This is module-private. No export.

3. **`registerLiveBinding(binding: LiveBinding): void`** — the mount-time registration function with `onCleanup`-driven disposal (RFC §2.3). Called from `mount()` when it detects `__agentBinding` on the component's server artifact.

4. **Registry capacity enforcement** — per Amendment 5 (§6.9), the array per tag MUST NOT exceed 1000 entries (default, configurable via `agent.registry.maxBindingsPerTag`). Excess attempts produce a WARN log and return without registering.

5. **`AgentContext` evolution** — `packages/arbor/src/types.ts` line 127 currently holds a frozen sentinel `{ _brand: 'AgentContext' }`. The interface must be evolved to RFC §4.2:

```typescript
export interface AgentContext {
  readonly _brand: 'AgentContext'
  readonly rootId: number
  readonly tag: string
  readonly readSignal: (name: string) => unknown
  readonly writeSignal: (name: string, value: unknown) => void
  readonly callAction: (name: string, args: unknown[]) => Promise<unknown>
}
```

The `_brand` field is preserved for backward compatibility. Callers check `'rootId' in agent` to detect live vs. sentinel context.

**How `$live` signals differ from regular signals:**

Regular signals (from `@aihu/signals`) are per-instance: each component mount creates its own reactive graph. `$live` binding does not introduce a new signal type — it is an aggregation layer that makes a component's existing signals reachable from outside the component, via the `componentInstanceRegistry`. The signals themselves are ordinary `signal()` and `computed()` calls from `@aihu/signals`; `LiveBinding.getSignal(name)` calls the getter function captured in `__agentBinding.reads[name]`. This is a cross-instance registry, not a cross-instance signal (the distinction matters: two instances of `weather-card` each have their own `location` signal; the registry exposes the first instance's `location` via `bindings[0]`).

**The security boundary:**

`componentInstanceRegistry` is module-private in `packages/arbor/src/mount.ts`. Only the `mount()` call path can call `registerLiveBinding`. Amendment 7 (§6.7) adds an origin check: when `window.parent !== window` and the origins differ (cross-origin iframe context), `mount()` MUST skip `LiveBinding` registration and emit a WARN log.

**Size impact estimate:**

The `registerLiveBinding` function, the Map, and the capacity enforcement logic add approximately 300–500 bytes minified to `@aihu/arbor`. The lazy-attach pattern applies: `registerLiveBinding` is only called when `__agentBinding` is present on the component artifact. Components without an `@agent` block never touch the registry. The `AgentContext` sentinel (`_frozenAgent`) is already present in `mount.ts`; evolving it adds ~50 bytes. Total arbor size impact: ~350–550 bytes minified, well under any tier-gate for a server-side primitive.

---

### Layer 3 — `<$guard>` enforcement

**`<$guard>` as a compiler-emitted boundary element:**

`<$guard>` is a structural element in the template that enforces `$scope` constraints at the UI layer — it wraps content that should only render when a user has a given scope claim. It is distinct from the server-side `checkScope` in `handleToolCall` (which guards MCP tool calls); `<$guard>` guards DOM rendering.

**How it enforces `$scope` constraints:**

At compile time, the template parser recognizes `<$guard scope="authenticated">...</$guard>`. The codegen emits a `when()` structural node that conditionally renders children based on a reactive signal wired to the current session's scope claims. The scope claims signal is populated by `@aihu/auth`'s client-side session provider.

At runtime, `<$guard>` is not a registered custom element — it is a compile-time-only boundary that lowers to `when(scopeSignal, () => branch(...children...))`. No DOM node with tag `$guard` ever exists in the output.

**Compile-time checks:**

- The parser MUST validate that the `scope` attribute on `<$guard>` is a string literal (no dynamic expressions — scope names are static).
- If `@aihu/auth` is not installed and the compiler encounters `<$guard scope="...">`, it MUST emit a `[SECURITY]`-prefixed warning (per Amendment 7, §6.11).
- The parser registers the `$guard` scope string into the component's `AgentMetadata` so the build-time audit can cross-reference it against `aihu.config.ts` scope definitions.

**Runtime checks:**

The `when()` condition reads from a session scope signal. If the signal is absent (auth plugin not loaded), `<$guard>` renders nothing — fail-closed by default.

**Files that change:**

- `packages/compiler/src/parser/template.rs` — recognize `<$guard>` structural element.
- `packages/compiler/src/codegen/emit.rs` — lower `<$guard>` to `when(scopeSignal, ...)`.
- `packages/auth/src/` (new package) — provides the client-side `scopeSignal` reactive primitive that `<$guard>` consumes.

---

### Layer 4 — `$scope` and `$rate-limit` (v0.3.0 scope boundary)

**v0.3.0 scope:**

The following land in v0.3.0:
- `LiveBinding` + `componentInstanceRegistry` in `@aihu/arbor` (Layer 2)
- `__agentBinding` codegen in compiler (Layer 1)
- `handleToolCall` real implementation in `@aihu/agent-service` (replaces stub)
- `$scope` enforcement: `checkScope` injected into `AgentService`, validated against `aihu.config.ts`
- `$rate-limit` enforcement: `checkRateLimit` injected into `AgentService`, sliding-window counter from `@aihu/scraping` rate limiter
- `AgentContext` evolution (Layer 2)
- Registry capacity bounds (Amendment 5)
- Cross-frame origin check (Amendment 7 / §6.7)
- `<$guard>` compile-time lowering (Layer 3) — partial: lowering to `when()` lands; the full `@aihu/auth` session-scope signal integration may slip to v0.3.1

**v0.4.0 scope (deferred):**

- `$rate-limit` advanced controls: per-scope default rate limits, tighter-wins logic
- `$expose.write` sensitive-signal opt-in (Amendment 7 / §6.11(c)) — build-time review tooling
- M3 multi-instance dispatch: `instanceId` parameter, `__list` pseudo-action, per-instance MCP resources
- M3 headless mount pattern: long-lived server-side binding without a browser session
- TTL-based eviction fallback for long-lived bindings (§6.9(c)) — reserved config key `agent.registry.bindingTtlMs`

**Decision on `$rate-limit` in v0.3.0:**

`$rate-limit` lands in v0.3.0. The sliding-window rate limiter exists in `@aihu/scraping`'s in-process implementation and the interface (`checkRateLimit(rateSpec, requestContext, key)`) is straightforward. Deferring it would leave a parsed-but-unenforced macro in production, which the RFC explicitly prohibits. The `userId` cardinality requirement (Amendment 3 / §6.3) and the timing-channel invariants (Amendment 4 / §6.8) are implementation constraints on `checkRateLimit`, not blockers for landing it in v0.3.0.

---

## Acceptance criteria (for the Builder)

1. **AC1 — `__agentBinding` emission:** Given an SFC with an `@agent` block containing `$scope authenticated` and `$rate-limit 100`, the compiler server artifact contains `export const __agentBinding = { tag: '...', scope: 'authenticated', rateLimit: '100/min', reads: {...}, writes: {...}, actions: {...} }`. The client artifact contains no reference to `__agentBinding` (CI grep check validates this).

2. **AC2 — Registry mount:** When a component with a `__agentBinding` export is mounted via `mount()`, `componentInstanceRegistry.get(tag)` returns an array containing one `LiveBinding` with `rootId`, `tag`, `getSignal`, `setSignal`, `callAction`, `scope`, `rateLimit`, and `dispose$`.

3. **AC3 — Registry dispose:** After the component's `MountScope.dispose()` is called, `componentInstanceRegistry.get(tag)` returns `undefined` (key deleted when array empties) or an array that no longer contains the disposed binding's `rootId`.

4. **AC4 — `handleToolCall` live dispatch:** `handleToolCall('weather-card/fetchForecast', {}, validJwtCtx)` where `weather-card` is mounted returns `{ result: <signal value> }`, not the stub.

5. **AC5 — Scope enforcement (pass):** `handleToolCall` with a JWT carrying the `authenticated` claim against a `$scope authenticated` component returns 200.

6. **AC6 — Scope enforcement (fail):** Same call with a JWT lacking the `authenticated` claim returns 403.

7. **AC7 — Auth-absent fail-closed:** `handleToolCall` on a `$scope authenticated` component when `@aihu/auth` middleware is NOT registered returns HTTP 401 with `{ error: 'AUTH_MISSING' }`.

8. **AC8 — Rate-limit enforcement:** After exhausting the `$rate-limit` quota for `{userId}:{tag}`, the next call returns 429.

9. **AC9 — `userId` cardinality:** A request with a valid JWT that lacks a `sub` claim returns 401, not 429 and not 200.

10. **AC10 — No live instance:** `handleToolCall('weather-card/fetchForecast', {}, ctx)` when `weather-card` is NOT mounted returns `{ error: 'no live instance: weather-card', code: 404 }`.

11. **AC11 — Action allowlist:** `handleToolCall('weather-card/internalMethod', {}, ctx)` where `internalMethod` is not declared in `$action` returns `{ error: 'no action: internalMethod', code: 404 }`.

12. **AC12 — Capacity cap:** Mounting 1001 instances of the same tag with `__agentBinding` produces a WARN log on the 1001st mount; `handleToolCall` continues to succeed using `bindings[0]` (no eviction).

13. **AC13 — Cross-origin iframe skip:** When `mount()` is called from a cross-origin iframe context (simulated via `window.parent !== window` + different origin), `componentInstanceRegistry` does NOT gain an entry for that component, and a WARN log is emitted.

14. **AC14 — Dispatch ordering invariant:** The error-code ordering 404 → 403 → 429 is verified by a unit test that confirms a rate-limited 429 is NEVER returned before the scope check passes (test: call with exhausted rate limit but invalid scope → must return 403, not 429).

15. **AC15 — Backward compatibility:** Components without an `@agent` block produce an unmodified `MountScope`; `scope.agent._brand === 'AgentContext'` is still true; `'rootId' in scope.agent` is false for sentinel contexts.

---

## Implementation sequence

The layers have these dependencies:

```
Compiler (Layer 1) → Runtime (Layer 2) → handleToolCall (agent-service) → $guard (Layer 3)
```

**Recommended sequence:**

1. **Runtime types first** (1–2 days): Define `LiveBinding` interface in `packages/agent-service/src/types.ts`. Evolve `AgentContext` in `packages/arbor/src/types.ts`. This unblocks parallel work on compiler and runtime.

2. **Compiler `__agentBinding` emission** (2–3 days): Implement `emit_agent_binding()` in `emit.rs`. Add compiler fixture tests (AC1). The compiler work is self-contained and can proceed in parallel with runtime wiring.

3. **Runtime registry + `mount()` wiring** (2–3 days): Implement `componentInstanceRegistry`, `registerLiveBinding`, capacity enforcement, cross-frame origin check, and `AgentContext` live population in `packages/arbor/src/mount.ts`. Test AC2, AC3, AC12, AC13, AC15.

4. **`handleToolCall` real dispatch** (2–3 days): Replace the stub in `packages/agent-service/src/agent-service.ts` with the RFC §5 dispatch algorithm. Wire `checkScope` and `checkRateLimit` as constructor dependencies. Test AC4–AC11, AC14.

5. **`<$guard>` compiler lowering** (1–2 days): Add `<$guard>` recognition in the template parser and `when()` lowering in codegen. This depends on Layer 1 being complete.

6. **Integration tests + CI grep check** (1 day): Add the `grep '__agentBinding'` CI step over assembled client bundles. Run all ACs end-to-end.

**Can Layer 1 and Layer 2 be parallelized?**

Yes. Once the `LiveBinding` interface is defined (step 1), the compiler work (step 2) and the runtime wiring (step 3) can proceed in parallel on separate worktrees. The compiler produces the artifact shape; the runtime consumes it. The interface contract is the `__agentBinding` export shape from RFC §3 — fix that shape first and both tracks work independently.

---

## Size budget

Per `.size-limit.json` conventions: `@aihu/arbor` is a browser-eligible package with an existing per-package row. `@aihu/agent-service` is server-side only and MUST NOT add a size-limit row.

**Expected gzipped additions:**

| Package | Addition | Rationale |
|---|---|---|
| `@aihu/arbor` | ~400–600 bytes gz | `componentInstanceRegistry` Map, `registerLiveBinding`, capacity check, cross-frame origin check. Lazy-attach: only called when `__agentBinding` detected. |
| `@aihu/agent-service` | N/A (server-only) | `handleToolCall` implementation; not browser-bundled; no size row. |
| `@aihu/signals` | 0 bytes | No new signal primitives; `$live` uses existing `signal()` / `computed()`. |
| `@aihu/runtime` | 0 bytes | No runtime changes needed; `defineComponent` wiring is through `@aihu/arbor`. |

The lazy-attach pattern from `$aria` applies directly: `registerLiveBinding` is invoked only when the compiled server artifact exposes `__agentBinding`. Components without `@agent` blocks incur zero additional runtime cost. The Map itself (`componentInstanceRegistry`) exists at module level but is a single allocation.

**Size gate action:** Add a note to the `@aihu/arbor` row in `.size-limit.json` documenting the expected +400–600 bytes from this feature. Do NOT add a size row for `@aihu/agent-service`.

---

## Security invariants (from the 7 amendments)

### Amendment 1 — §6.7 Cross-Frame Trust (CWE-346)

`mount()` MUST check `window.parent !== window` and compare origins before registering a `LiveBinding`. Cross-origin iframe context → skip registration + WARN log. Same-origin iframe → permitted (shares module graph by design; document this explicitly). `sandbox="allow-scripts allow-same-origin"` MUST NOT be combined on aihu-hosted content iframes; CI/CD tooling SHOULD flag this combination.

**Implementation requirement:** Origin check in `registerLiveBinding` (or at the call site in `mount()`) gated on `typeof window !== 'undefined'` for SSR safety.

### Amendment 2 — §6.1 Fail-Closed When `@aihu/auth` is Absent (CWE-306)

If `@aihu/auth` middleware is not registered and `handleToolCall` targets a component with a non-null `$scope`, the call MUST return HTTP 401 with `{ error: 'AUTH_MISSING' }`. This is the fail-closed default.

**Implementation requirement:** `AgentService` constructor accepts an optional `authPlugin` dependency. When absent, the `checkScope` function is replaced with a sentinel that returns 401 for any non-null scope. AC7 validates this.

**v1 transport posture (G6f):** `asMiddleware` is auth-wired in v1 via the injected `resolveAuth` resolver — the host supplies `getAuthState` (`@aihu/auth/server`) to build the per-request `RequestContext` (userId + raw jwt), and the middleware propagates the JSON-RPC envelope's HTTP code (no double-wrap). When `resolveAuth` is absent, `asMiddleware` passes no context, so scoped tools fail closed (401), preserving Amendment 2. The `@aihu/agent-a2a` and `@aihu/agent-acp` adapters remain **anonymous-only for v1** (no `RequestContext` forwarded → scoped tools 401); auth wiring for those adapters is deferred to M3.

### Amendment 3 — §6.3 `userId` Cardinality (CWE-285)

`requestContext.userId` MUST be a non-null, non-empty string from verified JWT claims. If `userId` is absent, undetermined, or empty, `handleToolCall` MUST return 401. The rate-limit key MUST NOT fall through to a shared anonymous bucket.

**Implementation requirement:** Validate `requestContext.userId` before constructing the rate-limit key `{userId}:{tag}`. AC9 validates this.

### Amendment 4 — §6.8 Timing Properties (CWE-200)

`checkRateLimit` MUST operate in O(1) constant time regardless of key history. The error-code ordering 404 → 403 → 429 is a **security-relevant invariant** and MUST NOT be reordered. A 429 before scope check would implicitly confirm binding existence to unauthorized callers.

**Implementation requirement:** Sliding-window store initializes new keys atomically on first access (no existence-check round-trip). Dispatch ordering is locked by code structure (not by comment). AC14 validates the ordering invariant.

### Amendment 5 — §6.9 Registry Capacity Bounds (CWE-400)

The `LiveBinding[]` array for any tag MUST NOT exceed 1000 entries (default; configurable via `agent.registry.maxBindingsPerTag`). Exceeding the cap → WARN log. New binding rejected; existing bindings unchanged. Reserve config key `agent.registry.bindingTtlMs` for future TTL eviction (unactivated in v0.3.0).

**Implementation requirement:** Capacity check in `registerLiveBinding` before appending. AC12 validates this.

### Amendment 6 — §6.10 CSP Compatibility (CWE-693)

The binding mechanism is compatible with `Content-Security-Policy: script-src 'self'`. No `unsafe-eval`, `unsafe-inline`, or blob: URL evaluation at any point. `__agentBinding` elision from client bundles is a **compiler guarantee, not a runtime defense**.

**Implementation requirement:** CI/CD pipeline MUST include a `grep '__agentBinding'` step over assembled client bundles (AC1 covers compiler fixture; this covers production build). Document CSP compatibility in `docs/site/` and `llms.txt`.

### Amendment 7 — §6.11 Supply-Chain / Template Trust (CWE-345, CWE-440)

`$scope` declarations are a security control. If `@aihu/auth` is not installed and the compiler encounters an `@agent` block with `$scope`, the compiler MUST emit a `[SECURITY]`-prefixed warning including the filename and unvalidated scope string. Third-party templates SHOULD be audited for `@agent` blocks before production deployment. This guidance MUST appear in `SECURITY.md`.

**Implementation requirement:** Compiler warning in `emit_options_form` when `agent.scope` is non-null and `@aihu/auth` is absent from the dependency graph (detected via the compiler's plugin registry or a build-time presence check). Update `SECURITY.md`.

---

## Open questions

1. **`$rate-limit` string format:** The `@agent` block parser (`agent_macros.rs`) currently parses `$rate-limit` as a `u32` (raw number). The RFC §6.3 uses the string `'100/min'` in `__agentBinding.rateLimit`. Which format is canonical — the numeric value emitted as `'N/min'` by codegen, or a full string literal in the SFC source (e.g. `$rate-limit "100/min"`)? **Needs Director input** before the parser and codegen are finalized. Recommendation: keep `u32` in the parser (simpler, validated at parse time) and format as `'{n}/min'` in codegen.

2. **`@aihu/auth` absence detection in compiler:** How does the compiler know whether `@aihu/auth` is installed in the project? Options: (a) check for `@aihu/auth` in `package.json` dependencies during the build pass; (b) require the build tool (Vite/Bun plugin) to pass an `authInstalled` flag to the compiler; (c) always emit the `[SECURITY]` warning and let the user silence it via config. **Needs Director input** on the preferred detection mechanism.

3. **`<$guard>` session scope signal source:** The `<$guard>` lowering emits `when(scopeSignal, ...)`. Where does `scopeSignal` come from in the browser? Options: (a) `@aihu/auth` provides a module-level reactive signal populated by the session provider; (b) `<$guard>` accepts a `signal` attribute referencing a user-defined signal; (c) the compiler emits a `__aihu_scopeCheck('authenticated')` call that the runtime resolves. **Needs Director input** before Layer 3 can be finalized. Recommendation: (a) — `@aihu/auth` exports `getScopeSignal(scopeName): Signal<boolean>` and `<$guard>` lowers to `when(getScopeSignal(scope), ...)`.

4. **TTL eviction mechanism activation:** Amendment 5 requires reserving `agent.registry.bindingTtlMs` but defers activation to a future release. Should the config key be validated and documented in v0.3.0 even if the eviction logic is a no-op? **Needs Director input** on whether to ship a disabled-by-default TTL stub or purely reserve the key in documentation.

5. **`handleToolCall` JSON-RPC 2.0 envelope:** The RFC §8.3 notes the dispatch pseudocode uses `{ error, code }` for readability but the actual implementation must emit MCP JSON-RPC 2.0 error objects. The mapping from internal codes (400, 401, 403, 404, 429, 503) to JSON-RPC error codes is unspecified. **Needs Director input** before `handleToolCall` implementation to prevent per-engineer interpretation divergence. Recommendation: define the mapping in a `jsonrpcError(code, message)` helper in `agent-service.ts` before the Builder starts on AC4–AC11.

---

## Alternatives considered

### Cross-instance sync via Proxy rather than a signal wrapper

The RFC prescribes a module-level Map of tag → LiveBinding[]. An alternative would be a Proxy over the component's reactive state, shared via a WeakRef or a module singleton. This was rejected because: (a) Proxy-based sharing makes the security boundary harder to enforce — the `componentInstanceRegistry` is module-private and write-locked to the `mount()` path, while a Proxy over shared state would need to replicate the same access control; (b) Proxy introduces `has`-trap interactions with signal tracking that could silently break the reactive graph; (c) the Map approach is prescribed verbatim by arch-3 §3.2 (the canonical source for RFC §2.1) and any deviation requires an arch-level re-review.

### Context-based registry (React-style context)

An alternative to a module-level Map is a component-tree-scoped context registry — live bindings are propagated through the DOM tree via a context provider element (similar to React context or ARIA live regions). This was considered for `$scope` tree scoping (hence the `$scope` name) but rejected for live-binding itself because: (a) MCP tool calls arrive outside any component tree — there is no DOM context available to the `handleToolCall` dispatcher; (b) the module-level Map approach requires no DOM traversal at call time (O(1) lookup by tag); (c) context-based scoping would require each `handleToolCall` invocation to know which instance to target, which is the M3 `instanceId` problem — not the M2 problem.

### Making `$live` a new signal type in `@aihu/signals`

A `liveSignal(name)` primitive that auto-syncs across component instances would be ergonomic for authors but requires the signals package to know about component identity and mounting — a layering violation (`@aihu/signals` must remain zero-dependency and framework-agnostic per its size gate and design contract). The RFC correctly keeps `$live` binding entirely in the arbor+agent-service layer, using ordinary signals internally and exposing them through the `LiveBinding` interface at the registry boundary.

### Eager `__agentBinding` detection at define time vs. mount time

An alternative is detecting `__agentBinding` at `customElements.define()` time (when `defineComponent()` is called) rather than at `mount()` time. This would allow earlier validation but requires the custom element class to carry `__agentBinding` as a static property, which couples the component definition to the binding infrastructure. The RFC prescribes mount-time detection because: (a) SSR components mount and unmount per request — the binding lifecycle must match the mount lifecycle; (b) mount-time detection is consistent with the `onCleanup`-driven disposal pattern already in `mount.ts`; (c) `__agentBinding` is in the server artifact, not the class definition — the detection naturally belongs in the materialization path.
