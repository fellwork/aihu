# timer

> Aihu — agentic discovery and interaction, for human purpose.

**What this teaches:** lifecycle hooks, reactive derivations, and an agent surface that lets AI monitor timer progress and trigger resets on the human's behalf (7GUIs #4).

## Run

```bash
bun install
bun run dev    # http://localhost:5103
```

## Concepts shown

- `$lifecycle.mount` / `$lifecycle.dispose` — paired setup/teardown
- Multiple `$computed` derivations sharing a single signal source
- `$bind:value` on `<input type="range">` — slider as writable signal
- `$if={done}` conditional rendering of "Done." status
- `@agent` block: `$expose elapsed/duration/progress` + `$action reset`
- Dark-mode tokens throughout `@style`

## Agent surface

| Name | Kind | Description |
|---|---|---|
| `elapsed` | state | Elapsed time in milliseconds |
| `duration` | state | Timer duration (slider-controlled) |
| `progress` | state | Fraction from 0 to 1 |
| `reset()` | action | Reset elapsed to 0 |

## Compare with

- [Svelte 7GUIs timer](https://svelte.dev/examples/seven-gui-s-timer)
- [Solid 7GUIs timer](https://www.solidjs.com/examples/7guis-timer)
- 7GUIs task #4: <https://eugenkiss.github.io/7guis/tasks/#timer>
