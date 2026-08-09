---
'@aihu/primitives': patch
'@aihu/compiler': patch
---

Fix a live, currently-shipping crash for `$extends` (`base:`) components under
`output: 'ssr'` — the last of the three SSR-entry exclusions filed with the
`$aria`/`$form` guards, and the worst of them.

**This was already live, and it did not fail soft.** A `.aihu` component using
the `$extends`/`base:` recipe (`packages/ui/registry/switch/switch.aihu`,
`checkbox.aihu`, every `dialog-*`/`popover-*` piece, `temperature.aihu`)
imports its base primitive at module scope. `@aihu/primitives` declared every
one of those bases as `class Aihu… extends HTMLElement` at ITS OWN module
scope, and a class-extends clause is evaluated at module LOAD, not at
construction or registration. So a server bundle threw
`ReferenceError: HTMLElement is not defined` the instant it imported the base
— before any compiled component code ran.

Unlike the `$form`/`$aria` crash, this one is not caught by `__aihu_schild`'s
fail-closed handling: the base import happens inside the router's
`Promise.all` over the child registry, which is not fail-soft. The whole
request died. Reproduced against a real built Worker: `ReferenceError` out of
`__buildRouter`, no response at all — not a 200 with a missing element.

**The scope question, settled by measurement rather than assumption.** The
filed note wondered whether Cloudflare's runtime might already supply some
inert `HTMLElement`, making this a bare-Node artifact. It does not. Probed
directly against workerd 1.20260616.1 (the version this repo resolves), a
Worker sees:

| global | typeof |
| --- | --- |
| `HTMLRewriter` | `function` |
| `HTMLElement` | `undefined` |
| `customElements` | `undefined` |
| `CSSStyleSheet` | `undefined` |
| `document` / `Element` / `Node` | `undefined` |
| `ElementInternals` | `undefined` |

So the bug is real in the actual deploy target and the scope did not narrow.
A sweep of every `exports` subpath of every workspace package under a DOM-less
`import()` found `@aihu/primitives` to be the ONLY package with this failure —
so the fix did not need to widen either.

**Two fixes, in two packages, and neither is sufficient alone.**

1. `@aihu/primitives` — every base class now extends `HTMLElementBase`
   (new, exported from the barrel) instead of the bare global:
   `typeof HTMLElement === 'undefined' ? <inert placeholder> : HTMLElement`.
   All 23 declarations across 16 files, not a sample. A *conditional base*
   rather than the lazy-factory shape `@aihu-plugin/kindly-note` uses for its
   own DOM classes: there the class is an implementation detail, here it is
   the public API — consumers import `AihuSwitchRoot` by name, the `defineX()`
   registries hold direct references, and `$extends: AihuSwitchRoot` lowers to
   a class *identifier*, not a call. Deferring the declaration would break the
   `base:` recipe outright. Constructing one without a DOM throws a message
   naming the cause, rather than handing back an object that silently lacks
   `setAttribute`.

2. `@aihu/compiler` — `$extends` is no longer excluded from the options-form
   SSR entry. That exclusion's stated reason was accurate but was a fact about
   `@aihu/primitives`, not about the gate: no compiler-side change could have
   fixed an import that throws before the emitted code runs. With the base
   import-safe, the exclusion was the only thing left. Without it, a
   `$extends` component still fell through to the plain client shape — a bare,
   ungated `defineElement(...)` at module scope
   (`ReferenceError: customElements is not defined`) and no `__ssr` export at
   all.

`base:` needed no other change: it only affects which class the CLIENT-side
`defineElement` extends (`packages/runtime/src/define-component.ts` reads
`Base` inside `defineComponent`, which this branch already gates on DOM
globals). `__aihu_setup__`'s body never touches it.

**Known and intended:** the SSR pass renders the component's own `@template`,
not the DOM the base primitive adds in `connectedCallback` (`role`,
`aria-checked`, `tabindex`, the hidden form input). A server render never
mounts, so that wiring lands on hydration — the same trade-off `$aria` already
makes. **Still excluded:** `$extends` combined with `$form` (`define_opts` is
still not threaded through the options-form SSR branch) — now pinned by a test
so it cannot be lifted by accident.

**Verified end-to-end, not by string assertion.** A `$extends` component
against a real `@aihu/primitives` base, in the `workers-ssr` fixture, through
a real `vite build`, driven as a built Worker. Before: `ReferenceError` and no
response. After: 200 with `EXTENDS-OK` rendered inside its own element inside
the outlet. Each fix was then reverted INDEPENDENTLY against that same Worker
to confirm which crash each one owns:

| primitives | compiler | result |
| --- | --- | --- |
| ✗ | ✗ | `ReferenceError: HTMLElement is not defined` (the filed crash) |
| ✗ | ✓ | same — the compiler gate cannot reach the base module |
| ✓ | ✗ | `ReferenceError: customElements is not defined` |
| ✓ | ✓ | 200, rendered |

Pinned by three layers: `workers-ssr-e2e.test.ts` assertions 15 + 15b (real
Worker, with the empty-registry control proving the content is resolved
through the child registry rather than inlined); a node-environment
`@aihu/primitives` suite covering all 20 published entries in milliseconds, so
a primitive added later that forgets `HTMLElementBase` fails immediately; and
four Rust tests on the emitted structure. Reverting the primitives fix turns
10 of 18 e2e assertions red; reverting the compiler fix turns 2 Rust tests
red.

Size: the guard costs ~170 B gzip on each entry that declares a class, and is
tree-shaken entirely out of the two that do not (`context`, `focus-trap` are
byte-identical). Every per-primitive budget still passes; tightest is
`radio-group` at 3.42 kB / 4 KB.
