# @aihu/auth

JWT scope checks, a reactive `ScopeSignal`, client sign-in/sign-out helpers, and server middleware/routes for aihu auth. The package supplies the `AuthPlugin` that `@aihu/agent-service` uses to gate `$scope`-protected components, plus the cookie-backed session machinery for sign-in flows.

The public surface is split across two entry points: a browser-safe root (`@aihu/auth`) and a server-only subpath (`@aihu/auth/server`) that needs Web Crypto (`crypto.subtle`).

## Install

```bash
npm install @aihu/auth
# or
bun add @aihu/auth
```

`@aihu/signals` is a required peer dependency. `@aihu/agent-service` is an optional peer dependency — install it only when you wire the auth plugin into an agent service for `$scope` enforcement.

## Entry points

| Import | Surface | Notes |
|--------|---------|-------|
| `@aihu/auth` | Browser-safe | Client helpers, the agent-service `AuthPlugin` factory, the `ScopeSignal`, and legacy JWT/middleware helpers. No `crypto.subtle` dependency. |
| `@aihu/auth/server` | Server-only | The `auth()` plugin factory, `createAuthRoutes`, and `getAuthState`. Verifies JWT signatures via `crypto.subtle`. Never import this into a browser bundle. |

## API overview

### Root — `@aihu/auth`

| Name | Kind | Description |
|------|------|-------------|
| `createAuthPlugin` | function | Build an `AuthPlugin` for `createAgentService({ authPlugin })` so `$scope`-gated tool calls are enforced. |
| `signIn` | function | Client POST to the sign-in endpoint; resolves to the authenticated `User`. |
| `signOut` | function | Client POST to the sign-out endpoint; never throws. |
| `useCurrentUser` | function | Reactive getter returning the current `User | null`. |
| `setCurrentScopes` | function | Update the module-level scope signal. |
| `clearCurrentScopes` | function | Reset the current user and scopes to `null` / `[]`. |
| `createScopeSignal` | function | Create a `ScopeSignalHandle` for reactive scope tracking. |
| `getScopeSignal` | function | Reactive getter returning whether a given scope is currently held. |
| `decodeJwt` | function | Legacy: decode a JWT payload (no signature check); returns `JwtClaims | null`. |
| `hasScope` | function | Legacy: test whether decoded `JwtClaims` carry a scope. |
| `requireAuth` | function | Legacy middleware: 401 when no token is present. |
| `requireScope` | function | Legacy middleware: 401 on missing token, 403 on missing scope. |
| `AuthError` | class | Error thrown by client `signIn` on HTTP/parse failures. |

### Server — `@aihu/auth/server`

| Name | Kind | Description |
|------|------|-------------|
| `auth` | function | aihu `Plugin` factory: registers the sign-in/out/refresh routes and exposes `getAuthState` as a server-runtime helper. |
| `createAuthRoutes` | function | Build the three `RouteHandler`s (`signIn`, `signOut`, `refresh`). |
| `getAuthState` | function | Read and verify the session JWT cookie; async, never throws. |

## Functions

### createAuthPlugin

```typescript
function createAuthPlugin(options?: AuthPluginOptions): AuthPlugin
```

Creates an `AuthPlugin` compatible with `@aihu/agent-service`. Its `checkScope(jwt, scope)` decodes the JWT payload and returns `true` when the required scope is present in any standard claim location (`scope`, `scp`, `scopes`). Returns `false` — never throws — for malformed or unsigned tokens. Pass `options.decodeJwt` to inject a custom decoder.

### signIn

```typescript
async function signIn(token: string, signInPath = '/auth/sign-in'): Promise<User>
```

Client helper. POSTs the supplied `token` to the sign-in endpoint, updates the local user/scope signals on success, and resolves to the authenticated `User`. Throws `AuthError` on HTTP or parse failures.

### signOut

```typescript
async function signOut(signOutPath = '/auth/sign-out'): Promise<void>
```

Client helper. POSTs to the sign-out endpoint and clears the local user/scope signals. Never throws.

### useCurrentUser

```typescript
function useCurrentUser(): () => User | null
```

Returns a reactive getter for the current `User | null`, suitable for use inside computeds and effects.

### setCurrentScopes / clearCurrentScopes

```typescript
function setCurrentScopes(scopes: string[]): void
function clearCurrentScopes(): void
```

`setCurrentScopes` writes the active scope list onto the module-level scope signal. `clearCurrentScopes` resets the current user to `null` and scopes to `[]`.

### createScopeSignal / getScopeSignal

```typescript
function createScopeSignal(): ScopeSignalHandle
function getScopeSignal(scope: string): () => boolean
```

`createScopeSignal` returns a `ScopeSignalHandle` for managing the reactive scope set. `getScopeSignal(scope)` returns a reactive getter that is `true` while the named scope is held.

### auth (`/server`)

```typescript
function auth(config: AuthConfig): Plugin
```

Server-only plugin factory. Registers the sign-in, sign-out, and refresh routes (paths from `config.signInPath` / `signOutPath` / `refreshPath`, defaulting to `/auth/sign-in`, `/auth/sign-out`, `/auth/refresh`) and exposes `getAuthState` as a server-runtime helper. Register it in `defineAihuConfig({ plugins: [auth({ jwtSecret })] })`.

### createAuthRoutes (`/server`)

```typescript
function createAuthRoutes(config: AuthConfig): RouteHandlers
```

Returns the three `RouteHandler` objects (`{ signIn, signOut, refresh }`) so you can register them with any fetch-API router. The sign-in handler verifies the token and sets the session cookie; sign-out clears it.

### getAuthState (`/server`)

```typescript
async function getAuthState(ctx: RequestContext, config: AuthConfig): Promise<AuthState>
```

Reads the session JWT cookie from the request, verifies its signature with `crypto.subtle`, and returns `{ user, scopes }`. Never throws — on an absent or invalid cookie it returns `{ user: null, scopes: [] }`.

## Types

| Name | Kind | Description |
|------|------|-------------|
| `User` | interface | `{ id, email?, scopes: string[] }`. |
| `AuthState` | interface | `{ user: User | null, scopes: string[] }` — result of `getAuthState`. |
| `AuthConfig` | interface | `jwtSecret` plus optional `signInPath` / `signOutPath` / `refreshPath`, `cookieName` (default `aihu_session`), and `maxAge` (default `86400`). |
| `RouteHandlers` | interface | `{ signIn, signOut, refresh }` — each a `RouteHandler` from `@aihu/server`. |
| `RequestContext` | type | Alias for the standard `Request`. |
| `AuthError` | class | Carries an optional `statusCode`. |
| `JwtClaims` | interface | Decoded JWT payload shape consumed by `hasScope`. |
| `AuthMiddlewareOptions` | interface | Options for `requireAuth` / `requireScope`. |
| `AuthPluginOptions` | interface | Options for `createAuthPlugin` (`decodeJwt` override). |
| `ScopeSignalHandle` | interface | Handle returned by `createScopeSignal`. |

## Auth on agent endpoints (v1)

The MCP HTTP path — `createAgentService(...).asMiddleware()` — is **auth-capable** via `createAuthPlugin()`. When you pass `authPlugin`, `handleToolCall` enforces `$scope`-gated components: it returns `401 AUTH_MISSING` when no JWT is present and `403 SCOPE_DENIED` when the JWT lacks the required scope (see `packages/agent-service/src/agent-service.ts`). `@aihu/auth` supplies that plugin via `createAuthPlugin()`.

By contrast, the [`@aihu/agent-a2a`](/docs/packages/agent-a2a) and [`@aihu/agent-acp`](/docs/packages/agent-acp) adapters have **no** scope wiring — they are **anonymous-only for v1**. Do not rely on them for access control.

```typescript
import { createAgentService } from '@aihu/agent-service'
import { getAllAgentMetadata } from '@aihu/agent'
import { createAuthPlugin } from '@aihu/auth'

const service = createAgentService({
  manifests: getAllAgentMetadata(),
  authPlugin: createAuthPlugin(),
})

// MCP HTTP middleware now enforces $scope checks:
// 401 AUTH_MISSING when no JWT, 403 SCOPE_DENIED on insufficient scope.
const handler = service.asMiddleware()
```

## How it relates

- [`@aihu/agent-a2a`](/docs/packages/agent-a2a) and [`@aihu/agent-acp`](/docs/packages/agent-acp) — anonymous-only adapters; no auth wiring in v1.
- [`@aihu/scraping`](/docs/packages/scraping) plugs into the same agent-service rate-limit path that `createAuthPlugin()` extends with scope checks.
