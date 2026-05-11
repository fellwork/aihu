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

export interface RobotsRule {
  readonly userAgent: string | ReadonlyArray<string>
  readonly allow?: ReadonlyArray<string>
  readonly disallow?: ReadonlyArray<string>
  readonly crawlDelay?: number
}

export interface RobotsConfig {
  readonly aiAgents?: 'allow-all' | 'deny-all' | ReadonlyArray<RobotsRule>
  readonly standard?: ReadonlyArray<RobotsRule>
  readonly sitemap?: string
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

export function generateRobotsTxt(config: RobotsConfig = {}): string {
  const blocks: string[] = []
  const { aiAgents = 'allow-all' } = config

  if (config.standard?.length) {
    for (const rule of config.standard) {
      blocks.push(renderRule(rule))
    }
  }

  if (aiAgents === 'allow-all') {
    // Per spec §3.4: explicit Allow: / for each AI bot in AI_BOT_LIST plus wildcard
    for (const bot of AI_BOT_LIST) {
      blocks.push(`User-agent: ${bot}\nAllow: /`)
    }
    blocks.push('User-agent: *\nAllow: /')
  } else if (aiAgents === 'deny-all') {
    for (const bot of AI_BOT_LIST) {
      blocks.push(`User-agent: ${bot}\nDisallow: /`)
    }
    blocks.push('User-agent: *\nAllow: /')
  } else {
    for (const rule of aiAgents) {
      blocks.push(renderRule(rule))
    }
  }

  let output = blocks.join('\n\n')
  if (config.sitemap) output += `\n\nSitemap: ${config.sitemap}`
  return output.trimEnd()
}
