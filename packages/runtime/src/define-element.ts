import type { MountScope } from '@aihu/arbor'
import { type DefineOptions, RuntimeError, type ShadowMode } from './types.ts'

export const SHADOW_ROOT_SYM: unique symbol = Symbol()
const _HS = Symbol()

type HydrateFn = (
  component: () => unknown,
  host: Element | ShadowRoot,
  snapshot: Record<string, unknown>,
) => MountScope

let _hydrateFn: HydrateFn | null = null

/** @internal */
export function _setHydrate(fn: HydrateFn): void {
  _hydrateFn = fn
}

function wrapClass(
  Ctor: typeof HTMLElement,
  mode: ShadowMode,
  name: string,
  enableHydration: boolean,
): typeof HTMLElement {
  if (mode === 'none' && !enableHydration) return Ctor
  const isClosed = mode === 'closed'
  const attachMode: ShadowRootMode = isClosed ? 'closed' : 'open'
  const attachShadow = mode !== 'none'

  class Wrapped extends Ctor {
    [SHADOW_ROOT_SYM]: ShadowRoot | null = null;
    [_HS]: MountScope | null = null

    constructor() {
      super()
      if (attachShadow) {
        const root = this.attachShadow({ mode: attachMode })
        if (isClosed) this[SHADOW_ROOT_SYM] = root
      }
    }

    connectedCallback(): void {
      if (enableHydration && _hydrateFn !== null) {
        const state = (globalThis as Record<string, unknown>).__aihu_state__ as
          | Record<string, unknown>
          | undefined
        const snapshot = state?.[name] as Record<string, unknown> | undefined
        if (snapshot) {
          const host: Element | ShadowRoot = this.shadowRoot ?? this
          const ctor = this as unknown as { _build?(): unknown }
          if (typeof ctor._build === 'function') {
            this[_HS] = _hydrateFn(() => ctor._build?.(), host, snapshot)
            return
          }
        }
      }
      ;(_proto.connectedCallback as (() => void) | undefined)?.call(this)
    }

    disconnectedCallback(): void {
      const hs = this[_HS]
      if (hs !== null) {
        hs.dispose()
        this[_HS] = null
        return
      }
      ;(_proto.disconnectedCallback as (() => void) | undefined)?.call(this)
    }
  }
  const _proto = Object.getPrototypeOf(Wrapped.prototype) as Record<string, unknown>
  return Wrapped
}

export function defineElement(
  name: string,
  Ctor: typeof HTMLElement,
  options?: DefineOptions,
): void {
  if (customElements.get(name)) {
    throw new RuntimeError('SCR-R0001', `already: ${name}`)
  }
  const mode: ShadowMode = options?.shadowMode ?? 'open'
  const enableHydration = options?.hydrate === true
  const Wrapped = wrapClass(Ctor, mode, name, enableHydration)
  customElements.define(name, Wrapped)
}
