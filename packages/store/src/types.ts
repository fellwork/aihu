/**
 * @aihu/store — public + internal types.
 *
 * Public surface is fully inferred: setup-style stores infer their return
 * shape; options-style stores infer state/getters/actions. No `any` appears
 * anywhere in the public surface.
 */
import type { Dispose, Read, Write } from '@aihu/signals'

/** A plain-object state tree: what a store serializes to / hydrates from. */
export type StateTree = Record<string, unknown>

// ───────────────────────────── $onAction ─────────────────────────────

/**
 * Context handed to every `$onAction` subscriber at the moment an action is
 * invoked (before the action body runs).
 */
export interface ActionContext<S> {
  /** The store instance the action belongs to. */
  store: S
  /** The action's key on the store. */
  name: string
  /** The arguments the action was called with. */
  args: unknown[]
  /**
   * Register a hook that runs after the action returns (or, for an
   * async action, after the returned promise resolves).
   */
  after(cb: (result: unknown) => void): void
  /**
   * Register a hook that runs when the action throws (or the returned
   * promise rejects). The error is always re-thrown to the caller.
   */
  onError(cb: (error: unknown) => void): void
}

export type ActionSubscriber<S> = (context: ActionContext<S>) => void

// ───────────────────────────── store base ─────────────────────────────

/**
 * The `$`-prefixed instance surface every store carries, regardless of
 * definition style. `St` is the store's serializable state snapshot shape.
 */
export interface StoreBase<St extends StateTree = StateTree> {
  /** The store's unique id (registry key + serialization key). */
  readonly $id: string
  /**
   * Apply several state writes as one batch. Object form writes the given
   * state keys; function form receives the store and may call any setters —
   * either way subscribers are notified once.
   */
  $patch(patch: Partial<St> | ((store: this) => void)): void
  /**
   * Reset state back to the `state()` factory's initial values.
   * Options-style stores only: a setup store has no canonical initial-state
   * factory to re-run (its initial values are arbitrary expressions inside
   * the setup closure), so `$reset()` throws for setup-style stores.
   */
  $reset(): void
  /**
   * Subscribe to state changes. `cb` receives a fresh snapshot of the
   * store's state after each change (batched writes notify once).
   * Returns a dispose function.
   */
  $subscribe(cb: (state: St) => void): Dispose
  /** Hook before/after/onError around every action call. Returns dispose. */
  $onAction(cb: ActionSubscriber<this>): Dispose
  /**
   * Tear the store down: dispose subscriptions and store-owned computeds,
   * then remove the instance from the registry (the next `useStore()`
   * call re-instantiates fresh).
   */
  $dispose(): void
}

/** Widest store instance type — used by the registry, plugins, and SSR. */
export type AnyStore = StoreBase & Record<string, unknown>

/** What `defineStore` returns: a lazy accessor for the store instance. */
export type UseStore<T> = (() => T) & { readonly $id: string }

/** Per-store options bag consumed by plugins (e.g. `{ persist: true }`). */
export type StoreCustomOptions = Record<string, unknown>

// ─────────────────────── setup-style inference ───────────────────────

/**
 * State detection for setup-style stores — mirrored at runtime in
 * `store.ts` (`instantiateSetup`, pass 1): a key `k` is a state entry when
 * the setup returns a zero-arg read function under `k` AND a setter under
 * `set${Capitalize<k>}`. Computed reads (which carry `.dispose`) are
 * excluded at runtime; the type level cannot see that, so a computed that
 * coincidentally has a `set*` sibling types as state but is skipped at
 * runtime (documented limitation).
 */
export type SetupStateKeys<SS> = {
  [K in keyof SS & string]: SS[K] extends Read<unknown>
    ? `set${Capitalize<K>}` extends keyof SS
      ? K
      : never
    : never
}[keyof SS & string]

/** The serializable snapshot shape of a setup-style store. */
export type SetupSnapshot<SS> = {
  [K in SetupStateKeys<SS>]: SS[K] extends Read<infer T> ? T : never
}

/** Full instance type of a setup-style store. */
export type SetupStore<SS extends Record<string, unknown>> = SS & StoreBase<SetupSnapshot<SS>>

// ─────────────────────── options-style inference ───────────────────────

/** Read-side view of an options-style store's state. */
export type StateReads<S extends StateTree> = { readonly [K in keyof S]: Read<S[K]> }

/** Write-side view: each state key `k` lowers to a `setK` writer. */
export type StateWrites<S extends StateTree> = {
  readonly [K in keyof S & string as `set${Capitalize<K>}`]: Write<S[K]>
}

/** Getters receive the read-side state view and return a derived value. */
export type GettersTree<S extends StateTree> = Record<string, (state: StateReads<S>) => unknown>

/** Each getter lowers onto the instance as a computed read function. */
export type GetterReads<S extends StateTree, G extends GettersTree<S>> = {
  readonly [K in keyof G]: G[K] extends (state: StateReads<S>) => infer R ? Read<R> : never
}

export type ActionsTree = Record<string, (...args: never[]) => unknown>

/** Full instance type of an options-style store. */
export type OptionsStore<
  S extends StateTree,
  G extends GettersTree<S>,
  A extends ActionsTree,
> = StateReads<S> & StateWrites<S> & GetterReads<S, G> & A & StoreBase<S>

/**
 * Options-style store definition. Lowered onto the same core as
 * setup-style: each state key becomes a `signal`, each getter a `computed`
 * over the read-side view, each action a wrapped method with `this` bound
 * to the store instance.
 */
export interface OptionsStoreConfig<
  S extends StateTree,
  G extends GettersTree<S>,
  A extends ActionsTree,
> {
  state: () => S
  getters?: G
  actions?: A & ThisType<OptionsStore<S, G, A>>
}

// ───────────────────────────── plugins ─────────────────────────────

/** Context handed to every registered plugin at store instantiation. */
export interface StorePluginContext {
  /** The just-built store instance (after hydration adoption). */
  store: AnyStore
  /** The store id. */
  id: string
  /** The per-store custom options bag (`defineStore`'s third argument). */
  options: StoreCustomOptions | undefined
}

/**
 * A store plugin. Runs once per store instantiation; may hook
 * `$subscribe`/`$onAction` and may return a record of extra properties
 * that is merged onto the instance.
 */
export type StorePlugin = (context: StorePluginContext) => Record<string, unknown> | undefined

// ───────────────────────────── internals ─────────────────────────────

/** @internal registry record for one live store instance. */
export interface StoreInternal {
  id: string
  instance: AnyStore
  /** State reads keyed by state key — the serialization source. */
  stateReads: Map<string, () => unknown>
  /** State writes keyed by state key — the hydration/$patch sink. */
  stateWrites: Map<string, (next: unknown) => void>
  actionSubs: Set<ActionSubscriber<AnyStore>>
  /** $subscribe effect disposers + plugin-added disposers. */
  effects: Dispose[]
  /** Store-owned computed disposers (options getters + setup computeds). */
  computedDisposes: Dispose[]
  /** Options-style only: re-runs state() and patches it in. */
  reset: (() => void) | null
}

/** @internal one registry per scope: module singleton or per SSR request. */
export interface StoreRegistry {
  stores: Map<string, StoreInternal>
  /** Hydration payloads for stores not yet instantiated (adopted lazily). */
  pending: Map<string, StateTree>
}
