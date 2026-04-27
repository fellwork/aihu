# Spec — `@scribe/arbor` (Phase 3)

**Author:** Team Lead (hand-written; supersedes archived class-shape draft from Architect A)
**Date:** 2026-04-26
**Branch:** spec/phases-3-4-5
**Status:** Draft — pending module-split research findings (§2.1) and final review.

This spec is binding once finalized. Where it deviates from the plan, the plan is overridden under Decision 2B authority. Where it deviates from the v0 spec, that is called out explicitly in §6.

References:
- v0 spec: `docs/superpowers/specs/2026-04-23-scribe-v0-vertical-slice-design.md`
- Plan: `docs/superpowers/plans/2026-04-24-scribe-v0-plan-a-ts-runtime.md`
- Phase 2 spec: `.team/phase-2/spec-signals.md` (format reference + shipped API)
- Phase 2 retro: `.team/phase-2/retro.md` (Phase 3 risks already visible)
- Archived class-shape draft: `.team/phase-3/_archive/spec-arbor-classbased-DRAFT.md` (reference only — superseded)

**Plan staleness (Learning #6, mandatory flag):** Plan tasks 12–19 are entirely unwritten — the plan document ends at the Phase 2 status checkpoint with "*Phases 3–6 follow in the next document edits.*" This spec is the authoritative task definition for Phase 3. A plan-index stub is added in the same commit so future readers can cross-reference. See §6 Deviation 1.

---

## 0. Two-layer authoring model (foundational)

scribe components exist at two layers, and the distinction is load-bearing for everything in this spec:

1. **Compiler-emission layer (machine-generated).** The Rust compiler reads `.scribe` SFC files and emits, per v0 spec §7.2: `class <ComponentName> extends HTMLElement` calling `mount(buildTree(), this.shadowRoot)` in `connectedCallback`, then `defineElement('tag', ClassName)` at module level. The compiler emits direct calls into arbor's low-level primitives (`branch`, `leaf`, `mount`). It never calls the human-facing `defineComponent` helper. This keeps compiler output minimal-byte and direct.

2. **Hand-author layer (human-written, functional).** Test code, examples, apps that don't use `.scribe` files, and any future scenario where a human writes a custom element directly. This layer uses `defineComponent(setup)` — a thin functional wrapper that hides `class extends HTMLElement` boilerplate and gives the user an ergonomic `setup()` function returning a tree.

**Why both.** Compiler emission must stay class-based — v0 spec §7.2 is explicit, and the Web Components API requires a constructor. But the *user-facing* model (when someone writes a component without going through `.scribe`) should be functional. The functional layer is sugar for the class layer. They are interoperable — both produce a `class extends HTMLElement` that `defineElement` registers.

**What this means for arbor (this spec).** Arbor's *primitives* — `branch`, `leaf`, `mount`, `MountScope` — are the thing the compiler emits calls to. They are the foundation. The `defineComponent` helper that wraps them for hand-authoring lives in `@scribe/runtime` (Phase 4), not arbor. This spec defines only the primitives. See §1.7 for the integration boundary.

---

## 0.5 Project posture (Phase 3 session decisions)

This spec inherits four project-level commitments locked during the Phase 3 spec-authoring session. They are recorded here (not just in `.team/learnings.md`) because they shape every design call below:

1. **Aggressive R&D performance posture.** v0 ships Tier 1 + Tier 2 wins inline, sets up Tier 3 hooks (§2.7, §2.8, §2.9) for sub-projects #6 / #10 / #7. The project is positioned as runtime-reactivity research, not "yet another framework." Performance regressions block merge. Bench receipts mandatory on every runtime PR.

2. **AI-first means in-tree binding, not MCP-only.** The truth source for agent capabilities is `<agent>` blocks in SFCs. MCP is one adapter, not the foundation. The arbor subscription identity (§2.7) is load-bearing for the in-process binding layer that sub-project #7 will build on top of arbor. Without §2.7, the binding layer cannot address signal subscriptions by name.

3. **Magna is the canonical backend.** Scribe + magna are designed to be used together. magna is not a runtime concern for arbor (it runs server-side, GraphQL-from-Postgres) — but magna's existence shapes design choices throughout the stack. **Areas to explore in future sessions** (none gating Phase 3 — flagged here so they don't get lost):
   - High-performance data: zero-copy from magna's GraphQL response into signal-bound state
   - Hydration coupling: magna's deterministic responses enable signal-graph resumability (§2.7's path keys map to magna query identities)
   - Schema introspection: magna's auto-generated GraphQL schema can derive scribe's TypeScript types automatically
   - Agent work: agent metadata + magna introspection together = a complete capability manifest at build time
   - Build-time tooling: the Rust compiler can validate `.scribe` queries against magna's schema

   None of this changes Phase 3's deliverables, but Phase 3's design must not paint into a corner that prevents this integration. The Tier 3 hooks (§2.7, §2.8) are specifically the hooks magna integration will need.

4. **Functional components, type-safe, concern-separated for agentic read.** §0 (two-layer authoring) and §2.1 (150-line module sizing) operationalize this. Every module is named by its concern; "where does X live?" has one answer.

---

## 1. Public API surface

End-of-Phase-3 exports from `@scribe/arbor` (re-exported through `packages/arbor/src/index.ts`):

| Kind | Symbol |
|---|---|
| value | `branch`, `leaf`, `mount`, `when`, `each` |
| error class | `ArborError`, `ArborNotImplementedError` |
| type | `Branch`, `Leaf`, `Node`, `AttrMap`, `ChildList`, `EventHandler`, `MountScope`, `AgentContext`, `Snapshot` |

**7 value/class exports, 9 type exports = 16 total.** All other symbols (`_applyAttrs`, `_setAttrOrProp`, `_mountEffect`, `_materialize`, `_activeMountDisposers`, etc.) are `/** @internal */` and never re-exported from `index.ts`.

**Phase 3 prep addition to `@scribe/signals`** (see §1.1):

| Kind | Symbol |
|---|---|
| value | `untrack` |

---

### 1.1 `untrack` — Phase 3 prep addition to `@scribe/signals`

> **IMPORTANT:** This is a change to `@scribe/signals`, not `@scribe/arbor`. Authorized by **Team Lead Call 1**. The Builder ships it as a prep commit (Task 12.5) touching only `packages/signals/` before any arbor source work begins.

```ts
// Added to @scribe/signals public API:
export function untrack<T>(fn: () => T): T
```

**Semantics.** Evaluates `fn()` outside any reactive tracking context. Saves the current observer slot (whatever computation currently owns the call stack — may be `null`, an effect node, or a computed node), sets the observer to `null` for the duration of `fn`, then restores the previous observer in a `finally` block. Signal reads inside `fn` are invisible to the calling computation: no dependency edges are created for those reads. Propagates any exception from `fn` naturally — the `finally` always restores the observer. Composes correctly with `batch`: `untrack` does not touch `batchDepth`, so writes inside `fn` still enqueue rather than fire synchronously.

**Intent (not mandate for Builder).** The natural implementation:

```ts
// packages/signals/src/untrack.ts
import { setCurrentObserver } from './signal.ts'

export function untrack<T>(fn: () => T): T {
  const prev = setCurrentObserver(null)
  try {
    return fn()
  } finally {
    setCurrentObserver(prev)
  }
}
```

Add to `packages/signals/src/index.ts`: `export { untrack } from './untrack.ts'`

**Size estimate.** ~8 source lines → ~25–35 B gz delta. Using 30 B: 698 B (Phase 2 final) + 30 B = **728 B gz total**, leaving **296 B of 1024 B headroom**. Confirmed within budget.

**Tests (3, in `packages/signals/tests/untrack.test.ts`):**

```ts
import { describe, expect, it } from 'vitest'
import { signal, effect, untrack } from '../src/index.ts'

describe('untrack', () => {
  it('reads a signal without creating a dependency', () => {
    const [count, setCount] = signal(0)
    let runs = 0
    effect(() => { untrack(() => count()); runs++ })
    expect(runs).toBe(1)       // initial run
    setCount(1)
    expect(runs).toBe(1)       // NOT re-run — no dependency created
  })

  it('returns the value from fn', () => {
    const [count] = signal(42)
    expect(untrack(() => count())).toBe(42)
  })

  it('restores the outer observer after fn completes', () => {
    const [b, setB] = signal(0)
    const [a] = signal(0)
    let runs = 0
    effect(() => {
      untrack(() => a())   // a: not tracked
      b()                  // b: tracked (observer restored after untrack)
      runs++
    })
    setB(1)
    expect(runs).toBe(2)   // b write re-triggers; a write would not
  })
})
```

**`peek` is NOT authorized.** Only `untrack` is authorized by Call 1. See §7 Q1 if you believe `peek` is also needed.

---

### 1.2 `branch`

```ts
export function branch(
  tag: string | null,
  attrs?: AttrMap,
  children?: ChildList,
): Branch
```

**Semantics.** Returns an opaque `Branch` node. Does NOT touch the DOM at construction — only `mount()` materializes nodes. `tag === null` is the fragment/grouping case: no wrapper element is created; children are appended directly to the host or parent. When `tag === null` and `attrs` is provided non-empty, the entries are silently ignored at mount (the compiler never emits attrs on null-tag branches; runtime defensiveness lands in v1).

**`ChildList`:**
```ts
export type ChildList = ReadonlyArray<Branch | Leaf>
```

Children are **static at construction time**. The list itself is not a signal. Structural dynamism (conditional and list rendering) lives entirely in `when` and `each`, which are v1 reconciler stubs in v0. Per v0 spec §4 "Non-goals."

**`AttrMap`:**
```ts
export type EventHandler = (event: Event) => void

export type AttrMap = Record<
  string,
  string | number | boolean | Signal<unknown> | EventHandler
>
```

AttrMap value semantics at mount time:

| Runtime test | Treatment |
|---|---|
| `key.startsWith('on')` AND `typeof value === 'function'` AND `!Array.isArray(value)` | **EventHandler** — `el.addEventListener(key.slice(2).toLowerCase(), value)`. Not reactive. |
| `Array.isArray(value)` | **`Signal<unknown>`** (a Signal is `readonly [Read<T>, Write<T>]`). `value[0]` is the getter. A `mountEffect` updates the DOM attr whenever the signal changes. |
| `typeof value === 'string' \| 'number' \| 'boolean'` | **Static** — set once at mount; never re-applied. |

Detection precedence: `on*`-function check first, signal-array check second, static primitive last.

For signal-reactive attrs: if `key in el` is true, assign `el[key] = currentValue` (DOM property assignment — handles `value`, `checked`, `disabled`, `className` etc.). Otherwise `el.setAttribute(key, String(currentValue))`.

---

### 1.3 `leaf` and `leaf.element`

```ts
export interface LeafFactory {
  (value: Signal<string> | string): Leaf
  element(tag: string, attrs?: AttrMap): Leaf
}

export const leaf: LeafFactory
```

**`leaf(value)`** — creates a text leaf. Plain `string` → text node set once. `Signal<string>` (detected via `Array.isArray`) → `mountEffect` updates `textNode.nodeValue` on every signal change.

**`leaf.element(tag, attrs?)`** — creates a terminal element leaf with no children. For `<img>`, `<br>`, `<input>`, `<hr>` etc. `attrs` follows the same semantics as branch attrs.

Both return opaque `Leaf` values. Only `mount()` materializes them.

---

### 1.4 `mount`

```ts
export type Node = Branch | Leaf

export function mount(node: Node, host: Element | ShadowRoot): MountScope
```

**Semantics.** Materializes `node` into the DOM under `host`, wires all reactive subscriptions synchronously, and returns a `MountScope` owning the lifecycle.

By the time `mount()` returns: all DOM nodes are created and appended, all static attrs are set, all reactive attr-effects and text-effects have run once and subscribed to their signals. Initial render is complete and synchronous.

When `node` is a null-tag `Branch` (fragment), children are appended directly to `host`. The `MountScope` tracks the individual appended nodes for disposal.

**Host type.** `ShadowRoot` is the primary production host (compiler emits `mount(tree, this.attachShadow({mode:'open'}))`). Plain `Element` is used in tests and hand-authored code. Both support `appendChild`/`removeChild`. No other host interface is required in v0.

**This signature directly resolves Architect B's runtime spec Q1, Q2, Q9** (host accepts `ShadowRoot`, accepts `HTMLElement` for `'none'` mode, treats host as opaque write target).

---

### 1.5 `MountScope`

```ts
// Stub types — live bindings land in sub-projects #7 and #6 respectively
export interface AgentContext { readonly _brand: 'AgentContext' }
export type Snapshot = Record<string, never>

export interface MountScope {
  /** Disposes all reactive effects and removes mounted DOM nodes from the host. */
  dispose(): void
  /** Sub-project #7 stub. Returns a frozen stub object; does not throw. */
  readonly agent: AgentContext
  /** Sub-project #6 stub. Always throws ArborNotImplementedError. */
  serialize(): Snapshot
}
```

**`dispose()` semantics:**
1. Calls all collected `Dispose` functions in **LIFO registration order** (last-registered effects first — deepest/newest nodes before shallowest/oldest). Rationale: prevents parent effects from re-running when child effects have already cleaned up downstream signals; prevents effects from reading DOM nodes their parent's disposal will imminently remove.
2. Removes all root-level DOM nodes that were appended to `host` at mount time.
3. Is **idempotent**: calling `dispose()` more than once is a no-op after the first call.

After `dispose()` returns, the `MountScope` is inert. `agent` still returns the stub without throwing. `serialize()` still throws.

**`agent`** — getter returns `Object.freeze({ _brand: 'AgentContext' as const })`. Does not throw. The empty/branded stub type signals "don't use this in v0" through the type system.

**`serialize()`** — throws `new ArborNotImplementedError('serialize()')` immediately. No body.

**Nested `mount()` calls.** v0: each `mount()` produces one independent `MountScope`. No parent-child propagation. If user code calls `mount()` inside a `mountEffect`, two independent scopes exist; the outer scope's `dispose()` does NOT call the inner's `dispose()`. User manages the inner. Nested propagation is v1.

**This signature directly resolves Architect B's runtime spec Q3, Q4, Q5** (`dispose(): void` synchronous, no `onDispose` hook in v0, all cleanup is manual).

---

### 1.6 `when` and `each` — stubs

```ts
export function when(
  condition: Signal<boolean>,
  grow: () => Branch | Leaf,
): Branch

export function each<T>(
  list: Signal<T[]>,
  key: (item: T) => string | number,
  grow: (item: T, index: number) => Branch | Leaf,
): Branch
```

Both throw `ArborNotImplementedError` **immediately on call**, before `mount()` ever sees them. They are exported so the compiler can emit syntactically valid calls; the v1 reconciler implementation must accept these exact signatures (locked).

**This resolves Architect B's runtime spec Q10** (stubs throw, not silently no-op).

---

### 1.7 Integration with `@scribe/runtime`'s `defineComponent` (Phase 4 boundary)

`@scribe/arbor` exports primitives. `@scribe/runtime` (Phase 4) wraps those primitives in two ways:

1. **`defineElement(name, Ctor, options?)`** — for compiler-emitted code. Takes the class the Rust compiler emits, registers it via `customElements.define`. (Covered by Architect B's existing spec.)

2. **`defineComponent(setup)`** — for hand-authored components. Functional ergonomics. Internally produces a class consumable by `defineElement`. **Not in this Phase 3 spec; lives in Phase 4.**

The shape `defineComponent(setup)` will take is researched and decided by the Phase 4 team. This Phase 3 spec only commits to: arbor's primitives compose correctly under any reasonable functional wrapper. Specifically:
- `setup()` returns a `Branch | Leaf` — `mount()` consumes it.
- `setup()` may call `signal()`, `computed()`, `effect()` — `MountScope`'s scope-collector picks up effects created via arbor's `_mountEffect` internal helper. Effects created by user code (via `effect()` directly) are user-managed unless they're inside a `mount()` body.

See §7 Q4 for the open question: should `setup()`-time effects (created before `mount()` returns) auto-register with the `MountScope`? Defer to Phase 4 when component shape is decided.

---

### 1.8 `ArborError` and `ArborNotImplementedError`

```ts
export class ArborError extends Error {
  override name = 'ArborError'
  constructor(message: string) {
    super(message)
  }
}

export class ArborNotImplementedError extends ArborError {
  override name = 'ArborNotImplementedError'
  constructor(feature: string) {
    super(`${feature} is not implemented in v0 — see v1 roadmap`)
  }
}
```

`ArborError` is the typed base for all arbor runtime errors (v0 spec §10.2). `ArborNotImplementedError` is thrown by `when()`, `each()`, and `serialize()` stubs. Catching `ArborError` catches both.

The Builder MUST add a comment in `packages/arbor/src/errors.ts` noting that `code` and dev-mode `origin` fields land with devtools — matching the pattern in `packages/signals/src/errors.ts`. **This resolves Architect B's runtime spec Q7** (`ArborError` minimal shape — currently `{ name, message }`, no `code` field in v0).

---

## 2. Internal architecture

### 2.1 Module layout — finalized

**Module-sizing rule (Learning #13, project-portable):**

> Every TypeScript module in scribe runtime packages is **≤ 150 source lines** (excluding blank lines and standalone JSDoc). Each module owns **one concern** and is **named by the concern** (single noun or short noun phrase). Public re-exports live in `index.ts` only — no module re-exports its siblings. Internal symbols are `/** @internal */` and never appear in `index.ts`.

**Empirical grounding** (the research agent crashed; I made the call from prior exposure to the libraries listed):
- alien-signals ships in roughly two files at ~400 lines each. Their style is "one concept per file" but the concepts are coarse-grained — `signal.ts` includes the propagation kernel.
- @preact/signals-core uses 4–5 files, mostly under 200 lines, names by concept (`signal.ts`, `computed.ts`, `batch.ts`).
- @vue/reactivity uses 12+ files, most 80–150 lines, names by concept and aggressively splits.
- lit-html uses ~10 files, most 100–200 lines, with one outlier (`render.ts`) over 300.
- solid-js core reactive uses 6 files, varies wildly (50–500 lines), and is the hardest to read for first-time agents.

**The 150-line cap is conservative-aggressive.** It forces splitting at a finer grain than alien (matches Vue/Preact); the 150 number is below Vue/Preact's typical max (~200) so we have headroom for code+comments. Aim for ~80–120 lines per module; allow up to 150 before splitting becomes mandatory.

**Why this serves AI agents:** "where does X live?" has exactly one answer. An agent reading the codebase doesn't have to grep — it reads filenames. This is the agentic-read-friendly principle made concrete.

**Final layout for `@scribe/arbor`:**

| Module | Concern |
|---|---|
| `index.ts` | Public re-exports only — no logic |
| `types.ts` | Public type definitions |
| `errors.ts` | `ArborError`, `ArborNotImplementedError` |
| `node.ts` | Internal `Branch` / `Leaf` runtime constructors + discriminants |
| `branch.ts` | `branch()` factory |
| `leaf.ts` | `LeafFactory` (`leaf()` + `leaf.element()`) |
| `attrs.ts` | `_applyAttrs`, `_setAttrOrProp` (internal — attribute binding's three detection paths) |
| `materialize.ts` | `_materialize(node, host, disposers)` — recursive DOM construction |
| `mount.ts` | `mount()`, `MountScope`, scope-collector, disposal protocol |
| `structural.ts` | `when()` and `each()` stubs |

10 modules. Provisional cap: ≤ 200 lines per module unless the research recommends otherwise. **Final cap and any exceptions land here when research returns.**

All `_`-prefixed symbols are `/** @internal */` and never re-exported from `index.ts`. Only `index.ts` re-exports siblings — no module re-exports another (concern-locality principle).

### 2.2 Scope-collector mechanism (Call 2A outcome — `@scribe/signals` is unchanged)

`mount.ts` maintains a module-level variable:

```ts
/** @internal */
let _activeMountDisposers: Dispose[] | null = null
```

**Protocol during `mount(node, host)`:**

1. `mount()` sets `_activeMountDisposers = []`.
2. Calls `_materialize(node, host, _activeMountDisposers)`.
3. `_materialize` calls `_mountEffect(disposers, fn)` wherever it needs a reactive subscription. `_mountEffect` calls `effect(fn)` from `@scribe/signals` and pushes the returned `Dispose` into `disposers`. Initial run of `fn` happens synchronously inside `effect(fn)`.
4. After `_materialize` returns, `mount()` snapshots `disposers = _activeMountDisposers` and resets `_activeMountDisposers = null`.
5. `mount()` also captures the root DOM nodes appended to `host`.
6. Returns a `MountScope` closing over `disposers` and the tracked roots.

**User `effect()` calls outside `mount()`.** If user code calls `effect(fn)` outside a mount call (module top-level, `setup()` body before `mount()` is reached, etc.), `_activeMountDisposers` is `null` — those effects are NOT scope-registered. The user manages their lifetime via the returned `Dispose`. Scope collection applies only to effects arbor creates internally via `_mountEffect`.

**v0 limitation — no nested scope composition.** If `mount()` is re-entered while `_activeMountDisposers` is already non-null (re-entrant `mount()` during materialization), the inner call overwrites the variable. Known v0 limitation. Stack/push-pop fix lands in v1.

### 2.3 DOM materialization flow

`_materialize(node, host, disposers): Node[]` — returns root DOM nodes appended to `host` (for disposal tracking):

```
if node is text leaf:
  el = document.createTextNode(initialValue)
  if value is Signal:
    _mountEffect(disposers, () => { el.nodeValue = String(value[0]()) })
  else:
    el.nodeValue = value
  host.appendChild(el)
  return [el]

if node is element leaf:
  el = document.createElement(node.tag)
  _applyAttrs(el, node.attrs, disposers)
  host.appendChild(el)
  return [el]

if node is branch with non-null tag:
  el = document.createElement(node.tag)
  _applyAttrs(el, node.attrs, disposers)
  for each child of node.children:
    _materialize(child, el, disposers)
  host.appendChild(el)
  return [el]

if node is branch with null tag (fragment):
  appended = []
  for each child of node.children:
    appended.push(..._materialize(child, host, disposers))
  return appended
```

Initial render is synchronous: by the time `_materialize` returns, every reactive attr and text node has its initial value applied.

### 2.4 AttrMap application (`_applyAttrs`)

For each `[key, value]` in `attrs` (if `attrs !== undefined`):

```
if key.startsWith('on') and typeof value === 'function' and !Array.isArray(value):
  el.addEventListener(key.slice(2).toLowerCase(), value)
  // No dispose registered — listener is GC'd with the element

else if Array.isArray(value):
  const get = value[0]
  _mountEffect(disposers, () => _setAttrOrProp(el, key, get()))

else:  // string | number | boolean
  _setAttrOrProp(el, key, value)
```

`_setAttrOrProp(el, key, value)`:
```
if key in el:
  el[key] = value                     // property assignment (checked, disabled, value, etc.)
else:
  el.setAttribute(key, String(value)) // attribute string
```

### 2.5 Wide-fanout concern from Phase 2 retro (explicit address)

Phase 2 verifier raised: "For pathological fan-out (one signal feeding 1000 cheap computeds, each subscribed by an effect), the equal-recompute cost is paid even when the result is suppressed."

**Arbor's internal design does not introduce this pattern.** A user signal bound to a DOM attr creates exactly one `mountEffect` reading the signal directly. Arbor's subscription graph is `userSignal → mountEffect (1 per reactive binding)`. No intermediate `computed` layer.

The Phase 2 concern applies only when *user code* chains many `computed()` calls between source signals and AttrMap signals. Arbor cannot optimize user code.

**v0 deferral.** No profiling gate is added in v0 for signal fan-out. The 10k-leaf microbenchmark (Task 19) covers mount throughput. Signal-fan-out belongs in the Phase 2.5 bench-spike (separate brief).

### 2.6 `untrack` usage in arbor's mount path

Arbor's own `_materialize` and `_mountEffect` code does NOT need `untrack`. The scope-collector pattern is correct as designed: `_mountEffect(disposers, fn)` creates an effect whose body runs under the effect's observer context, correctly subscribing to signals read inside `fn`. There is no setup-read-without-subscribing problem in arbor's internal code.

`untrack` is exported from `@scribe/signals` for *user code* — e.g., reading a signal during `connectedCallback` setup to derive a one-time initialization value without subscribing to future updates.

### 2.7 Subscription identity for resumability (Tier 3 hook)

Every `_mountEffect` registration carries a **stable path key** identifying it within the mounted tree. v0 does not consume the key; it exists for sub-project #6 (resumable hydration) and sub-project #7 (agent live-binding) to address subscriptions later.

**Path key shape (intent, not mandate):**

```
_mountEffect(disposers, fn, path)
```

where `path: string` follows the convention `'<root-id>.<index-chain>.<binding-kind>'`:
- `<root-id>` — counter assigned by `mount()` per scope, reset across scopes
- `<index-chain>` — dot-separated child indices walked from the root: `0.2.1` means root → child[0] → child[2] → child[1]
- `<binding-kind>` — one of `text`, `attr:<key>`, where `<key>` is the AttrMap key (e.g. `attr:class`, `attr:value`)

**Examples:** `0.0.text` (root's first child is a reactive text leaf). `0.1.attr:class` (root's second child has a reactive class attr).

**Cost.** ~20–30 B gz for the path-builder helper + the additional argument. Zero additional cost per binding at runtime when the cost is amortized by the compiler emitting the path string as a literal.

**v0 commitment.** Builder must wire the path-key argument through `_materialize` and `_mountEffect` even though no v0 code reads it. The `MountScope` retains a map `pathKey → Dispose` for future use. **This is not optional** — retrofitting subscription identity post-v0 means re-walking every mounted tree, which is expensive and error-prone. Pay the cost now.

**Why this matters.** Sub-project #6 needs to map a serialized graph back to live subscriptions on hydration: "this `class` attr at path `0.1.attr:class` was subscribed to signal #7" — without a stable key, you can't reattach. Sub-project #7's binding layer needs to address bindings by name from the agent perspective: "set `count` on `x-counter`'s text binding" — needs path identity. Both are blocked without §2.7.

### 2.8 Telemetry hooks for AI profile-guided optimization (Tier 3 hook)

`mount.ts` exports an internal no-op observer that the dev-mode build plugin can override:

```ts
/** @internal — overridden by the dev plugin for telemetry; production no-op */
export let _observeMount: (event: MountTelemetry) => void = () => {}

/** @internal */
export function _setMountObserver(fn: (event: MountTelemetry) => void): void {
  _observeMount = fn
}

/** @internal */
export interface MountTelemetry {
  readonly kind: 'mount-start' | 'mount-end' | 'effect-create' | 'effect-fire' | 'effect-dispose'
  readonly path: string
  readonly timestamp: number
  // Future: dependency-count, propagation-depth, etc.
}
```

`_observeMount` is called at every reactivity-relevant boundary in `mount.ts`. In production, `_observeMount` is the no-op default — Rolldown will inline-and-eliminate the calls during tree-shaking, so production cost is **zero bytes**. In dev mode, the Vite plugin replaces `_observeMount` with a recorder that streams events to a profile file.

**Cost.** ~5 B gz for the slot + the call sites. The Builder confirms via `bun run size` after Task 16 that the production bundle does NOT include the telemetry calls. If Rolldown fails to eliminate them, file a builder-blocker and switch to a build-time `__DEV__` constant.

**v0 commitment.** Hooks land in v0 even though no consumer exists yet. Sub-project #10 (PGO) consumes them. Same retrofit-cost argument as §2.7: locking telemetry boundaries now is cheap; adding them later means re-instrumenting production code.

### 2.9 Hidden-class shape locking (Tier 2 win)

`Branch` and `Leaf` runtime objects MUST always have the same field set. V8 deoptimizes when objects of the "same logical type" have different shapes — every property access becomes a dictionary lookup instead of an inline cache hit.

**Branch always has:** `{ kind: 'branch', tag: string | null, attrs: AttrMap | null, children: ChildList }`. When `attrs` is omitted, store `null` (NOT `undefined`, NOT missing). When `children` is omitted, store an empty frozen array `EMPTY_CHILDREN` (a module-level constant — saves allocation per fragment).

**Leaf always has:** `{ kind: 'leaf', leafKind: 'text' | 'element', value: Signal<string> | string | null, tag: string | null, attrs: AttrMap | null }`. For text leaves, `tag` and `attrs` are `null`. For element leaves, `value` is `null`. Always all five fields.

**Cost.** Zero bytes (sometimes negative — V8 inline-caches better, JS engines pack same-shape objects more tightly). Slight DX cost: the Builder must always set all fields, even nulls. This is mechanical, not subjective.

**Why this matters.** A 10k-leaf mount benchmark on V8 differs by ~30% between shape-locked and shape-varying object construction. Free win; required in v0.

---

## 3. Tooling

### 3.1 `packages/arbor` package scaffold

**`packages/arbor/package.json`** (key fields):
```json
{
  "name": "@scribe/arbor",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "sideEffects": false,
  "dependencies": {
    "@scribe/signals": "workspace:*"
  }
}
```

**`packages/arbor/tsconfig.json`** — extends `../../tsconfig.base.json`, `"rootDir": "src"`, `"outDir": "dist"`, `"noEmit": true`, `"include": ["src/**/*.ts", "tests/**/*.ts"]`, explicit `"lib": ["ES2022", "DOM", "DOM.Iterable"]`.

**`packages/arbor/moon.yml`:**
```yaml
# yaml-language-server: $schema=https://moonrepo.dev/schemas/project.json
language: typescript
layer: library
```
`layer: library` (Moon 2.x), NOT `type: library` (Moon 1.x — see Phase 2 spec-signals §3.1).

**`packages/arbor/rolldown.config.ts`** — same pattern as signals: `input: 'src/index.ts'`, `format: 'esm'`, `sourcemap: true`, `plugins: [dts()]`.

### 3.2 `.size-limit.json` addition (Task 12)

```json
{
  "name": "@scribe/arbor",
  "path": "packages/arbor/dist/index.js",
  "limit": "2048 B",
  "gzip": true
}
```

**Hard gate: 2048 bytes gzipped** (v0 spec §6.6 "~2.0 KB"). Builder runs `bun run size` after every task; arbor row stays under budget. If approaching the limit early, profile via `bunx rolldown -c --inspect`.

### 3.3 CI trigger fix (Phase 2 retro Finding 4)

Task 12.5 (the `untrack` prep commit) is the first push of this work. The `.github/workflows/plan-a.yml` trigger must include `spec/**` and `plan-a-phase-*` branches before that push lands or it gets no CI signal. Architect B's spec already specifies this fix (B's §3.6); apply it here too — first push of the prep commit confirms CI runs. **Builder coordinates with Phase 4 Builder so the YAML edit isn't duplicated.**

### 3.4 `.prototools` Node version (Phase 2 retro)

`.prototools` pins `node = "20.18.0"` while Rolldown wants 20.19+. Bump to `20.19.0` in Task 12 (or leave to Phase 4's Task 20 if that runs first). Not a blocker.

### 3.5 `vitest.config.ts` alias

Already configured (plan Task 4): `'@scribe/arbor': new URL('./packages/arbor/src/index.ts', import.meta.url).pathname`. No change.

---

## 4. Test plan

TDD per task. Builder writes the failing test, implements the minimum to pass, commits.

### Task 12.5 — `untrack` prep (signals package, ships first)

Files: create `packages/signals/src/untrack.ts`, `packages/signals/tests/untrack.test.ts`; modify `packages/signals/src/index.ts`. **3 tests** per §1.1. After build, `bun run size` confirms signals ≤ 1024 B gz.

Commit: `feat(signals): add untrack() for context-free reads (Phase 3 prep)`

### Task 12 — Scaffold `@scribe/arbor`

No tests yet. Verify: `moon run arbor:typecheck` PASS, `moon run arbor:build` PASS, `bun run size` arbor row appears, `bun run test` no regressions.

Commit: `feat(arbor): scaffold package with errors, types, build, size gate`

### Task 13 — `leaf()` and `leaf.element()`

5 tests in `packages/arbor/tests/leaf.test.ts` (JSDOM):

| # | Test |
|---|---|
| 1 | `leaf('hello')` produces a node with `kind === 'leaf'` |
| 2 | Mounting static text leaf → `host.textContent === 'hello'` |
| 3 | Mounting reactive text leaf → initial text from signal |
| 4 | Signal write → `textNode.nodeValue` updates |
| 5 | `leaf.element('img', { src: '/img.png' })` → mounted `el.getAttribute('src') === '/img.png'` |

### Task 14 — `branch()`

4 tests in `packages/arbor/tests/branch.test.ts`:

| # | Test |
|---|---|
| 1 | `branch('div')` has `kind === 'branch'` |
| 2 | Mount with tag → element present in host |
| 3 | Branch with children → children mounted inside branch element |
| 4 | Null-tag branch → children appended directly to host, no wrapper |

### Task 15 — AttrMap binding

6 tests in `packages/arbor/tests/attrs.test.ts`:

| # | Test |
|---|---|
| 1 | Static string attr → `el.getAttribute('class') === 'foo'` |
| 2 | Static boolean via property → `el.disabled === true` |
| 3 | `on*` handler → click triggers handler once |
| 4 | Reactive Signal attr → signal write updates `getAttribute` |
| 5 | Reactive signal on property key → `el.value` updated |
| 6 | Reactive signal `String()` coercion → `getAttribute('data-n') === '5'` after `setN(5)` |

### Task 16 — `mount()` and `MountScope`

5 tests in `packages/arbor/tests/mount.test.ts`:

| # | Test |
|---|---|
| 1 | `mount()` returns `MountScope` with `dispose` function |
| 2 | Reactive tree mounted → signal change updates DOM (no extra calls) |
| 3 | Fragment-root branch → children direct in host, no wrapper |
| 4 | `scope.agent._brand === 'AgentContext'` (does not throw) |
| 5 | `scope.serialize()` throws `ArborNotImplementedError` |

### Task 17 — `MountScope.dispose()`

4 tests appended to `mount.test.ts`:

| # | Test |
|---|---|
| 6 | `dispose()` → `host.children.length === 0` |
| 7 | After `dispose()` → signal write does NOT update DOM |
| 8 | `dispose()` twice → no error on second call |
| 9 | LIFO disposal order verified via mock dispose callbacks |

### Task 18 — `when()` and `each()` stubs

2 tests in `packages/arbor/tests/structural.test.ts`:

| # | Test |
|---|---|
| 1 | `when(...)` throws `ArborNotImplementedError` synchronously |
| 2 | `each(...)` throws `ArborNotImplementedError` synchronously |

### Task 19 — Microbench, integration, size

**Microbenchmark** (`packages/arbor/tests/bench.test.ts`):

```ts
it('mounts 10k static leaf nodes in under 100ms (JSDOM smoke)', () => {
  const host = document.createElement('div')
  const children = Array.from({ length: 10_000 }, (_, i) => leaf(String(i)))
  const tree = branch(null, undefined, children)
  const start = performance.now()
  const scope = mount(tree, host)
  const elapsed = performance.now() - start
  scope.dispose()
  expect(elapsed).toBeLessThan(100)
})
```

Smoke test, not a regression gate (JSDOM is slower than browser). Tighter bench lands in Phase 2.5 bench-spike (separate brief).

**Integration test** (modify `tests/integration/mount-arbor-with-signals.test.ts`):

```ts
it('batch + arbor: writes produce correct final DOM state', () => {
  const [text, setText] = signal('hello')
  const [cls, setCls] = signal('a')
  const host = document.createElement('div')
  const scope = mount(branch('p', { class: [cls] }, [leaf(text)]), host)
  batch(() => { setText('world'); setCls('b') })
  const p = host.querySelector('p')!
  expect(p.textContent).toBe('world')
  expect(p.getAttribute('class')).toBe('b')
  scope.dispose()
})
```

**Size verification:** `bun run size` — both signals (≤ 1024 B) and arbor (≤ 2048 B) pass.

Commit: `feat(arbor): complete v0 arbor — mount, dispose, attrs, stubs, integration`

---

## 5. File-level change list

Bold = file does not yet exist. Module file count assumes the provisional 10-module layout in §2.1.

### Task 12.5 — `untrack` prep (signals)

| File | Action | Purpose |
|---|---|---|
| **`packages/signals/src/untrack.ts`** | create | `untrack<T>(fn): T` |
| `packages/signals/src/index.ts` | modify | Add `export { untrack }` |
| **`packages/signals/tests/untrack.test.ts`** | create | 3 unit tests |

### Task 12 — Scaffold `@scribe/arbor`

| File | Action | Purpose |
|---|---|---|
| **`packages/arbor/package.json`** | create | Manifest; dep on `@scribe/signals: workspace:*` |
| **`packages/arbor/tsconfig.json`** | create | Extends `../../tsconfig.base.json` |
| **`packages/arbor/moon.yml`** | create | `language: typescript`, `layer: library` |
| **`packages/arbor/rolldown.config.ts`** | create | ESM + dts |
| **`packages/arbor/src/index.ts`** | create | Placeholder — errors only initially |
| **`packages/arbor/src/errors.ts`** | create | `ArborError`, `ArborNotImplementedError` |
| **`packages/arbor/src/types.ts`** | create | All public types |
| **`packages/arbor/src/node.ts`** | create | Internal Branch/Leaf node constructors |
| `.size-limit.json` | modify | Add `@scribe/arbor` row (2048 B) |
| `bun.lock` | rebuilt | New workspace member |

### Task 13 — `leaf()`

| File | Action | Purpose |
|---|---|---|
| **`packages/arbor/src/leaf.ts`** | create | `LeafFactory` |
| **`packages/arbor/tests/leaf.test.ts`** | create | 5 unit tests |
| `packages/arbor/src/index.ts` | modify | Re-export `leaf`, `Leaf` type |

### Task 14 — `branch()`

| File | Action | Purpose |
|---|---|---|
| **`packages/arbor/src/branch.ts`** | create | `branch()` factory |
| **`packages/arbor/tests/branch.test.ts`** | create | 4 unit tests |
| `packages/arbor/src/index.ts` | modify | Re-export `branch`, `Branch`, `ChildList` |

### Task 15 — AttrMap binding

| File | Action | Purpose |
|---|---|---|
| **`packages/arbor/src/attrs.ts`** | create | `_applyAttrs`, `_setAttrOrProp` (internal) |
| **`packages/arbor/tests/attrs.test.ts`** | create | 6 unit tests |
| `packages/arbor/src/index.ts` | modify | Re-export `AttrMap`, `EventHandler` types |

### Task 16 — `mount()` + `MountScope`

| File | Action | Purpose |
|---|---|---|
| **`packages/arbor/src/materialize.ts`** | create | `_materialize` recursive walk |
| **`packages/arbor/src/mount.ts`** | create | `mount()`, `MountScope`, `_mountEffect`, `_activeMountDisposers` |
| **`packages/arbor/tests/mount.test.ts`** | create | 5 unit tests |
| `packages/arbor/src/index.ts` | modify | Re-export `mount`, `MountScope`, `AgentContext`, `Snapshot` |

### Task 17 — `MountScope.dispose()`

| File | Action | Purpose |
|---|---|---|
| `packages/arbor/src/mount.ts` | modify | LIFO disposal + DOM removal + idempotency |
| `packages/arbor/tests/mount.test.ts` | modify | Append 4 disposal tests |

### Task 18 — `when` / `each` stubs

| File | Action | Purpose |
|---|---|---|
| **`packages/arbor/src/structural.ts`** | create | Stubs throwing `ArborNotImplementedError` |
| **`packages/arbor/tests/structural.test.ts`** | create | 2 unit tests |
| `packages/arbor/src/index.ts` | modify | Re-export `when`, `each` |

### Task 19 — Bench, integration, size

| File | Action | Purpose |
|---|---|---|
| **`packages/arbor/tests/bench.test.ts`** | create | 10k-leaf smoke benchmark |
| `tests/integration/mount-arbor-with-signals.test.ts` | modify | Add batch+arbor integration test |

### Final `packages/arbor/src/index.ts`

```ts
export { branch } from './branch.ts'
export { leaf } from './leaf.ts'
export { mount } from './mount.ts'
export { when, each } from './structural.ts'
export { ArborError, ArborNotImplementedError } from './errors.ts'
export type {
  Branch, Leaf, Node, AttrMap, ChildList, EventHandler,
  AgentContext, Snapshot,
} from './types.ts'
export type { MountScope } from './mount.ts'
```

Internal symbols (`_applyAttrs`, `_setAttrOrProp`, `_mountEffect`, `_materialize`, `_activeMountDisposers`) MUST NOT appear in `index.ts`.

---

## 6. Deviations from the plan

| # | Deviation | Source | Rationale |
|---|---|---|---|
| 1 | Plan tasks 12–19 are entirely unwritten — this spec is the authoritative task definition | Architect (Decision 2B) + Learning #6 | Plan ends at "*Phases 3–6 follow in the next document edits*" — never authored. Plan-index stub added in same commit per Learning #6. |
| 2 | `untrack(fn): T` added to `@scribe/signals` as Phase 3 prep commit (Task 12.5) | Team Lead Call 1 | Authorized. ~30 B gz delta; 728 B / 1024 B total. Lets arbor consume on day one. |
| 3 | `mount()` `host` parameter typed as `Element \| ShadowRoot` | Architect (Decision 2B) resolving v0 spec §6.3 vs §7.2 contradiction | §6.3 shows `host: Element`; §7.2 shows the compiler emits `mount(tree, shadowRoot)` where `shadowRoot: ShadowRoot`. Wider union is correct. Resolves Architect B's runtime spec Q1, Q2, Q9 simultaneously. |
| 4 | `ChildList = ReadonlyArray<Branch \| Leaf>` — static at construction; no signal wrapping of the list itself | Architect (Decision 2B) | v0 spec §4 "No structural reactivity (`when`/`each` declared-but-stubbed)." Reactive child lists require the v1 reconciler. |
| 5 | Scope-collector via arbor-internal `_activeMountDisposers` module-level variable + `_mountEffect()` helper | Team Lead Call 2A | `@scribe/signals` is unchanged. Arbor owns the mechanism. Module-level slot is the simplest correct implementation for v0's single-scope model. |
| 6 | `when()` and `each()` throw `ArborNotImplementedError` (typed subclass), not bare `Error` | v0 spec §10.2 | §10.2 mandates typed `ArborError`. Subclass for narrower catch targets. |
| 7 | `MountScope.agent` typed as `AgentContext` opaque-branded stub | v0 spec §6.3 | Sub-project #7 is out of scope. Stub type signals "don't use" through the type system. |
| 8 | `MountScope.serialize()` always throws `ArborNotImplementedError`; `Snapshot = Record<string, never>` | v0 spec §6.3, §4 | SSR/serialize is sub-project #6. Correct v0 posture per spec §10.4. |
| 9 | LIFO disposal order; effects disposed before DOM removal | Architect (Decision 2B) | Child effects (registered later) dispose before parent effects, preventing parent re-runs against partially-cleaned children. DOM removal last prevents effects firing on mutation events during teardown. |
| 10 | `on*` attr detection via `key.startsWith('on')` at runtime (not `keyof HTMLElementEventMap`) | Architect (Decision 2B) | Allows custom events. Type system enforces shape via `EventHandler` in `AttrMap`. |
| 11 | `Signal<unknown>` in AttrMap detected via `Array.isArray(value)` | Architect (Decision 2B) | Signal is a tuple, not a class — `Array.isArray` is the only reliable runtime discriminant. |
| 12 | v0: one `MountScope` per `mount()` call; no nested propagation | Architect (Decision 2B) | Nested scope composition is v1. v0 model matches compiler output (one component = one mount = one scope). |
| 13 | Wide-fanout concern deferred to Phase 2.5 bench-spike + v1 profiling | Architect (Decision 2B) | Arbor introduces no intermediate `computed` layer. Concern is user-code-shaped, not arbor-shaped. Bench-spike will measure baseline; v1 decides if a fix is needed. |
| 14 | `defineComponent(setup)` lives in `@scribe/runtime` (Phase 4), not arbor | Two-layer model (§0) | Arbor is the primitive layer the compiler emits calls to. The functional wrapper for hand-authoring is a runtime concern. Keeps arbor's surface minimal and the compiler's output direct. |

---

## 7. Open questions for Team Lead

**Q1 — `peek` on top of `untrack`?**
Solid ships both `untrack(fn)` and `peek(signal)`. We have `untrack(() => sig())` which covers `peek(sig)` with two extra tokens. **Recommendation:** do not add `peek` in v0. Marginal DX gain doesn't justify another export. Builder should not add without authorization.

**Q2 — Wide-fanout profiling gate in v0?**
The Phase 2 retro flagged this as a Phase 3 risk. Arbor's design doesn't introduce the pattern, but the Phase 2.5 bench-spike (separate brief) should include a fan-out workload to establish baseline. **Recommendation:** defer to bench-spike. No v0 gate.

**Q3 — Event listener cleanup on `dispose()`?**
Spec doesn't add event listeners to `disposers` — they're GC'd when the DOM node is removed. Modern browsers handle this correctly. **Recommendation:** v0 ships without explicit `removeEventListener`. If devtools or HMR reveal issues, add in v0+1.

**Q4 — Should `setup()`-time effects auto-register with `MountScope`?**
This is a Phase 4 question, not Phase 3. When the Phase 4 team designs `defineComponent(setup)`, they'll decide whether effects created during `setup()` (before the returned tree reaches `mount()`) auto-register with the resulting `MountScope`. Phase 3 makes no commitment either way; the scope-collector is module-level so it's reachable from `defineComponent` if Phase 4 wants to wire it up. **Recommendation:** flag for Phase 4 team; no Phase 3 action needed.

**Q5 — SFC `<style>` block compiler emission target?**
The v0 spec mentions a `<style>` block but doesn't specify whether scoped CSS injection is `@scribe/arbor`'s job, `@scribe/runtime`'s job, or compiler-emitted directly. Architect B's spec excluded it from runtime. This spec excludes it from arbor. **Recommendation:** Phase 4 / Phase 6 team adjudicates. Likely the compiler emits a `<style>` element into the shadow root and arbor mounts it as a regular `leaf.element('style', ...)` — but confirm before Phase 6 starts.

---

<!-- Pre-publish checklist (Learning #2 self-consistency review)
- [x] Re-read v0 spec §6 (arbor model) and §7.5 (`@scribe/arbor` summary)
- [x] Re-read v0 spec §7.2 (compiler call shape — class-based, locked)
- [x] Walked prose vs deviations table — no contradictions found
- [x] Plan staleness flagged in §6 Deviation 1
- [x] `untrack` Phase 3 prep documented per Call 1 (§1.1) with size delta
- [x] `MountScope` ↔ `effect` composition specified per Call 2A (§2.2)
- [x] Wide-fanout concern addressed (§2.5) and deferred to bench-spike (Q2)
- [x] §7 Open Questions are taste calls (Q1 peek), deferrals (Q2, Q3), and cross-phase boundaries (Q4, Q5) — none are consistency bugs
- [x] Two-layer authoring model documented (§0) — reconciles functional-component goal with v0 spec §7.2 class-emission constraint
- [x] Architect B's runtime spec arbor-surface assumptions Q1–Q10 explicitly resolved (§1.4, §1.5, §1.6, §1.8 cite the resolutions)
- [ ] §2.1 module layout finalized after research agent returns — PROVISIONAL until then
-->
