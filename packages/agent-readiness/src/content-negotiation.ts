import type { Middleware } from '@scribe/server'

/**
 * Abstract interface for resolving markdown content from a URL path.
 *
 * Edge-safe: this module does NOT import fs, path, Deno.readFile,
 * Bun.file, or any filesystem API. The resolver is injected by the caller.
 *
 * SECURITY: Concrete resolver implementations MUST sanitize the `path`
 * argument before any filesystem access. Reject paths containing `..`,
 * null bytes, or other traversal patterns.
 */
export interface MarkdownResolver {
  /**
   * Return markdown content for the given URL path, or null when none exists.
   * Implementations must catch errors internally and return null rather than throw.
   */
  resolve(path: string): Promise<string | null>
}

export interface ContentNegotiationOptions {
  readonly resolver: MarkdownResolver
  /**
   * Token count estimator for the x-markdown-tokens response header.
   * Default: Math.ceil(content.length / 4).
   */
  readonly estimateTokens?: (content: string) => number
}

/**
 * Create a content-negotiation middleware.
 *
 * Behavior:
 * 1. If Accept does NOT include text/markdown → call next()
 * 2. If Accept includes text/markdown:
 *    a. Call resolver.resolve(url.pathname)
 *    b. null result → call next() (fall through)
 *    c. string result → return 200 with:
 *       - Content-Type: text/markdown; charset=utf-8
 *       - x-markdown-tokens: {count}  (integer string, estimate)
 *       - Body: the markdown content
 *
 * Does NOT modify responses from next().
 */
export function createContentNegotiationHandler(
  opts: ContentNegotiationOptions,
): Middleware {
  const estimateTokens = opts.estimateTokens ?? ((content: string) => Math.ceil(content.length / 4))

  return async (req, next) => {
    const accept = req.headers.get('Accept') ?? ''
    if (!accept.includes('text/markdown')) {
      return next()
    }

    const pathname = new URL(req.url).pathname
    const content = await opts.resolver.resolve(pathname)

    if (content === null) {
      return next()
    }

    const tokens = estimateTokens(content)
    return new Response(content, {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'x-markdown-tokens': String(tokens),
      },
    })
  }
}
