// Type declarations for virtual modules used by @scribe/app.

declare module 'virtual:scribe-routes' {
  import type { RouteDefinition } from '@scribe/router'
  const routes: RouteDefinition[]
  export default routes
}
