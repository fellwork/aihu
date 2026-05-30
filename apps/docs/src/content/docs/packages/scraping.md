# @aihu/scraping

An O(1) fixed-window rate limiter and a Fetch-API bot-detection middleware for aihu agent services. The rate limiter plugs into the same `@aihu/agent-service` enforcement path that `@aihu/auth` extends with scope checks; the bot-detection middleware chains ahead of any fetch-API handler.

## Install

```bash
npm install @aihu/scraping
# or
bun add @aihu/scraping
```

Zero runtime dependencies — the package ships no `dependencies` block.

## API overview

| Name | Kind | Description |
|------|------|-------------|
| `createRateLimiter` | function | Build an O(1) fixed-window `RateLimitPlugin` that parses specs like `'100/min'`. |
| `createRateLimitPlugin` | function | Alias of `createRateLimiter`. |
| `createBotDetectionMiddleware` | function | Fetch-API middleware that blocks known-bot User-Agents and (optionally) missing UAs. |

## Functions

### createRateLimiter

```typescript
function createRateLimiter(options?: RateLimiterOptions): RateLimitPlugin
```

Creates an O(1) fixed-window rate limiter satisfying `RateLimitPlugin`. The returned `checkRateLimit(rateSpec, key)` parses specs of the form `'<n>/<unit>'` (units: `sec` | `min` | `hour`, e.g. `'100/min'`) and returns `true` while the key is within its window. Every operation is O(1): no sorted structures, no expiry scans. `createRateLimitPlugin` is an exported alias.

### createBotDetectionMiddleware

```typescript
function createBotDetectionMiddleware(
  options?: BotDetectionOptions,
): (req: Request, next: () => Response | Promise<Response>) => Response | Promise<Response>
```

Returns a fetch-API middleware that inspects the `User-Agent` header. A UA containing any blocked substring (case-insensitive; the default list plus `options.blockList`) yields a `403`. A missing or empty UA yields a `403` unless `options.allowNoUserAgent` is `true`. Otherwise it delegates to `next()`.

## Types

| Name | Description |
|------|-------------|
| `RateLimiterOptions` | `maxKeys?` (max map size, default `100_000`) and `now?` (clock override for testing, default `Date.now`). |
| `RateLimitPlugin` | `{ checkRateLimit(rateSpec: string, key: string): boolean }`. |
| `BotDetectionOptions` | `blockList?: string[]` (appended to the default block list) and `allowNoUserAgent?` (default `false`). |

## Usage

Wire the rate limiter into an agent service for per-component `$rate-limit` enforcement (the limiter is invoked with each component's `rateLimitSpec`):

```typescript
import { createAgentService } from '@aihu/agent-service'
import { getAllAgentMetadata } from '@aihu/agent'
import { createRateLimiter } from '@aihu/scraping'

const service = createAgentService({
  manifests: getAllAgentMetadata(),
  rateLimitPlugin: createRateLimiter(),
})
```

Chain bot detection ahead of a fetch-API handler:

```typescript
import { createBotDetectionMiddleware } from '@aihu/scraping'

const guard = createBotDetectionMiddleware({ blockList: ['my-bad-bot'] })

export default {
  fetch(req: Request): Response | Promise<Response> {
    return guard(req, () => handleRequest(req))
  },
}
```

## How it relates

The rate limiter plugs into the same agent-service auth/rate-limit path documented in [`@aihu/auth`](/docs/packages/auth): pass `createRateLimiter()` as `rateLimitPlugin` alongside `createAuthPlugin()` as `authPlugin`.
