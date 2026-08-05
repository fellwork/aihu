import { deriveReadPolicy, extractReadValue, isCallAdvertised } from '@aihu/server'
import type { RouteReadPolicy } from './robots.ts'

export interface LlmsTxtLink {
  readonly title: string
  readonly url: string
  readonly description?: string
}

export interface LlmsTxtSection {
  readonly title: string
  /**
   * Link list for this section. Optional since v2.3 — a section may carry
   * `body` prose instead of, or in addition to, links.
   */
  readonly links?: ReadonlyArray<LlmsTxtLink>
  /**
   * Free markdown prose for this section, emitted between the `##` heading and
   * the link list.
   *
   * WHY THIS EXISTS. Until v2.3 a section was a title plus a list of links, and
   * nothing else could be said. That is enough for a docs site whose llms.txt
   * is a table of contents, and not enough for a site whose llms.txt has to
   * TEACH an agent something before the links are useful — a wire protocol and
   * its transport, a REST route table, the reference grammar for addressing
   * content. Those are paragraphs and non-link bullets, and every site that
   * needed them had to abandon the generator and hand-roll the whole document,
   * which is how a "canonical" format ends up with as many dialects as
   * consumers.
   *
   * Emitted verbatim — it is markdown going into a markdown document, so it is
   * NOT escaped. Treat it as authored content, never as interpolated user
   * input.
   */
  readonly body?: string
}

export interface LlmsTxtConfig {
  readonly name: string
  readonly summary?: string
  /**
   * Free markdown prose emitted after the `>` summary and before the first
   * section heading — the document's opening paragraph(s).
   *
   * The summary is one blockquoted line by convention (llmstxt.org); this is
   * where a site says the thing that does not fit there, e.g. "three ways to
   * access the data, setup instructions are at /connect". Emitted verbatim,
   * unescaped, same contract as `LlmsTxtSection.body`.
   */
  readonly intro?: string
  readonly sections: ReadonlyArray<LlmsTxtSection>
  readonly optional?: ReadonlyArray<LlmsTxtLink>
  /**
   * Component metadata, rendered as a `## Components` section listing each
   * component's tag, description, callable actions, and readable state.
   * When empty (zero components) the section is omitted entirely.
   *
   * GX Phase 3 (#437-GX): the section is FILTERED by each component's
   * compiled `extract` policy — a component whose `read` excludes
   * user-directed AI fetchers (`'search'`/`'none'`/any hard value) or whose
   * `call` is closed (`'none'`) is not advertised here (spec §8). Derived,
   * fail-closed; components without an `extract` member (the pre-GX registry
   * shape) are advertised exactly as before.
   */
  readonly components?: ReadonlyArray<ComponentMetaLike>
  /**
   * GX Phase 3 (#437-GX): the compiled route table (structurally,
   * `@aihu/router` `RouteDefinition[]`). Rendered as a derived `## Routes`
   * section listing exactly the routes whose declared `read:` admits
   * user-directed AI fetchers (`'all'`/`'agents'`) — `'search'`/`'none'` and
   * every hard value are absent from this agent-facing document (spec §8).
   * One source (the compiled declarations), no hand-maintained route list.
   * Omitted → no `## Routes` section (byte-identical to pre-GX output).
   */
  readonly routes?: ReadonlyArray<RouteReadPolicy>
  /**
   * Base URL for derived route links (e.g. `https://example.com`, no trailing
   * slash). Without it, derived route entries render as bare patterns.
   */
  readonly baseUrl?: string
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
export interface ComponentMetaLike {
  readonly tag: string
  readonly describes?: string
  readonly state?: Record<string, string>
  readonly actions?: Record<string, { readonly returns?: Record<string, { type: string }> }>
  /**
   * GX Phase 3: the compiled `extract` policy (rides `AgentMetadata`'s open
   * index signature). Consulted — fail-closed — to decide whether the
   * component is advertised in llms.txt at all. Absent → advertised (the
   * resolved default, `read: 'agents'`).
   */
  readonly extract?: unknown
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

/**
 * Render one component as markdown lines: heading, describes, actions, state.
 *
 * Exported so `markdown-resolver.ts` projects components identically to
 * llms.txt — one renderer, so the two agent surfaces cannot drift.
 */
export const renderComponentMarkdown = (meta: ComponentMetaLike): string[] => {
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

/**
 * GX Phase 3 (#437-GX): is this surface advertisable in an AGENT-facing
 * discovery document? Derived from the compiled `extract` policy, fail-closed:
 * the `read` axis must admit user-directed AI fetchers AND the `call` axis
 * must not be closed. Absent policy → advertised (the resolved default).
 * COMPLIANCE-TIER: absence from a listing hides nothing from a client that
 * guesses URLs — the origin gate (Phases 2/4) is the enforcement.
 */
const advertisedToAgents = (extract: unknown): boolean =>
  deriveReadPolicy(extractReadValue(extract)).agentDiscovery && isCallAdvertised(extract)

/** Derived `## Routes` entries: exactly the agent-advertisable routes (spec §8). */
const renderDerivedRoutes = (
  routes: ReadonlyArray<RouteReadPolicy>,
  baseUrl: string | undefined,
): string[] => {
  const advertised = routes.filter((r) => advertisedToAgents(r.extract))
  if (advertised.length === 0) return []
  const lines = ['## Routes']
  for (const r of advertised) {
    lines.push(baseUrl ? `- [${r.pattern}](${baseUrl}${r.pattern})` : `- ${r.pattern}`)
  }
  lines.push('')
  return lines
}

const renderDocument = (config: LlmsTxtConfig, optionalHeading: string): string => {
  const lines: string[] = [`# ${config.name}`, '']
  if (config.summary) {
    lines.push(`> ${config.summary}`, '')
  }
  if (config.intro) {
    lines.push(config.intro.trimEnd(), '')
  }
  for (const section of config.sections) {
    // A section with neither prose nor links is still omitted entirely — the
    // pre-v2.3 behaviour, just widened from "no links" to "nothing to say", so
    // a link-only config renders byte-identically to before.
    const links = section.links ?? []
    if (!section.body && links.length === 0) continue
    lines.push(`## ${section.title}`)
    if (section.body) {
      // Blank line after the heading so the prose is a paragraph, not a
      // lazy-continuation of the ATX heading in strict markdown parsers.
      lines.push('', section.body.trimEnd(), '')
    }
    for (const link of links) lines.push(renderLink(link))
    lines.push('')
  }
  // GX Phase 3: derived route listing — from the compiled declarations only.
  if (config.routes?.length) {
    lines.push(...renderDerivedRoutes(config.routes, config.baseUrl))
  }
  // Components section: omitted entirely when zero components (no empty header).
  // GX Phase 3: filtered by each component's compiled extract policy.
  const components = (config.components ?? []).filter((c) => advertisedToAgents(c.extract))
  if (components.length > 0) {
    lines.push('## Components', '')
    for (const meta of components) {
      lines.push(...renderComponentMarkdown(meta), '')
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

/** Config for {@link seoLlmsSections}. Structurally compatible with `@aihu/seo`'s `SeoConfig`. */
export interface SeoLlmsSectionsConfig {
  readonly siteName: string
  readonly baseUrl: string // e.g. 'https://example.com' (no trailing slash)
  readonly sitemapSources?: ReadonlyArray<{ readonly path: string }>
}

/**
 * Returns an array of LlmsTxtSection entries for composition into the
 * `llmsSections` config field — one section titled after the site, linking
 * each sitemap source path.
 *
 * Ported from `@aihu/seo` in the #430 consolidation (the deprecated shim
 * re-exports this function).
 *
 * Usage:
 *   llmsSections: [...userSections, ...seoLlmsSections(config)]
 */
export function seoLlmsSections(config: SeoLlmsSectionsConfig): ReadonlyArray<LlmsTxtSection> {
  return [
    {
      title: config.siteName,
      links: (config.sitemapSources ?? []).map((s) => ({
        title: s.path,
        url: config.baseUrl + s.path,
      })),
    },
  ]
}
