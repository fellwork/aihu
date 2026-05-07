/**
 * `@aihu/scraping` — Fetch-API-compatible bot-detection middleware.
 *
 * Returns 403 for requests that carry a known-bot User-Agent substring
 * or that lack a User-Agent entirely (when `allowNoUserAgent` is false).
 */

export interface BotDetectionOptions {
  /** Additional UA substrings to block (appended to the default list). */
  blockList?: string[]
  /**
   * When true, requests with no User-Agent header are allowed through.
   * Default: false (block missing UA).
   */
  allowNoUserAgent?: boolean
}

const DEFAULT_BLOCK_LIST: readonly string[] = [
  'bot',
  'spider',
  'crawl',
  'scraper',
  'wget',
  'curl',
  'python-requests',
  'java/',
  'Go-http-client',
  'libwww-perl',
]

/**
 * Returns a middleware function that inspects the `User-Agent` header.
 *
 * - Missing UA → 403 (unless `allowNoUserAgent: true`).
 * - UA containing any blocked substring (case-insensitive) → 403.
 * - Otherwise → delegates to `next()`.
 */
export function createBotDetectionMiddleware(
  options?: BotDetectionOptions,
): (req: Request, next: () => Response | Promise<Response>) => Response | Promise<Response> {
  const allowNoUA = options?.allowNoUserAgent ?? false
  const extra = options?.blockList ?? []

  // Merge and lowercase once at construction time for fast case-insensitive matching.
  const patterns: string[] = [...DEFAULT_BLOCK_LIST, ...extra].map((s) => s.toLowerCase())

  return function botDetectionMiddleware(
    req: Request,
    next: () => Response | Promise<Response>,
  ): Response | Promise<Response> {
    const ua = req.headers.get('user-agent')

    if (ua === null || ua === '') {
      if (allowNoUA) return next()
      return new Response('Forbidden', { status: 403 })
    }

    const uaLower = ua.toLowerCase()

    for (const pattern of patterns) {
      if (uaLower.includes(pattern)) {
        return new Response('Forbidden', { status: 403 })
      }
    }

    return next()
  }
}
