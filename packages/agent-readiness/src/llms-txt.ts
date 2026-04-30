export interface LlmsTxtLink {
  readonly title: string
  readonly url: string
  readonly description?: string
}

export interface LlmsTxtSection {
  readonly title: string
  readonly links: ReadonlyArray<LlmsTxtLink>
}

export interface LlmsTxtConfig {
  readonly name: string
  readonly summary?: string
  readonly sections: ReadonlyArray<LlmsTxtSection>
  readonly optional?: ReadonlyArray<LlmsTxtLink>
}

/** Minimal shape used for llms.txt link generation. Structurally compatible with @scribe/agent AgentMetadata. */
interface AgentMetadataLike {
  readonly tag: string
  readonly describes?: string
}

const renderLink = (link: LlmsTxtLink): string =>
  link.description
    ? `- [${link.title}](${link.url}): ${link.description}`
    : `- [${link.title}](${link.url})`

const renderDocument = (config: LlmsTxtConfig, optionalHeading: string): string => {
  const lines: string[] = [`# ${config.name}`, '']
  if (config.summary) {
    lines.push(`> ${config.summary}`, '')
  }
  for (const section of config.sections) {
    if (section.links.length === 0) continue
    lines.push(`## ${section.title}`)
    for (const link of section.links) lines.push(renderLink(link))
    lines.push('')
  }
  if (config.optional?.length) {
    lines.push(`## ${optionalHeading}`)
    for (const link of config.optional) lines.push(renderLink(link))
    lines.push('')
  }
  return lines.join('\n').trimEnd()
}

export function generateLlmsTxt(config: LlmsTxtConfig): string {
  return renderDocument(config, 'Optional')
}

export function generateLlmsFullTxt(config: LlmsTxtConfig): string {
  return renderDocument(config, 'More')
}

export function agentMetadataToLlmsTxtLink(
  meta: AgentMetadataLike,
  baseUrl: string,
): LlmsTxtLink | null {
  if (!meta.describes) return null
  return { title: meta.tag, url: `${baseUrl}/components#${meta.tag}` }
}
