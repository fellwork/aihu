export type { ContentNegotiationOptions, MarkdownResolver } from './content-negotiation.ts'
export { createContentNegotiationHandler } from './content-negotiation.ts'
export type { LlmsTxtConfig, LlmsTxtLink, LlmsTxtSection } from './llms-txt.ts'
export { generateLlmsFullTxt, generateLlmsTxt } from './llms-txt.ts'
export type { AgentSkill, McpServerCard, McpServerCardConfig } from './mcp-server-card.ts'
export { generateMcpServerCard } from './mcp-server-card.ts'
export type { RobotsConfig, RobotsRule } from './robots.ts'
export { AI_BOT_LIST, generateRobotsTxt } from './robots.ts'
export type { AgentReadinessConfig, McpAuthConfig } from './types.ts'
// v0.7.4: viteAgentReadinessIntegration is the canonical name; agentReadiness is deprecated
export {
  agentReadiness,
  createAgentReadinessRoutes,
  viteAgentReadinessIntegration,
} from './vite-plugin.ts'
