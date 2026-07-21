/**
 * #437-GX Phase 2 — the unified bot registry + tier classifier.
 *
 * One registry (`BOT_REGISTRY`) now backs robots.txt generation, content
 * negotiation, and the principal gate's anonymous UA classification. These
 * tests prove (1) the classifier maps known bots to the right tier, (2) the
 * unification dropped NOTHING from #430's 13-bot AI list, and (3) search
 * bots never leak into the AI lists (robots.txt / negotiation unchanged).
 */

import { describe, expect, it } from 'vitest'
import {
  AI_BOT_LIST,
  AI_TRAINING_CRAWLER_BOTS,
  AI_USER_FETCHER_BOTS,
  BOT_REGISTRY,
  classifyBotUserAgent,
  generateRobotsTxt,
  isAiCrawlerUserAgent,
  SEARCH_BOTS,
} from '../src/index.ts'

/** #430's shipped 13-bot list, verbatim — the unification must not drop one. */
const THE_430_LIST = [
  'GPTBot',
  'ClaudeBot',
  'PerplexityBot',
  'Googlebot-Extended',
  'CCBot',
  'anthropic-ai',
  'Google-Extended',
  'Bytespider',
  'cohere-ai',
  'OAI-SearchBot',
  'ChatGPT-User',
  'DuckAssistBot',
  'Applebot',
]

describe('unification — nothing dropped, nothing leaked', () => {
  it("AI_BOT_LIST is exactly #430's 13 bots, in the same order", () => {
    expect([...AI_BOT_LIST]).toEqual(THE_430_LIST)
  })

  it('every #430 bot is present in the unified registry with a non-searcher tier', () => {
    for (const agent of THE_430_LIST) {
      const entry = BOT_REGISTRY.find((b) => b.agent === agent)
      expect(entry, `${agent} must survive unification`).toBeDefined()
      expect(entry?.tier).not.toBe('searcher')
    }
  })

  it('the fetcher/trainer split is unchanged from #430', () => {
    expect([...AI_USER_FETCHER_BOTS]).toEqual([
      'OAI-SearchBot',
      'ChatGPT-User',
      'DuckAssistBot',
      'Applebot',
    ])
    expect(AI_TRAINING_CRAWLER_BOTS).toHaveLength(9)
  })

  it('search bots are registry members but NEVER in the AI lists', () => {
    expect(SEARCH_BOTS.length).toBeGreaterThan(0)
    for (const bot of SEARCH_BOTS) {
      expect(AI_BOT_LIST).not.toContain(bot)
      const entry = BOT_REGISTRY.find((b) => b.agent === bot)
      expect(entry?.tier).toBe('searcher')
    }
  })

  it('robots.txt output never targets a search bot (Phase 3 derives output; Phase 2 must not)', () => {
    for (const policy of ['allow-agents', 'allow-all', 'deny-all'] as const) {
      // Whole-line comparison: `User-agent: Googlebot-Extended` (an AI entry)
      // legitimately CONTAINS the substring `User-agent: Googlebot`.
      const lines = generateRobotsTxt({ aiAgents: policy }).split('\n')
      for (const bot of SEARCH_BOTS) {
        expect(lines).not.toContain(`User-agent: ${bot}`)
      }
    }
  })

  it('every registry entry records its classification rationale', () => {
    for (const entry of BOT_REGISTRY) {
      expect(entry.why.length).toBeGreaterThan(10)
    }
  })
})

describe('classifyBotUserAgent — the tier classifier the principal gate consumes', () => {
  it('maps the canonical bots to their tiers', () => {
    expect(classifyBotUserAgent('Mozilla/5.0 (compatible; GPTBot/1.1)')).toBe('training-crawler')
    expect(classifyBotUserAgent('ChatGPT-User/1.0 (+https://openai.com/bot)')).toBe('user-fetcher')
    expect(
      classifyBotUserAgent(
        'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      ),
    ).toBe('searcher')
    expect(classifyBotUserAgent('Mozilla/5.0 (compatible; bingbot/2.0)')).toBe('searcher')
    expect(classifyBotUserAgent('CCBot/2.0 (https://commoncrawl.org/faq/)')).toBe(
      'training-crawler',
    )
    expect(classifyBotUserAgent('DuckAssistBot/1.0')).toBe('user-fetcher')
  })

  it('longest-token-first: Googlebot-Extended is a TRAINER, not plain search', () => {
    expect(classifyBotUserAgent('Googlebot-Extended')).toBe('training-crawler')
    expect(classifyBotUserAgent('Mozilla/5.0 (compatible; Googlebot-Extended/1.0)')).toBe(
      'training-crawler',
    )
    // …and plain Googlebot still classifies as search.
    expect(classifyBotUserAgent('Googlebot/2.1')).toBe('searcher')
  })

  it('human browsers and unknown UAs classify to null', () => {
    expect(
      classifyBotUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
      ),
    ).toBeNull()
    expect(classifyBotUserAgent('curl/8.4.0')).toBeNull()
    expect(classifyBotUserAgent('')).toBeNull()
  })

  it('Applebot classifies (user-fetcher) but AppleWebKit does not (over-application guard)', () => {
    expect(classifyBotUserAgent('Applebot/0.1')).toBe('user-fetcher')
    expect(classifyBotUserAgent('Mozilla/5.0 AppleWebKit/605.1.15 Safari')).toBeNull()
  })
})

describe('isAiCrawlerUserAgent — rebuilt on the classifier, behavior preserved', () => {
  it('AI tiers are crawlers; the searcher tier and humans are not', () => {
    expect(isAiCrawlerUserAgent('GPTBot/1.1')).toBe(true)
    expect(isAiCrawlerUserAgent('ChatGPT-User/1.0')).toBe(true)
    expect(isAiCrawlerUserAgent('Googlebot/2.1')).toBe(false)
    expect(isAiCrawlerUserAgent('Mozilla/5.0 AppleWebKit/605.1.15 Safari')).toBe(false)
  })

  it('every bot in AI_BOT_LIST still registers as an AI crawler (no-drop, behavioral)', () => {
    for (const bot of AI_BOT_LIST) {
      expect(isAiCrawlerUserAgent(`Mozilla/5.0 (compatible; ${bot}/1.0)`), bot).toBe(true)
    }
  })
})
