/**
 * defineStore core — both API styles lower onto one internal record:
 *
 *   stateReads / stateWrites   Maps keyed by state key: the single source
 *                              of truth for $patch, $subscribe snapshots,
 *                              $reset, serialization, and hydration.
 *
 * Setup style is primary: the setup function uses `signal` / `computed` /
 * plain functions and returns the store shape. State is detected by the
 * read/write pair convention (`count` + `setCount`); computed reads are
 * recognized by their `.dispose` own property (present in prod builds of
 * @aihu/signals) and are neither state nor actions. Options style lowers
 * each `state()` key to a signal pair under the same names.
 */
import { batch, computed, type Dispose, effect, signal } from '@aihu/signals'
import { _activePlugins } from './plugins.ts'
import { resolveRegistry } from './registry.ts'
import type {
  ActionSubscriber,
  ActionsTree,
  AnyStore,
  GettersTree,
  OptionsStore,
  OptionsStoreConfig,
  SetupStore,
  StateTree,
  StoreCustomOptions,
  StoreInternal,
  StoreRegistry,
  UseStore,
} from './types.ts'

function cap(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1)
}

function isComputedRead(value: unknown): boolean {
  return (
    typeof value === 'function' && typeof (value as { dispose?: unknown }).dispose === 'function'
  )
}

/**
 * Write one state value through an internal writer. Signal writers treat
 * function arguments as updaters, so a raw function value is wrapped in
 * an updater that returns it verbatim.
 */
function writeValue(write: (next: unknown) => void, value: unknown): void {
  write(typeof value === 'function' ? () => value : value)
}

/** Apply a plain state object (hydration payload / $patch object form). */
function applyState(internal: StoreInternal, state: StateTree): void {
  batch(() => {
    for (const key of Object.keys(state)) {
      const write = internal.stateWrites.get(key)
      if (write !== undefined) writeValue(write, state[key])
    }
  })
}

/** @internal — hydration entry point used by ssr.ts. */
export function _adoptState(internal: StoreInternal, state: StateTree): void {
  applyState(internal, state)
}

function wrapAction(
  internal: StoreInternal,
  name: string,
  fn: (...args: unknown[]) => unknown,
): (...args: unknown[]) => unknown {
  return function wrappedAction(this: unknown, ...args: unknown[]): unknown {
    const subs = internal.actionSubs
    if (subs.size === 0) return fn.apply(internal.instance, args)
    const afters: ((result: unknown) => void)[] = []
    const errors: ((error: unknown) => void)[] = []
    for (const sub of [...subs]) {
      sub({
        store: internal.instance,
        name,
        args,
        after: (cb) => afters.push(cb),
        onError: (cb) => errors.push(cb),
      })
    }
    let result: unknown
    try {
      result = fn.apply(internal.instance, args)
    } catch (error) {
      for (const cb of errors) cb(error)
      throw error
    }
    if (result instanceof Promise) {
      return result.then(
        (resolved) => {
          for (const cb of afters) cb(resolved)
          return resolved
        },
        (error) => {
          for (const cb of errors) cb(error)
          throw error
        },
      )
    }
    for (const cb of afters) cb(result)
    return result
  }
}

/** Attach the `$`-prefixed base surface onto a fresh instance. */
function attachBase(internal: StoreInternal): void {
  const instance = internal.instance

  Object.defineProperty(instance, '$id', {
    value: internal.id,
    enumerable: false,
    writable: false,
  })

  instance.$patch = (patch: StateTree | ((store: AnyStore) => void)): void => {
    batch(() => {
      if (typeof patch === 'function') patch(instance)
      else applyState(internal, patch)
    })
  }

  instance.$reset = (): void => {
    if (internal.reset === null) {
      throw new Error(
        `[@aihu/store] $reset() requires an options-style store ("${internal.id}" is setup-style: ` +
          'its initial values are arbitrary expressions inside the setup closure, so there is no ' +
          'state() factory to re-run). Model resettable state options-style, or write an explicit ' +
          'reset action.',
      )
    }
    internal.reset()
  }

  instance.$subscribe = (cb: (state: StateTree) => void): Dispose => {
    let first = true
    const dispose = effect(() => {
      const snapshot: StateTree = {}
      for (const [key, read] of internal.stateReads) snapshot[key] = read()
      if (first) {
        first = false
        return
      }
      cb(snapshot)
    })
    internal.effects.push(dispose)
    return dispose
  }

  instance.$onAction = (cb: ActionSubscriber<AnyStore>): Dispose => {
    internal.actionSubs.add(cb)
    return () => {
      internal.actionSubs.delete(cb)
    }
  }

  instance.$dispose = (): void => {
    for (const dispose of internal.effects) dispose()
    internal.effects.length = 0
    for (const dispose of internal.computedDisposes) dispose()
    internal.computedDisposes.length = 0
    internal.actionSubs.clear()
    const registry = resolveRegistry()
    if (registry.stores.get(internal.id) === internal) registry.stores.delete(internal.id)
  }
}

function createInternal(id: string): StoreInternal {
  return {
    id,
    instance: {} as AnyStore,
    stateReads: new Map(),
    stateWrites: new Map(),
    actionSubs: new Set(),
    effects: [],
    computedDisposes: [],
    reset: null,
  }
}

/** Lower a setup-function store onto the internal record. */
function instantiateSetup(id: string, setup: () => Record<string, unknown>): StoreInternal {
  const internal = createInternal(id)
  const raw = setup()

  // Pass 1 — state pairs: `k` (plain read fn) + `set${Cap(k)}` (plain fn).
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'function' || isComputedRead(value)) continue
    const writer = raw[`set${cap(key)}`]
    if (typeof writer !== 'function' || isComputedRead(writer)) continue
    internal.stateReads.set(key, value as () => unknown)
    internal.stateWrites.set(key, writer as (next: unknown) => void)
  }
  const setterKeys = new Set([...internal.stateReads.keys()].map((key) => `set${cap(key)}`))

  // Pass 2 — assemble the instance: state reads/writes verbatim, computeds
  // verbatim (store-owned: disposed on $dispose), everything else callable
  // wrapped as an action, plain values verbatim.
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'function') {
      internal.instance[key] = value
      continue
    }
    if (isComputedRead(value)) {
      internal.instance[key] = value
      internal.computedDisposes.push(() => (value as unknown as { dispose(): void }).dispose())
      continue
    }
    if (internal.stateReads.has(key) || setterKeys.has(key)) {
      internal.instance[key] = value
      continue
    }
    internal.instance[key] = wrapAction(internal, key, value as (...args: unknown[]) => unknown)
  }

  return internal
}

/** Lower an options-style config onto the internal record. */
function instantiateOptions(
  id: string,
  config: OptionsStoreConfig<StateTree, GettersTree<StateTree>, ActionsTree>,
): StoreInternal {
  const internal = createInternal(id)
  const reads: Record<string, () => unknown> = {}

  for (const [key, initial] of Object.entries(config.state())) {
    const [read, write] = signal<unknown>(initial)
    internal.stateReads.set(key, read)
    internal.stateWrites.set(key, write as (next: unknown) => void)
    internal.instance[key] = read
    internal.instance[`set${cap(key)}`] = write
    reads[key] = read
  }

  for (const [key, getter] of Object.entries(config.getters ?? {})) {
    const derived = computed(() => getter(reads))
    internal.instance[key] = derived
    internal.computedDisposes.push(() => derived.dispose())
  }

  for (const [key, action] of Object.entries(config.actions ?? {})) {
    internal.instance[key] = wrapAction(internal, key, action as (...args: unknown[]) => unknown)
  }

  internal.reset = () => applyState(internal, config.state())
  return internal
}

function instantiate(
  id: string,
  setupOrConfig:
    | (() => Record<string, unknown>)
    | OptionsStoreConfig<StateTree, GettersTree<StateTree>, ActionsTree>,
  options: StoreCustomOptions | undefined,
  registry: StoreRegistry,
): StoreInternal {
  const internal =
    typeof setupOrConfig === 'function'
      ? instantiateSetup(id, setupOrConfig)
      : instantiateOptions(id, setupOrConfig)
  attachBase(internal)

  // Register before plugins run so plugin code calling useStore() (or
  // serializeStores()) sees this instance rather than recursing.
  registry.stores.set(id, internal)

  // Adopt a pending SSR snapshot BEFORE plugins and before the caller sees
  // the instance: the client's first useStore() returns server values with
  // no observable flicker ($subscribe callbacks cannot exist yet).
  const pending = registry.pending.get(id)
  if (pending !== undefined) {
    registry.pending.delete(id)
    applyState(internal, pending)
  }

  for (const plugin of _activePlugins()) {
    const extension = plugin({ store: internal.instance, id, options })
    if (extension !== undefined) Object.assign(internal.instance, extension)
  }

  return internal
}

// ───────────────────────────── defineStore ─────────────────────────────

/**
 * Define a store with a setup function (primary style). The setup runs
 * once per scope (client: lazy module singleton; server: once per
 * request), uses `signal`/`computed`/plain functions, and returns the
 * store shape. State is the set of `k`/`setK` read-write pairs.
 */
export function defineStore<SS extends Record<string, unknown>>(
  id: string,
  setup: () => SS,
  options?: StoreCustomOptions,
): UseStore<SetupStore<SS>>

/**
 * Define a store options-style (Pinia-shaped). Lowers onto the same core:
 * each `state()` key becomes a `k`/`setK` signal pair, each getter a
 * computed read over the state reads, each action a method with `this`
 * bound to the store.
 */
export function defineStore<S extends StateTree, G extends GettersTree<S>, A extends ActionsTree>(
  id: string,
  config: OptionsStoreConfig<S, G, A>,
  options?: StoreCustomOptions,
): UseStore<OptionsStore<S, G, A>>

export function defineStore(
  id: string,
  setupOrConfig:
    | (() => Record<string, unknown>)
    | OptionsStoreConfig<StateTree, GettersTree<StateTree>, ActionsTree>,
  options?: StoreCustomOptions,
): UseStore<AnyStore> {
  const useStore = (): AnyStore => {
    const registry = resolveRegistry()
    const existing = registry.stores.get(id)
    if (existing !== undefined) return existing.instance
    return instantiate(id, setupOrConfig, options, registry).instance
  }
  ;(useStore as { $id?: string }).$id = id
  return useStore as UseStore<AnyStore>
}
