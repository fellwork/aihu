# Scout Report — Track A
**Date:** 2026-04-30
**By:** Scout (automated)

---

## Task 1: Bundle size baseline

`bun run build` fails with exit code 1 because `packages/compiler` is a stub (no `rolldown.config.ts`). All four real packages built successfully from cache. `bun run size` succeeded.

| Package | Gzip size | Cap | Headroom |
|---|---|---|---|
| `@aihu/signals` | 1.53 kB | 1.70 kB | **172 B** |
| `@aihu/arbor` | 1.28 kB | 2.05 kB | **772 B** |
| `@aihu/runtime` | 438 B | 1.02 kB | **586 B** |
| `@aihu/agent` | 72 B | 100 B | **28 B** |

Caps defined in `C:/git/fellwork/aihu/.size-limit.json`.

Track A additions to consider against headroom:
- Plan 4.2 `onError` hook in `@aihu/arbor`: estimated small; 772 B headroom is comfortable.
- Plan 1.1 `when()`/`each()` reconciler bodies (currently stubs, zero runtime cost): will consume arbor headroom.
- Plan 1.2 `observedAttributes`/props wiring in `@aihu/runtime`: 586 B headroom is very tight for a non-trivial props system.

---

## Task 2: `_activeMountDisposers` re-entry

**File:** `C:/git/fellwork/aihu/packages/arbor/src/mount.ts`

(a) **Initialized/assigned:** line 44 (module-level declaration `let _activeMountDisposers: Dispose[] | null = null`) and line 117 (`_activeMountDisposers = disposers` inside `mount()` before the `try`).

(b) **Read by `_mountEffect`:** `_mountEffect` does NOT read `_activeMountDisposers` directly. The slot is module-level, but `_mountEffect` (lines 69–79) receives the `disposers` array as a parameter passed explicitly by `_materialize`. The slot exists for future sub-project #7 "binding layer inspection" (per JSDoc at line 36–42). `_mountEffect` reads only its `disposers` parameter, not the module slot.

(c) **Reset to null after use:** line 123 (`_activeMountDisposers = null` in the `finally` block of `mount()`).

**Re-entry safety:** `_materialize` (in `materialize.ts`) never calls `mount()`. Confirmed: the only reference to `mount` in `materialize.ts` is in the JSDoc comment on line 13. `_materialize` only calls `_applyAttrs` and recurses into itself. `_applyAttrs` (in `attrs.ts`) also has no reference to `mount()`. There is no re-entrant `mount()` path in v0.

**Noted v0 limitation:** The JSDoc at `mount.ts:16–17` explicitly documents that re-entrant `mount()` (if it occurred) would overwrite the slot — a stack/push-pop fix is deferred to v1.

**Nested mount() tests:** No test in `packages/arbor/tests/mount.test.ts` exercises nested `mount()` calls. There is no `describe` block or test name containing "nested". The integration tests also do not nest `mount()` calls.

---

## Task 3: Dispose chain in MountScope

**File:** `C:/git/fellwork/aihu/packages/arbor/src/mount.ts`

**LIFO dispose loop line range:** lines 134–137.
```
for (let i = disposers.length - 1; i >= 0; i--) {
  const dispose = disposers[i]
  if (dispose !== undefined) dispose()
}
```

**DOM removal loop:** lines 139–143 — runs after all effects are disposed.

**Disposers array contents:** The `disposers` array contains **only effect disposers**. Specifically, `_mountEffect` (line 75) pushes a wrapped `() => { _observeMount(…); dispose() }` closure — a telemetry-augmented effect dispose. DOM removal is handled separately via the `appendedRoots` array (lines 118, 120, 139–143), which is NOT part of `disposers`. The two concerns are fully separated.

**Idempotency:** Confirmed. `mount()` declares `let disposed = false` at line 127. `dispose()` checks `if (disposed) return` at line 131 and sets `disposed = true` at line 132 before doing any work. Second call returns immediately. Test #8 (`mount.test.ts:249`) directly verifies this.

---

## Task 4: `when()`/`each()` stub return type and `_materialize` handling

**File:** `C:/git/fellwork/aihu/packages/arbor/src/structural.ts`

**Declared return types:**
- `when(_condition: Signal<boolean>, _grow: () => Branch | Leaf): Branch` — line 29
- `each<T>(_list: Signal<T[]>, _key: (item: T) => string | number, _grow: (item: T, index: number) => Branch | Leaf): Branch` — lines 41–45

Both return `Branch` (even though both throw immediately, the declared signature is `Branch`).

**`_materialize` switch/if structure** (`C:/git/fellwork/aihu/packages/arbor/src/materialize.ts`):

There is no `switch`. The structure is two `if` guards:

1. `if (node.kind === 'leaf')` (line 50) — handles two sub-cases: `leafKind === 'text'` (lines 51–70) and the element-leaf fallthrough (lines 72–76).
2. `if (node.tag === null)` (line 80) — fragment branch: recurse children directly into host (lines 81–90).
3. Unconditional fallthrough (lines 93–103) — tagged branch: create wrapper element, apply attrs, recurse children.

**No third `kind` value is handled.** `_materialize` never inspects `node.kind === 'branch'` explicitly; it falls through to the branch handling after the leaf guard. Any node that is not `kind === 'leaf'` is treated as a branch.

**Impact on reconciler:** If `when()`/`each()` return a `Branch`-shaped node (with `kind: 'branch'`) with a special `kind` sub-field (e.g. `kind: 'live-branch'`), `_materialize` would NOT need changes — it only discriminates on `node.kind` at line 50, and anything that is not `'leaf'` falls through to branch handling. However, if the reconciler needs to inject DOM mutations reactively (replacing child subtrees in response to signal changes), `_materialize` **would need changes**: a new `mountEffect`-driven path to re-run the `_grow` factory and diff/replace children is not present in any form today.

---

## Task 5: `SetupContext` and `observedAttributes` flow

**File:** `C:/git/fellwork/aihu/packages/runtime/src/types.ts`

**`SetupContext` TypeScript interface (lines 43–46):**
```typescript
export interface SetupContext {
  readonly host: ShadowRoot | Element
  readonly element: HTMLElement
}
```

Two fields only: `host` and `element`. There is no `attrs`, `props`, or `observedAttributes` field.

**`attributeChangedCallback` on `defineComponent`-produced class:**
ABSENT. `C:/git/fellwork/aihu/packages/runtime/src/define-component.ts` defines a `Component` class (lines 78–96) with only `connectedCallback` (line 80) and `disconnectedCallback` (line 92). There is no `attributeChangedCallback` method and no `static observedAttributes` on this class.

This is the confirmed gap for Plan 1.2. The spec comment at `define-element.ts:42–43` notes: "`static observedAttributes` and instance methods propagate through `class extends` prototype inheritance — no explicit copy needed." This means `wrapClass` in `define-element.ts` relies on the compiler-emitted class providing these. `defineComponent`-produced classes do NOT provide them.

**`static observedAttributes`:** ABSENT on `defineComponent`-produced class. Neither declared on `Component` (lines 78–96 of `define-component.ts`) nor present as a default.

**Where props wiring would need to be inserted:**

For Plan 1.2 to work with `defineComponent`, two insertion points are required:

1. **`connectedCallback` body** (after line 88, `const ctx: SetupContext = { host, element: this }`) — before `setup(ctx)` is called, the props/attrs should be read from the element and populated into `ctx`. Likely by adding `attrs: Object.fromEntries(...)` or a signal-per-attribute to `SetupContext`.

2. **New `attributeChangedCallback` method** — must be added to the `Component` class body (after `disconnectedCallback`, after line 95) to re-drive signal writes when observed attributes change.

3. **`static observedAttributes`** — must be derived from the `setup` function signature or passed as a second argument to `defineComponent`. The current `defineComponent(setup: Setup)` signature would need to change or be overloaded.

---

## Task 6: Signal subscription patterns

**`_mountEffect` call signature:**

Defined in `C:/git/fellwork/aihu/packages/arbor/src/mount.ts:69`:
```typescript
export function _mountEffect(disposers: Dispose[], fn: () => void, path: string): void
```

Called in `_materialize` (via the injected `mountEffect` parameter) at:
- `materialize.ts:57–63` — reactive text leaf: `mountEffect(disposers, () => { textNode.nodeValue = String(get()) }, \`${pathBase}.text\`)`
- `attrs.ts:82` — reactive attr: `mountEffect(disposers, () => _setAttrOrProp(el, key, get()), \`${pathBase}.attr:${key}\`)`

`MountEffectFn` type alias defined at `attrs.ts:44`: `(disposers: Dispose[], fn: () => void, path: string) => void`.

**`effect()` return type:**

`C:/git/fellwork/aihu/packages/signals/src/effect.ts:40`:
```typescript
export function effect(fn: EffectFn): Dispose
```

`Dispose` is `() => void` (line 5). The function runs `fn()` synchronously on creation (line 68: `runEffect(node)`) and returns a synchronous dispose closure. Confirmed: `effect()` returns a synchronous `Dispose` function.

**`untrack` usage in `packages/arbor/src/`:**
Not used anywhere. Grep over all `packages/arbor/src/*.ts` returned no matches. `untrack` is exported from `@aihu/signals` (`signals/src/index.ts:11`) but is not imported anywhere in `packages/arbor/src/`.

---

## Task 7: Branch/Node kind discriminants

**File:** `C:/git/fellwork/aihu/packages/arbor/src/node.ts`

**`kind` values today:** Only two:
- `'branch'` — set by `_makeBranch` at line 39: `{ kind: 'branch', tag, attrs, children }`
- `'leaf'` — set by `_makeTextLeaf` (line 51) and `_makeElementLeaf` (line 60): `{ kind: 'leaf', leafKind: ..., ... }`

Confirmed: no other `kind` values exist in any source file.

**Exact TypeScript types** (`C:/git/fellwork/aihu/packages/arbor/src/types.ts`):

```typescript
// types.ts:44–49
export interface Branch {
  readonly kind: 'branch'
  readonly tag: string | null
  readonly attrs: AttrMap | null
  readonly children: ChildList
}

// types.ts:56–62
export interface Leaf {
  readonly kind: 'leaf'
  readonly leafKind: 'text' | 'element'
  readonly value: Signal<string> | string | null
  readonly tag: string | null
  readonly attrs: AttrMap | null
}

// types.ts:67
export type Node = Branch | Leaf
```

The `kind` field uses string literal types for discrimination. Both interfaces require all fields (per §2.9 hidden-class shape locking).

**Union accommodation for a new "live branch" kind:**

`Node` is currently `Branch | Leaf` (used as `type Node` in `materialize.ts:1` import `from './types.ts'`). `_materialize` discriminates on `node.kind === 'leaf'` only — everything else is treated as a branch. This means:
- A `LiveBranch` with `kind: 'live-branch'` would fall through to the branch-handling path in `_materialize`, which would try to call `document.createElement(node.tag)` — potentially broken behavior unless `node.tag` is set.
- The correct approach is to add an explicit `else if (node.kind === 'live-branch')` arm, which requires `_materialize` changes regardless.
- Adding a new `kind` to the `Node` union would NOT be a breaking change to the public API (`Branch` and `Leaf` types are unchanged) but WOULD require `_materialize` to be updated.

---

## Task 8: Test count and coverage

**Total passing tests:** 255 tests across 36 test files. All pass. Zero failures.

**Files in `packages/arbor/tests/` that exercise `mount()` specifically:**

| File | Tests |
|---|---|
| `packages/arbor/tests/mount.test.ts` | 21 tests — primary mount() test file. Covers: basic mount, reactive text, fragment, agent brand, serialize throw, static/reactive leaf/branch/attr integration, telemetry, path keys, dispose (clears DOM, post-dispose signal no-op, idempotency, LIFO order). |
| `packages/arbor/tests/bench.test.ts` | 1 test — calls `mount()` indirectly to benchmark 10k-leaf mount (39.64 ms in this run). |
| `packages/arbor/tests/attrs.test.ts` | 9 tests — unit-tests `_applyAttrs` with a mock `mountEffect` spy; does NOT call `mount()`. |
| `packages/arbor/tests/branch.test.ts` | 9 tests — tests `branch()` factory shape only; does NOT call `mount()`. |
| `packages/arbor/tests/leaf.test.ts` | 9 tests — tests `leaf()` factory shape only; does NOT call `mount()`. |
| `packages/arbor/tests/structural.test.ts` | 2 tests — tests `when()`/`each()` throw; does NOT call `mount()`. |

**Integration tests covering the `mount()` → `_setMount` → `defineComponent` path:**

| File | Coverage |
|---|---|
| `tests/integration/define-element-integration.test.ts` | Covers `mount()` + `defineElement()` path (compiler-emitted pattern). Does NOT use `defineComponent` or `_setMount`. |
| `tests/integration/mount-arbor-with-signals.test.ts` | Covers `mount()` + `branch()`/`leaf()` + `signal()` + `batch()`. No `defineComponent`. |
| `tests/integration/agent-context-unchanged.test.ts` | Covers `mount()` + `MountScope.agent` shape. No `defineComponent`. |
| `packages/runtime/tests/define-component.test.ts` | **This is the closest file.** Covers `_setMount(mount)` + `defineComponent()` + `defineElement()` + `connectedCallback` / `disconnectedCallback` / effect dispose chain. 4 tests. |

**Gap:** No integration test exercises the full `mount()` → `_setMount` → `defineComponent` path with `attributeChangedCallback`. The `define-component.test.ts` does exercise `_setMount` + `defineComponent` but the class produced has no `attributeChangedCallback` to test.

---

## Summary: Blockers for Architect

### Plan 4.2 — `onError` error boundary on `MountScope`

**No hard blockers.** The `MountScope` interface (`mount.ts:94–98`) has three members: `dispose()`, `agent`, `serialize()`. Adding `onError` requires:
1. Extending the `MountScope` interface with an `onError(handler)` registration method or an options parameter to `mount()`.
2. Wrapping the effect callbacks in `_mountEffect` to call the handler on throw instead of propagating.
3. Deciding whether `onError` is per-scope (set on the returned `MountScope`) or per-mount (passed as an option to `mount()`).
4. The 772 B headroom in `@aihu/arbor` is comfortable.

**Design questions for Architect:** Does `onError` replace or supplement the existing thrown error from `_mountEffect`? Does it fire on effect-throw only, or also on `_materialize` synchronous errors?

### Plan 1.1 — `when()`/`each()` reconciler

**No hard blockers, but `_materialize` must change.** Current `_materialize` has no handler for a reactive/live-branch kind. The reconciler cannot be purely additive in `structural.ts` — it must either:
- Add a new `kind` arm in `_materialize` (breaking the current "leaf / else-is-branch" structure), or
- Return an already-fully-materialized `Branch` (with children pre-built), relying on the existing tagged-branch path — but this doesn't support reactivity.

The `when()` and `each()` return type is declared `Branch`. If the v1 reconciler returns a wrapper `Branch` whose children are managed reactively via a `mountEffect`, `_materialize` needs a new case that can re-invoke the `_grow` factory and swap DOM subtrees. This is a non-trivial addition.

**Signal subscription wiring:** `untrack` is available from `@aihu/signals` but not currently used anywhere in `packages/arbor/src/`. The reconciler will likely need `untrack` to read the condition/list signal inside `_materialize` without subscribing the outer traversal.

### Plan 1.2 — `observedAttributes`/props in `@aihu/runtime`

**Confirmed gap — `defineComponent`-produced class has no `attributeChangedCallback` or `static observedAttributes`.** Specific gaps:

1. `SetupContext` (`types.ts:43–46`) has only `host` and `element`. It needs a props surface (signals or plain values).
2. `define-component.ts:78–96`: `Component` class body has no `static observedAttributes` and no `attributeChangedCallback`. Both must be added.
3. `defineComponent(setup: Setup)` signature (`define-component.ts:76`) takes only a `setup` function. There is no mechanism to declare which attributes are observed. A second argument (e.g., `options: { observedAttributes?: string[] }`) or a different API shape is needed.
4. The 586 B headroom in `@aihu/runtime` may be tight for a complete props system — especially if signal-per-attribute wiring is used.

**`define-element.ts:42–43`** explicitly notes that `static observedAttributes` and `attributeChangedCallback` propagate through prototype inheritance from the compiler-emitted class — this is the intended compiler path. `defineComponent` is the hand-authored path and is currently behind on this.

**Execution order dependency confirmed:** Plan 1.2 depends on `defineComponent` plumbing that is decoupled from Plan 4.2 and Plan 1.1 — no ordering conflict within Track A's 4.2 → 1.1 → 1.2 sequence.
