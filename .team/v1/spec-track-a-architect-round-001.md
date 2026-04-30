# Track A Architect Decisions — Round 001

**Date:** 2026-04-30
**Plans:** 4.2 (Error boundaries), 1.1 (Reconciler), 1.2 (Component props)
**Status:** DECISIONS FINAL — awaiting Builder dispatch
**Branch convention:** `feat/track-a-*`
**Prerequisite:** `main` at commit `79e86a6` (phase0 agent-readiness verifier corrections)

**Anchor documents read:**
- `.team/phase-3/spec-arbor.md` — authoritative arbor spec (Tasks 12–19, shipped)
- `.team/phase-4/spec-runtime.md` — authoritative runtime spec (Tasks 20–22, shipped)
- `packages/arbor/src/mount.ts`, `structural.ts`, `materialize.ts`, `node.ts`, `attrs.ts`, `errors.ts`, `types.ts`
- `packages/runtime/src/define-element.ts`, `define-component.ts`, `types.ts`, `index.ts`
- `.size-limit.json` — current limits: arbor ≤ 2048 B gz, runtime ≤ 1024 B gz
- **Measured current sizes (2026-04-30):** arbor dist = 1329 B gz (~719 B headroom), runtime dist = 504 B gz (~520 B headroom)

---

## 1. Plan 4.2 — Error Boundary Design

### 1.1 Attachment mechanism

**Decision:** `onError` is an optional third parameter to `mount()`, making it part of `MountScope`'s creation context.

**Signature change:**
```typescript
export function mount(
  node: Node,
  host: Element | ShadowRoot,
  options?: MountOptions,
): MountScope
```

where:
```typescript
export interface MountOptions {
  onError?: ErrorHandler
}
```

**Rationale:** Three alternatives were considered:

- **Parameter to `mount()` (chosen):** `mount()` already controls the lifecycle of every reactive subscription in the scope. Passing `onError` at creation time means the handler is installed before any effect runs — there is no window between "scope created" and "scope has error handler." It requires zero new API surface on `MountScope` itself. The `MountOptions` interface extends cleanly to future `onError` + other options (e.g. a v1 hydration `key` field) without breaking existing call sites. Existing `mount(node, host)` calls are unaffected — `options` is optional.

- **Method/setter on `MountScope`:** Rejected. The scope is returned after materialization. An error during initial synchronous `_materialize` would fire before the caller could attach a handler. Requires a two-phase init (create scope, then set handler) that is error-prone.

- **Separate wrapper function** (e.g. `withErrorBoundary(node, handler)`): Rejected. A wrapper function that produces a decorated node would either need to change the `Node` type (breaking the hidden-class shape-locking invariant from spec §2.9) or require `_materialize` to understand wrapper nodes, which adds significant complexity.

**Size:** `MountOptions` is a type-only interface (zero bytes at runtime). The `onError` field is `| undefined` — checked via a single `options?.onError` reference.

---

### 1.2 Callback signature

**Decision:** Full signature, implemented as notify-only in Plan 4.2, fallback rendering activated in Plan 1.1.

```typescript
export type ErrorHandler = (error: unknown, path: string) => Node | void
```

- In Plan 4.2: the return value is **ignored**. If `onError` returns a `Node`, it is stored but not materialized. No dependency on `_materialize` for fallback rendering in this plan.
- In Plan 1.1: when `onError` returns a `Node`, `_materialize` is called with that node to replace the failed subtree in place using the DOM anchor mechanism (§2.2).

**Rationale:** Designing the full signature now locks the public API contract once. Changing from `(error: unknown) => void` to `(error: unknown, path: string) => Node | void` in a later plan would be a breaking change for any consumer that cached `ErrorHandler` types. The path argument is already available in every call site (every `_mountEffect` has a path string per spec §2.7). The return value is `Node | void` — `void` means "notify only, no fallback"; returning a `Node` signals "replace with this fallback tree." Plan 4.2 treats all returns as `void` — a one-line guard `if (result !== undefined) { /* stub: fallback rendering in Plan 1.1 */ }`.

---

### 1.3 Error scope

**Decision:** `onError` catches **both** (a) synchronous errors thrown during initial `mount()` materialization and (b) errors thrown inside reactive effects after mount.

**Rationale:** These two cases are not distinguishable from the user's perspective — both produce a broken subtree. Catching only one would produce surprising asymmetry: a reactive text node that throws on first render (during mount) would be uncaught, but the same signal update throwing after mount would be caught. Unified handling is simpler and more correct.

**Implementation for Plan 4.2:**

- **Initial materialization errors:** `mount()` wraps its `_materialize` call in `try/catch`. If `_materialize` throws and `options?.onError` is defined, the error is passed to the handler (with path = `pathBase`). If no handler, rethrow. If the handler returns a `Node`, store it (stub — not materialized until Plan 1.1).

- **Reactive effect errors:** `_mountEffect` wraps the effect body in `try/catch`. If the effect throws during any run (initial or subsequent) and `onError` was supplied to the parent `mount()`, the error is passed to the handler. The effect is then disposed (unsubscribed) to prevent further throws from the same reactive binding.

  Implementation: `_mountEffect` receives the `onError` handler via a new parameter `errorHandler?: ErrorHandler`. `mount.ts` passes `options?.onError` down through `_materialize` → `_mountEffect`. The `attrs.ts` `MountEffectFn` type gains the optional parameter.

---

### 1.4 Propagation model

**Decision:** Errors bubble to the nearest ancestor scope that has an `onError` handler. Scopes without a handler re-throw (letting the error propagate to the next outer `mount()` scope, or to the browser's uncaught-error handler if no scope has one).

**v0 implementation detail:** In v0, `mount()` calls are independent (spec §1.5 §2.2 — "No nested scope composition"). There is no parent-child scope tree to walk. Bubbling is achieved by the re-throw behavior: if `mount()` is called within an outer `mount()` call's effect body (the user manually called `mount()` inside a reactive effect), and the inner mount has no `onError`, the error propagates up to the effect's catch layer, which belongs to the outer scope's `_mountEffect`. If the outer scope has an `onError`, it catches it there.

In Plan 1.1 when nested scopes are introduced for `when()`/`each()`, child scopes explicitly reference the parent scope's `onError` as a fallback. The design here is forward-compatible: each scope stores `ErrorHandler | undefined`. When a child scope has no handler, it calls the parent's handler if available.

---

### 1.5 Runtime coupling

**Decision:** `defineComponent`'s `connectedCallback` does NOT need to explicitly wire `onError`. The `onError` mechanism is entirely inside `mount()`. If a component author wants error boundaries, they pass `onError` in the third argument to `mount()` in their `connectedCallback`. `defineComponent` gains an optional `onError` field in its options object (Plan 1.2 extends this — see §3.3).

**Rationale:** `defineComponent` is a thin wrapper that calls `mount(tree, host)`. Adding `onError` to `defineComponent`'s API means `defineComponent` must forward it to `mount()` — which is exactly what passing it to `mount(tree, host, { onError })` does. The coupling is additive and transparent. `defineComponent` does not need special knowledge of error boundaries beyond passing through the option.

---

### 1.6 TypeScript interface

New and changed types in `packages/arbor/src/`:

```typescript
// packages/arbor/src/types.ts — ADD these:

/**
 * Error handler for a mount scope. Receives the thrown value and the
 * path key of the binding that threw (spec §2.7 format).
 *
 * Return a Node to replace the failed subtree (active in Plan 1.1).
 * Return void for notify-only behavior (Plan 4.2 implementation).
 */
export type ErrorHandler = (error: unknown, path: string) => Node | void

/**
 * Options for mount(). All fields are optional; omitting options is
 * identical to passing {}.
 */
export interface MountOptions {
  /** Error boundary handler. See ErrorHandler. */
  onError?: ErrorHandler
}
```

Changed type in `packages/arbor/src/attrs.ts`:

```typescript
// MountEffectFn gains an optional errorHandler parameter:
export type MountEffectFn = (
  disposers: Dispose[],
  fn: () => void,
  path: string,
  errorHandler?: ErrorHandler,
) => void
```

Changed signature in `packages/arbor/src/mount.ts`:

```typescript
// mount() gains the options parameter:
export function mount(
  node: Node,
  host: Element | ShadowRoot,
  options?: MountOptions,
): MountScope
```

`_mountEffect` gains an `errorHandler` parameter and wraps the effect body:

```typescript
export function _mountEffect(
  disposers: Dispose[],
  fn: () => void,
  path: string,
  errorHandler?: ErrorHandler,
): void {
  _observeMount({ kind: 'effect-create', path, timestamp: Date.now() })
  const dispose = effect(() => {
    _observeMount({ kind: 'effect-fire', path, timestamp: Date.now() })
    if (errorHandler !== undefined) {
      try {
        fn()
      } catch (err: unknown) {
        errorHandler(err, path)
        // Dispose this effect to prevent repeated throws from the
        // same binding. LIFO cleanup happens naturally; this effect
        // removes itself from the disposers array via the dispose ref.
        dispose()
      }
    } else {
      fn()
    }
  })
  // Note: when errorHandler disposes from within the effect body,
  // the dispose reference is already captured. Calling dispose() inside
  // the effect is safe in @scribe/signals' effect model (idempotent).
  disposers.push(() => {
    _observeMount({ kind: 'effect-dispose', path, timestamp: Date.now() })
    dispose()
  })
}
```

`_materialize` passes `errorHandler` through to every `mountEffect` call — its signature gains `errorHandler?: ErrorHandler` after `mountEffect`.

`_applyAttrs` similarly gains `errorHandler?: ErrorHandler` as a final parameter, passed through to each `mountEffect` call.

**Updated exports from `packages/arbor/src/index.ts`:**

```typescript
export type { ..., MountOptions, ErrorHandler } from './types.ts'
```

---

### 1.7 Size estimate

**`@scribe/arbor` additions:**

| Addition | Estimated gz delta |
|---|---|
| `ErrorHandler` and `MountOptions` types (erased at build) | 0 B |
| `options?: MountOptions` parameter + `options?.onError` reads in `mount()` | ~35 B |
| `errorHandler?: ErrorHandler` parameter + try/catch in `_mountEffect` | ~80 B |
| Passing `errorHandler` through `_materialize` and `_applyAttrs` call sites | ~25 B |
| **Total arbor delta** | **~140 B** |

Current arbor gz: 1329 B. After Plan 4.2: ~1469 B. Budget: 2048 B. **Headroom remaining: ~579 B.**

**`@scribe/runtime` additions:**

None in Plan 4.2. `defineComponent` does not change (error handling is purely opt-in at `mount()` call time).

---

## 2. Plan 1.1 — Reconciler Design

### 2.1 ChildScope type

**Decision:** Option B — a lightweight dedicated type, NOT a recursive `MountScope`.

```typescript
// packages/arbor/src/structural.ts — new internal type

/** @internal */
export interface ChildScope {
  /** DOM comment anchor that marks the position of this child scope in the parent. */
  readonly anchor: Comment
  /** All disposers for effects owned by this child scope. LIFO on teardown. */
  readonly disposers: Dispose[]
  /**
   * For each() scopes: the key string/number that identifies this item.
   * For when() scopes: the string 'true' (only one branch can be active).
   */
  readonly key: string | number
  /**
   * Root DOM nodes materialized by this scope. Removed from the DOM on
   * teardown, immediately before the anchor is removed.
   */
  appendedNodes: globalThis.Node[]
}
```

**Rationale for Option B over Option A (recursive `MountScope`):**

- `MountScope` is the public-facing type. Re-entering `mount()` for each child would: (a) increment `_rootIdCounter` unnecessarily; (b) apply the v0 re-entrant overwrite bug to `_activeMountDisposers` (the known limitation documented in spec §2.2); (c) expose a public `agent` / `serialize()` API on every list item, which is semantically wrong. Child scopes are internal implementation details of `when()`/`each()`, not independently inspectable scopes.
- `ChildScope` is lean: only 4 fields. The anchor comment is co-located with the disposers and appended nodes, which is the only state needed for create/destroy/reorder operations.
- `MountScope.dispose()` can delegate to child scope teardown without the API surface mismatch.

**Teardown protocol for a `ChildScope`:**
1. Dispose effects in `disposers` array, LIFO order.
2. Remove each node in `appendedNodes` from its parent (the `anchor.parentNode`).
3. Remove the `anchor` comment node from its parent.

---

### 2.2 DOM anchor mechanism

**Decision:** `when()` and `each()` each insert **one** `Comment` anchor node during `_materialize`, before any child content. The comment is inserted by `_materialize` (not by the `when()`/`each()` factory at call time), because `_materialize` is the only place with access to the live DOM `host`.

**Comment text:** `<!--when-->` for `when()` anchors; `<!--each-->` for `each()` anchors.

**Rationale:**
- A `Comment` node is the standard mechanism for stable DOM position markers (used by React, Vue, Solid, Lit). It survives DOM manipulation by sibling additions/removals and is invisible to layout.
- Inserting in `_materialize` (not at `when()`/`each()` call time) is required because `when()`/`each()` return a `Node` value that describes intent — they are called before `mount()` and have no access to a live `host`. `_materialize` is the DOM-writing phase and is where all DOM node creation already lives.
- The comment text serves as a debug label. `<!--when-->` vs `<!--each-->` helps distinguish boundary types in DevTools without any runtime overhead.

**`_materialize` new case (structural node):**

When `_materialize` encounters a node with `kind: 'structural'` (see §2.6), it:
1. Creates `document.createComment(node.structuralKind)` (i.e. `'when'` or `'each'`).
2. Appends the comment to `host`.
3. Registers the reactive effect for the structural node, wiring the signal subscription via `_mountEffect` to the reconciler update function (§2.4 / §2.3's `when`-effect / §2.4's `each`-effect).
4. Returns `[commentNode]` as the root DOM node for the outer scope's disposal tracking.

On outer `MountScope.dispose()`: the comment node is removed along with the structural node's `appendedNodes` from each active `ChildScope`.

---

### 2.3 Push-pop stack fix

**Decision:** Replace the module-level single slot with a stack (array used as a stack via push/pop).

**Before (current `packages/arbor/src/mount.ts`):**
```typescript
let _activeMountDisposers: Dispose[] | null = null
```

**After:**
```typescript
/** @internal */
const _mountDisposersStack: Array<Dispose[]> = []

/** @internal — current active disposers array, or null if no mount in progress */
function _currentMountDisposers(): Dispose[] | null {
  return _mountDisposersStack.length > 0
    ? (_mountDisposersStack[_mountDisposersStack.length - 1] ?? null)
    : null
}
```

**Push/pop protocol:**

```typescript
// In mount() — before _materialize:
_mountDisposersStack.push(disposers)
try {
  appendedRoots = _materialize(node, host, disposers, pathBase, _mountEffect)
} finally {
  _mountDisposersStack.pop()
}
```

**When `when()`/`each()` create child scopes inside a reactive effect (which runs inside a parent `_mountEffect` call), the parent's disposers array is already on the stack.** The child scope materializes its subtree by pushing a fresh `ChildScope.disposers` array, materializing into it, and popping. The parent's array is restored by the finally-pop of the parent `mount()` call. Nesting is safe.

**Backward compatibility:** The existing `_activeMountDisposers` name is replaced entirely. The new `_currentMountDisposers()` function provides the same read semantics for any future internal caller that needs to inspect the active scope. This is an internal symbol (never exported from `index.ts`) so there is no public API break.

**Size impact:** The stack replaces a single variable with a small array + two push/pop calls. Net gz delta: ~20 B (the const array declaration + push/pop overhead).

---

### 2.4 `each()` keyed diff algorithm

The following is the complete step-by-step algorithm the Builder implements. No further decisions are deferred.

**State tracked per `each()` structural node** (on the reactive effect's closure):

```typescript
// Mutable map keyed by item key, value is the active ChildScope
let activeScopes: Map<string | number, ChildScope> = new Map()
```

**On every signal update (and on initial mount), execute:**

1. **Read new list.** Call `list[0]()` (the signal getter) inside the reactive effect to subscribe. Let `newItems = list[0]()`.

2. **Build new key set.** For each item in `newItems`, compute `keyFn(item)` → `string | number`. Let `newKeys: Array<string | number>` be the ordered array of keys for the new list. Let `newKeySet = new Set(newKeys)`.

3. **Identify removed keys.** For each `key` in `activeScopes` that is NOT in `newKeySet`: call `_teardownChildScope(scope)` (dispose effects LIFO, remove `appendedNodes` from DOM, remove anchor), then delete from `activeScopes`.

4. **Identify added keys.** For each `key` in `newKeySet` that is NOT already in `activeScopes`: create a new `ChildScope` for this item (see step 5).

5. **Create new child scopes.** For each new key (in `newKeys` order):
   - Create `anchor = document.createComment('each-item')`. Do NOT insert yet.
   - Create `childDisposers: Dispose[] = []`.
   - Call `grow(item, index)` to get the child tree (`Branch | Leaf`).
   - Push `childDisposers` onto `_mountDisposersStack` (see §2.3).
   - Call `_materialize(childTree, anchorParent, childDisposers, childPath, _mountEffect)` where `anchorParent` is the `host` (the `anchor.parentNode` at insertion point — see step 6 for how to find it).
   - Pop `_mountDisposersStack`.
   - Create `ChildScope { anchor, disposers: childDisposers, key, appendedNodes }` and insert into `activeScopes`.

6. **DOM reorder pass.** After all teardowns and creates, reorder the DOM to match `newKeys` order:
   - Walk `newKeys` in order. For each key, get the `ChildScope`.
   - The reference point is the `each()` structural anchor comment (the `<!--each-->` comment created in §2.2, which is the static anchor for the whole list).
   - Use `insertBefore` to position each child scope's anchor (and its appended nodes) in the correct order relative to the structural anchor. The invariant: after this pass, all active child scopes appear in `newKeys` order immediately after the `<!--each-->` comment in the DOM.
   - **Mechanism:** walk `newKeys` in reverse order, inserting each scope's anchor before the `structural anchor's nextSibling` (or before the next scope's anchor). This requires one `insertBefore` call per scope, including existing scopes that may need reordering.
   - For scopes whose DOM position is already correct, `insertBefore` is a no-op (browser skips the move). No need for a "positions unchanged" fast path in v1 — correctness first.

7. **Update indices.** After the reorder pass, `index` values in `grow(item, index)` are correct because we pass the index from `newItems.indexOf(item)` (i.e., the new position in `newItems`) when creating new scopes.

**Disposal order for removed scopes (step 3):**
- Effects are disposed LIFO within the child scope's `disposers` array.
- All removed scopes are torn down before new scopes are created (prevents "flash" of old + new content simultaneously).

**Batching:** All reconciliation happens synchronously within the reactive effect. The effect fires once per signal change (or once per `batch()` flush for batched writes). No asynchronous batching is introduced.

**Key uniqueness invariant:** Duplicate keys within a single list render are a user error. The Builder adds a `DEV`-mode assert: `if (process.env.NODE_ENV !== 'production' && newKeySet.size !== newItems.length) throw new ArborError('each(): duplicate keys detected')`. Production builds tree-shake this guard.

---

### 2.5 Path key extension

**Current v0 format:** `<rootId>.<index-chain>.<binding-kind>`

**Extension for structural children:**

| Context | Path format | Example |
|---|---|---|
| `when()` — condition binding | `<rootId>.<index-chain>.conditional` | `0.2.conditional` |
| `when()` — true branch child | `<rootId>.<index-chain>.conditional.true.<sub-chain>.<kind>` | `0.2.conditional.true.0.text` |
| `each()` — list effect binding | `<rootId>.<index-chain>.list` | `0.3.list` |
| `each()` — item child (keyed) | `<rootId>.<index-chain>.list.<key>.<sub-chain>.<kind>` | `0.3.list.foo.0.attr:class` |

**Rules:**
- The structural anchor node's path is the base (e.g. `0.2`). The `.conditional` or `.list` suffix identifies the reactive effect that owns the condition/list signal subscription.
- Child scopes extend the base path with `.conditional.true` (for when) or `.list.<key>` (for each), followed by the child's normal index-chain and binding-kind.
- Keys that are numbers are stringified: key `42` → path segment `42`.
- Keys must not contain `.` characters. If a user provides a key containing `.`, the Builder adds a DEV-mode warning and replaces `.` with `_` in the path string only (the original key is unaffected for reconciliation logic).
- `when()` only has a `true` sub-scope (no `false` branch in v1 — see §2.6). If a `false` branch is added in a later plan, it would be `conditional.false.<sub-chain>`.

---

### 2.6 Return type / `_materialize` interface

**Decision:** `when()` and `each()` return a new `kind: 'structural'` node. `_materialize` gains a new case for this kind. `ChildList` is extended to include `StructuralNode`.

**New node type in `packages/arbor/src/types.ts`:**

```typescript
export interface StructuralNode {
  readonly kind: 'structural'
  readonly structuralKind: 'conditional' | 'list'
  /** For 'conditional': the Signal<boolean> condition */
  readonly condition: Signal<boolean> | null
  /** For 'conditional': the grow function for the true branch */
  readonly grow: (() => Node) | null
  /** For 'list': the Signal<unknown[]> list */
  readonly list: Signal<unknown[]> | null
  /** For 'list': the key extractor function */
  readonly keyFn: ((item: unknown) => string | number) | null
  /** For 'list': the per-item grow function */
  readonly listGrow: ((item: unknown, index: number) => Node) | null
}
```

**Discriminated union update:**

```typescript
// types.ts
export type Node = Branch | Leaf | StructuralNode
export type ChildList = ReadonlyArray<Branch | Leaf | StructuralNode>
```

**`when()` and `each()` factory signatures (unchanged externally):**

```typescript
// structural.ts — replaces the throwing stubs
export function when(
  condition: Signal<boolean>,
  grow: () => Branch | Leaf,
): StructuralNode {
  return {
    kind: 'structural',
    structuralKind: 'conditional',
    condition,
    grow: grow as () => Node,
    list: null,
    keyFn: null,
    listGrow: null,
  }
}

export function each<T>(
  list: Signal<T[]>,
  key: (item: T) => string | number,
  grow: (item: T, index: number) => Branch | Leaf,
): StructuralNode {
  return {
    kind: 'structural',
    structuralKind: 'list',
    condition: null,
    grow: null,
    list: list as Signal<unknown[]>,
    keyFn: key as (item: unknown) => string | number,
    listGrow: grow as (item: unknown, index: number) => Node,
  }
}
```

**Return type alignment with locked public signatures:** The existing stubs in `structural.ts` declare return type `Branch`. `StructuralNode` is a new kind — it is NOT `Branch`. The public signatures must change their return type annotation from `Branch` to `StructuralNode`. This is a breaking change on the stub's declared return type but NOT a behavioral break — the stubs currently always throw, so no consumer can have a compiled program that depended on the `Branch` return type from `when()`/`each()`. The Builder updates both the implementation and the `ChildList` type to include `StructuralNode`.

**`_materialize` new case:**

```typescript
// In _materialize, add after the existing Branch/Leaf cases:
if (node.kind === 'structural') {
  return _materializeStructural(node, host, disposers, pathBase, mountEffect, errorHandler)
}
```

`_materializeStructural` is a new internal function in `structural.ts` (not `materialize.ts` — the concern belongs to the reconciler). It:
1. Creates and appends the `Comment` anchor.
2. If `structuralKind === 'conditional'`: registers a `_mountEffect` for the condition signal; the effect calls `_reconcileConditional(...)`.
3. If `structuralKind === 'list'`: registers a `_mountEffect` for the list signal; the effect calls `_reconcileList(...)`.
4. Returns `[anchorComment]`.

**Hidden-class shape locking for `StructuralNode`:** All fields are always present (using `null` for unused union arms), per spec §2.9 pattern.

---

### 2.7 Size estimate

**`@scribe/arbor` additions for Plan 1.1:**

| Addition | Estimated gz delta |
|---|---|
| `StructuralNode` type interface (type-erased) | 0 B |
| `when()` / `each()` factory implementations (replacing throw stubs) | ~60 B |
| `_materializeStructural` + `_reconcileConditional` in `structural.ts` | ~200 B |
| `_reconcileList` + `_teardownChildScope` + `ChildScope` type in `structural.ts` | ~280 B |
| Push-pop stack fix in `mount.ts` (§2.3) | ~20 B |
| Path key extension through `_materialize` call sites | ~15 B |
| **Total Plan 1.1 delta** | **~575 B** |

Post-4.2 arbor gz: ~1469 B. After Plan 1.1: ~2044 B. Budget: 2048 B. **Headroom: ~4 B — extremely tight.**

**The Builder MUST run `bun run size` after every Plan 1.1 task.** If the budget is exceeded at any point:
1. First optimization target: `_reconcileList` — the diff algorithm prose is written for clarity; the implementation can fold the "removed keys" and "new keys" passes into a single `Map` traversal.
2. Second target: share the `_teardownChildScope` logic between `when` and `each` (one function, not two).
3. Third target: use property mangling (already proven viable in bench/arbor per round-n1) on internal `ChildScope` field names.
4. If still over: file a builder-blocker and the Director will review the size budget. Do NOT silently exceed the limit.

---

## 3. Plan 1.2 — Component Props Design

### 3.1 Props declaration mechanism

**Decision:** Option A — `attrs` field on the options object passed to `defineComponent`.

```typescript
defineComponent({
  tag: 'x-counter',
  attrs: ['count', 'label'] as const,
  setup(ctx) { ... }
})
```

**Rationale:**

- **Backward compatibility (critical):** The existing `defineComponent(setup: Setup)` call sites use the function-only form. The new overload is `defineComponent(options: ComponentOptions)`. TypeScript resolves the overload: if the argument is a function, use the existing `Setup` path; if it's an object, use the new `ComponentOptions` path. No existing call site breaks. The Builder adds a TypeScript overload, not a replacement.

- **Runtime cost:** The `attrs` array is the `observedAttributes` static value — it's already needed as a string array for the browser API. There is zero additional runtime cost compared to Option B (generic type parameter) or Option C (separate function). Option B has zero runtime cost too, but no way to infer the attr names without an explicit array somewhere. Option C requires a separate public function, adding ~30 B gz for the second export name.

- **TypeScript inference quality:** `['count', 'label'] as const` gives a `readonly ['count', 'label']` tuple. TypeScript can narrow `ctx.attrs.count` to `Signal<string>` when the `attrs` array is `as const`. This is equivalent quality to Option B without the type parameter overhead at the call site.

- **Size budget:** The options object form adds one function overload resolution (type-erased) and one `attrs` field read (the array is passed straight through to `observedAttributes`). Net runtime cost: ~0 B.

**`defineComponent` signature (updated to support both forms):**

```typescript
// types.ts additions

export interface ComponentOptions<A extends ReadonlyArray<string> = ReadonlyArray<string>> {
  /** Observed attribute names. Passed directly to static observedAttributes. */
  attrs?: A
  /** Setup function. Receives an extended SetupContext with attr signals. */
  setup: (ctx: SetupContext & AttrContext<A>) => Branch | Leaf
}

// defineComponent overloads in define-component.ts:
export function defineComponent(setup: Setup): typeof HTMLElement
export function defineComponent<A extends ReadonlyArray<string>>(
  options: ComponentOptions<A>
): typeof HTMLElement
export function defineComponent(
  setupOrOptions: Setup | ComponentOptions
): typeof HTMLElement
```

---

### 3.2 Reactivity model

**Decision:** Option B — per-attribute signal. `ctx.attrs` is a record of `Signal<string>` values, one per declared attribute name.

```typescript
// ctx.attrs.count is a Signal<string>
const Counter = defineComponent({
  attrs: ['count'] as const,
  setup(ctx) {
    const count = ctx.attrs.count  // Signal<string>
    return branch('p', {}, [leaf(count)])
  }
})
```

**Rationale:**

- **Option A (whole-record signal):** `ctx.attrs` as `Signal<Record<string, string>>` means every attribute change invalidates every consumer of the record signal, even if only one attribute changed. This is a reactivity anti-pattern — defeats fine-grained updates. Rejected.

- **Option B (per-attribute signal, chosen):** One signal per declared attribute. An attr change only invalidates effects that read that specific attr's signal. Matches the fine-grained reactivity model of `@scribe/signals`. The setup function can destructure: `const { count, label } = ctx.attrs` and pass each signal independently to arbor nodes.

- **Option C (callback):** `onAttrChange(name, value)` is an imperative callback. It does not compose with `@scribe/signals`'s reactive model — you cannot pass a callback as an `AttrMap` value. Rejected.

- **Option D (zero-runtime, types only):** Would require `attributeChangedCallback` to write to a plain reactive object, which still needs signals under the hood to propagate changes. Option D is Option B with the types hidden. Rejected for confusion.

**Signal creation:** In `connectedCallback`, `defineComponent` creates one `[signal, setSignal]` pair per declared attr name using the attr's current `getAttribute` value as the initial value (or `''` if the attribute is not present). These signals are stored on the element instance (via a `Symbol`-keyed slot) so `attributeChangedCallback` can call the appropriate setter.

**`attributeChangedCallback` wiring:**

```typescript
attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null): void {
  const setter = this[ATTR_SIGNALS_SYM]?.[name]?.[1]
  if (setter !== undefined) setter(newValue ?? '')
}
```

---

### 3.3 SetupContext extension

**Decision:** `ctx.attrs` is added as an **optional field** on `SetupContext` via intersection, not a new context type. The existing `SetupContext` interface is unchanged (no breaking change). `defineComponent` with `attrs` produces a context with `AttrContext<A>` intersected in.

```typescript
// packages/runtime/src/types.ts — ADD:

/**
 * Per-attribute signal map. Keys are the declared attr names;
 * values are Signal<string> (a readonly tuple [Read<string>, Write<string>]).
 *
 * Only present on SetupContext when defineComponent is called with
 * the options form and an `attrs` array. The intersection type
 * ensures the Setup type for options-form components is distinct
 * from the plain Setup type.
 */
export type AttrContext<A extends ReadonlyArray<string>> = {
  readonly attrs: { readonly [K in A[number]]: Signal<string> }
}

/**
 * Existing SetupContext — unchanged. Additive only.
 */
export interface SetupContext {
  readonly host: ShadowRoot | Element
  readonly element: HTMLElement
}
```

**The existing `Setup` type (`(ctx: SetupContext) => Branch | Leaf`) is unchanged.** The options-form setup function receives `SetupContext & AttrContext<A>`, which is a strict supertype of `SetupContext` — a function accepting the intersection is assignable to both.

**Consuming `Signal<string>` type in `runtime/src/types.ts`:** `Signal<string>` is imported as `import type { Signal } from '@scribe/signals'`. This is a type-only import — zero runtime cost, zero bytes in the bundle per the existing pattern.

---

### 3.4 `wrapClass` compatibility

**No changes required to `wrapClass` in `define-element.ts`.** The existing implementation uses `class Wrapped extends Ctor {}` — JavaScript prototype chain inheritance propagates `static observedAttributes` automatically. This is explicitly verified by test 4 in the Phase 4 test plan (`packages/runtime/tests/define-element.test.ts`), which already passes.

The new behavior in `defineComponent`: the returned `class Component extends HTMLElement` sets `static observedAttributes` directly on the class (not inherited — it's a fresh class definition). When `defineElement` calls `wrapClass(Component, mode)`, `Wrapped extends Component` inherits `static observedAttributes` through the prototype chain. This is the same mechanism already verified.

**One addition in `define-component.ts`:** When `attrs` is provided in `ComponentOptions`, the `Component` class sets:

```typescript
static readonly observedAttributes = attrs  // the array from options
```

This must be `static` on the class body. TypeScript class syntax supports `static observedAttributes = attrs` inside the returned class body. `wrapClass` inherits it — no change to `wrapClass` needed.

---

### 3.5 Size estimate

**`@scribe/runtime` additions for Plan 1.2:**

| Addition | Estimated gz delta |
|---|---|
| `AttrContext<A>` and `ComponentOptions<A>` types (type-erased) | 0 B |
| `defineComponent` overload resolution (types only, erased) | 0 B |
| `define-component.ts`: branch for options-form input | ~25 B |
| Signal creation loop (`attrs.map(name => signal(el.getAttribute(name) ?? ''))`) | ~60 B |
| `ATTR_SIGNALS_SYM` symbol slot + storage on element instance | ~30 B |
| `attributeChangedCallback` method on Component class | ~50 B |
| `static observedAttributes = attrs` on Component class | ~15 B |
| **Total Plan 1.2 delta** | **~180 B** |

Current runtime gz: 504 B. After Plan 1.2: ~684 B. Budget: 1024 B. **Headroom remaining: ~340 B.**

Note: this estimate assumes Signal creation uses the existing `signal()` import from `@scribe/signals`. Per spec §2.4 runtime has zero source-level value imports from `@scribe/arbor`, but `@scribe/signals` is a declared peerDependency. `_setMount` is already injected; `signal` can be imported directly since `@scribe/signals` is listed in `peerDependencies`. Alternatively, `signal` can be injected via a `_setSignal` pattern parallel to `_setMount`. **Decision: inject via `_setSignal(signal)` at app boot**, consistent with the existing `_setMount` pattern. This preserves the structural independence of `@scribe/runtime` from any build-time resolution of `@scribe/signals`.

The `_setSignal` injection adds ~15 B gz to the estimate above → revised total ~195 B. Headroom: ~325 B.

---

## 4. Builder Acceptance Criteria Updates

The `.team/v1/` directory has no existing `plan-v1-roadmap.md`. The following criteria are defined here for Plans 4.2, 1.1, and 1.2 as the authoritative acceptance gates. The Builder writes tests first (TDD), implements minimum to pass, then runs `bun run size` before committing each task.

### Plan 4.2 — Error Boundaries

**Complete when:**
- [ ] `mount(node, host, { onError: handler })` — handler is called when `_materialize` throws during initial mount (synchronous)
- [ ] `mount(node, host, { onError: handler })` — handler is called when a reactive effect throws during any effect run (initial or subsequent)
- [ ] When `onError` returns `void`, the scope continues running for other (non-throwing) bindings
- [ ] When `onError` is not provided and `_materialize` throws, the error propagates normally (no swallowing)
- [ ] After a reactive effect throws and calls `onError`, that effect is disposed (no further calls for that binding)
- [ ] `mount(node, host)` call sites (no options) are unaffected — no regression
- [ ] `bun run size` — `@scribe/arbor` ≤ 2048 B gz passes
- [ ] `bun run test` — all pre-existing tests pass; minimum 4 new tests in `packages/arbor/tests/mount.test.ts`

**New test cases (minimum 4):**

| # | Test |
|---|---|
| 1 | Synchronous throw in `_materialize` → `onError` called with the error and path |
| 2 | Reactive signal write causing effect throw → `onError` called; subsequent signal writes do not re-call `onError` |
| 3 | No `onError` provided + throw → error propagates from `mount()` call site |
| 4 | `onError` returning `void` (notify-only) → other bindings in the scope continue updating |

### Plan 1.1 — Reconciler

**Complete when:**
- [ ] `when(condition, grow)` returns a `StructuralNode` (does not throw)
- [ ] `mount()` with a tree containing `when()` — when condition is true, `grow()` result is materialized in DOM
- [ ] When condition signal flips false → previously materialized nodes are removed from DOM; child scope effects are disposed
- [ ] When condition signal flips true again → `grow()` is called again; new nodes are appended
- [ ] `each(list, key, grow)` — initial render materializes one child scope per item in correct order
- [ ] Signal update adding items → new child scopes materialized; DOM order matches new list order
- [ ] Signal update removing items → removed scopes torn down (effects disposed, DOM nodes removed)
- [ ] Signal update reordering items → DOM order matches new key order; no old scopes recreated
- [ ] `when`/`each` nested inside `mount()` — `_activeMountDisposers` stack push-pop is correct (no overwrite)
- [ ] `when` nested inside `each` child — path keys correctly extend (e.g. `0.3.list.foo.0.conditional`)
- [ ] `bun run size` — `@scribe/arbor` ≤ 2048 B gz passes (watch carefully — ~4 B headroom after 4.2)
- [ ] `bun run test` — all pre-existing tests pass; minimum 12 new tests in `packages/arbor/tests/structural.test.ts`

### Plan 1.2 — Component Props

**Complete when:**
- [ ] `defineComponent(setup)` — existing function-form call sites unchanged and passing tests
- [ ] `defineComponent({ attrs: ['count'] as const, setup })` — returns a class with `static observedAttributes = ['count']`
- [ ] `wrapClass` wraps the returned class → `observedAttributes` inherited (existing test 4 still passes)
- [ ] `attributeChangedCallback('count', null, '5')` called after connect → `ctx.attrs.count` signal reads `'5'`
- [ ] Signal returned via `ctx.attrs.count` is a valid `@scribe/signals` `Signal<string>` (can be passed to `leaf(signal)`)
- [ ] `_setSignal(signal)` must be called before any element with `attrs` connects; throws `RuntimeError` if not
- [ ] `bun run size` — `@scribe/runtime` ≤ 1024 B gz passes
- [ ] `bun run test` — all pre-existing tests pass; minimum 6 new tests in `packages/runtime/tests/define-component.test.ts`

---

## 5. Do-Not-Break Constraints

The Builder must observe these constraints derived from the existing implementation:

**From `packages/arbor/src/mount.ts`:**
1. The `_rootIdCounter` module-level counter is not reset between tests — tests must account for non-zero root IDs in path assertions, or use path-prefix matching rather than exact equality.
2. `_mountEffect`'s `disposers.push()` side effect happens synchronously during `effect()` creation (the effect runs immediately in `@scribe/signals`). Do not assume push happens after materialization.
3. The `disposed` flag on `MountScope` prevents double-dispose — the error boundary implementation must not circumvent this by calling dispose from within an effect body without checking.

**From `packages/arbor/src/materialize.ts`:**
4. `_materialize` returns `globalThis.Node[]` — the `StructuralNode` case must return `[anchorComment]` (exactly one element) for the outer scope's DOM removal to work correctly during `MountScope.dispose()`.
5. Fragment branches (`tag === null`) return N nodes (flat list from children). The reconciler's child scope teardown must handle the case where `appendedNodes` is a flat list, not a single root.

**From `packages/arbor/src/structural.ts`:**
6. The locked public signatures for `when()` and `each()` are: `when(condition: Signal<boolean>, grow: () => Branch | Leaf): ...` and `each<T>(list: Signal<T[]>, key: (item: T) => string | number, grow: (item: T, index: number) => Branch | Leaf): ...`. The return type changes from `Branch` to `StructuralNode` — this is the only permitted change to the signatures.

**From `packages/arbor/src/node.ts`:**
7. Shape-locking (spec §2.9): `StructuralNode` must always have all fields present (use `null` for unused arms). Add `StructuralNode` to the shape-lock comment in `node.ts`.

**From `packages/runtime/src/define-component.ts`:**
8. The `_setMount` injection pattern must be preserved — do not add a static import of `mount` from `@scribe/arbor`. Add `_setSignal` following the identical pattern.
9. `defineComponent(setup: Setup)` where `setup` is a function must not require any `_setSignal` call — plain function-form components do not use signals internally and should not break if `_setSignal` was never called.

**From `packages/runtime/src/define-element.ts`:**
10. `wrapClass` skips wrapping when `mode === 'none'` (returns `Ctor` directly). The `defineComponent`-returned class has `static observedAttributes` set directly on the class body. When `wrapClass` returns `Ctor` unchanged for `mode === 'none'`, `observedAttributes` is on the class and `attributeChangedCallback` is on the prototype — both accessible without shadow wrapping. No change needed.

**Cross-cutting:**
11. `bun run size` must be run after each task before committing. The 2048 B arbor limit is the hard stop; Plan 1.1 leaves ~4 B headroom — property mangling is available as an emergency lever (proven in round-n1 bench work).
12. All internal symbols (`_` prefix) must never appear in `index.ts` exports. `ErrorHandler` and `MountOptions` are public types and MUST be added to `index.ts`. `StructuralNode` is an internal implementation detail of the reconciler and MUST NOT be exported from `index.ts` — it appears only in `structural.ts` and is referenced only by `_materialize`.
13. `ArborNotImplementedError` stubs in `structural.ts` are removed entirely when Plan 1.1 ships. The `ArborNotImplementedError` class in `errors.ts` is retained (used by `MountScope.serialize()` stub).
