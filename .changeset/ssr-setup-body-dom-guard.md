---
'@aihu/primitives': patch
'@aihu/ui': patch
---

Fix a live, currently-shipping crash for `@aihu/ui` styled recipes under
`output: 'ssr'` — a component's `@state` block runs on the server, and six
recipes touched a DOM global from inside it.

**This was already live, and on a page it did not fail soft.** The compiler
emits an `@state` block VERBATIM into `__aihu_setup__` and
`__aihu_ssr_string_setup__` — the body a server render executes for every
component. Six shipped recipes put a DOM-only operation there:

| recipe | what it did in `@state` | threw |
| --- | --- | --- |
| `card`, `badge`, `separator` | `class X extends HTMLElement` + `static sheet = new CSSStyleSheet()` + `customElements.define` | `HTMLElement is not defined` |
| `button` | same, extending `AihuButton` (import-safe, but the static initializer and registration are not) | `CSSStyleSheet is not defined` |
| `before-after` | `defineSlider()` from `@aihu/primitives/slider` | `customElements is not defined` |
| `temperature` | `defineRadioGroup()` from `@aihu/primitives/radio-group` | `customElements is not defined` |

Two outcomes, and only one is survivable. As a CHILD, `__aihu_schild` catches
the throw and degrades that element to `<aihu-card></aihu-card>` with a console
error — the page ships with a hole in it. As a PAGE or a LAYOUT there is no
such net: `handle()` calls `renderToString` directly, the `ReferenceError`
propagates out of the Worker's `fetch`, and the request gets **no response at
all**. Both reproduced against a real built Worker, not inferred.

**This is a DIFFERENT bug from `$extends`, at a different time.**
`.changeset/ssr-extends-base-guard.md` fixed a crash at module LOAD: a class
declared at a primitive module's own top level, whose extends clause is
evaluated on import. That fix (`HTMLElementBase`) is necessary and is not
sufficient here, because nothing about it reaches code that runs later. This
crash is at SETUP-BODY EXECUTION, which happens for every server-rendered
component whether or not it has a `base:` clause — and `HTMLElementBase` cannot
help a `new CSSStyleSheet()` or a `customElements.get()` written by an author.

**The filed scope was wrong in both directions; corrected by measurement.**

- `chat-fab.aihu` was flagged as calling `defineX()`. It does not — its only
  mention of `customElements.define` is a comment explaining why it deliberately
  does NOT call `definePopover()`. Removed from scope.
- `button.aihu` was NOT flagged and is affected — the same class + Constructable
  StyleSheet shape as `card`/`badge`/`separator`. Added to scope.
- A sweep of all 301 `.aihu` files in the repo (not just `packages/ui`) found no
  further instances. Every other DOM reference in a `@state` block is inside
  `onMount`, an `action`, or an event handler — none of which run on the server
  — or is already `typeof`-guarded (`apps/docs`), or reaches `@aihu/use`, whose
  composables carry their own `isClient` no-op contract.
  `examples/primitives-showcase` does call `defineButton`/`defineDialog`/
  `defineTooltip` from `@state`; it is a SPA build, so it never crashed, but it
  is fixed by the same change below.

**Two fixes, in two packages, and neither is sufficient alone.**

1. `@aihu/primitives` — all 17 `defineX()` registration entry points now return
   early when `typeof customElements === 'undefined'`. Fixed ONCE for every
   caller, rather than as ~18 edits across recipes, examples and consumer code
   that does not exist yet.

   **The no-op is deliberate, and it is not a new policy.** The filed note
   raised it as an open behavior decision ("silently skipping registration").
   Three things settle it. Registration is a pure side effect on
   `window.customElements` with no return value and no server-side consumer: an
   SSR render resolves children through the compiler's module registry
   (`virtual:aihu-server-components`), never through `customElements`, and a
   server render never mounts — so nothing observable is lost. The compiler
   ALREADY emits every compiled component's own registration as
   `if (typeof HTMLElement !== 'undefined' && typeof customElements !==
   'undefined') defineElement(…)`, so "no DOM → skip registration" is what aihu
   does everywhere it controls the registration; this extends it to the ones a
   primitive owns. And a better-worded throw would help nobody: the `defineX()`
   call is correct code that happens to also run on the server, and there is no
   edit the author could make in response.

   This is the opposite answer to `HTMLElementBase`'s throw-on-CONSTRUCT, for a
   reason stated in that file's docblock: construction hands back an object the
   caller will use and find broken, so it fails loud. Unlike the conditional
   base, the check here is per CALL, so a host that installs a DOM shim late
   still gets real registration.

2. `@aihu/ui` — `card`, `badge`, `separator` and `button` wrap their `@state`
   class + registration in the same `typeof HTMLElement !== 'undefined' &&
   typeof customElements !== 'undefined'` condition the compiler puts on its own
   `defineElement` call a few lines below in the emitted module. This one has to
   live in authored source: no shared function is involved, the compiler emits
   what the author wrote, and these recipes are copied verbatim into consumer
   projects by `aihu add`. Documented in `packages/ui/README.md` §"Authoring a
   recipe: `@state` runs on the SERVER too".

No compiler change was needed. The `@style` block's own `new CSSStyleSheet()`
is already elided at the server target (`emit_ssr_css_export`, `emit.rs`); only
author-written code was reaching a DOM global.

**Verified end-to-end, then reverted in both directions.** The
`workers-ssr` fixture gained three probes (a styled-recipe child, the same shape
on a page, and an unguarded `defineSlider()` call), built by a real `vite build`
and driven as a built Worker. Before: the child rendered empty with
`ReferenceError: HTMLElement is not defined`, and `GET /recipe-page` threw out
of `mod.default.fetch` with no response. After: 200, content rendered inside the
outlet. Each fix was then reverted INDEPENDENTLY against that same Worker:

| primitives | ui recipes | result |
| --- | --- | --- |
| ✗ | ✗ | both shapes broken (the filed crash) |
| ✓ | ✗ | assertions 16 + 17 red — the library fix cannot reach authored code |
| ✗ | ✓ | assertion 18 red — `customElements is not defined` from `defineSlider` |
| ✓ | ✓ | 23/23 green |

Pinned by three layers. `workers-ssr-e2e.test.ts` assertions 16/16b/17/18/18b (a
real Worker, with empty-registry controls proving the content resolves through
the child registry rather than being inlined). A new
`packages/ui/tests/ssr-recipe-safety.test.ts` that compiles all 53 registry
recipes to the server target with the real compiler binary and CALLS
`__ssrString` and `__ssr` in a node realm with no DOM — execution, not a regex,
so a future recipe reaching for `matchMedia` or `new ResizeObserver()` at setup
time fails too; reverting the ui fix turns 8 of its 109 assertions red, and
reverting the primitives fix turns exactly `before-after` and `temperature` red.
And an extension to `packages/primitives/tests/no-dom-import.test.ts` that
enumerates every `define*` export off the barrel and calls each one twice under
no DOM.

Browser behavior is unchanged and was checked as such, not assumed: the
Storybook interaction + axe gate (`bun run check:a11y`) passes 270 tests across
61 suites in real chromium, covering every affected recipe's play functions.
Size: `@aihu/primitives/radio-group`, the tightest budget, moves 3.42 kB → 3.43 kB
against a 4 KB cap; every other entry is unchanged or smaller in headroom terms.

**Found while verifying, NOT fixed here.** RESOLVED in
`.changeset/registry-dead-registration.md`: the block was deleted, and the R2
worry below turned out to be unfounded — the compiler's own module-scope
`__style__` already delivers it. Everything from here down is the finding as
originally filed. The
hand-written `customElements.define` in `card`/`badge`/`separator`/`button` is
DEAD CODE in the browser, and measurably so: loading a compiled `aihu-card`
module in jsdom and reading `customElements.get('aihu-card')` returns the
compiler's `Wrapped` class, never `AihuCard`. The compiler registers the tag at
module scope; the `@state` body only runs on upgrade, i.e. strictly afterwards,
so `customElements.get(...)` is already truthy and the recipe's own `define` is
always skipped. (`aihu add`'s `substitutePrefix` rewrites the tag in the source
AND the filename together, so the two never disagree and it is not registering a
phantom element either.) The consequence is that R2 — "the compiled recipe
stylesheet is a shared static Constructable StyleSheet adopted into the shadow
root" — is not actually delivered by the shipped path for these four recipes;
`tests/shadow-adoption.test.ts` proves the class SHAPE honours it, by
registering that class itself, which the real build never does. Guarding the
block keeps today's behavior exactly. Deleting it, or making the compiler honour
the recipe's own class, is a design decision about the registry's CSS-attachment
contract and is left to the founder.
