---
"@aihu/compiler": patch
---

Template parser: a JS comment opening a `{expr}` interpolation (`{/* note */ count}`,
`{// note` …`}`) was misclassified as a `{/if}` / `{/each}` block tail and errored
with "unexpected `{:` or `{/`". Block tails are always `{/` + letter, so `{//` and
`{/*` now fall through to expression parsing. Comments inside expressions were
already handled downstream (`{count /* trailing */}` worked); only the
comment-first form was affected.
