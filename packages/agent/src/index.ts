/**
 * `@scribe/agent` public surface (spec §1, §5).
 *
 * 2 value exports + 1 type-only export = 3 total. `__resetRegistryForTesting`
 * is intentionally NOT re-exported here — it is internal to the package and
 * accessed only by tests via the registry module path.
 */
export type { AgentMetadata } from './registry.ts'
export { getAgentMetadata, registerAgentMetadata } from './registry.ts'
