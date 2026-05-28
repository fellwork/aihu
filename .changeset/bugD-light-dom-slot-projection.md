---
"@aihu/runtime": patch
---

Fix `<$slot>` projection under `shadowMode: 'none'`. The compiler lowers `<$slot>` to a real `<slot>` DOM element, which the browser only projects against light-DOM children when there is an actual Shadow Root. With `shadowMode: 'none'` there is no shadow root, so the `<slot>` element was inert — and worse, the parent's `_materialize` had already appended the page's children to the host BEFORE the layout's `connectedCallback` ran, so the layout template was appended AFTER them. End result: `<layout-default><h1>...</h1></layout-default>` rendered as `[h1, nav]` instead of `[nav, h1]`.

`defineComponent.connectedCallback` now adds a light-DOM-only branch (guarded by `this.shadowRoot === null`): carve `this.childNodes` into a buffer, clear the host, run `_build()`/`_mount()`, then locate the first default `<slot>` in the host subtree and `replaceWith(...bufferedChildren)`. If the layout exposes no slot, the children are reappended to the host as a graceful fallback (preserves prior behavior for plain custom elements that simply contained children). Both function-form and options/props-form `connectedCallback` are patched. Shadow-DOM path (`this.shadowRoot !== null`) is untouched — the browser continues to handle projection natively.

**Deferred to follow-up (not in this fix):** named slots (`<slot name="foo">` routing children by `slot="foo"` attribute) and default fallback content (`<slot>fallback</slot>` keeping the fallback subtree when no children are projected). A `TODO(architect)` comment marks the gap in `define-component.ts`.
