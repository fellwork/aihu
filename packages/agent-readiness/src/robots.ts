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
]

export interface RobotsRule {
  readonly userAgent: string | ReadonlyArray<string>
  readonly allow?: string
  readonly disallow?: string
}

export interface RobotsConfig {
  readonly aiAgents?: 'allow-all' | 'deny-all' | ReadonlyArray<RobotsRule>
  readonly standard?: ReadonlyArray<RobotsRule>
  readonly sitemap?: string
}

const renderRule = (rule: RobotsRule): string => {
  const agents = Array.isArray(rule.userAgent) ? rule.userAgent : [rule.userAgent]
  const lines: string[] = (agents as string[]).map((a) => `User-agent: ${a}`)
  if (rule.disallow !== undefined) lines.push(`Disallow: ${rule.disallow}`)
  if (rule.allow !== undefined) lines.push(`Allow: ${rule.allow}`)
  return lines.join('\n')
}

export function generateRobotsTxt(config: RobotsConfig = {}): string {
  const blocks: string[] = []
  const { aiAgents = 'allow-all' } = config

  if (aiAgents === 'allow-all') {
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

  for (const rule of config.standard ?? []) {
    blocks.push(renderRule(rule))
  }

  let output = blocks.join('\n\n')
  if (config.sitemap) output += `\n\nSitemap: ${config.sitemap}`
  return output.trimEnd()
}
