/**
 * `@scribe/agent` public surface (spec §1, §5).
 *
 * 2 value exports + 3 type-only exports = 5 total. `__resetRegistryForTesting`
 * is intentionally NOT re-exported here — it is internal to the package and
 * accessed only by tests via the registry module path.
 */
export type { ActionSchema, AgentMetadata, InputSchema } from './registry.ts'
export { getAgentMetadata, getAllAgentMetadata, registerAgentMetadata } from './registry.ts'
