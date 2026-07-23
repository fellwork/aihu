/**
 * Gallery corpus for the examples + cookbook page. Cookbook entries mirror the
 * machine-readable `<!-- @cookbook -->` frontmatter of the real `cookbook/*.aihu`
 * recipes; governed entries mirror the 9 founder-ratified governed examples
 * (cookbook/COVERAGE-MATRIX.md). In the next phase this is generated directly
 * from `packages/mcp/src/cookbook-index.json` + each `coverage.manifest.json`
 * rather than hand-mirrored.
 */
export interface Recipe {
  readonly id: string
  readonly title: string
  readonly type: string
  readonly description: string
  readonly constructs: readonly string[]
  readonly playground?: string
}
export interface Governed {
  readonly id: string
  readonly name: string
  readonly subsystem: string
}

export const COOKBOOK: readonly Recipe[] = [
  {
    id: 'aihu-counter',
    title: 'Counter',
    type: 'display',
    description:
      'Minimal reactive counter — prop-backed count with increment / decrement / reset actions.',
    constructs: ['prop', 'action', 'on:click', 'interpolation'],
    playground: 'aihu-counter',
  },
  {
    id: 'aihu-tabs',
    title: 'Tabs',
    type: 'container',
    description:
      'derived() computes the selected tab; each/key renders the tablist; onMount picks the initial tab.',
    constructs: ['prop', 'derived', 'each', 'key', 'onMount'],
    playground: 'aihu-tabs',
  },
  {
    id: 'agent-weather',
    title: 'Agent Weather',
    type: 'agent',
    description:
      'Agent-surface async fetch — prop city and action fetchForecast carry expose/describe so MCP agents can read and invoke them.',
    constructs: ['prop.expose', 'action.expose', 'if', 'elseif', 'else'],
    playground: 'agent-weather',
  },
  {
    id: 'form-validation',
    title: 'Form Validation',
    type: 'form',
    description:
      'form() exposes value/validity; derived() computes the error; touched gates when errors show.',
    constructs: ['form', 'derived', 'on:input', 'on:blur'],
    playground: 'form-validation',
  },
  {
    id: 'aihu-modal',
    title: 'Modal',
    type: 'container',
    description:
      'aria() declares role/aria-modal on the host; show toggles visibility; Escape and backdrop click dismiss.',
    constructs: ['aria', 'show', 'slot', 'on:keydown'],
  },
  {
    id: 'fetch-resource',
    title: 'Fetch Resource',
    type: 'async',
    description:
      'resource() intrinsic — async fetch with loading/error/value states through an if/elseif/else chain.',
    constructs: ['resource', 'if', 'elseif', 'else'],
  },
  {
    id: 'data-table',
    title: 'Data Table',
    type: 'list',
    description:
      'Sortable table — derived() sorts a copy of the prop rows; click headers to toggle direction.',
    constructs: ['derived', 'each', 'key', 'on:click'],
  },
  {
    id: 'context-provider',
    title: 'Context Provider',
    type: 'container',
    description:
      'provide() exposes a theme token to descendant consumers over the context prototype chain.',
    constructs: ['provide', 'slot', 'action'],
  },
  {
    id: 'guard-ui',
    title: 'Guard UI',
    type: 'agent',
    description:
      '<guard> element — scope-gated UI that renders its children only when the admin scope is verified.',
    constructs: ['guard'],
  },
  {
    id: 'infinite-scroll',
    title: 'Infinite Scroll',
    type: 'list',
    description:
      'controller() wires an IntersectionObserver sentinel that calls loadMore; each/key/empty renders the list.',
    constructs: ['controller', 'each', 'empty'],
  },
  {
    id: 'aihu-clock',
    title: 'Clock',
    type: 'display',
    description:
      'Real-time clock — onMount starts the interval, onDispose clears it; tick runs through an action.',
    constructs: ['onMount', 'onDispose', 'action'],
  },
  {
    id: 'ssr-hydration',
    title: 'SSR Hydration',
    type: 'ssr-ssg',
    description:
      'Server-rendered markup adopted in place on hydration — the progressive-enhancement path.',
    constructs: ['ssr-hydration', 'each', 'key'],
  },
]

export const GOVERNED: readonly Governed[] = [
  { id: 'G1', name: 'todo-mvc', subsystem: 'Core reactivity + template grammar' },
  { id: 'G2', name: 'hacker-news', subsystem: 'SSR meta-framework' },
  { id: 'G3', name: 'layouts', subsystem: 'Router / layouts / navigation' },
  { id: 'G4', name: 'storefront', subsystem: 'Data fetching + resources' },
  { id: 'G5', name: 'css-engine-utility', subsystem: 'css-engine utility layer' },
  { id: 'G6', name: 'primitives-showcase', subsystem: '@aihu/ui primitives' },
  { id: 'G7', name: 'agent-hub', subsystem: 'Agent protocols (A2A / ACP / MCP)' },
  { id: 'G8', name: 'ssg-site', subsystem: "SSG / output: 'static'" },
  { id: 'G9', name: 'auth-magna-seo', subsystem: 'Auth + SEO' },
]

/**
 * Source shown in the landing hero. Kept in this data module (not inline in the
 * page's @state) because the aihu SSR-eligibility scanner reads reactive-looking
 * tokens (`prop(`, `action(`, `on:click`) literally — inlining aihu source in a
 * page's @state would misclassify the page as interactive and drop it from the
 * DOM-free prerender path.
 */
export const HERO_SOURCE = `@state {
  // one declaration — reactive for humans, discoverable for agents
  let city = prop({
    default: 'London',
    describe: 'City to forecast',
    expose: 'read write',
  })

  const refresh = action(
    { describe: 'Fetch the latest forecast', expose: 'read write' },
    async () => { forecast = await getForecast(city) },
  )
}

@template {
  <button on:click={refresh}>Forecast {city}</button>
}`

/**
 * The AGENT SURFACE half of the dual-surface card — the exposed `expose` /
 * `describe` contract an agent discovers for `weather.aihu` over MCP / A2A. This
 * is the SAME component the human-render island runs; these rows are what the
 * compiler emits into the agent-discoverable surface. Mirrors the `expose`
 * declarations in HERO_SOURCE (and in the real `weather-demo.aihu` island), so
 * the two projections are provably one component.
 */
export interface AgentSurfaceEntry {
  readonly kind: 'prop' | 'action'
  readonly name: string
  readonly describe: string
  readonly expose: string
}
export const AGENT_SURFACE: readonly AgentSurfaceEntry[] = [
  { kind: 'prop', name: 'city', describe: 'City to forecast', expose: 'read write' },
  {
    kind: 'action',
    name: 'refresh',
    describe: 'Fetch the latest forecast',
    expose: 'read write',
  },
]

/** Source for the live, runnable counter shown in the playground panel. */
export const COUNTER_SOURCE = `// counter — prop count + action increment/decrement/reset

@state {
  let count = prop({ default: 0 })

  const increment = action(() => { count++ })
  const decrement = action(() => { count-- })
  const reset = action(() => { count = 0 })
}

@template {
  <section class="counter">
    <output class="count">{count}</output>
    <div class="controls">
      <button on:click={decrement}>−</button>
      <button on:click={reset}>Reset</button>
      <button on:click={increment}>+</button>
    </div>
  </section>
}`
