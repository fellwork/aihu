import type { signal as SignalFactory } from '@aihu/signals'
import { _takeAgentServerBinding } from './agent-dispatch.ts'
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

/** Bug 6: safe tag-name lookup for the connectedCallback error path. A real
 * upgraded custom element always has a valid `tagName`, but the error handler
 * must NEVER itself throw (and thereby mask the original error) — e.g. if
 * invoked on a detached/non-Element receiver the `tagName` getter throws a
 * TypeError. Fall back to a sentinel so the attributable console.error always
 * fires and the original error is what re-throws. */
function _tagOf(el: HTMLElement): string {
  try {
    return el.tagName.toLowerCase()
  } catch {
    return 'unknown-element'
  }
}

/**
 * Bug D — light-DOM slot projection helper. Under `shadowMode: 'none'` the
 * browser does not run native <slot> projection, so the compiled-to-DOM
 * `<slot>` element from `<$slot>` is inert. After the layout template has
 * been mounted into `host`, find the default <slot> placeholder and replace
 * it with the carved light-DOM children. If the layout exposes no slot,
 * append the children back to the host as a graceful fallback — this
 * preserves prior behavior for components that don't author a slot at all.
 *
 * TODO(architect): named slots (`<slot name="foo">`) + default fallback
 * content (`<slot>fallback</slot>`) are NOT YET HANDLED. Named-slot routing
 * needs to match children with `slot="foo"` to the corresponding placeholder
 * (Shadow-DOM semantics). Default fallback should keep the slot's existing
 * rendered children when there are no projected nodes. Both are out of scope
 * for the v0 light-DOM fix; track as a follow-up.
 */
/** Bug D — safe `is-real-Element` check for the light-DOM slot carve. Some
 * existing tests invoke `connectedCallback()` directly on an
 * `Object.create(Cmp.prototype)` non-Element receiver to exercise specific
 * invariant throws (e.g. SCR-R0003). On such a receiver the `shadowRoot` /
 * `childNodes` getters throw TypeError. The carve must therefore degrade to
 * a no-op (preserving the legacy SCR-R0003 path) instead of throwing first. */
function _isRealElement(el: HTMLElement): boolean {
  try {
    // Touch a property that throws on non-Element receivers in jsdom/native.
    void el.childNodes
    return true
  } catch {
    return false
  }
}

function _projectLightDomSlot(host: HTMLElement, children: ChildNode[]): void {
  if (children.length === 0) return
  const slotEl = host.querySelector('slot:not([name])')
  if (slotEl !== null) {
    slotEl.replaceWith(...children)
    return
  }
  // No slot in the layout — reattach the children to the host so they remain
  // observable (no errors, no data loss). This preserves the prior behavior
  // of plain custom elements that simply contained children.
  for (const c of children) host.appendChild(c)
}

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
      /** @internal — hydration entry point. Runs setup and returns the node
       * tree without calling _mount. Called by define-element's hydration
       * branch via the `_build?()` check. */
      _build(): ReturnType<Setup> {
        const lc: _LC = { m: [], c: [], a: [], ac: [] }
        this[LC_SYM] = lc
        const host = this.shadowRoot ?? this
        _cur = lc
        try {
          return setup({ host, element: this } as SetupContext)
        } finally {
          _cur = null
        }
      }
      connectedCallback(): void {
        if (_mount === null) throw new RuntimeError('SCR-R0002', _E0002)
        // Bug 6: a throw from setup()/_build()/_mount() escapes into the
        // platform custom-element-reactions queue, which surfaces it only as a
        // bare anonymous "Uncaught" with no component-tag attribution (and the
        // shadow root is left empty because the throw aborts before mount runs).
        // Catch-log-rethrow: console.error WITH the tag for a greppable,
        // attributable signal, then re-throw to preserve fail-loud behavior
        // (so SCR-R0002/0003 invariants and any other throw still propagate).
        try {
          // Bug D — light-DOM slot projection. Under `shadowMode: 'none'` the
          // host has no shadow root, so the browser's native <slot> projection
          // does not run. Carve any existing light-DOM children BEFORE _mount
          // appends the layout template (otherwise the layout's nodes land
          // after them) and reinsert at the <slot> position after mount.
          // Shadow-DOM path is untouched (`host !== this`).
          const isLightDom = _isRealElement(this) && this.shadowRoot === null
          const lightDomChildren: ChildNode[] | null = isLightDom
            ? Array.from(this.childNodes)
            : null
          if (lightDomChildren !== null) {
            for (const c of lightDomChildren) this.removeChild(c)
          }
          const tree = this._build()
          const lc = this[LC_SYM]!
          const host = this.shadowRoot ?? this
          // Server-build @agent components register a full per-instance binding
          // in setup (keyed by `this`). Forward it to mount() so the LiveBinding
          // lands in arbor's componentInstanceRegistry — the headless gate path.
          // Client builds never register one (undefined → mount() no-ops it).
          const ab = _takeAgentServerBinding(this)
          const scope = ab ? _mount(tree!, host, { agentBinding: ab }) : _mount(tree!, host)
          this[S] = scope
          _scopes.set(this, scope)
          if (lightDomChildren !== null) _projectLightDomSlot(this, lightDomChildren)
          _runMounts(lc)
        } catch (err) {
          console.error(`[aihu] setup failed for <${_tagOf(this)}>:`, err)
          throw err
        }
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

  const {
    attrs = [] as unknown as ReadonlyArray<string>,
    setup,
    props: propsCfg,
    base,
  } = setupOrOptions
  // Recipe class-extension (§9.4): extend a primitive base instead of
  // HTMLElement so its connectedCallback (ARIA/keyboard/context) runs. When no
  // base is declared this is HTMLElement, so existing components are unchanged.
  const Base: typeof HTMLElement = base ?? HTMLElement
  const S = Symbol()
  const PROPS_SYM = Symbol()
  // Bug (pre-connect prop binding): per-instance buffer for prop writes that
  // arrive BEFORE _build() runs (i.e. before connectedCallback). At pre-connect
  // PROPS_SYM is null, so the prop setter has no signal to write to — arbor's
  // _materialize applies reactive `$prop` bindings via `el.prop = v` the moment
  // the element is created, before it is appended/connected. Without this buffer
  // the first bound value is silently dropped and the prop reverts to its
  // attribute/default at connect. Lazily allocated in the setter, drained in
  // _build() (where it takes precedence over the getAttribute/default fallback).
  const PENDING_SYM = Symbol()
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

  // observedAttributes = legacy `attrs` ∪ R1 prop attribute names ∪ the base
  // class's own observed attributes. A subclass's static `observedAttributes`
  // SHADOWS the base's, so without the union the base would stop seeing its
  // attributes (e.g. AihuButton's `disabled`/`pressed`) in
  // attributeChangedCallback. Union them when a base is present.
  const observed: string[] = [...attrs]
  for (const [, , attrName] of propEntries) {
    if (attrName !== null && !observed.includes(attrName)) observed.push(attrName)
  }
  const baseObserved = (Base as unknown as { observedAttributes?: string[] }).observedAttributes
  if (baseObserved) {
    for (const a of baseObserved) if (!observed.includes(a)) observed.push(a)
  }

  // Base lifecycle callbacks, captured once. `super.<cb>` can't be typed (the
  // DOM lib doesn't declare these on HTMLElement), so we dispatch via the base
  // prototype. All are `undefined` when `base` is unset (HTMLElement), so the
  // forwarding below is a no-op for ordinary components.
  type _LifecycleProto = {
    connectedCallback?: () => void
    disconnectedCallback?: () => void
    attributeChangedCallback?: (n: string, o: string | null, v: string | null) => void
  }
  const _baseProto = Base.prototype as _LifecycleProto

  // Reverse-lookup: attribute name → prop name. Used by attributeChangedCallback
  // to resolve which signal to update.
  const attrToProp = new Map<string, string>()
  for (const [name, , attrName] of propEntries) {
    if (attrName !== null) attrToProp.set(attrName, name)
  }

  class C extends Base {
    static readonly observedAttributes = observed
    private [S]: _ScopeRef | null = null
    private [LC_SYM]: _LC | null = null
    private [ATTR_SYM]: Record<string, ReturnType<typeof SignalFactory>> | null = null
    // R1 — per-instance prop signal map (callable getter + .set writer).
    private [PROPS_SYM]: Record<string, PropSignal> | null = null
    // Bug (pre-connect prop binding): pending writes keyed by prop name. `.has()`
    // distinguishes a buffered `undefined`/`null` from "never written". A Map
    // (gzips well against the file's existing Map use). Declared (no initializer)
    // → `undefined` until the first pre-connect write, so it adds no constructor
    // bytes.
    private [PENDING_SYM]: Map<string, unknown> | undefined = undefined
    // R1 — re-entrancy guard for reflect: true. Set during setAttribute writes
    // triggered by signal updates so attributeChangedCallback skips dispatch.
    private [REFLECT_SYM] = new Set<string>()
    // R4/Q3 (Director r6 §2.Q3): coarse-grained reflect-loop guard. Set on
    // entry to attributeChangedCallback, cleared in finally. While set, any
    // ps.set() that would reflect back to attribute is suppressed — covers
    // the cross-component $bind + reflect: true cycle (Lit's _isReflecting
    // precedent).
    _isInternalAttrChange: boolean = false

    constructor() {
      // Custom-element constructors are always invoked with no arguments (the
      // spec forbids parameters), so `super()` covers HTMLElement and any custom
      // `$extends` base alike.
      super()
      // Upgrade rescue. A prop assigned to an element BEFORE its tag was
      // `define()`d — the lazy/async-import case, where the tag renders and is
      // written to before its chunk lands — has no accessor to catch it, so it
      // lands as an OWN property that then SHADOWS the prototype accessor forever
      // once the element upgrades: the setter never runs, the signal never sees
      // the value, and the prop silently reverts to its default. Capture each
      // such own property, delete it, and re-assign THROUGH the accessor, which
      // (pre-connect) buffers it into PENDING_SYM for `_build()` to seed. Fields
      // above are already initialized by the time this runs, so the accessor's
      // pre-connect branch is live.
      for (const [name] of propEntries) {
        if (Object.hasOwn(this, name)) {
          const buffered = (this as Record<string, unknown>)[name]
          delete (this as Record<string, unknown>)[name]
          ;(this as Record<string, unknown>)[name] = buffered
        }
      }
    }

    /** @internal — hydration entry point. Runs the signal/prop preamble
     * and setup, returning the node tree without calling _mount. Called by
     * define-element's hydration branch via the `_build?()` check. */
    _build(): ReturnType<typeof setup> {
      if (_signal === null && (attrs.length > 0 || propEntries.length > 0)) {
        throw new RuntimeError('SCR-R0003', 'no signal')
      }
      const attrSignals: Record<string, ReturnType<typeof SignalFactory>> = {}
      for (const name of attrs) attrSignals[name] = _signal!(this.getAttribute(name) ?? '')
      this[ATTR_SYM] = attrSignals

      // R1 — allocate per-prop signal at connect time. Initial value priority:
      // (0) a value buffered by a pre-connect property write (Bug: pre-connect
      // prop binding) — wins over everything, kept as-is with NO stringification
      // so objects/functions/arrays survive intact; (1) raw attribute string
      // passed through converter (when attribute is observed AND already set on
      // the element); (2) `def.value` default.
      const pending = this[PENDING_SYM]
      const propSignals: Record<string, PropSignal> = {}
      for (const [name, def, attrName] of propEntries) {
        let initial: unknown = def.value
        if (attrName !== null) {
          const raw = this.getAttribute(attrName)
          if (raw !== null) {
            initial = _convert(raw, def, def.value)
          }
        }
        // (0) Pre-connect buffered write takes precedence. `.has()` so a
        // deliberately-buffered `undefined`/`null` still wins over the default.
        if (pending?.has(name)) initial = pending.get(name)
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
      // Buffer fully drained — drop it so a later disconnect→reconnect rebuilds
      // from attribute/default (live signals carry forward via the writes
      // themselves) and we don't replay a stale pre-connect value.
      this[PENDING_SYM] = undefined

      const lc: _LC = { m: [], c: [], a: [], ac: [] }
      this[LC_SYM] = lc
      const host = this.shadowRoot ?? this
      _cur = lc
      try {
        return setup({
          host,
          element: this,
          attrs: attrSignals,
          props: propSignals,
        } as Parameters<typeof setup>[0])
      } finally {
        _cur = null
      }
    }

    connectedCallback(): void {
      if (_mount === null) throw new RuntimeError('SCR-R0002', _E0002)
      // Bug 6 (options/props-form): same catch-log-rethrow as the function-form
      // connectedCallback above. A setup/build/mount throw — incl. the
      // SCR-R0003 "no signal" invariant from _build() — is logged WITH the tag
      // for attribution, then re-thrown to preserve fail-loud propagation.
      try {
        // §9.4 class-extension: run the base primitive's connectedCallback
        // FIRST — it sets role/tabindex/aria-* and listeners on the HOST and
        // provides any cross-piece context, none of which touch the host's
        // children. Running it before the template mounts means a
        // context-providing primitive (e.g. checkbox root) is registered
        // before its slotted child pieces upgrade. Dispatched via the base
        // prototype (the DOM lib can't type `super.connectedCallback`); a no-op
        // when the base is HTMLElement, so existing components are unaffected.
        _baseProto.connectedCallback?.call(this)
        // Bug D — light-DOM slot projection (see function-form for the full
        // rationale). Mirrored here so options/props-form components behave
        // identically under `shadowMode: 'none'`.
        const isLightDom = _isRealElement(this) && this.shadowRoot === null
        const lightDomChildren: ChildNode[] | null = isLightDom ? Array.from(this.childNodes) : null
        if (lightDomChildren !== null) {
          for (const c of lightDomChildren) this.removeChild(c)
        }
        const tree = this._build()
        const lc = this[LC_SYM]!
        const host = this.shadowRoot ?? this
        // See function-form connectedCallback: forward the server @agent binding
        // (registered in setup, keyed by `this`) to mount() so the headless gate
        // sees a LiveBinding. Client builds never register one.
        const ab = _takeAgentServerBinding(this)
        const scope = ab ? _mount?.(tree!, host, { agentBinding: ab }) : _mount?.(tree!, host)
        this[S] = scope
        _scopes.set(this, scope)
        if (lightDomChildren !== null) _projectLightDomSlot(this, lightDomChildren)
        _runMounts(lc)
      } catch (err) {
        console.error(`[aihu] setup failed for <${_tagOf(this)}>:`, err)
        throw err
      }
    }

    attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
      // §9.4 class-extension: forward to the base FIRST so a base that observes
      // its own attributes (e.g. AihuButton's `disabled`/`pressed`) reacts. The
      // union'd observedAttributes is what makes this callback fire for the
      // base's attrs at all. No-op when base is HTMLElement.
      _baseProto.attributeChangedCallback?.call(this, name, oldValue, newValue)
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

    // R2 (Director r6 §3): adoptedCallback dispatches userland onAdopt. A base
    // primitive's adoptedCallback is NOT forwarded — no primitive defines one,
    // and document-adoption of a custom element is a rare edge the recipe layer
    // doesn't need (kept lean for the runtime size budget).
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
      // §9.4 class-extension: let the base tear down its own listeners/effects
      // (e.g. AihuButton's disposer array). Last, after our scope dispose.
      _baseProto.disconnectedCallback?.call(this)
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
        const props = this[PROPS_SYM]
        // Pre-connect: signals not built yet (PROPS_SYM null). Buffer the write
        // per prop (exact value/type, no stringification) so _build() can seed
        // it — otherwise the write is silently dropped and the prop reverts to
        // its default. Post-connect: write straight through to the signal.
        if (props !== null) props[name]?.set(v)
        else (this[PENDING_SYM] ??= new Map()).set(name, v)
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
