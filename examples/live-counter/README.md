# live-counter

> Aihu — agentic discovery and interaction, for human purpose.

**What this teaches:** the smallest possible aihu component — state, event handlers, a reactive text node, and an agent surface, in one file.

This is aihu's hello-world. It's the same shape as 7GUIs task #1 (Counter). Humans see +/- buttons; agents get `increment`, `decrement`, and `reset` as callable tools against the live `count` signal — no separate API layer.

## Run

```bash
bun install
bun run dev    # http://localhost:5101
```

## Concepts shown

- `@state` block declaring a single signal (`count: number = 0`)
- Three `$action` declarations — each becomes a batched mutation function
- `$on:click="actionName"` — quoted form references a named handler
- `{count}` text interpolation — auto-subscribes the text node
- `@agent` block: `$expose count` + `$action increment/decrement/reset` + `$describe`
- Dark-mode tokens from `examples/_shared/tokens.css`

## Agent surface

| Name | Kind | Description |
|---|---|---|
| `count` | state | Current counter value |
| `increment()` | action | Add 1 to the counter |
| `decrement()` | action | Subtract 1 from the counter |
| `reset()` | action | Reset the counter to 0 |

Agents get a tool to update the counter on the human's behalf. The human's intent — tracking a number — is the purpose; the agent surface is the means.

## Compare with

- [Lit `<simple-greeting>` + counter](https://lit.dev/playground/)
- [Svelte counter example](https://svelte.dev/examples/hello-world)
- [Solid counter](https://www.solidjs.com/examples/counter)
- 7GUIs task #1: <https://eugenkiss.github.io/7guis/tasks/#counter>
