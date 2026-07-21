/**
 * `@aihu/agent` public surface (spec §1, §5).
 *
 * 3 value exports + 6 type-only exports = 9 total. `__resetRegistryForTesting`
 * is intentionally NOT re-exported here — it is internal to the package and
 * accessed only by tests via the registry module path.
 */
export type {
  ActionParamsSchema,
  ActionSchema,
  AgentMetadata,
  ExtractPolicy,
  ExtractScopePolicy,
  InputSchema,
} from './registry.ts'
export { getAgentMetadata, getAllAgentMetadata, registerAgentMetadata } from './registry.ts'
