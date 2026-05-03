# live-counter

**What this teaches:** the smallest possible scribe component — state, event handlers, and a reactive text node, in one file.

This is scribe's hello-world. It's the same shape as 7GUIs task #1 (Counter), shipped by every framework starter you've seen.

## Run

Open `index.html` in any browser — it loads the SFC through the Vite dev server. Or use the CLI's run target:

```bash
bun install
bun run dev
```

## Concepts shown

- `@state` block declaring a single signal (`count: number = 0`)
- Three `$action` declarations — each becomes a batched mutation function
- `$on:click="actionName"` — quoted form references a named handler
- `{count}` text interpolation in `@template` — auto-subscribes the text node
- Scoped `@style` block

## Compare with

- [Lit `<simple-greeting>` + counter](https://lit.dev/playground/)
- [Svelte counter example](https://svelte.dev/examples/hello-world)
- [Solid counter](https://www.solidjs.com/examples/counter)
- 7GUIs task #1: <https://eugenkiss.github.io/7guis/tasks/#counter>
