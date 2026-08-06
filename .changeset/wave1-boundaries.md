---
'@aihu/compiler': patch
'@aihu/server': patch
'@aihu/app': patch
'@aihu/runtime': patch
---

Reconcile the SSR child-eligibility boundaries between the two renderers.

Whether a component reference is eligible for server rendering was decided in
two places — the Rust emitter on the raw template AST, the TypeScript walker on
the lowered arbor node — and their eligible sets differed, so one renderer
filled a child in while the other emitted an empty element.

The lowering is lossy: `<x-kid>`, `<x-kid show={on()}>`, `<x-kid ref={el}>`,
`<x-kid raw><b>s</b></x-kid>` and a multi-line `<x-kid>\n</x-kid>` all reach the
walker as the same node, so the walker cannot decline on information it does not
have. Those cases are reconciled by having the emitter resolve them; the lowered
tree is byte-identical to the plain reference already resolved and shipped.

Also fixes a divergence introduced by the previous `{#each}` fix: a reference
merely nested inside a conditional (`<div if={ready}><site-header></div>`)
resolved on the compiled path and declined on the walker, because the
static-path check tested "all digits" as a proxy for compile-time literalness
and `conditional.true` fails it. The check now tests literalness exactly.

32 differential fixtures added, one per boundary line, each asserting both
renderers agree AND which way — "both empty" satisfies byte-identity while
shipping the bug.

Component discovery loads in parallel, warns about a failed component only when
something references it, and no longer follows symlinks out of the components
directory.
