# todo-mvc

**What this teaches:** the canonical TodoMVC — list reactivity, filtering, computed derivations, keyed iteration. Mandatory parity anchor.

Every framework ships a TodoMVC. This is scribe's: ~110 LOC of one-file SFC covering add / toggle / delete / filter / clear-completed against an in-memory list.

## Run

```bash
bun install
bun run dev
```

Or open `index.html` through the dev server.

## Concepts shown

- `$each="visible as todo"` plus `$key="todo.id"` — keyed list reconciliation (Macro Vocabulary §3.3, §3.6)
- Multiple `$computed` derivations off one source-of-truth array (`visible`, `remaining`, `allDone`)
- `$bind:value` for the draft input plus `$on:keydown={...}` arrow form for the Enter key
- `$if={todos.length > 0}` — curly conditional on a real `<footer>` element
- Mixed handler forms: quoted name (`$on:click="clearCompleted"`) and inline arrow (`$on:click={() => setFilter('all')}`)

## Out of scope (T4-D Flag #2)

`localStorage` persistence is omitted on purpose. Reloading the page resets the list. Adding persistence is a 5-line `$effect` block plus a one-time `$lifecycle.mount` read; the v1.1 docs pass will publish a "TodoMVC + localStorage" recipe.

## Compare with

- [TodoMVC.com](https://todomvc.com)
- [Svelte TodoMVC](https://svelte.dev/examples/todomvc)
- [Vue TodoMVC](https://vuejs.org/examples/#todomvc)
- [Solid TodoMVC](https://www.solidjs.com/examples/todomvc)
