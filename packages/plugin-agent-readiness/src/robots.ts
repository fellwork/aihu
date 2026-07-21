/**
 * robots.txt generation with a TIERED bot policy (#430, extended by GX Phase 2).
 *
 * Every known crawler user agent is classified by what it actually is:
 *
 *   - `searcher` — traditional search-index crawlers (Googlebot, Bingbot, …).
 *     Never listed in `AI_BOT_LIST` and never targeted by the AI policies;
 *     the tier exists so the GX `read:` axis can tell "search" apart from
 *     "AI fetch" and "training" (spec §2.1: the `'search'` value).
 *   - `user-fetcher` — agents that fetch on behalf of a user action or surface
 *     cited search results back to users (ChatGPT-User, OAI-SearchBot,
 *     DuckAssistBot, Applebot). Allowed under the `'allow-agents'` default.
 *   - `training-crawler` — autonomous crawlers that gather content for model
 *     training or bulk scraping (GPTBot, CCBot, Bytespider, …). Explicit
 *     opt-in: disallowed under the `'allow-agents'` default.
 *
 * ONE registry (`BOT_REGISTRY`) drives robots.txt generation, content
 * negotiation (`isAiCrawlerUserAgent`), and the GX principal gate's anonymous
 * UA classification (`classifyBotUserAgent` → `resolvePrincipal` in
 * `@aihu/agent-service`). A second bot list anywhere would be exactly the
 * hand-maintained sync seam `check:derived` exists to forbid.
 *
 * GX Phase 2 scope note: this file CLASSIFIES; it does not yet derive
 * robots.txt output from per-route `extract.read` declarations — that is
 * Phase 3 (spec §12). `generateRobotsTxt` behavior is unchanged.
 *
 * NOTE: robots.txt is ADVISORY (RFC 9309 compliance is voluntary). CDN-layer
 * controls — e.g. Cloudflare's default AI-crawler blocking — override whatever
 * is emitted here. See docs/site/agent-discovery.md §robots.txt.
 */

/** Crawler tier — the classification the GX `read:` axis consumes. */
export type BotTier = 'searcher' | 'user-fetcher' | 'training-crawler'

/** One entry in the classified bot registry. */
export interface BotEntry {
  readonly agent: string
  readonly tier: BotTier
  /** Operator + what the agent actually is — the per-bot classification record. */
  readonly why: string
}

/**
 * The single source of truth for the 13 AI bots and their tiers.
 * `AI_BOT_LIST`, `AI_USER_FETCHER_BOTS`, and `AI_TRAINING_CRAWLER_BOTS` are
 * all DERIVED from this registry — there is no second list to keep in sync.
 * Order is preserved from the pre-#430 `AI_BOT_LIST` so `'allow-all'` /
 * `'deny-all'` output block order is unchanged for existing consumers.
 */
const AI_BOT_REGISTRY: ReadonlyArray<BotEntry> = [
  {
    agent: 'GPTBot',
    tier: 'training-crawler',
    why: 'OpenAI — autonomous crawler gathering content for model training.',
  },
  {
    agent: 'ClaudeBot',
    tier: 'training-crawler',
    why: 'Anthropic — autonomous crawler gathering content to train/improve models.',
  },
  {
    agent: 'PerplexityBot',
    tier: 'training-crawler',
    why:
      'Perplexity — autonomous index crawler. The user-delegated Perplexity agent ' +
      'is "Perplexity-User", which is not in this list.',
  },
  {
    agent: 'Googlebot-Extended',
    tier: 'training-crawler',
    why: 'Google — variant token of Google-Extended (AI/Gemini training control).',
  },
  {
    agent: 'CCBot',
    tier: 'training-crawler',
    why: 'Common Crawl — bulk corpus crawler; the corpus is widely used for LLM training.',
  },
  {
    agent: 'anthropic-ai',
    tier: 'training-crawler',
    why: 'Anthropic — legacy training-crawler token predating ClaudeBot.',
  },
  {
    agent: 'Google-Extended',
    tier: 'training-crawler',
    why: 'Google — control token governing use of content for Gemini/Vertex AI training.',
  },
  {
    agent: 'Bytespider',
    tier: 'training-crawler',
    why: 'ByteDance — aggressive scraper feeding LLM training.',
  },
  {
    agent: 'cohere-ai',
    tier: 'training-crawler',
    why: 'Cohere — training-data crawler token.',
  },
  {
    agent: 'OAI-SearchBot',
    tier: 'user-fetcher',
    why:
      'OpenAI — search-index crawler for ChatGPT search; surfaces cited links to ' +
      'users and is not used for training.',
  },
  {
    agent: 'ChatGPT-User',
    tier: 'user-fetcher',
    why: 'OpenAI — fetches a page when a ChatGPT user asks for it (user-delegated).',
  },
  {
    agent: 'DuckAssistBot',
    tier: 'user-fetcher',
    why:
      'DuckDuckGo — fetches sources to generate cited DuckAssist answers in ' +
      'response to user queries.',
  },
  {
    agent: 'Applebot',
    tier: 'user-fetcher',
    why:
      'Apple — search-index crawler powering Siri/Spotlight suggestions. AI-training ' +
      'use is separately controlled by the Applebot-Extended token (not in this list).',
  },
]

/**
 * Traditional search-index crawlers (GX Phase 2). These power the `searcher`
 * tier that the `read:` axis values `'search'`/`'none'` distinguish. They are
 * NOT AI bots: they never enter `AI_BOT_LIST`, are never targeted by the
 * `aiAgents` robots policies, and never trigger markdown content negotiation
 * — classification is their only job in this phase.
 */
const SEARCH_BOTS_LIST: ReadonlyArray<BotEntry> = [
  {
    agent: 'Googlebot',
    tier: 'searcher',
    why:
      'Google — the search-index crawler. AI-training use is separately ' +
      'controlled by the Google-Extended / Googlebot-Extended tokens (AI registry).',
  },
  {
    agent: 'Bingbot',
    tier: 'searcher',
    why: 'Microsoft — the Bing search-index crawler.',
  },
  {
    agent: 'DuckDuckBot',
    tier: 'searcher',
    why: 'DuckDuckGo — the search-index crawler (DuckAssistBot, the AI answerer, is separate).',
  },
  {
    agent: 'Baiduspider',
    tier: 'searcher',
    why: 'Baidu — the search-index crawler.',
  },
  {
    agent: 'YandexBot',
    tier: 'searcher',
    why: 'Yandex — the search-index crawler.',
  },
]

/**
 * The ONE unified bot registry: every classified crawler across all three
 * tiers. AI entries first (order preserved from #430), searchers appended —
 * so every AI-derived list below is byte-identical to its pre-unification
 * value. This is the registry `classifyBotUserAgent` matches against and the
 * one the GX principal gate consumes.
 */
export const BOT_REGISTRY: ReadonlyArray<BotEntry> = [...AI_BOT_REGISTRY, ...SEARCH_BOTS_LIST]

/** Traditional search-index crawler tokens (derived; `searcher` tier only). */
export const SEARCH_BOTS: ReadonlyArray<string> = SEARCH_BOTS_LIST.map((b) => b.agent)

const escapeForRegExp = (token: string): string => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Classification order: longest token first. Substring matching means a
 * `Googlebot-Extended` UA also contains `Googlebot`; matching the most
 * specific token first classifies it as the training-crawler it is, never as
 * plain search. Precomputed once at module load.
 */
const CLASSIFIER_ENTRIES: ReadonlyArray<{ pattern: RegExp; tier: BotTier }> = [...BOT_REGISTRY]
  .sort((a, b) => b.agent.length - a.agent.length)
  .map((b) => ({ pattern: new RegExp(escapeForRegExp(b.agent), 'i'), tier: b.tier }))

/**
 * Classify a User-Agent string against the unified bot registry.
 *
 * Returns the tier of the most specific matching token, or `null` for an
 * unrecognized UA (a human browser, an unlisted bot, or a spoofer — the
 * compliance-tier honesty budget: classification binds only the population
 * that identifies itself).
 *
 * Substring + case-insensitive, the same discipline as robots.txt matching
 * and `isAiCrawlerUserAgent`. Conservative in the over-application direction:
 * no registry token occurs in a mainstream browser UA (`Applebot` does not
 * match `AppleWebKit`).
 *
 * This is the classifier `resolvePrincipal` (`@aihu/agent-service`) uses for
 * anonymous principals, and the classification the `read:` axis will consume
 * in Phase 3.
 */
export function classifyBotUserAgent(userAgent: string): BotTier | null {
  if (!userAgent) return null
  for (const { pattern, tier } of CLASSIFIER_ENTRIES) {
    if (pattern.test(userAgent)) return tier
  }
  return null
}

/** All 13 known AI user agents (derived from the registry; order preserved). */
export const AI_BOT_LIST: ReadonlyArray<string> = AI_BOT_REGISTRY.map((b) => b.agent)

/** User-delegated fetchers / cited-search agents — allowed under `'allow-agents'`. */
export const AI_USER_FETCHER_BOTS: ReadonlyArray<string> = AI_BOT_REGISTRY.filter(
  (b) => b.tier === 'user-fetcher',
).map((b) => b.agent)

/** Training/scraping crawlers — explicit opt-in; disallowed under `'allow-agents'`. */
export const AI_TRAINING_CRAWLER_BOTS: ReadonlyArray<string> = AI_BOT_REGISTRY.filter(
  (b) => b.tier === 'training-crawler',
).map((b) => b.agent)

export interface RobotsRule {
  readonly userAgent: string | ReadonlyArray<string>
  readonly allow?: ReadonlyArray<string>
  readonly disallow?: ReadonlyArray<string>
  readonly crawlDelay?: number
}

/** The three named AI-agent policies. Any other string throws at generation time. */
const AI_AGENTS_POLICIES = ['allow-agents', 'allow-all', 'deny-all'] as const
type AiAgentsPolicy = (typeof AI_AGENTS_POLICIES)[number]

export interface RobotsConfig {
  /**
   * AI-agent crawl policy. Default: `'allow-agents'` (tiered) — user-delegated
   * fetchers get `Allow: /`, training/scraping crawlers get `Disallow: /`.
   * `'allow-all'` and `'deny-all'` apply one directive to all 13 bots.
   * An array of rules gives per-bot control.
   */
  readonly aiAgents?: AiAgentsPolicy | ReadonlyArray<RobotsRule>
  readonly standard?: ReadonlyArray<RobotsRule>
  readonly sitemap?: string
  /**
   * The trailing `User-agent: * / Allow: /` block is ALWAYS emitted for
   * predictable output — set `wildcard: false` to suppress it. It is also
   * skipped automatically when one of your own rules already targets `*`
   * (your rule IS the wildcard decision; emitting a second block would
   * contradict it).
   */
  readonly wildcard?: boolean
}

const renderRule = (rule: RobotsRule): string => {
  const agents = Array.isArray(rule.userAgent) ? rule.userAgent : [rule.userAgent]
  const lines: string[] = (agents as string[]).map((a) => `User-agent: ${a}`)
  if (rule.disallow) {
    for (const path of rule.disallow) lines.push(`Disallow: ${path}`)
  }
  if (rule.allow) {
    for (const path of rule.allow) lines.push(`Allow: ${path}`)
  }
  if (rule.crawlDelay !== undefined) lines.push(`Crawl-delay: ${rule.crawlDelay}`)
  return lines.join('\n')
}

/** Does any rule in the list target the `*` user agent? */
const targetsWildcard = (rules: ReadonlyArray<RobotsRule>): boolean =>
  rules.some((rule) =>
    (Array.isArray(rule.userAgent) ? rule.userAgent : [rule.userAgent]).includes('*'),
  )

export function generateRobotsTxt(config: RobotsConfig = {}): string {
  const blocks: string[] = []
  const { aiAgents = 'allow-agents' } = config

  // Value guard (#430): an unknown string must throw, not fall into the array
  // branch and iterate characters. 'disallow-all' / 'allow-verified' are
  // phantom values from older docs that were never implemented.
  if (
    typeof aiAgents === 'string' &&
    !(AI_AGENTS_POLICIES as ReadonlyArray<string>).includes(aiAgents)
  ) {
    throw new Error(
      `Unknown aiAgents value ${JSON.stringify(aiAgents)}. Valid values are ` +
        `'allow-agents' (default — user-delegated fetchers allowed, training/scraping ` +
        `crawlers disallowed), 'allow-all', 'deny-all', or an array of RobotsRule ` +
        `objects for per-bot control. (Note: 'disallow-all' and 'allow-verified' ` +
        `appeared in older docs but were never implemented — use 'deny-all' or rules.)`,
    )
  }

  if (config.standard?.length) {
    for (const rule of config.standard) {
      blocks.push(renderRule(rule))
    }
  }

  if (aiAgents === 'allow-all') {
    for (const bot of AI_BOT_LIST) {
      blocks.push(`User-agent: ${bot}\nAllow: /`)
    }
  } else if (aiAgents === 'deny-all') {
    for (const bot of AI_BOT_LIST) {
      blocks.push(`User-agent: ${bot}\nDisallow: /`)
    }
  } else if (aiAgents === 'allow-agents') {
    // Tiered default: fetchers allowed, trainers explicit opt-in. Registry
    // order is preserved so the output is stable and reviewable.
    for (const { agent, tier } of AI_BOT_REGISTRY) {
      blocks.push(
        tier === 'user-fetcher'
          ? `User-agent: ${agent}\nAllow: /`
          : `User-agent: ${agent}\nDisallow: /`,
      )
    }
  } else {
    for (const rule of aiAgents) {
      blocks.push(renderRule(rule))
    }
  }

  // Wildcard block (#430 decision 7): always emit `User-agent: * / Allow: /`
  // unless explicitly suppressed (wildcard: false) or a user rule already
  // targets `*`. Never emit a blanket wildcard Disallow — that blocks humans.
  const explicitWildcard =
    targetsWildcard(config.standard ?? []) ||
    (typeof aiAgents !== 'string' && targetsWildcard(aiAgents))
  if (config.wildcard !== false && !explicitWildcard) {
    blocks.push('User-agent: *\nAllow: /')
  }

  let output = blocks.join('\n\n')
  if (config.sitemap) output += `\n\nSitemap: ${config.sitemap}`
  return output.trimEnd()
}
