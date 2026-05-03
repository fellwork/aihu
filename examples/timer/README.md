# timer

**What this teaches:** lifecycle hooks plus reactive derivations — the 7GUIs #4 pattern in scribe form.

A `setInterval` is registered in `$lifecycle.mount` and torn down in `$lifecycle.dispose`. The slider-controlled duration is two-way bound; `$computed` derivations turn raw elapsed-ms into a progress fraction, formatted seconds, and a "done" boolean used for `$if`.

## Run

```bash
bun install
bun run dev
```

Or open `index.html` through the dev server.

## Concepts shown

- `$lifecycle.mount` / `$lifecycle.dispose` — paired setup/teardown (Macro Vocabulary §2.8)
- Multiple `$computed` derivations sharing a single signal source
- `$bind:value` on a `<input type="range">` — slider as a writable signal source
- `$if={done}` curly form — conditional rendering of the "Done." status
- `<progress>` element with a numeric `value` attribute fed by a computed

## Compare with

- [Svelte 7GUIs timer](https://svelte.dev/examples/seven-gui-s-timer)
- [Solid 7GUIs timer](https://www.solidjs.com/examples/7guis-timer)
- 7GUIs task #4: <https://eugenkiss.github.io/7guis/tasks/#timer>
