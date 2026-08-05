import { type DefineOptions, RuntimeError, type ShadowMode } from './types.ts'

function wrapClass(
  Ctor: typeof HTMLElement,
  mode: ShadowMode,
  lightScopeId?: string,
): typeof HTMLElement {
  // DA4 (#437): the mode is BINARY. `'shadow'` attaches an OPEN root — open
  // is the only browser mode aihu can use, because composition and hydration
  // read `this.shadowRoot` (a closed root nulls it and would be misdetected
  // as light DOM). `'light'` attaches nothing, so `this.shadowRoot === null`
  // is an unambiguous light-DOM detection.
  //
  // The fast path below skips wrapping entirely for the common light case —
  // EXCEPT when `lightScopeId` is set (light-DOM leaf flip, LDF §10 step 3):
  // stamping `data-a` needs a connectedCallback override, so a scoped
  // component must always be wrapped even though it attaches no shadow root.
  //
  // NOTE there is no hydration branch here any more. Hydration used to be a
  // SEPARATE connect path in this wrapper (`options.hydrate` +
  // `__aihu_state__[name]` gating a direct `_hydrateFn(...)` call) that
  // bypassed defineComponent's whole mount phase — no lifecycle host, no
  // `onMount`, no slot projection. First-render DOM adoption deleted the fork:
  // defineComponent's connectedCallback is the ONE connect path and chooses
  // its renderer (`_hydrate` vs `_mount`) itself, keyed on the server's
  // `data-aihu-ssr` host marker — see `_setHydrate`/`ADOPT_ATTR` in
  // define-component.ts.
  if (mode === 'light' && !lightScopeId) return Ctor
  const attachShadow = mode === 'shadow'

  class Wrapped extends Ctor {
    constructor() {
      super()
      if (attachShadow) {
        this.attachShadow({ mode: 'open' })
      }
      // NOT here: the Custom Elements spec forbids mutating attributes
      // inside a custom element constructor (an element's attributes must
      // be empty at construction time) — browsers throw `NotSupportedError`
      // on `setAttribute` this early. `data-a` is stamped in
      // `connectedCallback` instead, below.
    }

    connectedCallback(): void {
      // Idempotent: a server-rendered element already carries `data-a` from
      // `ssr_string_emit.rs`'s `root_scope_attr` (same value, by construction
      // — both read the SAME compiler-computed `lightScopeId`), so this is a
      // no-op re-stamp on hydration and the real stamp for client-only mounts.
      if (lightScopeId) {
        this.setAttribute('data-a', lightScopeId)
      }
      ;(_proto.connectedCallback as (() => void) | undefined)?.call(this)
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
  // Only meaningful in light mode — see the doc comment on
  // `DefineOptions.lightScopeId`. A shadow-mode component ignores it even if
  // present (shouldn't happen: `_injectShadowMode` only ever sets it
  // alongside `shadowMode: 'light'`), rather than trusting caller intent.
  const lightScopeId = mode === 'light' ? options?.lightScopeId : undefined
  const Wrapped = wrapClass(Ctor, mode, lightScopeId)
  // D5 — must be stamped BEFORE define(); the definition algorithm reads it
  // off the constructor there and never looks again.
  if (options?.formAssociated) {
    ;(Wrapped as unknown as { formAssociated: boolean }).formAssociated = true
  }
  customElements.define(name, Wrapped)
}
