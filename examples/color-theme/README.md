# color-theme

> Aihu — agentic discovery and interaction, for human purpose.

**What this teaches:** `$reactive(...)` in `@style` plus `$global { }` to propagate tokens beyond component scope — and `$media` macro for responsive breakpoints. The most differentiated aihu capability with no Svelte/Vue/Lit equivalent.

## The `$reactive()` callout

The `$reactive()` macro in `@style` is unique to aihu — it binds a signal directly to a CSS custom property with no JavaScript in the template. Three HSL signals drive three `:root` CSS variables. Every consumer of `var(--color-primary)` updates without a single template re-render.

## Run

```bash
bun install
bun run dev    # http://localhost:5105
```

## Concepts shown

- `$reactive(primary)` in CSS value position — emits one `--reactive-N` custom property + one effect
- `$global { ... }` block — escapes component scope to publish tokens at `:root`
- `$media(max-width: 480px)` macro — responsive breakpoints inside `@style` (unique to aihu)
- Three `$computed` values (`primary`, `onPrimary`, `surface`) feeding the global tokens
- `@agent` block: `$expose hue/saturation/lightness/primary` + `$action setPreset/setHue/setSaturation/setLightness`

## Agent surface

| Name | Kind | Description |
|---|---|---|
| `hue` | state | Hue (0–360) |
| `saturation` | state | Saturation (0–100) |
| `lightness` | state | Lightness (0–100) |
| `primary` | state | Computed HSL string |
| `setPreset(h)` | action | Apply a named hue preset |
| `setHue(h)` | action | Set hue directly |
| `setSaturation(s)` | action | Set saturation directly |
| `setLightness(l)` | action | Set lightness directly |

An agent can adjust the theme on the human's behalf — e.g. "switch to a warmer palette" calls `setPreset(40)`.

## Compare with

- [Lit color picker](https://lit.dev/playground/) — same "reactive CSS variable" effect via JS, not a CSS-block macro
- Svelte/Vue: typically achieved with inline `style={...}` props, not a scoped style block
