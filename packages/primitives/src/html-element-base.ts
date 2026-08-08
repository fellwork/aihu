/**
 * `HTMLElementBase` — the class every primitive extends INSTEAD of the bare
 * `HTMLElement` global.
 *
 * ## Why this exists
 *
 * `class AihuSwitchRoot extends HTMLElement {}` is evaluated when the module
 * is *loaded*, not when the element is constructed or registered. In a runtime
 * with no DOM the global does not exist, so merely `import`ing
 * `@aihu/primitives/switch` throws `ReferenceError: HTMLElement is not
 * defined` before one line of consumer code runs.
 *
 * That is not a theoretical Node-only concern. A `.aihu` component using the
 * `$extends`/`base:` recipe imports its base primitive at module scope, and
 * under `output: 'ssr'` that module is part of the built Cloudflare Worker.
 * The Workers runtime (workerd) exposes `HTMLRewriter` but **not**
 * `HTMLElement`, `customElements`, `CSSStyleSheet`, `document`, `Element` or
 * `ElementInternals` — verified against workerd directly, not assumed. So the
 * server bundle failed to evaluate and the whole request died in the router's
 * registry import, long before anything could render.
 *
 * ## The shape, and why this one
 *
 * A *conditional base* rather than a lazy `getAihuSwitchRoot()` factory (the
 * shape `@aihu-plugin/kindly-note` uses for its own DOM classes). The factory
 * shape is only available to a package whose class is an implementation
 * detail. Here the class IS the public API: consumers import `AihuSwitchRoot`
 * by name, the `defineX()` registries hold direct references, and the
 * compiler's `$extends: AihuSwitchRoot` recipe lowers to
 * `defineComponent({ base: AihuSwitchRoot })` — a class *identifier*, not a
 * call. Deferring the declaration would be a breaking API change across every
 * primitive and would break the `base:` recipe outright.
 *
 * With the conditional base, a DOM-less import gets a real, inert class
 * object: the module evaluates, the export exists, `Base.prototype` reads
 * (which `@aihu/runtime`'s `defineComponent` performs on `base`) are safe, and
 * nothing observable changes in a browser, where `HTMLElementBase === HTMLElement`
 * identically.
 *
 * ## Constructing one without a DOM throws, deliberately
 *
 * Registration and construction are DOM-only operations with no meaningful
 * server behavior — a server render never mounts. Rather than hand back an
 * object that silently lacks `setAttribute`/`addEventListener` and fails
 * somewhere far from the cause, the no-DOM placeholder throws at
 * construction with a message that names the situation.
 *
 * ## Known limitation (inherent to any non-lazy shape)
 *
 * The choice is made ONCE, when this module first evaluates. A host that
 * installs a DOM shim *after* importing a primitive keeps the placeholder.
 * That is strictly better than today's behavior (the import itself threw), and
 * avoiding it entirely would require the lazy-factory shape this class-as-API
 * package cannot adopt. Install DOM shims before importing primitives.
 */

/**
 * Stand-in for `HTMLElement` where the global does not exist. Exists to make
 * the class *declaration* evaluate; constructing one is always a mistake.
 */
class NoDomHTMLElement {
  constructor() {
    throw new TypeError(
      '@aihu/primitives: this custom element was declared against a no-DOM ' +
        'placeholder because `HTMLElement` did not exist when the module ' +
        'loaded (SSR / Cloudflare Worker / bare node). Construct and register ' +
        'primitives in the browser only.',
    )
  }
}

/**
 * `HTMLElement` in a DOM; an inert, throw-on-construct placeholder elsewhere.
 *
 * Extend this instead of `HTMLElement` in any class declared at module scope
 * that may be imported by a server bundle — including userland base classes
 * written for the compiler's `$extends`/`base:` recipe.
 */
export const HTMLElementBase: typeof HTMLElement =
  typeof HTMLElement === 'undefined'
    ? (NoDomHTMLElement as unknown as typeof HTMLElement)
    : HTMLElement
