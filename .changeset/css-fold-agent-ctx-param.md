---
"@aihu/compiler": patch
---

Fix: css-engine scoped-utility fold no-opped on agent components. The
`_foldCssEngineStyles` Shape-2 pass anchored on a literal `defineComponent((ctx) => {`,
but a component with an exposed member emits `(__aihu_ctx__)` (so
`_registerAgentServerBinding` can read `__aihu_ctx__?.element`). The pass now
captures the actual setup param and injects the `adoptedStyleSheets` adoption
against it, so an agent component using css-engine utilities gets its shadow
stylesheet instead of silently shipping none.
