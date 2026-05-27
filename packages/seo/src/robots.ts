import type { SeoConfig } from './types.js'

/**
 * AI bot list — mirrors AI_BOT_LIST from @aihu-plugin/agent-readiness.
 * Kept in sync manually; do not import from agent-readiness to avoid a circular
 * dependency at types level.
 */
export const AI_BOT_LIST: ReadonlyArray<string> = [
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

/**
 * Generate a robots.txt string from SEO config.
 *
 * When robotsOptions.disallowAiBots !== false (default: true), a
 * `User-agent: <bot>\nDisallow: /` block is emitted for each AI bot.
 * A wildcard `User-agent: *\nAllow: /` block is always appended.
 */
export function generateRobots(config: SeoConfig): string {
  const blocks: string[] = []
  const { robotsOptions } = config
  const disallowAiBots = robotsOptions?.disallowAiBots !== false

  // Emit additional custom rules first
  if (robotsOptions?.additionalRules?.length) {
    for (const rule of robotsOptions.additionalRules) {
      const lines: string[] = [`User-agent: ${rule.userAgent}`]
      if (rule.disallow) {
        for (const path of rule.disallow) lines.push(`Disallow: ${path}`)
      }
      if (rule.allow) {
        for (const path of rule.allow) lines.push(`Allow: ${path}`)
      }
      blocks.push(lines.join('\n'))
    }
  }

  if (disallowAiBots) {
    for (const bot of AI_BOT_LIST) {
      blocks.push(`User-agent: ${bot}\nDisallow: /`)
    }
  } else {
    // Explicitly allow all AI bots
    for (const bot of AI_BOT_LIST) {
      blocks.push(`User-agent: ${bot}\nAllow: /`)
    }
  }

  // Wildcard allow for all other crawlers
  blocks.push('User-agent: *\nAllow: /')

  return blocks.join('\n\n').trimEnd()
}
