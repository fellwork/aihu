export type { A2aCapabilities, A2aCard, A2aCardConfig, A2aSkill } from './a2a-card.ts'
export { generateA2aCard } from './a2a-card.ts'
export type { ContentNegotiationOptions, MarkdownResolver } from './content-negotiation.ts'
export { createContentNegotiationHandler, isAiCrawlerUserAgent } from './content-negotiation.ts'
export type { ComponentMetaLike, LlmsTxtConfig, LlmsTxtLink, LlmsTxtSection } from './llms-txt.ts'
export { generateLlmsFullTxt, generateLlmsTxt } from './llms-txt.ts'
export type { RouteMarkdownEntry, RouteMarkdownResolverOptions } from './markdown-resolver.ts'
export { createRouteMarkdownResolver, RouteMarkdownResolver } from './markdown-resolver.ts'
export type { McpDiscovery, McpDiscoveryConfig, McpDiscoveryServer } from './mcp-discovery.ts'
export { generateMcpDiscovery } from './mcp-discovery.ts'
export type { AgentSkill, McpServerCard, McpServerCardConfig } from './mcp-server-card.ts'
export { generateMcpServerCard } from './mcp-server-card.ts'
export type { RobotsConfig, RobotsRule } from './robots.ts'
export { AI_BOT_LIST, generateRobotsTxt } from './robots.ts'
export type { SitemapChangefreq, SitemapConfig, SitemapUrl } from './sitemap.ts'
export { generateSitemapXml } from './sitemap.ts'
export type { AgentReadinessConfig, McpAuthConfig } from './types.ts'
// v0.7.4: viteAgentReadinessIntegration is the canonical name; agentReadiness is deprecated
export {
  agentReadiness,
  createAgentReadinessRoutes,
  viteAgentReadinessIntegration,
} from './vite-plugin.ts'
