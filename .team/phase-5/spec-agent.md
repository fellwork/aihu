# Spec — `@aihu/agent` (Phase 5)

**Author:** Architect C
**Date:** 2026-04-26
**Branch:** `spec/phases-3-4-5`
**Status:** Final — Builder may consume.

This spec is binding. Where it deviates from the plan, the plan is overridden under Decision 2B authority. Where it deviates from the v0 spec, that is called out explicitly in §6.

References:
- Spec: `docs/superpowers/specs/2026-04-23-aihu-v0-vertical-slice-design.md` (`spec` below)
- Plan: `docs/superpowers/plans/2026-04-24-aihu-v0-plan-a-ts-runtime.md` (`plan` below)

---

## 1. Public API surface

End-of-Phase-5 exports from `@aihu/agent` (re-exported through `packages/agent/src/index.ts`):

| Kind | Symbol |
|---|---|
| value | `getAgentMetadata`, `registerAgentMetadata` |
| type | `AgentMetadata` |

**2 value exports, 1 type-only export = 3 total.**

### 1.1 `AgentMetadata`

```ts
export interface AgentMetadata {
  /** The custom-element tag name this metadata describes. */
  tag: string
  /** MCP prompt/description — human-readable summary of what this element does. */
  describes?: string
  /** MCP resources — names mapped to human-readable descriptions of reactive state. */
  state?: Record<string, string>
  /** MCP tools — names mapped to human-readable descriptions of callable operations. */
  actions?: Record<string, string>
  /** Unknown fields are preserved, not rejected (spec §9.1). */
  [key: string]: unknown
}
```

The trailing index signature is spec-mandated (spec §9.1: "Unknown fields are preserved, not rejected — we will add fields without breaking old SFCs"). This means `AgentMetadata` is not a closed type — future top-level keys flow through without a type error or data loss.

### 1.2 `registerAgentMetadata`

```ts
export function registerAgentMetadata(meta: AgentMetadata): void
```

Inserts or overwrites the registry entry for `meta.tag`. Called by the compiler-emitted module top-level (see §2). Idempotent for identical objects; last-registration-wins for the same tag (HMR re-execution overwrites; see §2.1). Does not deep-clone the argument — the compiler-emitted object is already frozen (spec §9.2); the registry stores the reference directly.

### 1.3 `getAgentMetadata`

```ts
export function getAgentMetadata(tag: string): AgentMetadata | undefined
```

Returns the registered `AgentMetadata` for `tag`, or `undefined` if no entry exists. Never throws — unknown tag returns `undefined`. Zero cost unless called (the registry is a plain `Map`; lookup is O(1)).

**Semantics:** returns the same frozen object reference that was registered. No copy, no deep-freeze wrapper. Callers receive the compiler-emitted frozen value directly.

### 1.4 Forward-compatibility — app-wide manifest aggregation (sub-project #7)

> **Phase 5 session note (2026-04-26).** The Phase 3 spec session locked an AI-first direction (Learning #15): the truth source for agent capabilities is `<agent>` blocks in SFCs, and a future build-time **app-wide capability manifest** aggregates per-component metadata into a single artifact agents load at session start. This v0 registry is the runtime-side data source for that aggregation.

**v1 / sub-project #7 will likely add:**

```ts
// Sketch — NOT in v0:
export interface AgentManifest {
  readonly version: string
  readonly schema: 'aihu-agent-manifest-v1'
  readonly components: Record<string, AgentMetadata>
  readonly generatedAt: string
}

export function getAgentManifest(): AgentManifest
```

`getAgentManifest()` returns a snapshot of the entire registry as a single object. Cheap (`Object.fromEntries(registry)` plus version/schema fields). Could also be emitted at *build time* by the compiler — the compiler reads every `<agent>` block across the app and writes `dist/agent-manifest.json` directly, with no runtime cost.

**Magna alignment.** Where `<agent>` blocks describe what *components* expose (state shape + actions), magna's GraphQL introspection describes what the *backend* exposes (queries, mutations, types). A unified capability manifest can include both surfaces — agents loading the manifest see the complete picture: "this app exposes these reactive components, backed by this data schema." Magna ships introspection out of the box; aihu's `<agent>` registry is the per-component complement.

**v0 design accommodates this without rework.** The current `Map<string, AgentMetadata>` registry is exactly the data structure manifest aggregation needs. The interface signature and registration mechanism in §1.1–§1.3 do not change in v1; `getAgentManifest` is a new export, not a replacement.

**v0 commitment.** No code change for this — this section is purely forward-compat documentation. Phase 5 ships the registry; sub-project #7 ships the manifest.

---

## 2. Internal architecture

The entire runtime is two files:

**`packages/agent/src/registry.ts`** — module-level `Map<string, AgentMetadata>` plus `registerAgentMetadata` and `getAgentMetadata`. No class, no proxy, no reactive wrapper. The registry is a `const registry = new Map<string, AgentMetadata>()` at module scope — initialized once, mutated only by `registerAgentMetadata`.

**`packages/agent/src/types.ts`** — `AgentMetadata` interface only. No runtime content.

**`packages/agent/src/index.ts`** — re-exports from both files.

### 2.1 Registration mechanism (Architect's call, Decision 2B)

The compiler emits, at the top level of each `.aihu`-derived JS module:

```js
import { registerAgentMetadata } from '@aihu/agent'
registerAgentMetadata(agentMetadata)
```

Rationale for this approach over the alternatives:

- **Explicit named import** — the compiler knows the exact function name at emit time; if `@aihu/agent` changes its export shape, the import fails with a clear TypeScript error at the consuming module's type-check, not silently at runtime.
- **Top-level call** — module evaluation registers the metadata automatically when the module is imported. No consumer bootstrap code required.
- **Last-registration-wins for HMR** — when a `.aihu` file's `<agent>` block changes and the HMR runtime re-executes the module, `registerAgentMetadata` is called again with the new frozen object. The registry overwrites the old entry by tag. No teardown needed; no stale entry survives. This matches the spec §10.3 framing: "HMR swaps one component's class; state survival is best-effort." The registry update is atomic (Map.set), not best-effort.
- **No side-effect-only import** — a bare `import '@aihu/agent/register'` side-effect module was considered and rejected: it would require a second `@aihu/agent` entry point, complicating the package's exports map and the size-limit path.

The alternative (a side-effect auto-registration module that scans a global `__SCRIBE_AGENTS__` var) is rejected: it introduces a global, makes the registration implicit, and adds complexity the registry doesn't need.

### 2.2 No reactive state

The registry is a plain `Map`. There is no signal wrapping, no `effect`, no `computed`, no observer. `@aihu/agent` does not import from `@aihu/signals` and does not import from `@aihu/arbor`. It is fully self-contained. Reactive agent-state binding is sub-project #7 (spec §9.3).

### 2.3 No error class

`@aihu/agent` does not define a custom error class. `getAgentMetadata` returns `undefined` for unknown tags — it never throws. `registerAgentMetadata` accepts any `AgentMetadata`-shaped object — it does not validate the shape at runtime in v0 (the compiler guarantees the shape; runtime validation would duplicate the cost for no gain at this layer). No `AgentError` class is defined or needed. This is consistent with spec §10.2 which names `ArborError` as the runtime error class — there is no agent-layer equivalent.

---

## 3. Tooling

### 3.1 `moon.yml`

```yaml
layer: library
```

One line. Inherits `build` and `typecheck` from `.moon/tasks.yml` (same pattern as `@aihu/signals`). No custom inputs or outputs — agent has no bench tasks, no jsdom environment, no special rolldown config.

### 3.2 `.size-limit.json` row (Task 23 addition)

Task 23 adds the agent row to `.size-limit.json`:

```json
{
  "name": "@aihu/agent",
  "path": "packages/agent/dist/index.js",
  "limit": "100 B",
  "gzip": true
}
```

**Budget rationale:** the plan's pre-written `.size-limit.json` sample (plan line ~416) states `"limit": "512 B"`. This spec overrides that to **100 B gzipped** under Decision 2B authority.

Rationale: the package is a `Map` plus two functions and one interface. The registry `Map` initialization, two function literals, and the `export` wrappers compress to well under 100 B gz — the Phase 2 analogy is `@aihu/signals`'s empty scaffold starting at 108 B raw before any logic. A package with two functions over a single `Map` will be smaller still. Setting 100 B forces CI to catch any inadvertent dependency pull (e.g. accidentally importing `@aihu/signals`) immediately. If the implementation lands at 80 B gz, 100 B gives 25% headroom for future additions within v0 (e.g. a `listAgentTags()` utility). If for some reason the bundled output exceeds 100 B gz, the Builder raises it to the Team Lead with measurement evidence before adjusting the gate — not silently bumping the limit.

The plan's 512 B was a conservative "negligible" ceiling, not a measured projection. 100 B is a more precise gate that will fail fast on scope creep.

### 3.3 CI workflow trigger

The `.github/workflows/plan-a.yml` workflow already triggers on `push: [main, 'plan-a-phase-*', 'plan-*']` — phase-5 branch pushes will run CI. No change needed. This was the fix called out in the Phase 2 retro ("Phase 3 risks already visible — CI workflow trigger list is over-narrow"). It has already been applied.

### 3.4 `vitest.config.ts` alias

The root `vitest.config.ts` already declares an `@aihu/agent` alias (plan line ~366):

```ts
'@aihu/agent': new URL('./packages/agent/src/index.ts', import.meta.url).pathname,
```

No change needed; Builder confirms the alias is present before Task 23 begins.

---

## 4. Test plan

### Task 23 — `registerAgentMetadata` + `getAgentMetadata`

All tests in `packages/agent/tests/registry.test.ts`. TDD: write tests before implementation.

Unit (7):

| # | Description | Expected |
|---|---|---|
| 1 | Unknown tag returns `undefined` | `getAgentMetadata('missing') === undefined` |
| 2 | Registered tag returns the metadata object | `getAgentMetadata('hello-aihu')` returns the registered object |
| 3 | Returned object is the same reference that was registered | `result === registeredObject` (no copy) |
| 4 | `describes`, `state`, `actions` all optional — minimal object `{ tag: 'x' }` round-trips | returns `{ tag: 'x' }` |
| 5 | Unknown extra fields are preserved | `{ tag: 'x', customField: 42 }` round-trips with `customField` intact |
| 6 | Re-registering the same tag overwrites the entry | second registration wins; `getAgentMetadata` returns second object |
| 7 | Multiple distinct tags coexist in the registry | registering `'a'` and `'b'` independently retrievable |

Test isolation: because `registry.ts` holds module-level state (the `Map`), tests that share the module instance will see each other's registrations. The Builder must either (a) export a `__resetRegistryForTesting()` function marked `/** @internal */` and call it in `beforeEach`, or (b) use Vitest's `vi.resetModules()` + dynamic re-import per test that needs isolation. Option (a) is preferred — one extra export, much simpler test setup, and the `/** @internal */` marker ensures it does not appear in `index.ts`. Builder's call; document the choice in the build manifest.

### Task 24 — typecheck, build, size

- `moon run agent:typecheck` — exits 0.
- `moon run agent:build` — `packages/agent/dist/index.js` and `dist/index.d.ts` written.
- `bun run size` — all rows including agent pass. Agent row reports ≤ 100 B gz.
- `bun run test` — all 7 registry tests pass (plus all prior-phase tests still green).
- `bun run lint` — Biome reports no issues for `packages/agent/**`.

No property-based tests (fast-check) for this package. The registry's invariants (lookup by key in a Map, last-write-wins) are not amenable to property testing in a way that adds signal beyond the 7 unit tests.

---

## 5. File-level change list

Builder uses this as a checklist. Bold = file does not yet exist.

### Task 23 — scaffold + implementation

| File | Action | Purpose |
|---|---|---|
| **`packages/agent/package.json`** | create | `@aihu/agent` package manifest; `"name": "@aihu/agent"`, no runtime deps |
| **`packages/agent/tsconfig.json`** | create | Extends `../../tsconfig.base.json`; `include: ["src"]` |
| **`packages/agent/rolldown.config.ts`** | create | ESM + dts emit; same pattern as `@aihu/signals` |
| **`packages/agent/moon.yml`** | create | `layer: library`; inherits build/typecheck |
| **`packages/agent/src/types.ts`** | create | `AgentMetadata` interface |
| **`packages/agent/src/registry.ts`** | create | Module-level `Map`; `registerAgentMetadata`; `getAgentMetadata`; optional `__resetRegistryForTesting` |
| **`packages/agent/src/index.ts`** | create | Re-exports `registerAgentMetadata`, `getAgentMetadata`, type `AgentMetadata` |
| **`packages/agent/tests/registry.test.ts`** | create | 7 unit tests (TDD — written before src) |
| `.size-limit.json` | modify | Add agent row: `"limit": "100 B"`, `"gzip": true` |
| `package.json` (workspace root) | modify | Add `packages/agent` to `workspaces` glob if not already covered |
| `vitest.config.ts` | verify | Confirm `@aihu/agent` alias exists; no edit if present |

### Task 24 — verify and commit

| File | Action | Purpose |
|---|---|---|
| `packages/agent/dist/index.js` | generated | ESM bundle (do not commit; gitignored) |
| `packages/agent/dist/index.d.ts` | generated | Type declarations (do not commit; gitignored) |

### Final `index.ts` (end-of-Phase-5)

```ts
export { registerAgentMetadata, getAgentMetadata } from './registry.ts'
export type { AgentMetadata } from './types.ts'
```

Note: `__resetRegistryForTesting` is NOT re-exported from `index.ts`. It is exported from `registry.ts` directly (so tests can import it via path) but excluded from the public surface. Alternatively, the Builder may co-locate it in the test file itself if Vitest module-reset is the chosen isolation strategy.

---

## 6. Deviations from the plan

| # | Deviation | Source | Rationale |
|---|---|---|---|
| 1 | Tasks 23–24 content is unwritten in the plan | Learning #6 (plan staleness) | Plan ends at "Phases 3–6 follow in the next document edits" — Tasks 23–24 do not exist. This spec is authoritative for Phase 5. The Builder consumes this spec, not the plan's Phase 5 section. |
| 2 | Size limit set to 100 B gz, not plan's 512 B | Architect (Decision 2B) | Plan's 512 B is a conservative ceiling for "negligible." A two-function Map-based registry compresses to well under 100 B gz. 100 B fails fast on accidental dep pulls; 512 B would allow an entire copy of `@aihu/signals` to sneak in without failing CI. |
| 3 | `registerAgentMetadata` is a named public export; compiler emits an explicit import of it | Architect (Decision 2B) | The compiler spec (spec §9.2) says the compiler "emits whatever `@aihu/agent` exports." This spec pins the contract: compiler imports `registerAgentMetadata` by name. This is a compile-time verifiable contract. Alternative (global side-effect scan) rejected for the reasons in §2.1. |
| 4 | No `AgentError` class | Architect (Decision 2B) | `getAgentMetadata` returns `undefined` for unknown tags; `registerAgentMetadata` does not validate at runtime in v0. No error surface exists. Spec §10.2 names only `ArborError` for runtime errors. |
| 5 | MCP server, live signal binding, agent invocation — out of scope | spec §9.3 | Sub-project #7. Documented here so the Builder does not add stubs "for completeness." |
| 6 | CI trigger list already fixed | Phase 2 retro fix | `.github/workflows/plan-a.yml` already includes `'plan-a-phase-*'` and `'plan-*'`. No edit needed in Phase 5. |

---

## 7. Open questions for the Team Lead

**OQ-1 (HMR re-registration):** When a `.aihu` file's `<agent>` block changes during Vite HMR, the module re-executes and `registerAgentMetadata` is called again with the updated frozen object. The registry overwrites the old entry. This spec treats that as correct behavior — last-registration-wins, same tag. If the Team Lead foresees a scenario where the compiler does NOT want last-registration-wins (e.g., multi-version coexistence), raise now; otherwise this spec stands.

**OQ-2 (compiler import contract):** This spec declares that the compiler emits `import { registerAgentMetadata } from '@aihu/agent'`. The compiler spec (spec §9.2) does not prescribe the exact import — it says "emitted as a frozen static module export" for `agentMetadata` only. This spec's §2.1 extends that contract to mandate the registration call. The Compiler Architect (if one exists for Plan B) should ack this contract before the compiler ships. If the compiler team prefers a different import shape, this spec's §2.1 and §1.2 need a corresponding update. No action required until Plan B begins.

---

<!-- Pre-publish checklist (per Builder brief instructions)
- [x] Re-read v0 spec §7.7, §9, §10.2 (for runtime error class consistency) — done; §10.2 names ArborError only; no agent error class
- [x] Re-read plan tasks 23–24 — done; they do not exist (plan ends at line 1646); flagged as Deviation 1
- [x] Walked prose vs deviations table (Learning #2) — done; all 6 deviations match corresponding prose sections
- [x] Plan staleness flagged in §6 Deviation 1 — done
- [x] CI trigger fix in §3.3 — confirmed already fixed; documented
- [x] Size budget number (100 B, not "negligible") in §3.2 — done; rationale given
- [x] Registration mechanism rationalized in §2.1 — done; Decision 2B authority invoked
-->
