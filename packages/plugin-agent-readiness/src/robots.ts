/**
 * robots.txt generation with a TIERED AI-bot policy (#430).
 *
 * The 13 known AI user agents are classified by what each one actually is:
 *
 *   - `user-fetcher` — agents that fetch on behalf of a user action or surface
 *     cited search results back to users (ChatGPT-User, OAI-SearchBot,
 *     DuckAssistBot, Applebot). Allowed under the `'allow-agents'` default.
 *   - `training-crawler` — autonomous crawlers that gather content for model
 *     training or bulk scraping (GPTBot, CCBot, Bytespider, …). Explicit
 *     opt-in: disallowed under the `'allow-agents'` default.
 *
 * NOTE: robots.txt is ADVISORY (RFC 9309 compliance is voluntary). CDN-layer
 * controls — e.g. Cloudflare's default AI-crawler blocking — override whatever
 * is emitted here. See docs/site/agent-discovery.md §robots.txt.
 */

/** One entry in the classified AI-bot registry. */
interface AiBotEntry {
  readonly agent: string
  readonly tier: 'user-fetcher' | 'training-crawler'
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
const AI_BOT_REGISTRY: ReadonlyArray<AiBotEntry> = [
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
