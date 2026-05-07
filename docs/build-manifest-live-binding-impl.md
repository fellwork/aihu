# Build Manifest — live-binding-impl (v0.3.0)

Branch: `feat/live-binding-impl`
Date: 2026-05-07
Author: Builder agent (claude-sonnet-4-6)

## Scope

Implements the `$live` binding feature as specified in `docs/specs/live-binding-impl.md`.
Four layers: Compiler (`__agentBinding` export), Runtime (`componentInstanceRegistry`),
Agent Service (`handleToolCall` live-dispatch), and `<$guard scope>` lowering.

## Files Changed

| File | Change | LOC delta |
|------|--------|-----------|
| `packages/compiler/src/codegen/emit.rs` | `__agentBinding` server export + `<$guard scope>` lowering | +211 / -11 |
| `packages/compiler/tests/integration.rs` | 4 new Rust integration tests for `__agentBinding` | +104 |
| `packages/compiler/tests/snapshots/codegen__agent_airtime_quote.snap` | Updated to include `__agentBinding` export | +9 |
| `packages/arbor/src/types.ts` | `AgentBindingSpec`, `MountOptions.agentBinding`, evolved `AgentContext` | +46 / -5 |
| `packages/arbor/src/mount.ts` | `LiveBinding`, `componentInstanceRegistry`, `registerLiveBinding`, `_getComponentInstanceRegistry` | +198 / -12 |
| `packages/arbor/src/index.ts` | Export `_getComponentInstanceRegistry`, `AgentBindingSpec` | +3 |
| `packages/arbor/tests/live-binding.test.ts` | NEW — 25 tests AC2, AC3, AC12, AC13, AC15 | +~350 |
| `packages/agent-service/src/types.ts` | `LiveBinding`, `RequestContext`, `AuthPlugin`, `RateLimitPlugin`, updated `AgentServiceOptions` | +103 / -7 |
| `packages/agent-service/src/agent-service.ts` | Full live-dispatch rewrite, `jsonrpcError()` helper | +166 / -28 |
| `packages/agent-service/src/index.ts` | Export new types | +9 |
| `packages/agent-service/tests/live-dispatch.test.ts` | NEW — 20 tests AC4–AC11, AC14 | +~360 |
| `packages/agent-service/tests/agent-service.test.ts` | Update 2 stub tests for v0.3.0 behavior | +31 / -10 |
| `packages/agent-a2a/tests/a2a-adapter.test.ts` | `makeLiveBinding`, `makeServiceWithRegistry` helpers; fix test 5 | +34 / -5 |
| `packages/agent-acp/tests/acp-adapter.test.ts` | `WIDGET_META`, `makeLiveBinding`, `sampleServiceLive` helpers; fix AC-5, AC-6, parts test | +55 / -6 |
| `SECURITY.md` | Full rewrite: `$scope`/`<$guard>` warnings, cross-origin policy, registry capacity | +85 |
| `.size-limit.json` | `@aihu/arbor` limit raised from 2200 B to 2800 B | +2 / -2 |

**Total:** ~984 insertions, ~72 deletions across 16 files (2 new).

## Acceptance Criteria Status

| AC | Description | Status |
|----|-------------|--------|
| AC1 | Compiler emits `__agentBinding` named export in server artifact | PASS |
| AC2 | `mount()` creates a `LiveBinding` and registers in `componentInstanceRegistry` | PASS |
| AC3 | `LiveBinding` exposes `getSignal`, `setSignal`, `callAction`, `scope()`, `rateLimit()`, `dispose$()` | PASS |
| AC4 | `handleToolCall` live dispatch returns real result, not stub | PASS |
| AC5 | Scope pass — JWT with claim → 200 | PASS |
| AC6 | Scope fail — JWT without claim → 403 | PASS |
| AC7 | Auth-absent fail-closed → 401 AUTH_MISSING | PASS |
| AC8 | Rate-limit → 429 after quota exhausted | PASS |
| AC9 | userId missing → 401 (for scoped/rate-limited components) | PASS |
| AC10 | No live instance → 404 | PASS |
| AC11 | Undeclared action → 404 | PASS |
| AC12 | `registerLiveBinding` enforces 1000-binding-per-tag capacity cap | PASS |
| AC13 | Cross-origin iframe → skip registration + WARN | PASS |
| AC14 | Dispatch ordering invariant: 404 → 401 → 403 → 429 | PASS |
| AC15 | `dispose$()` unregisters binding from registry | PASS |

All 15 ACs pass.

## Test Summary

- TypeScript tests: all pass (4 pre-existing failures unchanged: `b3b-sidecar-tsc.test.ts` × 3, `legacy-snapshot.test.ts` × 1)
- Rust unit tests: 135/135 pass
- Rust integration tests: 13/13 pass (including 4 new `agent_binding_*` tests)
- Rust conformance/b3/b4/etc.: all pass (232 total Rust tests)

## Open Questions Resolved

| # | Question | Resolution |
|---|----------|------------|
| OQ1 | `$rate-limit` u32 format in codegen | Format as `'N/min'` string |
| OQ2 | `@aihu/auth` absence detection | Always emit `[SECURITY]` warning in v0.3.0 (option c) |
| OQ3 | `<$guard scope>` scope signal import | Emit `getScopeSignal('scope')` from `@aihu/auth` |
| OQ4 | TTL eviction for registry capacity | Reserved config key in docs/comments only |
| OQ5 | JSON-RPC error envelope | Added `jsonrpcError(code, message)` helper with JSON-RPC 2.0 codes |

## Size Gate

`@aihu/arbor` limit updated: 2200 B → 2800 B (dist/index.js gzip).
Live-binding additions (registry, registerLiveBinding, cross-frame check) add ~400-600 bytes gz.
All other packages unchanged within existing limits.

## Security Notes

- Error ordering 404 → 401 → 403 → 429 is a timing-channel security invariant (Amendment 4 / CWE-200). Do NOT reorder.
- No `authPlugin` + `$scope` component → 401 AUTH_MISSING (fail-closed, Amendment 2).
- Cross-origin iframe skips registration and emits `[SECURITY] WARN` (Amendment 1).
- Registry capacity at 1000 per tag; 1001st rejected with WARN, no eviction (Amendment 5).
- Compiler emits `[SECURITY] WARN` whenever `$scope` is used (Amendment 7, option c).
- `userId` required only for auth-gated endpoints (those with `$scope` or `$rate-limit`); un-scoped, un-rate-limited components allow anonymous callers (backward compat with a2a/acp adapters).
