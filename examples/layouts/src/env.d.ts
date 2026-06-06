declare module 'virtual:aihu-routes' {
  import type { RouteDefinition } from '@aihu/router'

  const routes: RouteDefinition[]
  export default routes
}

declare module 'virtual:aihu-layouts' {
  const layouts: Record<string, { tag: string; load: () => Promise<unknown> }>
  export default layouts
}
