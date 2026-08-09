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
 *
 * ## Registration without a DOM: every `defineX()` is a documented NO-OP
 *
 * The class-declaration fix above makes a primitive module IMPORTABLE without a
 * DOM. It does not make `defineSlider()` CALLABLE — that function's first act
 * is `customElements.get(tag)`, and `customElements` is `undefined` in workerd
 * too. Those are two different bugs at two different times: the import throws
 * at module load, the call throws whenever the caller runs.
 *
 * And the caller runs on the server. A `.aihu` recipe that COMPOSES a primitive
 * instead of extending it (`before-after.aihu`'s `defineSlider()`,
 * `temperature.aihu`'s `defineRadioGroup()`) has to register that primitive
 * itself, and it does so from its `@state` block — which the compiler emits
 * verbatim into `__aihu_setup__` and `__aihu_ssr_string_setup__`, i.e. into the
 * body that every server render executes. So under `output: 'ssr'` the call
 * threw `ReferenceError: customElements is not defined` on every request.
 *
 * So every `defineX()` in this package now returns early, silently, when
 * `customElements` does not exist. The reasoning is the same one that justifies
 * throwing on CONSTRUCTION above, arriving at the opposite answer for a
 * defensible reason:
 *
 *   - Registration is a pure side effect on `window.customElements`, with no
 *     return value and no server-side consumer. An SSR render resolves child
 *     components through the compiler's module registry
 *     (`virtual:aihu-server-components`), never through `customElements`, and a
 *     server render never mounts, so nothing observable is lost by skipping it.
 *     Construction is the opposite: the caller wants a working element and
 *     would get a broken one, so it fails loud.
 *   - It is not a new policy, it is the EXISTING one. The compiler already
 *     emits every compiled component's own registration as
 *     `if (typeof HTMLElement !== 'undefined' && typeof customElements !==
 *     'undefined') defineElement(…)`. "No DOM → skip registration" is what
 *     aihu already does for the registrations it controls; this extends it to
 *     the ones a primitive owns.
 *   - Throwing a better-worded error would not help anyone. The `defineX()`
 *     call is CORRECT code that happens to also run on the server; there is no
 *     edit the author could make in response.
 *
 * Unlike the conditional base, this is decided per CALL, not once at module
 * load — so a host that installs a DOM shim late does get real registration.
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
