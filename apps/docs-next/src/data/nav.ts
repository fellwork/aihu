/**
 * The docs sidebar model. In this representative slice only the pages that
 * actually exist are wired live; the rest are shown as "soon" so the shape of
 * the full information architecture is judgeable. Full content migration
 * (docs/collapse-to-apps-docs unified corpus) is the next phase.
 */
export interface NavLink {
  readonly label: string
  readonly href: string
  /** true = a built page in this slice; false = placeholder in the IA. */
  readonly ready: boolean
}
export interface NavSection {
  readonly title: string
  readonly links: readonly NavLink[]
}

export const NAV: readonly NavSection[] = [
  {
    title: 'Guides',
    links: [
      { label: 'Getting Started', href: '/guides/getting-started', ready: true },
      { label: 'Installation', href: '/guides/installation', ready: false },
      { label: 'Reactivity', href: '/guides/reactivity', ready: false },
      { label: 'Authoring Components', href: '/guides/authoring-components', ready: false },
      { label: 'Routing & Layouts', href: '/guides/routing-layouts', ready: false },
      { label: 'SSR & Hydration', href: '/guides/ssr-hydration', ready: false },
      { label: 'Agent Discovery', href: '/guides/agent-discovery', ready: false },
      { label: 'Deployment', href: '/guides/deployment', ready: false },
    ],
  },
  {
    title: 'API Reference',
    links: [
      { label: '@aihu/signals', href: '/api/signals', ready: true },
      { label: '@aihu/runtime', href: '/api/runtime', ready: false },
      { label: '@aihu/router', href: '/api/router', ready: false },
      { label: '@aihu/server', href: '/api/server', ready: false },
      { label: '@aihu/app', href: '/api/app', ready: false },
      { label: 'All 37 packages', href: '/api', ready: false },
    ],
  },
  {
    title: 'Examples',
    links: [
      { label: 'Gallery', href: '/examples', ready: true },
      { label: 'Governed set (9)', href: '/examples#governed', ready: true },
    ],
  },
  {
    title: 'Cookbook',
    links: [
      { label: 'Recipes', href: '/examples#cookbook', ready: true },
      { label: 'Playground', href: '/examples#playground', ready: true },
    ],
  },
]
