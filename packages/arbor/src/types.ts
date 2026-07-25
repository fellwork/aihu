import type { Dispose, Signal } from '@aihu/signals'

/**
 * Public type definitions for `@aihu/arbor`.
 *
 * Per `.team/phase-3/spec-arbor.md` §1. Runtime objects (Branch/Leaf records)
 * are constructed by the internal factories in `node.ts` (and the public
 * factories in `branch.ts` / `leaf.ts`). The types below are the *external*
 * shape consumers see — runtime objects under §2.9 always have all fields
 * populated (never `undefined`) for hidden-class shape locking.
 */

/**
 * Event listener handler. Per spec §1.2: when an `AttrMap` key starts with
 * `on` and the value is a function (and not an array), it's wired via
 * `el.addEventListener(key.slice(2).toLowerCase(), value)`. Not reactive.
 */
export type EventHandler = (event: Event) => void

/**
 * Attribute map. Per spec §1.2 — value semantics at mount time:
 *
 * | Runtime test | Treatment |
 * |---|---|
 * | `key.startsWith('on')` AND `typeof value === 'function'` AND `!Array.isArray(value)` | EventHandler |
 * | `Array.isArray(value)` | `Signal<unknown>` (a Signal is `readonly [Read<T>, Write<T>]`) |
 * | `string \| number \| boolean` | Static — set once at mount |
 */
export type AttrMap = Record<string, string | number | boolean | Signal<unknown> | EventHandler>

/**
 * Children are static at construction time. The list itself is not a
 * signal. Structural dynamism (conditional + list rendering) lives entirely
 * in `when()` and `each()`. Per v0 spec §4 "Non-goals" and Phase 3 spec §1.2.
 */
export type ChildList = ReadonlyArray<Branch | Leaf | StructuralNode>

/**
 * A `branch` node. Returned opaque from `branch(tag, attrs?, children?)`.
 * The runtime shape is locked per §2.9: `kind`, `tag`, `attrs`, `children`
 * are always present.
 *
 * `el` is set by `_materialize` after the DOM element is created (non-null
 * only for tagged branches — null-tag fragments have no wrapper element).
 * The compiler-emitted `_onMount` callbacks for `class:` and `html`
 * bindings read `_n.el` to reach the live DOM node.
 */
export interface Branch {
  readonly kind: 'branch'
  readonly tag: string | null
  readonly attrs: AttrMap | null
  readonly children: ChildList
  /** Written by `_materialize`; undefined until the branch is mounted. */
  el?: Element
}

/**
 * A `leaf` node — either a text leaf (`leaf(value)`) or a terminal element
 * leaf (`leaf.element(tag, attrs?)`). The runtime shape is locked per §2.9:
 * `kind`, `leafKind`, `value`, `tag`, `attrs` are always present.
 */
export interface Leaf {
  readonly kind: 'leaf'
  readonly leafKind: 'text' | 'element'
  readonly value: Signal<string> | string | null
  readonly tag: string | null
  readonly attrs: AttrMap | null
}

/**
 * Structural node for `when()` (conditional) and `each()` (list) rendering.
 * All fields are always present — `null` for unused union arms per §2.9.
 *
 * @internal
 */
export interface StructuralNode {
  readonly kind: 'structural'
  /** Discriminator: 'conditional' for when(), 'list' for each(). Always present per §2.6. */
  readonly structuralKind: 'conditional' | 'list'
  /** For 'conditional': the Signal<boolean> condition. null on list nodes. */
  readonly condition: Signal<boolean> | null
  /** For 'conditional': the grow function for the true branch. null on list nodes. */
  readonly grow: (() => Node) | null
  /** For 'list': the Signal<unknown[]> list. null on conditional nodes. */
  readonly list: Signal<unknown[]> | null
  /** For 'list': the key extractor function. null on conditional nodes. */
  readonly keyFn: ((item: unknown) => string | number) | null
  /** For 'list': the per-item grow function. null on conditional nodes. */
  readonly listGrow: ((item: unknown, index: number) => Node) | null
}

/**
 * Internal child scope for when()/each() reconciler. Tracks the DOM anchor,
 * reactive effect disposers, and appended nodes for a single conditional or
 * list-item subtree.
 *
 * @internal
 */
export interface ChildScope {
  readonly anchor: Comment
  readonly disposers: Dispose[]
  appendedNodes: globalThis.Node[]
  /**
   * FEL-395: the list item VALUE this scope was grown from (`null` for the
   * `when()` boundary, which has no per-item value). Row bodies capture their
   * item by value at grow time (compiler-emitted `lgrow(items[i], i)`), so
   * `_reconcileEach` must compare the incoming item against this to detect
   * "same key, different value" and re-grow — otherwise a same-keyed
   * replacement object's field changes never reach the DOM.
   */
  readonly item?: unknown
  /**
   * FEL-408: this scope's position in the CURRENT DOM order of its `each()`
   * region — the index the previous reposition pass gave it. `-1` marks a
   * scope that has never been placed (it was appended to the end of the
   * parent, past everything, so it is never "already in order").
   * `_reconcileEach` runs a longest-increasing-subsequence over these to move
   * only the rows genuinely out of order, and reuses the field to carry that
   * pass's intermediate bookkeeping. Unused by `when()`, whose single child
   * scope is never repositioned.
   *
   * INVARIANT the scratch reuse depends on: between reconciles, `pos` MUST
   * hold a real DOM-order index (or -1 = never placed / force-move). During a
   * reconcile the patience pass overwrites it with run-length SCRATCH, and
   * the final walk is the ONLY writer that restores real indexes. Therefore
   * any path that exits `_reconcileEach` without running the walk (today:
   * the lgrow/materialize catch) MUST reset every already-processed row's
   * `pos` to -1 before propagating — otherwise the NEXT reconcile interprets
   * scratch as DOM order and silently commits wrong row order.
   */
  pos?: number
}

/**
 * Discriminated union of node kinds accepted by `mount()`.
 */
export type Node = Branch | Leaf | StructuralNode

/**
 * Error handler for a mount scope. Receives the thrown value and the
 * path key of the binding that threw (spec §2.7 format).
 *
 * Return a Node to replace the failed subtree (active in Plan 1.1).
 * Return void for notify-only behavior (Plan 4.2 implementation).
 */
export type ErrorHandler = (error: unknown, path: string) => Node | undefined

// ─── v0.3.0 — AgentBinding (compiler-emitted shape) ─────────────────────────

/**
 * Shape of the `__agentBinding` named export emitted by the compiler into
 * server artifacts for components with an `@agent` block (RFC §3).
 *
 * Passed to `mount()` via `MountOptions.agentBinding` to wire up the
 * `componentInstanceRegistry` entry for this component instance.
 */
export interface AgentBindingSpec {
  readonly tag: string
  readonly actions: Record<string, (args: unknown) => unknown>
  readonly reads: Record<string, () => unknown>
  readonly writes: Record<string, (v: unknown) => void>
  readonly scope: string | undefined
  readonly rateLimit: string | undefined
}

/**
 * Options for mount(). All fields are optional; omitting options is
 * identical to passing {}.
 */
export interface MountOptions {
  /** Error boundary handler. See ErrorHandler. */
  onError?: ErrorHandler
  /**
   * v0.3.0 — the `__agentBinding` export from the component's server artifact.
   * When present, `mount()` registers a `LiveBinding` in the
   * `componentInstanceRegistry`. Components without an `@agent` block
   * never pass this option (zero overhead on the non-agent path).
   */
  agentBinding?: AgentBindingSpec
}

/**
 * Agent context attached to a `MountScope`. v0.3.0 evolves this from a frozen
 * sentinel to a live-binding context for components with `__agentBinding`.
 *
 * Backward compat: `_brand === 'AgentContext'` is preserved. Check
 * `'rootId' in scope.agent` to distinguish live vs. sentinel context.
 *
 * Sentinel (no @agent block): `{ _brand: 'AgentContext' }` — frozen.
 * Live context (@agent block present): all fields populated.
 */
export interface AgentContext {
  readonly _brand: 'AgentContext'
  /** Root ID from the mount scope (only present on live contexts). */
  readonly rootId?: number
  /** Tag name (only present on live contexts). */
  readonly tag?: string
  /** Read the current value of a named signal (live context only). */
  readonly readSignal?: (name: string) => unknown
  /** Write a value to a named writable signal (live context only). */
  readonly writeSignal?: (name: string, value: unknown) => void
  /** Invoke a named action (live context only). */
  readonly callAction?: (name: string, args: unknown[]) => Promise<unknown>
}

/**
 * Sub-project #6 — SSR/serialize and hydration (Plan 3.2).
 * `MountScope.serialize()` returns a flat map of path-key → current signal
 * value. `hydrate()` consumes a `Snapshot` (pre-parsed from JSON) to
 * reattach reactive effects to server-rendered DOM nodes.
 */
export type Snapshot = Record<string, unknown>
