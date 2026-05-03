# markdown-preview

**What this teaches:** the `$bind:value` -> `$computed` -> `$html` pipeline, plus how scoped styles compose with rendered output.

A textarea is bound to a `source` signal; a `$computed` runs a tiny in-tree markdown function over it; the `$html` attribute drops the result into a sibling pane. Every keystroke flows through one reactive path.

## Run

```bash
bun install
bun run dev
```

Or open `index.html` through the dev server.

## Concepts shown

- `$bind:value="source"` on a `<textarea>`
- `$computed rendered = renderMd(source)` — fan-out from a single signal
- `$html={rendered}` — the curly form is required for an expression-typed attribute
- Scoped `@style` block targeting both layout shell and rendered output
- A single multi-line action declaration (`$action renderMd(src: string): string { ... }`) standing in for a derived helper

## Security note

`$html` sets `innerHTML` directly without sanitization. It is scribe's equivalent of React's raw-HTML escape hatch and Vue's `v-html`. This example renders only what the user typed locally — the author and the consumer are the same person — so the trust boundary is trivial. Any production use must run the input through a real sanitizer (DOMPurify, a server-side allowlist, or a markdown library that emits safe HTML by construction). The 15-LOC regex here is demo-grade only and intentionally HTML-escapes raw `<` / `>` first, but it is not a substitute for sanitization on untrusted input.

## Compare with

- [Svelte markdown editor](https://svelte.dev/examples/markdown-editor)
- [Vue markdown editor](https://vuejs.org/examples/#markdown)
