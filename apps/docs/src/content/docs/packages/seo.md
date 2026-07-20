# @aihu/seo

> **⚠️ Deprecated (v1.0.0, #430).** `@aihu/seo` is now a thin compatibility shim over `@aihu-plugin/agent-readiness` — the name is kept for discoverability, but all capability lives in the sibling. New apps should use `createAgentReadinessRoutes` / `viteAgentReadinessIntegration` directly (see the [agent discovery guide](/docs/guides/agent-discovery)). The shim preserves this package's historical robots.txt default: with `robotsOptions.disallowAiBots` absent it still blocks all AI bots (`deny-all`) and logs a deprecation warning asking you to state your choice in the new `aiAgents` vocabulary (`'allow-agents'` — the new package's tiered default — `'allow-all'`, `'deny-all'`, or rules). The sitemap now XML-escapes URLs via the shared generator.

aihu SEO plugin: `sitemap.xml`, `robots.txt`, and `llms.txt` route handlers plus JSON-LD structured-data injection via the `afterParse` compiler hook. Routes are framework-agnostic `RouteHandler`s, and the `llms.txt` sections compose cleanly into `@aihu-plugin/agent-readiness` (see the [agent discovery guide](/docs/guides/agent-discovery)).

## Install

```bash
npm install @aihu/seo
# or
bun add @aihu/seo
```

Dependencies: `@aihu/plugin`, `@aihu/server`, and `@aihu-plugin/agent-readiness`.

## API overview

| Name | Kind | Description |
|------|------|-------------|
| `seo` | function | Plugin factory. Registers an `afterParse` hook that injects default JSON-LD into SFC compilation output. |
| `createSeoRoutes` | function | Build framework-agnostic `RouteHandler`s for `/sitemap.xml`, `/robots.txt`, and `/llms.txt`. |
| `seoLlmsSections` | function | Produce `LlmsTxtSection[]` for composition into `@aihu-plugin/agent-readiness`'s `llmsSections` field. |

## Functions

### seo

```typescript
function seo(config: SeoConfig): Plugin
```

Plugin factory. Registers an `afterParse` hook that injects a baseline `WebPage` JSON-LD annotation (built from `config.jsonLdDefaults` merged with `config.baseUrl` as the default page URL) into SFC compilation output. Register it in `defineAihuConfig`.

### createSeoRoutes

```typescript
function createSeoRoutes(config: SeoConfig): SeoRoutes
```

Returns `{ sitemapXml, robotsTxt, llmsTxt }` — three `RouteHandler`s you wire into `@aihu/server` via `defineRoute`. `sitemapXml` serves `application/xml`, while `robotsTxt` and `llmsTxt` serve `text/plain`.

### seoLlmsSections

```typescript
function seoLlmsSections(config: SeoConfig): ReadonlyArray<LlmsTxtSection>
```

Returns an array of `LlmsTxtSection` entries derived from the configured sitemap sources. Spread the result into `@aihu-plugin/agent-readiness`'s `llmsSections` field (`llmsSections: [...userSections, ...seoLlmsSections(config)]`) for a richer, composed `llms.txt`.

## Types

| Name | Description |
|------|-------------|
| `SeoConfig` | `siteName`, `baseUrl` (no trailing slash), optional `sitemapSources?`, `jsonLdDefaults?`, and `robotsOptions?`. |
| `SitemapSource` | `path`, optional `lastmod?` (ISO date), `changefreq?`, and `priority?` (0.0–1.0). |
| `JsonLdPage` | `@context` / `@type` plus arbitrary keys (`name`, `description`, `url`, …). |
| `RobotsOptions` | `disallowAiBots?` (default `true`) and `additionalRules?` (per-user-agent allow/disallow). |
| `SeoRoutes` | `{ sitemapXml, robotsTxt, llmsTxt }` — each a `RouteHandler`. |

## Routes

`createSeoRoutes` produces handlers for the three canonical discovery endpoints:

| Method | Path | Content-Type | Source |
|--------|------|--------------|--------|
| `GET` | `/sitemap.xml` | `application/xml` | `config.sitemapSources` rendered to a sitemap. |
| `GET` | `/robots.txt` | `text/plain` | `config.robotsOptions` (AI bots disallowed by default). |
| `GET` | `/llms.txt` | `text/plain` | `seoLlmsSections(config)`. |

## Usage

```typescript
import { createSeoRoutes } from '@aihu/seo'
import { createRequestRouter, defineRoute } from '@aihu/server'

const seoRoutes = createSeoRoutes({
  siteName: 'My App',
  baseUrl: 'https://example.com',
  sitemapSources: [{ path: '/', priority: 1.0 }, { path: '/about' }],
})

const router = createRequestRouter({
  routes: [
    defineRoute('/sitemap.xml', seoRoutes.sitemapXml),
    defineRoute('/robots.txt', seoRoutes.robotsTxt),
    defineRoute('/llms.txt', seoRoutes.llmsTxt),
  ],
})
```

## How it relates

`llms.txt` and `robots.txt` overlap with [agent discovery](/docs/guides/agent-discovery): use `seoLlmsSections(config)` to feed SEO sources into `@aihu-plugin/agent-readiness` rather than maintaining two `llms.txt` generators.
