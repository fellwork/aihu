# color-theme

**What this teaches:** `$reactive(...)` inside `@style` plus `$global { ... }` to propagate tokens beyond component scope. The unique aihu `@style` capability with no Svelte/Vue/Lit equivalent.

Three HSL signals drive three CSS custom properties on `:root`. Every consumer of `var(--color-primary)` updates without a single template re-render.

## Run

```bash
bun install
bun run dev
```

Or open `index.html` through the dev server.

## Concepts shown

- `$reactive(primary)` in CSS value position (Macro Vocabulary §4.1) — emits one `--reactive-N` custom property + one effect
- `$global { ... }` block — escapes component scope to publish tokens at `:root` (Macro Vocabulary §4.3)
- Three derived `$computed` values (`primary`, `onPrimary`, `surface`) feeding the global tokens
- Range sliders bound via `$bind:value` for HSL controls
- A handful of preset buttons using inline arrow `$on:click={() => setPreset(...)}`

## Compare with

- [Lit color picker](https://lit.dev/playground/) — same "reactive CSS variable" effect, but Lit fires it from JS rather than a CSS-block macro
- Svelte / Vue: typically achieved with inline `style={...}` props, not a scoped style block
