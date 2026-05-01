import type { Dispose, Signal } from '@scribe/signals'

/**
 * Public type definitions for `@scribe/arbor`.
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
 */
export interface Branch {
  readonly kind: 'branch'
  readonly tag: string | null
  readonly attrs: AttrMap | null
  readonly children: ChildList
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
  readonly key: string | number
  readonly disposers: Dispose[]
  appendedNodes: globalThis.Node[]
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
export type ErrorHandler = (error: unknown, path: string) => Node | void

/**
 * Options for mount(). All fields are optional; omitting options is
 * identical to passing {}.
 */
export interface MountOptions {
  /** Error boundary handler. See ErrorHandler. */
  onError?: ErrorHandler
}

/**
 * Sub-project #7 stub — agent live-binding lands later. The empty/branded
 * stub type signals "don't use this in v0" through the type system.
 * `MountScope.agent` returns a frozen `{ _brand: 'AgentContext' }`.
 */
export interface AgentContext {
  readonly _brand: 'AgentContext'
}

/**
 * Sub-project #6 stub — SSR/serialize lands later. `MountScope.serialize()`
 * always throws `ArborNotImplementedError` in v0.
 */
export type Snapshot = Record<string, never>
