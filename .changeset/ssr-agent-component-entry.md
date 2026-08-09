---
'@aihu/compiler': patch
---

Give `$action`/`$state`-only components a standalone SSR entry under
`output: 'ssr'` — this includes the CLI scaffold's own default page.

A server build gated its no-DOM SSR entry (`export const __ssr`) on
`!is_agent_component`, which excluded **every** component with any exposed
`$action`, `$prop`, `$computed` or similar — not just components with a real
`@agent { }` block. A component in that shape fell through to the client-shaped
registration form instead: an unguarded `defineElement`/`new CSSStyleSheet()`
at module scope, which throws `ReferenceError: CSSStyleSheet is not defined` /
`HTMLElement is not defined` the instant a plain Node/Bun process — or a
Cloudflare Worker — imports the module. Since the CLI's default `minimal`
scaffold ships exactly this shape (a counter component with an `$action`
block, no `@agent`), every freshly scaffolded `output: 'ssr'` app was broken.

The exclusion was deliberately deferred under FEL-440 rather than lifted with
it, and its remaining stated reason — "the stubbed server SetupContext lacking
attr/prop signal support" — turned out to be real but far narrower than the
blanket gate it justified: only an `@agent { }` block's `$input` declarations
read `ctx.attrs.<name>[0]()`, and the host-less SSR `SetupContext` passes
`attrs: {}`. A plain `$action`/`$state` component's exposed closures reference
only the setup body's own local signals — never `ctx.attrs` — so it is exactly
as SSR-safe as a non-agent component, and so is an `@agent` block that carries
only policy (`$scope`/`$rate-limit`) with no `$input`s.

Narrowed the gate accordingly: excluded from the standalone SSR entry only
when `unit.source.agent` is present AND declares at least one `$input`. Pinned
by three new tests, each independently counterfactual-verified against the old
blanket gate (the two newly-permitted shapes fail under it; the still-excluded
shape does not).

`_registerAgentServerBinding` itself was never the blocker — it takes
`ctx.element`, which is `null` by design under SSR, and is a documented no-op
on a null host.
