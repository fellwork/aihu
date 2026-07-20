/**
 * `@aihu/agent` public surface (spec §1, §5).
 *
 * 2 value exports + 4 type-only exports = 6 total. `__resetRegistryForTesting`
 * is intentionally NOT re-exported here — it is internal to the package and
 * accessed only by tests via the registry module path.
 */
export type {
  ActionParamsSchema,
  ActionSchema,
  AgentMetadata,
  InputSchema,
} from './registry.ts'
export { getAgentMetadata, getAllAgentMetadata, registerAgentMetadata } from './registry.ts'
