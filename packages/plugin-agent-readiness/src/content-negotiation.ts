import type { Middleware } from '@aihu/server'
import { AI_BOT_LIST } from './robots.ts'

const escapeForRegExp = (token: string): string => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Single source for "is this an AI crawler": the SAME `AI_BOT_LIST` that
 * robots.txt is generated from. A second bot list here would be exactly the
 * hand-maintained sync seam `check:derived` exists to forbid.
 */
const AI_BOT_UA_PATTERN = new RegExp(AI_BOT_LIST.map(escapeForRegExp).join('|'), 'i')

/**
 * Does this user-agent belong to an AI crawler?
 *
 * Substring, case-insensitive — the matching robots.txt itself uses, and what
 * real crawler UAs require (`…compatible; GPTBot/1.1; +https://…`).
 *
 * Conservative in the over-application direction: no token in `AI_BOT_LIST`
 * occurs in a mainstream browser UA. In particular `Applebot` does not match
 * `AppleWebKit`, which every Safari and Chrome UA on macOS carries.
 */
export function isAiCrawlerUserAgent(userAgent: string): boolean {
  if (!userAgent) return false
  return AI_BOT_UA_PATTERN.test(userAgent)
}

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
  /**
   * Serve markdown to a recognized AI crawler that sent no `Accept` preference.
   * Default: true.
   *
   * Rationale: AI crawlers do not send `Accept: text/markdown` — of 7 agents
   * tested only 3 do, and those are coding agents, not search crawlers
   * (`docs/domain-hints/seo-and-agent-discoverability.md` §7.5). Without this
   * the negotiation path is unreachable for the clients with the volume.
   * Precedent: Next.js 15.2+ keeps an `htmlLimitedBots` list and UA-sniffs it.
   *
   * Set false to require an explicit `Accept` header from every client.
   */
  readonly userAgentFallback?: boolean
  /**
   * Override crawler detection. Defaults to {@link isAiCrawlerUserAgent},
   * which matches against the shared `AI_BOT_LIST`.
   */
  readonly isAgentUserAgent?: (userAgent: string) => boolean
}

/** Why this request was answered with markdown. Surfaced for observability. */
type NegotiationBasis = 'accept' | 'user-agent'

/**
 * Decide whether this request should receive markdown.
 *
 * Precedence, and the order matters in both directions:
 *
 * 1. `Accept` names `text/markdown` → markdown. The client chose; honor it.
 * 2. `Accept` names `text/html` → HTML, WHATEVER the user-agent says. An
 *    explicit human-axis preference is authoritative, so a browser can never
 *    be handed markdown. Thesis §1: "A human receives an experience."
 * 3. Otherwise, a recognized AI-crawler UA → markdown.
 * 4. Otherwise → HTML.
 *
 * Step 2 is what keeps UA sniffing from becoming over-application: the UA is
 * only ever a DEFAULT for a client that expressed no preference, never an
 * override of one. Format selection still belongs to the client.
 */
function negotiate(req: Request, opts: ContentNegotiationOptions): NegotiationBasis | null {
  const accept = req.headers.get('Accept') ?? ''
  if (accept.includes('text/markdown')) return 'accept'

  if (opts.userAgentFallback === false) return null
  if (accept.includes('text/html')) return null

  const isAgent = opts.isAgentUserAgent ?? isAiCrawlerUserAgent
  return isAgent(req.headers.get('User-Agent') ?? '') ? 'user-agent' : null
}

/**
 * Append a header value without clobbering an existing one. Response headers
 * are normally mutable; a guarded no-op keeps an immutable response safe.
 */
function appendVary(res: Response, value: string): Response {
  try {
    res.headers.append('Vary', value)
  } catch {
    // Immutable headers (e.g. a redirect). Leave the response untouched.
  }
  return res
}

/**
 * Create a content-negotiation middleware.
 *
 * Behavior:
 * 1. Negotiate (see {@link negotiate}). No markdown wanted → call next()
 * 2. Markdown wanted:
 *    a. Call resolver.resolve(url.pathname)
 *    b. null result → call next() (fall through)
 *    c. string result → return 200 with:
 *       - Content-Type: text/markdown; charset=utf-8
 *       - x-markdown-tokens: {count}  (integer string, estimate)
 *       - x-content-negotiated-by: accept | user-agent
 *       - Body: the markdown content
 *
 * The only response from next() that is touched is its `Vary` header. Because
 * one URL now yields two representations, `Vary: Accept, User-Agent` MUST be
 * present on BOTH — a shared cache that saw only the markdown variant's Vary
 * would happily serve that markdown to a browser.
 */
export function createContentNegotiationHandler(opts: ContentNegotiationOptions): Middleware {
  const estimateTokens = opts.estimateTokens ?? ((content: string) => Math.ceil(content.length / 4))

  return async (req, next) => {
    const basis = negotiate(req, opts)
    if (basis === null) {
      return appendVary(await next(), 'Accept, User-Agent')
    }

    const pathname = new URL(req.url).pathname
    const content = await opts.resolver.resolve(pathname)

    if (content === null) {
      return appendVary(await next(), 'Accept, User-Agent')
    }

    const tokens = estimateTokens(content)
    return new Response(content, {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'x-markdown-tokens': String(tokens),
        'x-content-negotiated-by': basis,
        Vary: 'Accept, User-Agent',
      },
    })
  }
}
