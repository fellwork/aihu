---
"@aihu/runtime": patch
"@aihu/compiler": patch
---

Make `$form` (D5) and `$aria` (B4) components actually run, and stop the
playground preview from dropping compiled presets on the floor.

`$form`/`$aria` were emit-tested but never executed, and four independent bugs
had accumulated behind that:

1. **`formAssociated` was assigned after registration, to `undefined`.** The
   compiler bound `defineElement(...)`'s result to `const _aihuFormEl_<tag>` and
   then wrote `.formAssociated = true` on it. `defineElement` returns `void`, so
   that write threw `Cannot set properties of undefined` at module evaluation —
   and even against a real class it would have been ignored, because
   `customElements.define()` reads `formAssociated` off the constructor at
   define time and never looks again. `defineElement` now takes a
   `formAssociated` option and stamps it on the wrapped class *before*
   `customElements.define`; the compiler passes
   `{ formAssociated: true }` instead of emitting the post-define assignment.

2. **The wiring wrote through `this`.** Both collections emitted
   `this._internals = this.attachInternals()` into the setup body — but setup is
   an arrow (`setup: (ctx) => …`), so `this` there is the module's `this`
   (`undefined` under ESM), never the element. Every `$aria`/`$form` component
   threw on construction. The wiring now binds `ctx.element`.

3. **`$form` entry expressions skipped the signal-read rewrite.** Inside
   `@state`, `value` names the getter, so `$form: { value: () => value }` was
   handing `setFormValue` a *function* (`The provided value is not of type
   '(File or USVString or FormData)?'`) and `validity` was calling `.trim()` on
   one. Entry expressions now go through the same rewrite the template and
   `derived`/`action` bodies get, and a thunk entry is called rather than passed
   through.

4. **`setValidity(flags)` throws once any flag is true.** `$form` has no
   `message` key, so the one-argument call could only work while the field was
   valid. A fallback message is now derived from the failing flag names.

On the docs playground side, `stripTs` — which erases the compiler's TS output
so it can run in a plain `<script>` — had two holes that made the whole script
a `SyntaxError` (no error surfaced; the preview just came up empty):

- Parameter type annotations on the `function` declarations `action()` lowers
  to (`function onInput(e: Event)`) were never stripped.
- The ` as unknown as <Type>` rule was greedy across `}`, so
  `setTimeout(…, 300) as unknown as number });` lost the arrow body's closing
  brace. It is now bounded to a single type reference, and covers ` as any` /
  ` as ShadowRoot` / `as unknown as` in one rule.

Also adds `@aihu/context` to the root tsconfig `paths` map. The playground's
preview-runtime IIFE resolves `@aihu/*` through those paths (no package `dist`
exists at docs-build time); `@aihu/context` was missing, so rolldown treated it
as external and the bundle referenced an undefined `_aihu_context` global —
`window.__aihu` was never assigned and every preset died on
`Cannot read properties of undefined (reading 'branch')`.
