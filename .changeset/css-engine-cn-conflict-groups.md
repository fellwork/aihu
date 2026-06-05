---
"@aihu/css-engine": patch
---

`cn()`: register the Tailwind-v4 parity utility families in the conflict map so
`cn()` de-dupes them last-wins — `size`, `aspect`, `order`, `blur`,
`backdrop-blur`, `cursor`, `list`, `self`, `shrink`, `grow`, `object`, and the
gradient stops `from`/`via`/`to`. Families that share a first-dash prefix with an
existing entry (`font-serif`→`font`, `outline-offset`→`outline`,
`text-pretty`→`text`, `bg-linear-to`→`bg`) were already covered. Follow-up to the
utility-parity work in #329.
