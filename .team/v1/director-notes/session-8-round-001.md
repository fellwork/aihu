# Director-Note — Session 8 Round 001

**Date:** 2026-05-03
**Session:** 8
**Topic Director:** Claude Sonnet 4.6
**Base commit:** `2340424` (main — session-7 retro + route.rs + 221 Rust tests)
**TS test baseline:** 570 passing
**Rust test baseline:** 221 passing
**v1 plans remaining:** 3 of 17 (4.3, 5.3, 7.1)
**Plans targeted this session:** All 3

---

## §1 Session Scope Decision

**All three remaining plans ship this session, in this order:**

1. Plan 4.3 — TypeScript template type-checking (Option B: scoped-down, no OXC)
2. Plan 5.3 — A2A and ACP adapters (both packages, parallel builders)
3. Plan 7.1 — v1 cutover (opens immediately after 5.3 merges to main)

**Sequencing rationale:**

- 4.3 is a small Rust-only change that removes the `as unknown as` quality concern before the v1 ship.
- 5.3 is two independent packages with a one-function prerequisite addition to `@scribe/agent`. Both adapters are parallel-safe.
- 7.1 is mechanical: README update, version bumps, GHA trigger re-enable. No design decisions needed.

---

## §2 Plan 4.3 Decision: Option B (Scoped-Down, No OXC)

**Decision: Option B.**

### Why not Option A (full OXC integration)

`packages/compiler/Cargo.toml` has no `[dependencies]` section — OXC is completely absent. Adding `oxc_parser` and `oxc_semantic` would introduce two major Rust crate families to a currently dependency-free compiler package, adding compile time, Cargo.lock churn, and risk of breaking the 221 passing Rust tests.

The full OXC integration is v2 scope. It belongs in a future Plan 4.3-v2 after v1 cutover.

### Why not Option C (defer entirely)

The single `as unknown as Signal<string>` cast at `packages/compiler/src/codegen/emit.rs` line 592 is fixable without OXC using data already in the `SignalMap`. For `TemplateNode::Interpolation(id)` where `id` is in the signal map, the emit layer already knows both signal name and setter name. The correct TypeScript cast is the direct tuple type — no `unknown` bridge needed.

### Option B scope

**Change:** `packages/compiler/src/codegen/emit.rs` line 592

- Current: `format!("leaf([{}, {}] as unknown as Signal<string>)", id, setter)`
- Target: `format!("leaf([{}, {}] as [Signal<string>, (v: string) => void])", id, setter)`

This is the direct tuple type that `leaf([signal, setter])` accepts. Accurate for all signals declared as `const [x, setX] = signal(...)` in setup scripts, which is the only pattern `resolve_signals` currently recognises.

**New test:** `packages/compiler/tests/codegen.rs` (or new `packages/compiler/tests/emit_types.rs`)
- Test name: `leaf_interpolation_emits_precise_tuple_type`
- Verify that a component with `const [msg, setMsg] = signal('hello')` and template `{{ msg }}` emits `as [Signal<string>, (v: string) => void]` and does NOT contain `as unknown as`.

**Acceptance criteria (Plan 4.3 Option B):**

- [ ] `emit.rs` no longer emits `as unknown as Signal<string>` for any interpolated signal in the signal map
- [ ] Emitted code contains `as [Signal<string>, (v: string) => void]` for those sites
- [ ] New Rust test added and passing
- [ ] All 221 existing Rust tests green
- [ ] All 570 existing TS tests green
- [ ] `packages/compiler/Cargo.toml` unchanged — zero new dependencies

**Branch:** `feat/v1-ts-template`

**v1 ship note for README:** "Template expression types are strengthened to precise Signal tuple types. Full TypeScript template type-checking (expression type resolution, attribute type assignability, event handler signature verification) is Plan 4.3-v2."

---

## §3 Plan 5.3 Decision: Both A2A and ACP, Parallel Builders

**Decision: Implement both adapters this session.**

### §3.1 Pre-requisite: `getAllAgentMetadata()` in `@scribe/agent`

`packages/agent/src/registry.ts` exports only `getAgentMetadata(tag)` — a single-tag lookup. Both adapters need to enumerate all registered agents for discovery endpoints.

Add to `packages/agent/src/registry.ts`:

```typescript
export function getAllAgentMetadata(): AgentMetadata[] {
  return Array.from(registry.values())
}
```

Re-export from `packages/agent/src/index.ts`. Add one test to `packages/agent/tests/registry.test.ts` confirming it returns all registered entries. Bundle impact: approximately 10 B gz (well under the 200 B gz cap).

This can be committed on the A2A branch (first commit) or as a standalone commit to main — Builder's choice.

### §3.2 A2A Adapter (`packages/agent-a2a/`)

**Branch:** `feat/v1-a2a-adapter`

**Package structure** (mirror `packages/agent-service/` as the model):

```
packages/agent-a2a/
  package.json          -- name: @scribe/agent-a2a, dep: @scribe/agent-service: workspace:*
  rolldown.config.ts    -- externalize @scribe/agent-service
  tsconfig.json
  moon.yml
  src/
    types.ts            -- A2aAdapterOptions, A2aAdapter interfaces
    a2a-adapter.ts      -- mountA2aAdapter implementation
    index.ts            -- barrel
  tests/
    a2a-adapter.test.ts -- ≥12 tests
```

**Routes exposed by `mountA2aAdapter(service, options)`:**

| Method | Path | Behavior |
|--------|------|----------|
| GET | `{prefix}/.well-known/agent.json` | Returns A2A agent card JSON |
| POST | `{prefix}/a2a/tasks/send` | Routes `{ taskId, message, params }` to `handleToolCall`; returns `{ taskId, status, result }` |
| POST | `{prefix}/a2a/tasks/sendSubscribe` | Same routing; response is `text/event-stream` with one event per result frame + `data: [DONE]` |
| other | — | Returns `null` (pass-through) |

**A2A agent card shape** (minimum valid):
```json
{
  "name": "scribe-agent-service",
  "description": "Scribe agent service",
  "version": "1.0.0",
  "capabilities": { "streaming": true },
  "defaultInputModes": ["application/json"],
  "defaultOutputModes": ["application/json"],
  "skills": [
    { "id": "<tag>/<action>", "name": "<action>", "description": "" }
  ]
}
```

Skills list is built from `service.getManifest().tools` — one skill per `{ tool.tag }/${action_name}` pair.

**Acceptance criteria:**

- [ ] `GET /.well-known/agent.json` returns 200 JSON with correct `skills` array
- [ ] `POST /a2a/tasks/send` valid tool → 200 with `{ taskId, status: 'completed', result }`
- [ ] `POST /a2a/tasks/send` unknown tool → 200 with `{ taskId, status: 'failed', error: '...' }`
- [ ] `POST /a2a/tasks/sendSubscribe` returns `content-type: text/event-stream`
- [ ] Non-matching requests return `null`
- [ ] ≥12 tests passing
- [ ] Bundle ≤ 700 B gz (externalize `@scribe/agent-service`)
- [ ] Entry in `.size-limit.json`, alias in `vitest.config.ts`

**`.size-limit.json` entry:**
```json
{
  "name": "@scribe/agent-a2a",
  "path": "packages/agent-a2a/dist/index.js",
  "limit": "700 B",
  "gzip": true,
  "ignore": ["@scribe/agent-service"]
}
```

### §3.3 ACP Adapter (`packages/agent-acp/`)

**Branch:** `feat/v1-acp-adapter`
**Parallel-safe with A2A** — entirely separate package.

**Package structure** (same pattern as A2A):

```
packages/agent-acp/
  package.json          -- name: @scribe/agent-acp, dep: @scribe/agent-service: workspace:*
  rolldown.config.ts    -- externalize @scribe/agent-service
  tsconfig.json
  moon.yml
  src/
    types.ts            -- AcpAdapterOptions, AcpAdapter interfaces
    acp-adapter.ts      -- mountAcpAdapter implementation
    index.ts            -- barrel
  tests/
    acp-adapter.test.ts -- ≥10 tests
```

**Routes exposed by `mountAcpAdapter(service, options)`:**

| Method | Path | Behavior |
|--------|------|----------|
| GET | `{prefix}/.well-known/acp-agent` | Returns ACP agent card JSON |
| POST | `{prefix}/acp/messages` | Extracts tool + params from ACP message parts; routes to `handleToolCall`; returns ACP response message |
| other | — | Returns `null` |

**ACP agent card shape** (minimum valid):
```json
{
  "agent_id": "scribe-agent-service",
  "description": "Scribe ACP agent",
  "skills": [
    { "skill_id": "<tag>/<action>", "name": "<action>" }
  ]
}
```

**ACP message routing:** `POST /acp/messages` body shape: `{ role: string, content: string, parts?: Array<{ type: string, content: unknown }> }`. Extract tool name from `parts[0].content.tool` (or from `content` if `parts` is absent). If no tool name can be extracted, return an error ACP message.

**Acceptance criteria:**

- [ ] `GET /.well-known/acp-agent` returns 200 JSON with correct `skills` array
- [ ] `POST /acp/messages` valid tool invocation → 200 ACP response message with result
- [ ] `POST /acp/messages` unknown skill → ACP error response message (not a 4xx)
- [ ] Non-matching requests return `null`
- [ ] ≥10 tests passing
- [ ] Bundle ≤ 600 B gz (externalize `@scribe/agent-service`)
- [ ] Entry in `.size-limit.json`, alias in `vitest.config.ts`

**`.size-limit.json` entry:**
```json
{
  "name": "@scribe/agent-acp",
  "path": "packages/agent-acp/dist/index.js",
  "limit": "600 B",
  "gzip": true,
  "ignore": ["@scribe/agent-service"]
}
```

### §3.4 Note on `handleToolCall` stub behavior

`agent-service.ts` `handleToolCall` currently returns `{ tag, action, params, result: null, stub: true }`. Both adapters pass this stub result through without modification. This is correct v1 behavior — live signal wiring requires a running custom element in a browser context. Builders must NOT attempt to replace the stub with DOM wiring.

---

## §4 Plan 7.1: Open After 5.3 Merges

**Branch:** `release/v1`
**Base:** `main` after 5.3 (both adapters) merges

| Item | File | Notes |
|------|------|-------|
| Remove "v0→v1 gate" callout | `README.md` | Remove the "Rust SFC compiler is the remaining v0→v1 gate" line |
| v1 feature table | `README.md` | One row per plan (17 rows); package, plan name, status |
| Bundle sizes | `README.md` | Pull from `.size-limit.json`; note actuals from last `bun run build` |
| Test count | `README.md` | TS: post-5.3 count; Rust: 221+ |
| GHA triggers | `.github/workflows/*.yml` | Add `push: branches: [main]` and `pull_request:` triggers |
| GHA publish step | `.github/workflows/release.yml` | Keep gated on `tags: ['v*']`; do NOT auto-publish on push |
| Package versions | All `packages/*/package.json` | Set `"version": "1.0.0"` on all packages |
| License field check | All `packages/*/package.json` | Verify `"license": "MIT"` present on all |
| New adapters in size-limit | `.size-limit.json` | Confirm entries for `@scribe/agent-a2a` and `@scribe/agent-acp` (added by 5.3) |

**Acceptance criteria (Plan 7.1):**

- [ ] `README.md` has v1 feature table with all 17 plans listed
- [ ] All `packages/*/package.json` have `"version": "1.0.0"` and `"license": "MIT"`
- [ ] GHA workflows allow push/PR triggers
- [ ] GHA npm publish remains tag-gated (not triggered by push to main)
- [ ] `bun run test` passes with ≥592 TS tests (570 baseline + ~22 from 5.3)
- [ ] `bun run build` passes all size-limit gates
- [ ] `packages/signals/src/` and `packages/arbor/src/` unchanged

---

## §5 Do-Not-Break List

| Gate | Constraint |
|------|-----------|
| 570 TS tests | `bun run test` must stay green across all builders |
| 221 Rust tests | `cargo test` must stay green after Plan 4.3 |
| `counter.scribe` regression | Must still compile to function form |
| `@scribe/signals` bundle | ≤ 1970 B gz |
| `@scribe/arbor` bundle | ≤ 2200 B gz |
| `@scribe/runtime` bundle | ≤ 1170 B gz |
| `@scribe/agent` bundle | ≤ 200 B gz |
| `@scribe/agent-service` bundle | ≤ 600 B gz (unchanged) |
| `packages/signals/src/` | Read-only |
| `packages/arbor/src/` | Read-only |
| `Cargo.toml` | No new dependencies — Option B is dep-free |
| `@scribe/agent-service` public API | Locked at Plan 5.2 contract |

---

## §6 Surface Triggers

| ID | Trigger | Action |
|----|---------|--------|
| ST-1 | Any Rust test failure from Plan 4.3 | Stop; surface with diff |
| ST-2 | `leaf` type signature mismatch discovered by Plan 4.3 Builder | Stop; surface actual signature |
| ST-3 | Plan 4.3 requires new Cargo.toml dependency | Stop; surface for scope re-decision |
| ST-4 | `bun run build` fails a size-limit gate on any existing package | Stop; surface size delta |
| ST-5 | Either adapter requires breaking change to `@scribe/agent-service` API | Stop; surface |
| ST-6 | `@scribe/agent` bundle exceeds 200 B gz | Surface (low probability) |
| ST-7 | GHA publish step would auto-publish to npm on push to main | Stop; surface before merging |
| ST-8 | TS test count drops below 570 | Stop; surface failing tests |

---

## §7 Execution Order

```
1. feat/v1-ts-template      ← Plan 4.3 Option B (emit.rs + 1 Rust test)
   (parallel with 2+3 — different packages)

2. feat/v1-a2a-adapter      ← Plan 5.3-prereq + A2A package
   (parallel with 3)

3. feat/v1-acp-adapter      ← Plan 5.3-ACP package
   (parallel with 2)

4. release/v1               ← Plan 7.1 (after 4.3+5.3 all merged)
```

---

## §8 Session Acceptance Bar

This session is DONE when all of the following are true on `main`:

- [ ] **Plan 4.3-B merged:** `emit.rs` emits `as [Signal<string>, (v: string) => void]`; no `as unknown as Signal<string>`; new Rust test passing; all 221 Rust tests green
- [ ] **5.3 prereq merged:** `getAllAgentMetadata()` exported from `@scribe/agent`; 1 new test added
- [ ] **Plan 5.3-A2A merged:** `packages/agent-a2a/` present; ≥12 tests green; `.size-limit.json` entry; `vitest.config.ts` alias
- [ ] **Plan 5.3-ACP merged:** `packages/agent-acp/` present; ≥10 tests green; `.size-limit.json` entry; `vitest.config.ts` alias
- [ ] **Plan 7.1 merged:** README v1 feature table; all packages at `"version": "1.0.0"`; GHA triggers updated; `bun run test` ≥592; `bun run build` all size gates pass
- [ ] No existing test regressions
