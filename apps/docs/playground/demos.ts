/**
 * Curated, all-compiling demos for the stage-first agent-drive surface
 * (`<agent-stage>`).
 *
 * Every demo here:
 *   1. Compiles cleanly under the CURRENT WASM compiler's CLIENT target
 *      (`wasm_compile_client`) — verified at build time; a broken sample on the
 *      flagship demo surface is worse than fewer samples.
 *   2. Declares an `@agent` block whose `$action:` handlers carry
 *      `expose: { read: true }`, so the compiler injects the per-instance
 *      `_registerAgentDispatcher(ctx.element, …)` wiring the postMessage bridge
 *      reads after mount.
 *   3. Is a component a HUMAN genuinely uses, that an AGENT can also drive — the
 *      "agent-first, human-served" thesis. The lead demo is the task-list (a
 *      human manages tasks; an agent drives the SAME instance), NOT a toy.
 *
 * `agentScript` is the scripted in-page "agent" run: an ordered list of action
 * invocations the stage sends over postMessage on "Let an agent drive it", with
 * a short visible delay between steps so the on-screen component visibly changes.
 * The action names match the `@agent` block; the stage resolves each name to its
 * opaque-ID invoker (the same FNV-1a hash the compiler uses) inside the iframe.
 */

export interface AgentStep {
  /** Action name declared in the `@agent` block. */
  readonly action: string
  /** Positional args passed to the action handler (the `args` array). */
  readonly args: readonly unknown[]
  /** Human-readable narration shown in the drive log as this step runs. */
  readonly label: string
}

export interface Demo {
  readonly id: string
  readonly label: string
  /** One-line pitch shown under the stage title. */
  readonly blurb: string
  readonly source: string
  /** The scripted agent run for "Let an agent drive it". */
  readonly agentScript: readonly AgentStep[]
}

const TASK_LIST = `@state {
  import { signal } from '@aihu/signals'

  const [tasks, setTasks] = signal([{ id: 1, text: 'Draft the launch post', done: false }])
  const [nextId, setNextId] = signal(2)
  const [draft, setDraft] = signal('')

  $action: {
    addTask: {
      describe: 'Append a task with the given text.',
      expose: { read: true },
      handler: (args) => {
        const text = typeof args?.[0] === 'string' ? args[0].trim() : ''
        if (!text) return
        const id = nextId()
        setTasks([...tasks(), { id, text, done: false }])
        setNextId(id + 1)
      },
    },
    toggleTask: {
      describe: 'Toggle the done state of the task with the given id.',
      expose: { read: true },
      handler: (args) => {
        const id = Number(args?.[0])
        setTasks(tasks().map((t) => (t.id === id ? { ...t, done: !t.done } : t)))
      },
    },
    clearCompleted: {
      describe: 'Remove every task that is marked done.',
      expose: { read: true },
      handler: () => {
        setTasks(tasks().filter((t) => !t.done))
      },
    },
  }

  const addFromInput = () => {
    addTask(draft())
    setDraft('')
  }
}

@template {
  <section class="tl">
    <header class="tl-head">
      <h2 class="tl-title">Tasks</h2>
      <span class="tl-count">{tasks.length}</span>
    </header>
    <form class="tl-add" $on.submit={(e) => { e.preventDefault(); addFromInput() }}>
      <input class="tl-input" $bind.value={draft} placeholder="Add a task…">
      <button class="tl-btn" type="submit">Add</button>
    </form>
    <ul class="tl-items">
      <li $each="tasks as task" $key="task.id" class="tl-item" $data-done={task.done}>
        <button class="tl-check" $on.click={() => toggleTask(task.id)} aria-label="toggle"></button>
        <span class="tl-text">{task.text}</span>
      </li>
    </ul>
  </section>
}

@style {
  .tl { max-width: 30rem; margin: 0 auto; font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif; color: #1a1d24; }
  .tl-head { display: flex; align-items: center; gap: .55rem; margin-bottom: 1.05rem; }
  .tl-title { margin: 0; font-size: 1.35rem; font-weight: 650; letter-spacing: -.01em; }
  .tl-count { background: rgba(200,84,58,.12); color: #b14a32; border-radius: 999px; padding: .15rem .62rem; font-size: .76rem; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.6; }
  .tl-add { display: flex; gap: .5rem; margin-bottom: 1rem; }
  .tl-input { flex: 1; padding: .64rem .82rem; border: 1px solid #e6e0d6; border-radius: 10px; font-size: .95rem; background: #fffdfa; color: #1a1d24; transition: border-color .15s, box-shadow .15s; }
  .tl-input:focus { outline: 0; border-color: #c8543a; box-shadow: 0 0 0 3px rgba(200,84,58,.14); }
  .tl-input::placeholder { color: #a7a097; }
  .tl-btn { padding: .64rem 1.1rem; border: 0; border-radius: 10px; background: #c8543a; color: #fff; cursor: pointer; font-weight: 600; font-size: .92rem; box-shadow: 0 2px 8px -3px rgba(200,84,58,.6); transition: transform .12s, box-shadow .2s; }
  .tl-btn:hover { transform: translateY(-1px); box-shadow: 0 5px 14px -4px rgba(200,84,58,.55); }
  .tl-btn:active { transform: translateY(0); }
  .tl-items { list-style: none; padding: 0; margin: 0; display: grid; gap: .55rem; }
  .tl-item { display: flex; align-items: center; gap: .75rem; padding: .72rem .85rem; background: #fffdfa; border: 1px solid #ece6dc; border-radius: 11px; box-shadow: 0 1px 2px rgba(26,29,36,.03); animation: tl-in .42s cubic-bezier(.2,.7,.2,1) both; transition: border-color .15s; }
  .tl-item:hover { border-color: #ddd2c2; }
  @keyframes tl-in { from { opacity: 0; transform: translateY(7px) scale(.99); } to { opacity: 1; transform: none; } }
  .tl-check { width: 1.4rem; height: 1.4rem; border: 1.5px solid #d6cfc3; border-radius: 6px; background: #fff; cursor: pointer; flex: 0 0 auto; position: relative; transition: background .15s, border-color .15s; }
  .tl-check:hover { border-color: #c8543a; }
  .tl-item[data-done="true"] .tl-check { background: #c8543a; border-color: #c8543a; }
  .tl-item[data-done="true"] .tl-check::after { content: "✓"; color: #fff; font-size: .9rem; font-weight: 700; position: absolute; inset: 0; display: grid; place-items: center; }
  .tl-item[data-done="true"] .tl-text { text-decoration: line-through; color: #a7a097; }
  .tl-text { font-size: 1rem; color: #2b2e35; }
  @media (prefers-reduced-motion: reduce) { .tl-item { animation: none; } }
}

@agent {
  action addTask()
  action toggleTask()
  action clearCompleted()
}
`

const COUNTER = `@state {
  import { signal } from '@aihu/signals'
  const [count, setCount] = signal(0)

  $action: {
    increment: {
      describe: 'Increase the counter by one.',
      expose: { read: true },
      handler: () => setCount(count() + 1),
    },
    decrement: {
      describe: 'Decrease the counter by one.',
      expose: { read: true },
      handler: () => setCount(count() - 1),
    },
    reset: {
      describe: 'Reset the counter back to zero.',
      expose: { read: true },
      handler: () => setCount(0),
    },
  }
}

@template {
  <div class="ct">
    <p class="ct-value">{count}</p>
    <div class="ct-row">
      <button class="ct-btn" $on.click={() => decrement()}>−</button>
      <button class="ct-btn" $on.click={() => increment()}>+</button>
    </div>
  </div>
}

@style {
  .ct { text-align: center; font-family: system-ui, sans-serif; padding: 1.5rem; color: #1a1a1a; }
  .ct-value { font-size: 3.5rem; font-weight: 700; margin: 0 0 1rem; font-variant-numeric: tabular-nums; }
  .ct-row { display: flex; gap: .6rem; justify-content: center; }
  .ct-btn { width: 3.25rem; height: 3.25rem; font-size: 1.5rem; border: 1px solid #ddd; border-radius: 10px; background: #fff; cursor: pointer; }
  .ct-btn:hover { background: #f6f6f6; }
}

@agent {
  action increment()
  action decrement()
  action reset()
}
`

const THERMOSTAT = `@state {
  import { signal } from '@aihu/signals'
  const [temp, setTemp] = signal(20)
  const [mode, setMode] = signal('idle')

  $action: {
    warmer: {
      describe: 'Raise the target temperature by one degree.',
      expose: { read: true },
      handler: () => { setTemp(temp() + 1); setMode('heating') },
    },
    cooler: {
      describe: 'Lower the target temperature by one degree.',
      expose: { read: true },
      handler: () => { setTemp(temp() - 1); setMode('cooling') },
    },
    setTarget: {
      describe: 'Set the target temperature to the given value.',
      expose: { read: true },
      handler: (args) => { setTemp(Number(args?.[0])); setMode('idle') },
    },
  }
}

@template {
  <div class="th">
    <p class="th-temp">{temp}<span class="th-unit">°C</span></p>
    <p class="th-mode">{mode}</p>
    <div class="th-row">
      <button class="th-btn" $on.click={() => cooler()}>Cooler</button>
      <button class="th-btn" $on.click={() => warmer()}>Warmer</button>
    </div>
  </div>
}

@style {
  .th { text-align: center; font-family: system-ui, sans-serif; padding: 1.5rem; color: #1a1a1a; }
  .th-temp { font-size: 3.5rem; font-weight: 700; margin: 0; font-variant-numeric: tabular-nums; }
  .th-unit { font-size: 1.4rem; color: #999; margin-left: .15rem; }
  .th-mode { text-transform: uppercase; letter-spacing: .1em; font-size: .72rem; color: #c8543a; margin: .25rem 0 1rem; font-weight: 700; }
  .th-row { display: flex; gap: .6rem; justify-content: center; }
  .th-btn { padding: .55rem 1.1rem; border: 1px solid #ddd; border-radius: 10px; background: #fff; cursor: pointer; }
  .th-btn:hover { background: #f6f6f6; }
}

@agent {
  action warmer()
  action cooler()
  action setTarget()
}
`

export const DEMOS: readonly Demo[] = [
  {
    id: 'task-list',
    label: 'Task list',
    blurb:
      'A list a human manages by hand — and an agent drives over the SAME component, mutating the component’s own signals (not the DOM).',
    source: TASK_LIST,
    agentScript: [
      {
        action: 'addTask',
        args: ['Review the agent contract'],
        label: 'addTask("Review the agent contract")',
      },
      { action: 'addTask', args: ['Ship the stage demo'], label: 'addTask("Ship the stage demo")' },
      { action: 'toggleTask', args: [1], label: 'toggleTask(1) — mark the first task done' },
      { action: 'clearCompleted', args: [], label: 'clearCompleted() — drop completed tasks' },
    ],
  },
  {
    id: 'counter',
    label: 'Counter',
    blurb:
      'The minimal proof: an agent invokes increment/decrement and the visible value tracks the component’s signal.',
    source: COUNTER,
    agentScript: [
      { action: 'increment', args: [], label: 'increment()' },
      { action: 'increment', args: [], label: 'increment()' },
      { action: 'increment', args: [], label: 'increment()' },
      { action: 'decrement', args: [], label: 'decrement()' },
    ],
  },
  {
    id: 'thermostat',
    label: 'Thermostat',
    blurb:
      'A device control a human nudges — and an agent sets the target on the exact same instance.',
    source: THERMOSTAT,
    agentScript: [
      { action: 'warmer', args: [], label: 'warmer()' },
      { action: 'warmer', args: [], label: 'warmer()' },
      { action: 'setTarget', args: [24], label: 'setTarget(24)' },
      { action: 'cooler', args: [], label: 'cooler()' },
    ],
  },
]

export const DEFAULT_DEMO_ID = 'task-list'

export function getDemo(id: string): Demo | undefined {
  return DEMOS.find((d) => d.id === id)
}
