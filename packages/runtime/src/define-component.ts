import type { signal as SignalFactory } from '@scribe/signals'
import type { ComponentOptions, MountFn, Setup, SetupContext } from './types.ts'
import { RuntimeError } from './types.ts'

type _ScopeRef = ReturnType<MountFn>

let _mount: MountFn | null = null
let _signal: typeof SignalFactory | null = null

// Lifecycle: current-instance pointer set during setup() calls
interface _LC {
  m: Array<() => undefined | (() => void)>
  c: Array<() => void>
}
let _cur: _LC | null = null

function _runMounts(lc: _LC): void {
  for (const fn of lc.m) {
    const r = fn()
    if (r) lc.c.push(r as () => void)
  }
}

function _runCleanups(lc: _LC): void {
  for (const fn of lc.c) fn()
}

/** @internal */
export function _setSignal(s: typeof SignalFactory): void {
  _signal = s
}

/** @internal */
export function _setMount(fn: MountFn): void {
  _mount = fn
}

const _scopes = new WeakMap<HTMLElement, _ScopeRef>()
const ATTR_SYM = Symbol()
const LC_SYM = Symbol()
const _E0002 = 'no mount'

export function defineComponent(setup: Setup): typeof HTMLElement
export function defineComponent<A extends ReadonlyArray<string>>(
  options: ComponentOptions<A>,
): typeof HTMLElement
export function defineComponent(setupOrOptions: Setup | ComponentOptions): typeof HTMLElement {
  if (typeof setupOrOptions === 'function') {
    const setup = setupOrOptions
    const S = Symbol()
    class C extends HTMLElement {
      private [S]: _ScopeRef | null = null
      private [LC_SYM]: _LC | null = null
      connectedCallback(): void {
        if (_mount === null) throw new RuntimeError('SCR-R0002', _E0002)
        const lc: _LC = { m: [], c: [] }
        this[LC_SYM] = lc
        const host = this.shadowRoot ?? this
        _cur = lc
        let tree: ReturnType<Setup>
        try {
          tree = setup({ host, element: this } as SetupContext)
        } finally {
          _cur = null
        }
        const scope = _mount(tree!, host)
        this[S] = scope
        _scopes.set(this, scope)
        _runMounts(lc)
      }
      disconnectedCallback(): void {
        const lc = this[LC_SYM]
        if (lc) _runCleanups(lc)
        this[S]?.dispose()
        this[S] = this[LC_SYM] = null
        _scopes.delete(this)
      }
    }
    return C
  }

  const { attrs = [] as unknown as ReadonlyArray<string>, setup } = setupOrOptions
  const S = Symbol()

  class C extends HTMLElement {
    static readonly observedAttributes = attrs
    private [S]: _ScopeRef | null = null
    private [LC_SYM]: _LC | null = null
    private [ATTR_SYM]: Record<string, ReturnType<typeof SignalFactory>> | null = null

    connectedCallback(): void {
      if (_mount === null) throw new RuntimeError('SCR-R0002', _E0002)
      if (_signal === null && attrs.length > 0) throw new RuntimeError('SCR-R0003', 'no signal')
      const attrSignals: Record<string, ReturnType<typeof SignalFactory>> = {}
      for (const name of attrs) attrSignals[name] = _signal(this.getAttribute(name) ?? '')
      this[ATTR_SYM] = attrSignals
      const lc: _LC = { m: [], c: [] }
      this[LC_SYM] = lc
      const host = this.shadowRoot ?? this
      _cur = lc
      let tree: ReturnType<typeof setup>
      try {
        tree = setup({ host, element: this, attrs: attrSignals } as Parameters<typeof setup>[0])
      } finally {
        _cur = null
      }
      const scope = _mount?.(tree!, host)
      this[S] = scope
      _scopes.set(this, scope)
      _runMounts(lc)
    }

    attributeChangedCallback(name: string, _old: string | null, newValue: string | null): void {
      this[ATTR_SYM]?.[name]?.[1](newValue ?? '')
    }

    disconnectedCallback(): void {
      const lc = this[LC_SYM]
      if (lc) _runCleanups(lc)
      this[S]?.dispose()
      this[S] = this[LC_SYM] = null
      _scopes.delete(this)
    }
  }
  return C
}

/** @internal */
export function _hmrReplace(element: HTMLElement, newSetup: Setup): void {
  if (_mount === null) return
  _scopes.get(element)?.dispose()
  _scopes.delete(element)
  const host = element.shadowRoot ?? element
  _scopes.set(element, _mount(newSetup({ host, element } as SetupContext)!, host))
}

// Lifecycle exports — exported only from index.ts
export function _onMount(fn: () => undefined | (() => void)): void {
  if (!_cur) throw new RuntimeError('SCR-R0010', 'no owner')
  _cur.m.push(fn)
}

export function _onCleanup(fn: () => void): void {
  if (!_cur) throw new RuntimeError('SCR-R0011', 'no owner')
  _cur.c.push(fn)
}
