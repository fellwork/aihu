/**
 * `@aihu/primitives/context` — self-contained DOM-walk context (Option C).
 *
 * A live ancestor-traversal context: a provider stamps a value onto a host
 * element; an injecting descendant resolves it by walking UP the real DOM tree
 * (crossing `ShadowRoot` boundaries), nearest-provider-wins. This is the
 * Radix/Ark root↔piece coordination mechanism — fundamentally different from
 * `@aihu/context`'s DOM-free, SSR-oriented module-level Map.
 *
 * Deliberately distinct vocabulary (`createDomContext` / `provideContext` /
 * `injectContext`, NOT `createContext`) so there is no colliding symbol with
 * `@aihu/context`. **This module does NOT import `@aihu/context`.**
 *
 * Signal composition: the stored value may be a raw `T` or a signal `Read<T>`.
 * The convention is "provide a `Read<T>` when you want descendants to react" —
 * a consuming primitive reads the injected `Read<T>` inside an `effect(...)`
 * so it re-runs when the provider updates (e.g. `config-provider` propagating
 * `colorScheme` to every descendant). The util itself is signal-agnostic: it
 * stores whatever is passed and only imports the `Read<T>` *type* — keeping
 * `dom-context.js` under its 1 KB row.
 */

import type { Read } from '@aihu/signals'

/**
 * Opaque token identifying a context slot. `_key` is the Symbol used in the
 * per-host registry; `_name` aids debugging + the throw-on-missing message.
 */
export interface DomContext<T> {
  readonly _key: symbol
  readonly _name: string
  readonly _default: T | undefined
}

/** Thrown by `injectContext` when no provider is found and the token has no default. */
export class MissingContextError extends Error {
  constructor(name: string) {
    super(
      `[@aihu/primitives] no provider found for context "${name}" (and it has no default value)`,
    )
    this.name = 'MissingContextError'
  }
}

/**
 * Module-level registry mapping a host element to its provided context values.
 * A `WeakMap` so entries auto-release when the host element is GC'd — no manual
 * teardown, and values can be non-serializable (e.g. signals).
 */
const REGISTRY: WeakMap<Element, Map<symbol, unknown>> = new WeakMap()

/** Create a context token. Optionally carry a default for `injectContext`. */
export function createDomContext<T>(name: string, defaultValue?: T): DomContext<T> {
  return { _key: Symbol(name), _name: name, _default: defaultValue }
}

/**
 * Provide `value` for `ctx` on `host`. Idempotent per `(host, ctx._key)` —
 * re-providing overwrites. `value` may be a raw `T` or a signal `Read<T>`.
 */
export function provideContext<T>(host: Element, ctx: DomContext<T>, value: T | Read<T>): void {
  let slots = REGISTRY.get(host)
  if (slots === undefined) {
    slots = new Map<symbol, unknown>()
    REGISTRY.set(host, slots)
  }
  slots.set(ctx._key, value)
}

/**
 * Resolve `ctx` for `from` by walking UP the DOM from `from.parentNode`,
 * crossing `ShadowRoot` boundaries (`ShadowRoot → .host`), nearest-wins.
 * Returns the first match; falls back to `ctx._default`; throws
 * `MissingContextError` if neither is present.
 */
export function injectContext<T>(from: Element, ctx: DomContext<T>): T | Read<T> {
  let node: Node | null = from.parentNode
  while (node !== null) {
    if (node instanceof Element) {
      const slots = REGISTRY.get(node)
      if (slots?.has(ctx._key)) {
        return slots.get(ctx._key) as T | Read<T>
      }
      node = node.parentNode
    } else if (node instanceof ShadowRoot) {
      // Step out of the shadow tree to the host element, then continue up.
      node = node.host
    } else {
      // Document / DocumentFragment (non-shadow) — keep walking up.
      node = node.parentNode
    }
  }
  if (ctx._default !== undefined) return ctx._default
  throw new MissingContextError(ctx._name)
}

/**
 * Like `injectContext`, but for the common case where a context carries a raw
 * (non-signal) value — typically an object whose fields are themselves signals.
 * Narrows the `T | Read<T>` union to `T` so call sites read fields directly.
 * Use `injectContext` when a provider may store a bare `Read<T>` signal.
 */
export function injectValue<T>(from: Element, ctx: DomContext<T>): T {
  return injectContext(from, ctx) as T
}
