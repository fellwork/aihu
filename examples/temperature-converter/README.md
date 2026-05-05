# temperature-converter

> Aihu — agentic discovery and interaction, for human purpose.

**What this teaches:** two-way binding plus a computed-derived counterpart (7GUIs #2), and an agent surface that lets AI tools read and write the temperature on a human's behalf.

## Run

```bash
bun install
bun run dev    # http://localhost:5102
```

## Concepts shown

- `$bind:value="celsius"` — two-way binding on the primary signal
- `$computed fahrenheit = ...` — auto-tracked derivation
- `$action setFromF(f)` / `setCelsius(c)` — write-back actions
- `@agent` block exposing both directions as readable state + writable actions
- Dark-mode tokens via `var(--panel-bg)`, `var(--input-bg)`, etc.

## Agent surface

| Name | Kind | Description |
|---|---|---|
| `celsius` | state | Temperature in degrees Celsius |
| `fahrenheit` | state | Computed Fahrenheit value |
| `setCelsius(c)` | action | Set temperature in Celsius |
| `setFromF(f)` | action | Set temperature in Fahrenheit |

## Compare with

- [Svelte 7GUIs #2](https://svelte.dev/examples/temperature-converter)
- [Solid 7GUIs](https://www.solidjs.com/examples/7guis-temperature-converter)
- 7GUIs task #2: <https://eugenkiss.github.io/7guis/tasks/#temp>
