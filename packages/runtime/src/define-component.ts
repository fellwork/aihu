import type { signal as SignalFactory } from '@aihu/signals'
import type {
  ComponentOptions,
  MountFn,
  PropDef,
  PropSignal,
  PropsConfig,
  Setup,
  SetupContext,
} from './types.ts'
import { RuntimeError } from './types.ts'

type _ScopeRef = ReturnType<MountFn>

let _mount: MountFn | null = null
let _signal: typeof SignalFactory | null = null

// Lifecycle: current-instance pointer set during setup() calls.
// R2 (Director r6 §3): four-callback $lifecycle extension. `a` (adopted) and
// `ac` (attributeChanged) are added so the host's adoptedCallback /
// attributeChangedCallback can dispatch userland callbacks at the right
// platform moment. `attributeChange` per spec runs AFTER R1's $prop signal
// dispatch (so authors see the post-converted signal value).
interface _LC {
  m: Array<() => void | (() => void)>
  c: Array<() => void>
  a: Array<() => void>
  ac: Array<(name: string, oldValue: string | null, newValue: string | null) => void>
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

function _runAdopts(lc: _LC): void {
  for (const fn of lc.a) fn()
}

function _runAttrChanges(
  lc: _LC,
  name: string,
  oldValue: string | null,
  newValue: string | null,
): void {
  for (const fn of lc.ac) fn(name, oldValue, newValue)
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
        const lc: _LC = { m: [], c: [], a: [], ac: [] }
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
      // R2 (Director r6 §3): adoptedCallback dispatches userland onAdopt.
      adoptedCallback(): void {
        const lc = this[LC_SYM]
        if (lc) _runAdopts(lc)
      }
      // R2: attributeChangedCallback dispatches userland onAttributeChange.
      // Function-form components have no observedAttributes by default, so
      // this only fires if a derived class declares them — kept here for
      // completeness + parity with options-form.
      attributeChangedCallback(
        name: string,
        oldValue: string | null,
        newValue: string | null,
      ): void {
        const lc = this[LC_SYM]
        if (lc) _runAttrChanges(lc, name, oldValue, newValue)
      }
    }
    return C
  }

  const { attrs = [] as unknown as ReadonlyArray<string>, setup, props: propsCfg } = setupOrOptions
  const S = Symbol()
  const PROPS_SYM = Symbol()
  const REFLECT_SYM = Symbol()

  // R1: derive the (propName → attributeName) mapping once at class-build time.
  // `attribute: false` removes the entry from observedAttributes; `'kebab'`
  // overrides; default is kebabCase(propName).
  const propEntries: Array<[string, PropDef, string | null]> = propsCfg
    ? Object.entries(propsCfg).map(([name, def]) => {
        const attr = def.attribute
        const attrName: string | null =
          attr === false ? null : typeof attr === 'string' ? attr : _kebab(name)
        return [name, def, attrName]
      })
    : []

  // Validation: `attribute: false` + `reflect: true` is invalid (nothing to
  // reflect to). Surface as RuntimeError at class-build (compile-time check
  // also exists in emit.rs; runtime is a defensive backstop).
  for (const [name, def, attrName] of propEntries) {
    if (attrName === null && def.reflect === true) {
      throw new RuntimeError(
        'SCR-R0004',
        `prop '${name}': reflect: true is incompatible with attribute: false`,
      )
    }
  }

  // observedAttributes = legacy `attrs` ∪ R1 prop attribute names.
  const observed: string[] = [...attrs]
  for (const [, , attrName] of propEntries) {
    if (attrName !== null && !observed.includes(attrName)) observed.push(attrName)
  }

  // Reverse-lookup: attribute name → prop name. Used by attributeChangedCallback
  // to resolve which signal to update.
  const attrToProp = new Map<string, string>()
  for (const [name, , attrName] of propEntries) {
    if (attrName !== null) attrToProp.set(attrName, name)
  }

  class C extends HTMLElement {
    static readonly observedAttributes = observed
    private [S]: _ScopeRef | null = null
    private [LC_SYM]: _LC | null = null
    private [ATTR_SYM]: Record<string, ReturnType<typeof SignalFactory>> | null = null
    // R1 — per-instance prop signal map (callable getter + .set writer).
    private [PROPS_SYM]: Record<string, PropSignal> | null = null
    // R1 — re-entrancy guard for reflect: true. Set during setAttribute writes
    // triggered by signal updates so attributeChangedCallback skips dispatch.
    private [REFLECT_SYM] = new Set<string>()
    // R4/Q3 (Director r6 §2.Q3): coarse-grained reflect-loop guard. Set on
    // entry to attributeChangedCallback, cleared in finally. While set, any
    // ps.set() that would reflect back to attribute is suppressed — covers
    // the cross-component $bind + reflect: true cycle (Lit's _isReflecting
    // precedent).
    _isInternalAttrChange: boolean = false

    connectedCallback(): void {
      if (_mount === null) throw new RuntimeError('SCR-R0002', _E0002)
      if (_signal === null && (attrs.length > 0 || propEntries.length > 0)) {
        throw new RuntimeError('SCR-R0003', 'no signal')
      }
      const attrSignals: Record<string, ReturnType<typeof SignalFactory>> = {}
      for (const name of attrs) attrSignals[name] = _signal!(this.getAttribute(name) ?? '')
      this[ATTR_SYM] = attrSignals

      // R1 — allocate per-prop signal at connect time. Initial value priority:
      // (1) raw attribute string passed through converter (when attribute is
      // observed AND already set on the element); (2) `def.value` default.
      const propSignals: Record<string, PropSignal> = {}
      for (const [name, def, attrName] of propEntries) {
        let initial: unknown = def.value
        if (attrName !== null) {
          const raw = this.getAttribute(attrName)
          if (raw !== null) {
            initial = _convert(raw, def, def.value)
          }
        }
        const sig = _signal!(initial as string)
        // The signal here stores `unknown` — the runtime signal type is
        // generic; we cast at the boundary. (`_signal` is typed as
        // `signal<string>` only for legacy attrs path.)
        const [get, set] = sig as unknown as [() => unknown, (v: unknown) => void]
        const ps = (() => get()) as PropSignal
        ps.set = (v: unknown): void => {
          set(v)
          // Reflect to attribute when configured. R4/Q3 (Director r6 §2.Q3):
          // suppress reflect when we are mid-attributeChangedCallback — the
          // attribute already holds the source-of-truth value and reflecting
          // would re-fire the callback (cross-component $bind cycle).
          if (def.reflect === true && attrName !== null && !this._isInternalAttrChange) {
            const reflected = _reflectToAttr(v)
            this[REFLECT_SYM].add(attrName)
            try {
              if (reflected === null) {
                this.removeAttribute(attrName)
              } else {
                this.setAttribute(attrName, reflected)
              }
            } finally {
              this[REFLECT_SYM].delete(attrName)
            }
          }
        }
        propSignals[name] = ps
      }
      this[PROPS_SYM] = propSignals

      const lc: _LC = { m: [], c: [], a: [], ac: [] }
      this[LC_SYM] = lc
      const host = this.shadowRoot ?? this
      _cur = lc
      let tree: ReturnType<typeof setup>
      try {
        tree = setup({
          host,
          element: this,
          attrs: attrSignals,
          props: propSignals,
        } as Parameters<typeof setup>[0])
      } finally {
        _cur = null
      }
      const scope = _mount?.(tree!, host)
      this[S] = scope
      _scopes.set(this, scope)
      _runMounts(lc)
    }

    attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
      // R4/Q3: reflect-loop guard. Set host-wide flag so ps.set() called from
      // userland onAttributeChange (or from the propagated _convert below)
      // does not reflect back to the attribute and re-fire this callback.
      // Cleared in `finally` to keep stack-discipline correct under throws.
      this._isInternalAttrChange = true
      try {
        // Legacy attrs path — direct string signal update.
        this[ATTR_SYM]?.[name]?.[1](newValue ?? '')
        // R1 — prop path. Skip when this change was caused by our own reflect
        // (re-entrancy guard).
        if (!this[REFLECT_SYM].has(name)) {
          const propName = attrToProp.get(name)
          if (propName !== undefined) {
            const ps = this[PROPS_SYM]?.[propName]
            const def = (propsCfg as PropsConfig)[propName]
            if (ps !== undefined && def !== undefined) {
              ps.set(_convert(newValue, def, def.value))
            }
          }
        }
        // R2 (Director r6 §3.R2): userland $lifecycle.attributeChange runs
        // AFTER R1's $prop signal-update so authors observe the post-converted
        // signal value. Order: legacy attr signal → R1 prop signal → userland.
        const lc = this[LC_SYM]
        if (lc) _runAttrChanges(lc, name, oldValue, newValue)
      } finally {
        this._isInternalAttrChange = false
      }
    }

    // R2 (Director r6 §3): adoptedCallback dispatches userland onAdopt.
    adoptedCallback(): void {
      const lc = this[LC_SYM]
      if (lc) _runAdopts(lc)
    }

    disconnectedCallback(): void {
      const lc = this[LC_SYM]
      if (lc) _runCleanups(lc)
      this[S]?.dispose()
      this[S] = this[LC_SYM] = null
      this[PROPS_SYM] = null
      _scopes.delete(this)
    }
  }

  // R1 — JS property accessors on the class prototype, one per prop. Reads
  // call into the signal getter; writes flow through the same `.set` path
  // (including reflect). Userland: `el.title = 'new'` is observable.
  for (const [name] of propEntries) {
    Object.defineProperty(C.prototype, name, {
      configurable: true,
      enumerable: true,
      get(this: InstanceType<typeof C>) {
        return this[PROPS_SYM]?.[name]?.()
      },
      set(this: InstanceType<typeof C>, v: unknown) {
        this[PROPS_SYM]?.[name]?.set(v)
      },
    })
  }

  return C
}

// ─── R1 helpers ────────────────────────────────────────────────────────────

/** kebab-case a camelCase identifier (`myProp` → `my-prop`). Used for
 * the default `attribute:` mapping when the userland did not override.
 * Acceptance: matches Lit's reactive-element kebab-cased attribute default. */
function _kebab(s: string): string {
  return s.replace(/[A-Z]/g, (c, i) => (i === 0 ? c.toLowerCase() : `-${c.toLowerCase()}`))
}

/** Default attribute → typed value conversion when no `converter` is
 * supplied. Identity for strings (raw attribute string), Number coercion
 * for numbers, presence for booleans, JSON.parse for everything else.
 * NaN-guard: bad number attributes fall back to `fallback` (the declared
 * default).  Failed JSON.parse falls back to `fallback`. */
function _convert(raw: string | null, def: PropDef, fallback: unknown): unknown {
  if (def.converter) return def.converter(raw)
  // Boolean: attribute presence (null = absent = false, anything else = true).
  // Detect a boolean prop by inspecting the declared default's type.
  if (typeof fallback === 'boolean') return raw !== null
  if (raw === null) return fallback
  if (typeof fallback === 'number') {
    const n = Number(raw)
    return Number.isFinite(n) ? n : fallback
  }
  if (typeof fallback === 'string') return raw
  // Object / array / unknown — JSON parse with defensive fallback.
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

/** Stringify a value for `reflect: true` attribute writes. Booleans use
 * the WHATWG attribute presence convention: `false` removes the attribute
 * (return `null`); `true` writes empty string. Numbers and strings
 * `String()`-coerce. Objects JSON.stringify with a defensive fallback. */
function _reflectToAttr(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'boolean') return v ? '' : null
  if (typeof v === 'number' || typeof v === 'string') return String(v)
  try {
    return JSON.stringify(v)
  } catch {
    return null
  }
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
export function _onMount(fn: () => void | (() => void)): void {
  if (!_cur) throw new RuntimeError('SCR-R0010', 'no owner')
  _cur.m.push(fn)
}

export function _onCleanup(fn: () => void): void {
  if (!_cur) throw new RuntimeError('SCR-R0011', 'no owner')
  _cur.c.push(fn)
}

// R2 (Director r6 §3): four-callback $lifecycle extension. `onAdopt` and
// `onAttributeChange` mirror the platform adoptedCallback /
// attributeChangedCallback. Both register at setup() time per the same
// _cur-pointer convention used by onMount/onCleanup; the host class
// dispatches into these arrays from the platform-callback methods.
export function _onAdopt(fn: () => void): void {
  if (!_cur) throw new RuntimeError('SCR-R0012', 'no owner')
  _cur.a.push(fn)
}

export function _onAttributeChange(
  fn: (name: string, oldValue: string | null, newValue: string | null) => void,
): void {
  if (!_cur) throw new RuntimeError('SCR-R0013', 'no owner')
  _cur.ac.push(fn)
}
