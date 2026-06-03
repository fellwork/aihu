/**
 * vitest setupFile — minimal jsdom polyfills for Constructable Stylesheets.
 *
 * jsdom 25 ships a `CSSStyleSheet` constructor but no `replaceSync`, and no
 * `adoptedStyleSheets` setter on `ShadowRoot`/`Document`. The REAL compiled
 * component adopts a `CSSStyleSheet` for its `@style` block, so we provide a
 * no-op-but-correct shim. CSS is not under test here — the capability bridge is.
 */

const SheetCtor = globalThis.CSSStyleSheet as unknown as
  | {
      prototype: {
        replaceSync?: (text: string) => void
        replace?: (text: string) => Promise<unknown>
      }
    }
  | undefined

if (SheetCtor?.prototype && typeof SheetCtor.prototype.replaceSync !== 'function') {
  SheetCtor.prototype.replaceSync = function replaceSync(): void {
    /* no-op: CSS rendering is out of scope for the bridge test */
  }
}
if (SheetCtor?.prototype && typeof SheetCtor.prototype.replace !== 'function') {
  SheetCtor.prototype.replace = function replace(): Promise<unknown> {
    return Promise.resolve()
  }
}

// `adoptedStyleSheets` — define a writable array property on ShadowRoot and
// Document prototypes if the host lacks it (jsdom does).
for (const Ctor of [globalThis.ShadowRoot, globalThis.Document]) {
  const proto = (Ctor as unknown as { prototype?: object } | undefined)?.prototype
  if (proto && !Object.getOwnPropertyDescriptor(proto, 'adoptedStyleSheets')) {
    const store = new WeakMap<object, unknown[]>()
    Object.defineProperty(proto, 'adoptedStyleSheets', {
      configurable: true,
      get() {
        return store.get(this) ?? []
      },
      set(v: unknown[]) {
        store.set(this, v)
      },
    })
  }
}
