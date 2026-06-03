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
  /**
   * Component metadata, rendered as a `## Components` section listing each
   * component's tag, description, callable actions, and readable state.
   * When empty (zero components) the section is omitted entirely.
   */
  readonly components?: ReadonlyArray<ComponentMetaLike>
}

/** Minimal shape used for llms.txt link generation. Structurally compatible with @aihu/agent AgentMetadata. */
interface AgentMetadataLike {
  readonly tag: string
  readonly describes?: string
}

/**
 * Minimal shape used for the `## Components` section. Structurally compatible
 * with @aihu/agent `AgentMetadata` (tag/describes/state/actions).
 */
interface ComponentMetaLike {
  readonly tag: string
  readonly describes?: string
  readonly state?: Record<string, string>
  readonly actions?: Record<string, { readonly returns?: Record<string, { type: string }> }>
}

const renderLink = (link: LlmsTxtLink): string =>
  link.description
    ? `- [${link.title}](${link.url}): ${link.description}`
    : `- [${link.title}](${link.url})`

/** Render a single action's return shape as `{ field: type, ... }`, or `{}` when no returns. */
const renderActionReturns = (returns?: Record<string, { type: string }>): string => {
  const entries = returns ? Object.entries(returns) : []
  if (entries.length === 0) return '{}'
  return `{ ${entries.map(([field, schema]) => `${field}: ${schema.type}`).join(', ')} }`
}

/** Render one component as markdown lines: heading, describes, actions, state. */
const renderComponent = (meta: ComponentMetaLike): string[] => {
  const lines: string[] = [`### ${meta.tag}`]
  if (meta.describes) lines.push(meta.describes)
  const actions = meta.actions ? Object.entries(meta.actions) : []
  if (actions.length > 0) {
    lines.push('Actions:')
    for (const [name, action] of actions) {
      lines.push(`- \`${name}()\` → ${renderActionReturns(action?.returns)}`)
    }
  }
  const state = meta.state ? Object.entries(meta.state) : []
  if (state.length > 0) {
    lines.push('State:')
    for (const [name, desc] of state) lines.push(`- \`${name}\`: ${desc}`)
  }
  return lines
}

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
  // Components section: omitted entirely when zero components (no empty header).
  if (config.components?.length) {
    lines.push('## Components', '')
    for (const meta of config.components) {
      lines.push(...renderComponent(meta), '')
    }
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
