---
'@aihu/ui': patch
---

Delete the dead `customElements.define` block from `card`, `badge`, `separator`
and `button`, and correct the two architectural claims it was standing in for.

This closes the open finding filed at the end of
`.changeset/ssr-setup-body-dom-guard.md`. That change SSR-guarded these four
`@state` blocks to preserve their behavior exactly, and while doing so noticed
the blocks never ran in a browser either. Reproduced independently here before
acting on it, and the finding holds — with one correction, below.

**The mechanism, from the compiler's actual output.** `aihu-compile --target
client` on `card.aihu` emits, in this order:

```js
const __style__ = new CSSStyleSheet();            // module scope
__style__.replaceSync(`.aihu-card { … }`);

defineElement('aihu-card', defineComponent((ctx) => {   // module scope
  (ctx.host as ShadowRoot).adoptedStyleSheets = [__style__];
  if (typeof HTMLElement !== 'undefined' && …) {        // the recipe's @state
    class AihuCard extends HTMLElement { static sheet = new CSSStyleSheet() … }
    if (!customElements.get('aihu-card')) customElements.define('aihu-card', AihuCard)
  }
  return branch('div', …)
}))
```

`defineElement` runs when the module evaluates. The `@state` block is emitted
into the *setup* body, which the runtime calls only when an element **upgrades**
— strictly afterwards. So `customElements.get('aihu-card')` is already truthy
the first time the recipe's own guard reads it, and always will be. Loading the
compiled module in jsdom and instrumenting `customElements.define` confirms it:
one call, tag `aihu-card`, constructor `Wrapped` (the runtime's
`wrapClass`), at module load — and after upgrading two instances, still one
call. The recipe's class never registers. `aihu add`'s `substitutePrefix`
rewrites the tag and the filename together, so it was not registering a phantom
element under a stale prefix either.

**Correction to the filed finding: R2 was never broken.** The note concluded
that "the compiled recipe stylesheet is a shared static Constructable StyleSheet
adopted into the shadow root" was therefore not delivered. It is delivered — by
the compiler, which is where it belongs. `__style__` above is module-scope
(constructed once per module, not per instance), carries the real compiled
`@style` rules, and is assigned to `ctx.host.adoptedStyleSheets` for every
instance. Measured on the compiled module: one adopted sheet per shadow root,
the SAME object across two instances, four parsed rules for `card`. What the
four recipes hand-rolled was a *second*, redundant implementation of a contract
the compiler already satisfied — and their `static sheet = new CSSStyleSheet()`
was never `replaceSync`'d, so it held zero rules. Had it somehow won
registration it would have attached a bare shadow root with no template and no
CSS: strictly worse than what ships.

**Chosen: delete it.** The alternative in the filed note — teach the compiler to
honour a class the recipe defines — is not a gap in the framework. Supplying a
base class is exactly what `$extends:`/`base:` already does: the compiler emits
`defineComponent({ base: X })`, the runtime does `class C extends Base` and then
`class Wrapped extends C`, so the named class really is in the prototype chain.
Eleven recipes already use it (`checkbox`, `switch`, the `dialog-*`, `popover-*`
and `tooltip-*` pieces, `temperature`). These four were not reaching for a
missing mechanism; they were duplicating one that exists, in a position where it
could not run.

**And `$extends` is the WRONG tool for these four — measured, not assumed.**
The tempting reading is that `button.aihu`, which imported `AihuButton` and
claimed to be "the class-extension recipe", should simply migrate to
`base: AihuButton`. Compiled and driven, that turns out to be a regression. Its
`@template` renders a real `<button type="button">` inside the shadow root, and
`AihuButton`'s contract is "if the host is NOT a native `<button>`, set
`role="button"` + `tabindex="0"` and translate Enter/Space into `this.click()`".
Applying it here:

| | host `role` | host `tabindex` | inner native `<button>` |
| --- | --- | --- | --- |
| shipped today | *(none)* | *(none)* | present |
| with `base: AihuButton` | `button` | `0` | present |

— a focusable widget wrapping a focusable control: nested interactive controls,
two tab stops, and Enter activating twice. That is precisely the failure
`input.aihu` already documents as the reason it takes no base ("the native
control plus light DOM is enough for forms; extending a primitive would fight
the template-rendered native element"). `button`, `card`, `badge` and
`separator` all render the semantic element in their template, so all four
belong in the no-`$extends` camp with `input` / `textarea` / `label`. The
recipes' headers now say so, and say where the class-extension model lives
instead.

**What actually changes at runtime.** Nothing visual — the CSS was always coming
from `__style__`, and the a11y/ARIA was always coming from the template
(`separator.stories.ts` had already noticed this and asserted against the
template element, calling it a "Track 0 finding"). Two real, small wins:

- the class declaration and its throwaway `new CSSStyleSheet()` sat inside the
  setup body, so they were re-evaluated on EVERY instance. Loading a recipe and
  upgrading two elements used to cost 3 sheet constructions; it now costs 1.
- `button`'s compiled module no longer imports `@aihu/primitives/button` (and
  transitively its context/form-control/signals edges) for a class it never
  used. `meta.json`'s `dependencies: ['@aihu/primitives']` and the generated
  `registry.json` entry drop with it — `aihu add button` no longer tells
  consumers to install a package the recipe does not use.

**`tests/shadow-adoption.test.ts` is rebuilt, because the old one was a
landmine.** It re-declared the recipe class by hand in TypeScript, registered
*that* itself, and asserted the result — validating a code path production never
takes. It could not have failed for a third reason either: jsdom 25 exposes a
`CSSStyleSheet` constructor but implements neither `replaceSync` nor a real
`adoptedStyleSheets` accessor, so `shadowRoot.adoptedStyleSheets = [sheet]` was a
plain expando write that `toContain(sheet)` read straight back. The replacement
compiles all four recipes with the real binary at the real client target, loads
the emitted modules, upgrades two instances of each, and asserts against those:
one adopted sheet per shadow root carrying the recipe's own selectors, the same
object across instances, exactly one `CSSStyleSheet` construction per recipe,
exactly one `customElements.define` per tag, and the template actually rendered.
Falsified in both directions: restoring all four pre-fix sources turns 8 of its
25 assertions red (4 sheet-construction counts, 4 source guards), and the
"registered exactly once" assertions stay green under the old sources too —
which is the honest result, since the dead `define` genuinely never fired.

**Real-browser confirmation, since jsdom cannot give it.** The Storybook + axe
gate (`bun run check:a11y`) drives all four recipes in chromium, and three
stories gained assertions that only mean something there: `UI/Card` Default
checks `adoptedStyleSheets.length === 1` with no inline `<style>` and real
computed `border-radius: 8px` / `padding: 24px`; `UI/Badge` Variants checks each
variant resolves a distinct background, proving the `[data-variant]` selectors
are live in the shadow cascade; `UI/Button` Default checks the computed size
box AND pins the host as having no `role` and no `tabindex` — the property the
`$extends` migration would have broken.

`packages/ui/README.md` gains two sections — "CSS attachment (R2): the compiler
owns it" and "Do NOT register the element yourself" — and its SSR-guard example
no longer teaches the dead pattern as the thing to guard. That example mattered:
these recipes are copied verbatim into consumer projects by `aihu add`.
