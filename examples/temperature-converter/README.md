# temperature-converter

**What this teaches:** two-way binding plus a computed-derived counterpart, the canonical 7GUIs #2 pattern.

A Celsius input is bound directly via `$bind:value`. The Fahrenheit input reads a `$computed` derivation and writes back through a one-line `$action`. Edit either field; the other updates without ceremony.

## Run

```bash
bun install
bun run dev
```

Or open `index.html` directly through the dev server.

## Concepts shown

- `$bind:value="celsius"` — quoted form is required for two-way binding (Template Attribute Syntax §3.4)
- `$computed fahrenheit = ...` — auto-tracked derivation
- `$action setFromF(f: number) { ... }` — one-shot mutation that writes the source-of-truth signal
- `value={fahrenheit}` curly form for a computed read on a standard HTML attribute
- `$on:input={(e) => ...}` curly form for an inline arrow handler

## Compare with

- [Svelte 7GUIs #2](https://svelte.dev/examples/temperature-converter)
- [Solid 7GUIs](https://www.solidjs.com/examples/7guis-temperature-converter)
- 7GUIs task #2: <https://eugenkiss.github.io/7guis/tasks/#temp>
