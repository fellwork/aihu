/**
 * examples/auth-magna-seo — the 3-package integration contract (imperative APIs).
 *
 * Proves auth + magna + seo compose end-to-end using ONLY the imperative
 * factories — no $auth/$query macros yet (those land in G3b / Round 3):
 *
 *   1. getAuthState(req, authConfig)         — @aihu/auth/server (JWT gate)
 *   2. createMagnaFetch / createMagnaResource — @aihu/magna (data read)
 *   3. createSeoRoutes                        — @aihu/seo (sitemap/robots/llms)
 *
 * The protected page handler gates on auth (401 no user / 403 missing scope),
 * then reads magna data server-side and renders HTML embedding the data plus a
 * hand-rolled JSON-LD <script type="application/ld+json"> block.
 */

import type { AuthConfig } from '@aihu/auth/server'
import { getAuthState } from '@aihu/auth/server'
import type { MagnaResource } from '@aihu/magna'
import { createMagnaFetch, createMagnaResource } from '@aihu/magna'
import type { JsonLdPage, SeoConfig } from '@aihu/seo'
import { createSeoRoutes } from '@aihu/seo'
import { createRequestRouter, defineRoute } from '@aihu/server'
import { signal } from '@aihu/signals'

/** Scope required to read magna data on the protected page. */
const REQUIRED_SCOPE = 'magna:read'

/** Magna GraphQL endpoint (never hit in tests — fetch is injected). */
const MAGNA_URL = 'https://magna.example.com/graphql'

/** The GraphQL operation the protected page reads server-side. */
export const MAGNA_QUERY = /* GraphQL */ `query Product { product { id name } }`

/** Shape of the magna data this example renders. */
export interface ProductData {
  readonly product: { readonly id: string; readonly name: string }
}

/** Options for {@link createApp}. The fetch + secret are injectable for tests. */
export interface CreateAppOptions {
  /** HMAC-SHA-256 secret used to verify session JWTs. */
  readonly jwtSecret: string
  /**
   * Custom fetch passed to createMagnaFetch so the smoke test can stub the
   * GraphQL endpoint and avoid real network I/O. Defaults to globalThis.fetch.
   */
  readonly fetch?: typeof globalThis.fetch
}

const seoConfig: SeoConfig = {
  siteName: 'Auth · Magna · SEO',
  baseUrl: 'https://example.com',
  sitemapSources: [
    { path: '/', changefreq: 'daily', priority: 1.0 },
    { path: '/product', changefreq: 'weekly', priority: 0.8 },
  ],
}

/**
 * Read the raw session JWT from the request cookie (so it can be relayed to
 * magna as a Bearer token). Returns null when absent.
 */
function readSessionToken(req: Request, cookieName = 'aihu_session'): string | null {
  const cookie = req.headers.get('cookie')
  if (!cookie) return null
  for (const part of cookie.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === cookieName) return rest.join('=')
  }
  return null
}

/** Render the protected page HTML with the magna data + a JSON-LD block. */
function renderPage(data: ProductData | null): string {
  const productName = data?.product?.name ?? 'Unknown'
  const productId = data?.product?.id ?? 'n/a'

  // SEO emission: hand-rolled JSON-LD. generateJsonLd is NOT a public export of
  // @aihu/seo, so we build the JsonLdPage object ourselves and serialise it.
  const jsonLd: JsonLdPage = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `Product — ${productName}`,
    description: `Auth-gated magna read for product ${productId}.`,
    url: `${seoConfig.baseUrl}/product`,
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${jsonLd.name}</title>
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body>
<main>
<h1>Protected product</h1>
<p data-product-id="${productId}">Product: ${productName} (#${productId})</p>
</main>
</body>
</html>`
}

/**
 * Build the request router for the example app.
 *
 * The protected `/product` handler demonstrates the imperative integration
 * end-to-end; SEO routes are wired alongside it.
 */
export function createApp(options: CreateAppOptions): (req: Request) => Promise<Response> {
  const authConfig: AuthConfig = { jwtSecret: options.jwtSecret }
  const seoRoutes = createSeoRoutes(seoConfig)

  const productPage = async (req: Request): Promise<Response> => {
    // TODO(G3b): replace imperative getAuthState/createMagnaFetch wiring with
    // $auth / $query macros (Round 3). The macro uplift collapses the gate +
    // read below into declarative `$auth('magna:read')` / `$query(...)` calls.
    const { user, scopes } = await getAuthState(req, authConfig)
    if (!user) {
      return new Response('Unauthorized', { status: 401 })
    }
    if (!scopes.includes(REQUIRED_SCOPE)) {
      return new Response('Forbidden', { status: 403 })
    }

    // Relay the session JWT to magna as a Bearer token via getToken.
    const sessionToken = readSessionToken(req, authConfig.cookieName)
    const magnaFetch = createMagnaFetch({
      url: MAGNA_URL,
      fetch: options.fetch,
      getToken: () => sessionToken,
    })

    // Read magna data SERVER-SIDE by awaiting the fetch directly. The reactive
    // resource (createMagnaResource) is the client-surface demonstration and is
    // exercised separately (see makeProductResource + the smoke test) — its
    // signal transitions async and must NOT be read synchronously here.
    const result = await magnaFetch<ProductData>(MAGNA_QUERY)

    return new Response(renderPage(result.data), {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  }

  return createRequestRouter({
    routes: [
      defineRoute('/product', productPage),
      defineRoute('/sitemap.xml', seoRoutes.sitemapXml),
      defineRoute('/robots.txt', seoRoutes.robotsTxt),
      defineRoute('/llms.txt', seoRoutes.llmsTxt),
    ],
  })
}

/**
 * Reactive surface demonstration: build a {@link MagnaResource} over the same
 * query. The resource drives its `state` signal idle → loading → ready via an
 * internal effect; the smoke test exercises this path. The fetch is injectable
 * so no network is hit.
 */
export function makeProductResource(
  fetchImpl?: typeof globalThis.fetch,
): MagnaResource<ProductData> {
  const magnaFetch = createMagnaFetch({ url: MAGNA_URL, fetch: fetchImpl })
  // A non-null variables signal puts the resource into a fetching state.
  const vars = signal<Readonly<Record<string, unknown>> | null>({})
  return createMagnaResource<ProductData>(magnaFetch, MAGNA_QUERY, vars)
}
