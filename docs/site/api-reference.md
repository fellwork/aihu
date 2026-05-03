# API Reference

## @scribe/signals

| Export | Description |
|--------|-------------|
| `signal<T>(initial)` | Create a writable reactive cell |
| `computed<T>(fn)` | Derive a read-only signal from other signals |
| `effect(fn)` | Run a side-effect; auto-tracks signal reads; returns dispose |
| `batch(fn)` | Defer effect flushes until fn completes |
| `untrack(fn)` | Read signals inside fn without subscribing |
| `latticeSignal<T>(merge, initial)` | Merge-monotone signal |
| `boolLatticeSignal(initial?)` | Boolean lattice signal (OR-merge) |
| `maxLatticeSignal(initial?)` | Numeric lattice signal (max-merge) |
| `$state` | State bag shorthand accessor |

## @scribe/arbor

| Export | Description |
|--------|-------------|
| `branch(tag, attrs, children)` | Create a reactive element branch |
| `leaf(signal)` | Create a reactive text node |
| `mount(root, tree)` | Mount a component tree onto a DOM node |
| `slot(opts, children)` | Slot boundary primitive |
| `hydrate(root, tree)` | Hydrate a server-rendered root |
| `materialize(descriptor)` | Materialize a component descriptor |

## @scribe/runtime

| Export | Description |
|--------|-------------|
| `onMount(fn)` | Register a callback to run after component mounts |
| `onCleanup(fn)` | Register a callback to run when component unmounts |

## @scribe/router

| Export | Description |
|--------|-------------|
| `createRequestRouter(opts?)` | Create an isomorphic request router |
| `defineMiddleware(fn)` | Define a server middleware handler |
| `composeMiddleware(...fns)` | Compose server middleware into a single handler |
| `defineRouterMiddleware(fn)` | Define a client-side router middleware |
| `composeRouterMiddleware(...fns)` | Compose router middleware with stage ordering |
| `RouteDefinition` | Type: a route definition object |

## @scribe/router/plugin

| Export | Description |
|--------|-------------|
| `viteRouterIntegration(opts?)` | Vite plugin: scan pages + emit route manifest |
| `scanPages(dir)` | Scan src/pages/ for .scribe files + .route.json sidecars |
| `scanLayouts(dir)` | Scan src/layouts/ for .scribe layout files |
| `readRouteSidecar(path)` | Read a .route.json sidecar file |

## @scribe/server

| Export | Description |
|--------|-------------|
| `defineRoute(opts)` | Define a server route handler |
| `createRequestRouter(opts?)` | Alias for server-side router |
| `defineMiddleware(fn)` | Server middleware |
| `composeMiddleware(...fns)` | Compose server middleware |
| `defineApiRoute(opts)` | Define a REST API route |
| `json(data, status?)` | Return a JSON response |
| `notFound(msg?)` | Return a 404 response |
| `renderToStream(component, opts)` | Stream-render a component to HTML |
| `renderToString(loader)` | String-render a server component |
| `defineLoader(fn)` | Define a server-side data loader |
| `defineScribeConfig(config)` | Define the scribe app configuration |
| `createServerCall<A, R>(endpoint)` | Create a typed client fetch stub |
| `BuildTarget` | Type: `'client' \| 'server' \| 'universal'` |

## @scribe/agent

| Export | Description |
|--------|-------------|
| `defineAgent(opts)` | Register an agent definition |
| `AgentRegistry` | Agent registry type |

## @scribe/agent-service

| Export | Description |
|--------|-------------|
| `AgentService` | Agent service adapter class |
| `defineAgentService(opts)` | Create an agent service instance |

## @scribe/agent-readiness

| Export | Description |
|--------|-------------|
| `viteAgentReadinessIntegration(opts?)` | Vite plugin for MCP/agent readiness |

## @scribe/data

| Export | Description |
|--------|-------------|
| `createDataPlugin(opts)` | Create a data plugin instance |

## @scribe/plugin

| Export | Description |
|--------|-------------|
| `definePlugin(opts)` | Define a scribe plugin |
| `validatePlugin(plugin)` | Validate a plugin at build time |
| `Plugin` | Plugin interface type |
| `BuildTarget` | Build target type |

## @scribe/cli

| Export | Description |
|--------|-------------|
| `scaffoldApp(name, dir)` | Scaffold a new scribe application |
| `scaffoldPage(route, dir)` | Add a page to an existing project |
| `scaffoldComponent(name, dir)` | Scaffold a .scribe component |
| `scaffoldPlugin(name, dir)` | Scaffold a plugin package skeleton |
| `migrateFile(content)` | Convert HTML-tag SFC content to @blockname{} |
| `migrateFiles(files, dryRun, cwd)` | Migrate files in-place or dry-run |

## @scribe/context

| Export | Description |
|--------|-------------|
| `createContext<T>(key)` | Create a scoped context cell |
| `getContext<T>(key)` | Read a context value |
| `setContext<T>(key, value)` | Set a context value |
