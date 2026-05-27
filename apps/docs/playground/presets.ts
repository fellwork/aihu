/**
 * Playground preset snippets — Directive 1 §6 acceptance criterion.
 *
 * Six starter snippets exposed via `<playground-embed>` segmented control
 * (desktop) / dropdown (mobile). Each compiles in <200ms and renders into
 * the sandboxed preview iframe.
 *
 * Constraints (per docs/roadmap/_user-directives.md):
 *   - Each preset ≤ 50 lines.
 *   - Each compiles cleanly under the WASM build of `aihu-compile`.
 *   - Each produces a visible interactive component in the preview pane.
 *
 * The preset id is what gets written to the URL hash as `#preset=<id>`.
 * When the editor's value diverges from a preset, the URL switches to
 * `#src=<encodeURIComponent(source)>` so the in-progress draft is shareable.
 *
 * Spec: docs/roadmap/_user-directives.md §Directive 1.
 */

export interface Preset {
  readonly id: string
  readonly label: string
  readonly source: string
}

const COUNTER = `@state {
  import { signal } from '@aihu/signals'
  const [count, setCount] = signal(0)
}

@template {
  <div class="demo">
    <h1>Hello from aihu</h1>
    <p>Count: {{ count }}</p>
    <button $on.click={() => setCount(count() + 1)}>+</button>
    <button $on.click={() => setCount(count() - 1)}>-</button>
  </div>
}

@style {
  .demo { padding: 1rem; font-family: system-ui, sans-serif; }
  button { padding: .25rem .75rem; margin-right: .25rem; cursor: pointer; }
}
`

const TODO = `@state {
  import { signal } from '@aihu/signals'
  const [todos, setTodos] = signal([{ text: 'Try aihu', done: false }])
  const [draft, setDraft] = signal('')

  const add = () => {
    const text = draft().trim()
    if (!text) return
    setTodos([...todos(), { text, done: false }])
    setDraft('')
  }
}

@template {
  <section class="todo">
    <h1>Todos</h1>
    <input value={draft()} $on.input={(e) => setDraft(e.target.value)} placeholder="What needs to be done?">
    <button $on.click={() => add()}>Add</button>
    <ul>
      <li $each={todos()} $as="t">{{ t.text }}</li>
    </ul>
  </section>
}

@style {
  .todo { padding: 1rem; font-family: system-ui, sans-serif; max-width: 24rem; }
  input { padding: .25rem; margin-right: .25rem; }
  ul { padding-left: 1.25rem; }
}
`

const AGENT_BLOCK = `@state {
  import { signal } from '@aihu/signals'
  const [temp, setTemp] = signal(20)
}

@template {
  <div class="card">
    <h1>Thermostat</h1>
    <p>Target: {{ temp }}°C</p>
    <button $on.click={() => setTemp(temp() + 1)}>Warmer</button>
    <button $on.click={() => setTemp(temp() - 1)}>Cooler</button>
    <p class="hint">An @agent block (below) exposes this component to MCP-compatible AI agents.</p>
  </div>
}

@style {
  .card { padding: 1rem; font-family: system-ui, sans-serif; max-width: 22rem; }
  button { padding: .25rem .75rem; margin-right: .25rem; cursor: pointer; }
  .hint { font-size: .8125rem; color: #666; }
}

@agent {
  $scope "thermostat:read thermostat:write"
  $rate-limit 60
}
`

const SSR = `@state {
  import { signal } from '@aihu/signals'
  const [now, setNow] = signal(new Date().toISOString().slice(11, 19))

  // SSR-safe: only run interval on the client.
  if (typeof window !== 'undefined') {
    setInterval(() => setNow(new Date().toISOString().slice(11, 19)), 1000)
  }
}

@template {
  <div class="clock">
    <h1>Server-rendered clock</h1>
    <time>{{ now }}</time>
    <p class="hint">Compiles to a custom element. Server renders the initial HTML; the client picks up reactivity on hydration.</p>
  </div>
}

@style {
  .clock { padding: 1rem; font-family: system-ui, sans-serif; text-align: center; }
  time { font-size: 2rem; font-variant-numeric: tabular-nums; }
  .hint { font-size: .8125rem; color: #666; }
}
`

const ROUTE = `@state {
  import { signal } from '@aihu/signals'
  const [page, setPage] = signal('home')
}

@template {
  <nav>
    <button $on.click={() => setPage('home')}>Home</button>
    <button $on.click={() => setPage('about')}>About</button>
    <button $on.click={() => setPage('contact')}>Contact</button>
  </nav>
  <section class="page">
    <h1>{{ page() === 'home' ? 'Welcome' : page() === 'about' ? 'About' : 'Contact' }}</h1>
    <p>You are viewing <code>/{{ page }}</code>. In a real app, @aihu/router maps file paths to routes.</p>
  </section>
}

@style {
  nav { display: flex; gap: .25rem; padding: 1rem 1rem 0; }
  nav button { padding: .25rem .75rem; cursor: pointer; }
  .page { padding: 1rem; font-family: system-ui, sans-serif; }
  code { background: #f1f5f9; padding: 1px 4px; border-radius: 3px; }
}
`

const PLUGIN = `// Plugins are registered at the app level (aihu.config.ts):
//   import { definePlugin } from '@aihu/plugin'
//   export default { plugins: [seo(), auth()] }
// Components then consume plugin-provided macros/composables.

@state {
  import { signal } from '@aihu/signals'
  const [title, setTitle] = signal('Page title')
}

@template {
  <article>
    <h1>{{ title }}</h1>
    <input value={title()} $on.input={(e) => setTitle(e.target.value)}>
    <p class="hint">
      If <code>@aihu/seo</code> is registered, this title flows to
      <code>&lt;title&gt;</code>, OG tags, and JSON-LD automatically.
    </p>
  </article>
}

@style {
  article { padding: 1rem; font-family: system-ui, sans-serif; max-width: 26rem; }
  input { width: 100%; padding: .25rem; margin: .5rem 0; font-size: 1rem; }
  .hint { font-size: .8125rem; color: #666; }
  code { background: #f1f5f9; padding: 1px 4px; border-radius: 3px; font-size: .8125rem; }
}
`

export const PRESETS: readonly Preset[] = [
  { id: 'counter', label: 'Counter', source: COUNTER },
  { id: 'todo', label: 'Todo', source: TODO },
  { id: 'agent-block', label: '@agent', source: AGENT_BLOCK },
  { id: 'ssr', label: 'SSR', source: SSR },
  { id: 'route', label: 'Route', source: ROUTE },
  { id: 'plugin', label: 'Plugin', source: PLUGIN },
]

export const DEFAULT_PRESET_ID = 'counter'

export function getPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id)
}
