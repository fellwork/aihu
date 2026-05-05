// Type declarations for virtual modules used by @aihu/app.

declare module 'virtual:aihu-routes' {
  import type { RouteDefinition } from '@aihu/router'
  const routes: RouteDefinition[]
  export default routes
}
