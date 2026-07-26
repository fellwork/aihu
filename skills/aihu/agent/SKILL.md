# aihu agent surface — `expose:` / `describe:` / `@agent`

aihu components can publish a machine-readable surface that external AI agents
discover (via MCP / llms.txt) and drive at runtime. This is part of the
framework contract, not an add-on.

## Per-entry metadata (the primary mechanism)

`prop`, `action`, and `derived` accept `describe:` and `expose:` in their config
bag (which always comes first — C622 if swapped):

```aihu
@state {
  let city = prop({
    default: 'London',
    describe: 'City name to retrieve weather forecast for',
    expose: 'read',
  })

  let status = state('idle')

  const refresh = action(
    { describe: 'Refresh the forecast for the current city',
      expose: 'read write' },
    () => { status = 'loading' })
}

@template {
  <p>{city}: {status}</p>
  <button on:click={refresh}>Refresh</button>
}
```

- `describe:` — one sentence, written for an agent deciding whether to call it.
- `expose:` — the access tier: `'read'`, `'read write'` (also `'write'`,
  `'public'` — both currently unexercised in the corpus).

Rules:

- **The expose tier must match what the member does.** An action that writes
  state is `'read write'`, not `'read'`.
- **Do not throw from an exposed action for ordinary failures** — set an error
  state the agent can read back.
- Anything without `expose:` is not on the agent surface. Expose deliberately;
  it is a security boundary, not documentation.

## The `@agent` block

A standalone `@agent { }` block lists which declared actions form the agent
surface, in statement form:

```aihu
@state {
  let tasks = state([])
  let nextId = state(1)

  const addTask = action(
    { describe: 'Append a task with the given text.', expose: 'read' },
    (args) => {
      const text = String(args?.[0] ?? '')
      tasks = [...tasks, { id: nextId, text, done: false }]
      nextId = nextId + 1
    })
  const clearCompleted = action(
    { describe: 'Remove all completed tasks.', expose: 'read' },
    () => { tasks = tasks.filter((t) => !t.done) })
}

@template {
  <ul>
    <li each={task of tasks} key={task.id}>{task.text}</li>
  </ul>
}

@agent {
  action addTask()
  action clearCompleted()
}
```

Names referenced in `@agent` must be declared in `@state`. Older docs show
`$expose` / `$describe` statements inside `@agent` — that is the retired v1
vocabulary; metadata lives on the `@state` entries now.

The end-to-end reference for an agent-drivable component is
`examples/agent-driven-demo` (external agent reads the surface over MCP, then
drives the mounted instance over a WebSocket capability bridge); protocol
serving (A2A/ACP) is `examples/agent-hub`.

## Not covered yet

`event()` + `$emit` (agent-visible events) and the GX hard-tier vocabulary
(`read: verified|{scope}|human`, `call:`) exist in the compiler but have no
exercised examples — check `cookbook/COVERAGE-MATRIX.md` §4 before using.
