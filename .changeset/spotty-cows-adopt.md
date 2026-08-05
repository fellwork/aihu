---
'@aihu/runtime': major
'@aihu/server': minor
'@aihu/compiler': minor
'@aihu/app': minor
'@aihu/arbor': patch
---

Adopt the server-rendered DOM on first render instead of rebuilding it.

Prerendering used to buy first paint and crawlability but zero client work: the
client discarded the entire server-rendered subtree and rebuilt it. Measured on
apps/docs by tagging every prerendered node before hydration and counting
survivors — **0 of 393**. It is now **320 of 393**, with no duplication (total
node count identical to a pure client render) and Lighthouse unchanged at
perf 100 / LCP 1480ms.

**BREAKING (`@aihu/runtime`):** `DefineOptions.hydrate` is removed. It gated a
hydration branch in `define-element.ts` that nothing in production ever set —
the compiler never emitted it — and that branch bypassed `defineComponent`'s
connect path entirely, so `onMount` never ran under hydration. Rather than
enable a lifecycle-skipping bypass, the fork is deleted: `defineComponent`'s
`connectedCallback` is now the single connect path and chooses its renderer
(`_adoptSsrTemplate` vs `_mount`). Everything downstream — `onMount`, slot
projection, scope registration, teardown — is byte-identical, so the lifecycle
cannot drift again.

The adoptable boundary is server-declared, not client-guessed:
`renderToString({ wrapTag, hydratable })` stamps `data-aihu-ssr` on the host it
wraps, meaning "these children are this host's own rendered template". That
resolves an ambiguity `data-aihu-path` could not — slotted content from a
parent's server render carries paths too, but its receiving host is never
marked.

Three latent bugs surfaced only once adoption ran, and are fixed here: arbor's
`hydrate()` pathMap collided across nested wrapped renders (the page overwrote
the layout's root key); `hydrate()` never assigned `branch.el`, silently
no-op'ing `class:`/`html={}` effects on adopted trees; and the compiler wrapped
enhanced `<a>` multi-children in a fragment the server never renders,
duplicating every prerendered link's children.

Remaining ceiling: structural `each`/`if` segments still use arbor's
adopt-by-replace, which is why 73 nodes do not survive.
