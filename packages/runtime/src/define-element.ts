import type { MountScope } from '@aihu/arbor'
import { type DefineOptions, RuntimeError, type ShadowMode } from './types.ts'

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
  // DA4 (#437): the mode is BINARY. `'shadow'` attaches an OPEN root — open
  // is the only browser mode aihu can use, because composition and hydration
  // read `this.shadowRoot` (a closed root nulls it and would be misdetected
  // as light DOM). `'light'` attaches nothing, so `this.shadowRoot === null`
  // is an unambiguous light-DOM detection.
  if (mode === 'light' && !enableHydration) return Ctor
  const attachShadow = mode === 'shadow'

  class Wrapped extends Ctor {
    [_HS]: MountScope | null = null

    constructor() {
      super()
      if (attachShadow) {
        this.attachShadow({ mode: 'open' })
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
  // Leaf default: 'shadow'. Pages/layouts receive an explicit
  // `{ shadowMode: 'light' }` from the compiler plugin (DA4 #437).
  const mode: ShadowMode = options?.shadowMode ?? 'shadow'
  const enableHydration = options?.hydrate === true
  const Wrapped = wrapClass(Ctor, mode, name, enableHydration)
  customElements.define(name, Wrapped)
}
