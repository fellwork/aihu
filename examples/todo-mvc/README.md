# todo-mvc

> Aihu — agentic discovery and interaction, for human purpose.

**What this teaches:** the canonical TodoMVC — list reactivity, filtering, computed derivations, keyed iteration, localStorage persistence, and an agent surface that lets AI add or clear todos in service of the human's task list.

## Run

```bash
bun install
bun run dev    # http://localhost:5104
```

## Concepts shown

- `$each="visible as todo"` + `$key="todo.id"` — keyed list reconciliation
- Multiple `$computed` derivations off one source-of-truth array
- `$bind:value` for the draft input + `$on:keydown` for Enter key
- **v1.1 fix:** `$lifecycle.mount` hydrates from localStorage; `$effect` persists on every change
- `@agent` block: `$expose todos/remaining/filter` + `$action addTodo/clearCompleted`
- Dark-mode tokens throughout `@style`

## localStorage persistence (v1.1 fix)

The previous v1 gap is resolved. Todos survive page reload via:
1. `$lifecycle.mount` — reads `aihu-todos` from localStorage into the `todos` signal
2. `$effect` — writes `JSON.stringify(todos)` to localStorage on every mutation

Both paths are guarded against `SecurityError` (private mode, quota exceeded).

## Agent surface

| Name | Kind | Description |
|---|---|---|
| `todos` | state | Array of `{ id, text, done }` todo items |
| `remaining` | state | Count of incomplete todos |
| `filter` | state | Active filter: `all \| active \| completed` |
| `addTodo()` | action | Add current draft as new todo |
| `clearCompleted()` | action | Remove all completed todos |

Agents can add tasks and clear completed items on the human's behalf — the list itself is the human's; the agent surface serves it.

## Compare with

- [TodoMVC.com](https://todomvc.com)
- [Svelte TodoMVC](https://svelte.dev/examples/todomvc)
- [Solid TodoMVC](https://www.solidjs.com/examples/todomvc)
