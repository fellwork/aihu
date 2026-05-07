# API Reference

## @aihu/signals

| Export | Description |
|--------|-------------|
| `signal<T>(initial)` | Create a writable reactive cell |
| `computed<T>(fn)` | Derive a read-only signal from other signals |
| `effect(fn)` | Run a side-effect; auto-tracks signal reads; returns dispose |
| `batch(fn)` | Defer effect flushes until fn completes |
| `untrack(fn)` | Read signals inside fn without subscribing |
| `latticeSignal<T>(merge, initial)` | Merge-monotone signal with custom merge function |
| `boolLatticeSignal(initial?)` | Boolean lattice signal (OR-merge) |
| `maxLatticeSignal(initial?)` | Numeric lattice signal (max-merge) |
| `$state` | State bag shorthand accessor (SFC-internal) |
| `SignalError` | Base error class for signal errors |
| `SignalCircularError` | Error thrown on circular signal dependencies |

**Types:** `Signal<T>`, `Read<T>`, `Write<T>`, `SignalOptions<T>`, `Dispose`, `EffectFn`, `LatticeSignal<T>`, `ComputedOptions<T>`, `State`

## @aihu/arbor

| Export | Description |
|--------|-------------|
| `branch(tag, attrs, children)` | Create a reactive element branch |
| `leaf(signal)` | Create a reactive text node |
| `mount(root, tree)` | Mount a component tree onto a DOM node |
| `slot(opts, children)` | Slot boundary primitive |
| `hydrate(root, tree)` | Hydrate a server-rendered root |
| `each(list, key, render)` | Keyed list rendering primitive |
| `when(cond, then, else?)` | Conditional rendering primitive |

**Types:** `Branch`, `Leaf`, `Node`, `ChildList`, `AttrMap`, `MountOptions`, `MountScope`, `Snapshot`, `EventHandler`, `ErrorHandler`, `AgentBindingSpec`, `AgentContext`

## @aihu/runtime

| Export | Description |
|--------|-------------|
| `defineComponent(opts)` | Define a custom element component |
| `defineElement(opts)` | Define a base custom element (lower-level) |
| `onMount(fn)` | Register a callback to run after component mounts |
| `onCleanup(fn)` | Register a cleanup callback for component unmount |
| `onAdopt(fn)` | Register a callback when element is adopted into a new document |
| `onAttributeChange(fn)` | Register a callback for attribute changes |
| `createStream(opts)` | Create a lazy-attach streaming primitive for `$stream` collection |
| `announce(message, opts?)` | Accessibility live-region announcement |
| `createFocusTrap(el)` | Create a keyboard focus trap for modals/dialogs |

**Types:** `ComponentOptions`, `DefineOptions`, `PropDef`, `PropSignal`, `PropsConfig`, `Setup`, `SetupContext`, `ShadowMode`, `StreamHandle`, `StreamStatus`

## @aihu/router

| Export | Description |
|--------|-------------|
| `createRouter(routes)` | Create a router from compiler-emitted route definitions |
| `defineRouterMiddleware(fn)` | Define a client-side router middleware |
| `composeRouterMiddleware(...fns)` | Compose router middleware with stage ordering |
| `navigate(path, opts?)` | Programmatically navigate to a path |
| `useRoute()` | Reactive accessor for the current route |
| `useRouter()` | Access the router instance |
| `createRouteSignal(router)` | Create a signal bound to the current route |
| `createPrefetcher(router)` | Create a route prefetcher |
| `provideRouteContext(router)` | Provide route context to the component tree |
| `RouteContext` | Context token for the current route |

**Types:** `RouteDefinition`, `RouteModule`, `Router`, `RouteSegment`, `MatchResult`, `NextFn`, `BeforeGuard`, `AfterGuard`, `RouterMiddleware`, `RouteMatchContext`, `RouterResult`, `NavigateOptions`, `PrefetchMode`, `RouteContextValue`

## @aihu/router/plugin

Build-time Vite plugin. Import from `@aihu/router/plugin` in `vite.config.ts` — never in browser code.

| Export | Description |
|--------|-------------|
| `viteRouterIntegration(opts?)` | Vite plugin: scan `src/pages/`, read `.route.json` sidecars, emit virtual route manifest |
| `scanPages(dir)` | Scan `src/pages/` for `.aihu` files and `.route.json` sidecars |
| `scanLayouts(dir)` | Scan `src/layouts/` for `.aihu` layout files |
| `readRouteSidecar(path)` | Read a `.route.json` sidecar file |
| `viteRouterPlugin` | Deprecated alias for `viteRouterIntegration` (removed at v1.0) |

**Types:** `RouterPluginOptions`, `RouteSidecar`, `LayoutMap`, `MiddlewareScan`

## @aihu/server

| Export | Description |
|--------|-------------|
| `defineRoute(opts)` | Define a server route handler |
| `createRequestRouter(manifest, opts?)` | Create a fetch-API request handler from a route manifest |
| `defineMiddleware(fn)` | Server middleware |
| `composeMiddleware(...fns)` | Compose server middleware |
| `defineApiRoute(opts)` | Define a REST API route |
| `defineLoader(fn)` | Define a server-side data loader |
| `defineAihuConfig(config)` | Define the aihu app configuration |
| `createServerCall<A, R>(endpoint)` | Create a typed client fetch stub for a server action |
| `defineStreamRoute(opts)` | Define a streaming HTTP route (v0.4.0+) |
| `json(data, status?)` | Return a JSON response |
| `notFound(msg?)` | Return a 404 response |
| `badRequest(msg?)` | Return a 400 response |
| `serverError(msg?)` | Return a 500 response |
| `methodNotAllowed(msg?)` | Return a 405 response |
| `renderToStream(component, opts)` | Stream-render a component to HTML |
| `renderToString(loader)` | String-render a server component |

**Types:** `AihuConfig`, `BuildConfig`, `BuildTarget`, `CorsConfig`, `RouteConfig`, `ServerConfig`, `DefinedLoader`, `LoadedRouteContext`, `LoaderFn`, `LoaderResult`, `Route`, `RouteManifest`, `RouteOptions`, `RouterOptions`, `HttpMethod`, `Middleware`, `Next`, `RouteContext`, `RouteHandler`, `ApiHandler`, `ComponentDescription`, `HeadConfig`, `LinkTag`, `MetaTag`, `SsrOptions`, `StreamRouteHandler`, `DataSource`, `StreamOptions`, `AgentReadinessConfig`

## @aihu/data

| Export | Description |
|--------|-------------|
| `createResource(key, fetcher, opts?)` | Create a reactive async resource (signal-native, backend-agnostic) |
| `createResourceStore()` | Create a resource cache store |
| `createResourceSerializer(store)` | Create an SSR dehydration serializer for a resource store |
| `ResourceStoreToken` | Context token for store injection |
| `data(config?)` | Plugin factory — register `@aihu/data` in `defineAihuConfig({ plugins: [data()] })` |

**Types:** `Resource<T>`, `ResourceOptions`, `DataState`, `ResourceStore`, `ResourceStoreWithMeta`

## @aihu/context

| Export | Description |
|--------|-------------|
| `createContext<T>(defaultValue?)` | Create a context token with an optional default value |
| `provide<T>(token, value)` | Write a value for a token into the active context map |
| `inject<T>(token)` | Read a value for a token from the active context map |
| `setSsrContextMap(map)` | Set the active context map (SSR entry point) |
| `clearSsrContextMap()` | Clear the active context map (SSR teardown) |
| `runWithContext<R>(map, fn)` | Run fn() with a per-request context map (recommended SSR pattern) |

**Types:** `ContextToken<T>`

## @aihu/agent-readiness

| Export | Description |
|--------|-------------|
| `viteAgentReadinessIntegration(opts?)` | Vite plugin for MCP/agent readiness routes (canonical name) |
| `agentReadiness(opts?)` | Deprecated alias for `viteAgentReadinessIntegration` |
| `createAgentReadinessRoutes(config)` | Create agent readiness route handlers (framework-agnostic) |
| `generateLlmsTxt(config)` | Generate `llms.txt` content from config |
| `generateLlmsFullTxt(config)` | Generate `llms-full.txt` content from config |
| `generateMcpServerCard(config)` | Generate an MCP Server Card JSON |
| `generateRobotsTxt(config)` | Generate `robots.txt` from config |
| `createContentNegotiationHandler(opts)` | Create a content-negotiation handler for agent endpoints |
| `AI_BOT_LIST` | Known AI crawler user-agent strings |

**Types:** `LlmsTxtConfig`, `LlmsTxtLink`, `LlmsTxtSection`, `AgentReadinessConfig`, `McpAuthConfig`, `AgentSkill`, `McpServerCard`, `McpServerCardConfig`, `ContentNegotiationOptions`, `MarkdownResolver`, `RobotsConfig`, `RobotsRule`

## @aihu/agent

| Export | Description |
|--------|-------------|
| `defineAgent(opts)` | Register an agent definition |

**Types:** `AgentRegistry`

## @aihu/agent-service

| Export | Description |
|--------|-------------|
| `AgentService` | Agent service adapter class |
| `defineAgentService(opts)` | Create an agent service instance |

## @aihu/plugin

| Export | Description |
|--------|-------------|
| `definePlugin(opts)` | Define an aihu plugin |
| `validatePlugin(plugin)` | Validate a plugin at build time |

**Types:** `Plugin`, `BuildTarget`

## @aihu/cli

| Export | Description |
|--------|-------------|
| `scaffoldApp(name, dir)` | Scaffold a new aihu application |
| `scaffoldPage(route, dir)` | Add a page to an existing project |
| `scaffoldComponent(name, dir)` | Scaffold a `.aihu` component |
| `scaffoldPlugin(name, dir)` | Scaffold a plugin package skeleton |
| `migrateFile(content)` | Convert HTML-tag SFC content to `@blockname{}` form |
| `migrateFiles(files, dryRun, cwd)` | Migrate files in-place or dry-run |

## @state macro collection forms (v2)

The v2 collection-form syntax for `@state` macros. v1 forms produce error C440.

| Macro | Collection-form |
|-------|-----------------|
| `$prop` | `$prop: { name: { default: value, type?: "T", describe?: "...", expose?: { read?: true, write?: true } } }` |
| `$computed` | `$computed: { name: () => expr }` (bare) or `{ name: { value: () => expr, describe?: "...", expose?: { read?: true } } }` (wrapped) |
| `$action` | `$action: { name: (args) => expr }` (bare) or `{ name: { handler: (args) => expr, describe?: "...", expose?: { write?: true } } }` (wrapped) |
| `$resource` | `$resource: { name: () => fetcher() }` (bare) or `{ name: { value: () => fetcher(), describe?: "...", expose?: { read?: true } } }` (wrapped) |
| `$effect` | `$effect: () => { body }` (anonymous) or `$effect: { name: () => { body } }` (named) |
| `$lifecycle` | `$lifecycle: { mount: () => ..., dispose: () => ... }` — always bare, wrapped form forbidden |

## @agent block (v2)

`@agent` holds only cross-cutting declarations. Per-name metadata lives on `@state` entries.

```
@agent {
  $scope "scope-name"   // agent permission scope string
  $rate-limit 100       // requests per minute (positive integer)
}
```

Removed in v2 (C440 errors): `$expose`, `$expose.write`, `$action <bareName>`, `$describe`.
