---
'@aihu/runtime': minor
---

`ComponentOptions.base` (§9.4 recipe class-extension): the options-form
`defineComponent({ base, props, setup })` now extends the given custom-element
base class instead of `HTMLElement`. The base's `connectedCallback` runs
before the template mounts (so context-providing primitives register before
their child pieces upgrade), `observedAttributes` are unioned with the base's
(a subclass static would otherwise shadow them), and
`disconnectedCallback` / `attributeChangedCallback` are forwarded. Without
`base`, behavior is unchanged.
