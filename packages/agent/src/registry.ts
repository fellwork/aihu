/**
 * `@scribe/agent` — registry of static agent metadata per spec §1, §2.
 *
 * Module-level `Map<string, AgentMetadata>` keyed by custom-element tag name.
 * The compiler emits `registerAgentMetadata(metadata)` at the top level of each
 * `.scribe`-derived JS module; module evaluation populates the registry.
 * `getAgentMetadata(tag)` returns the registered object by reference, or
 * `undefined` if no entry exists. No reactive wrapping, no error class
 * (spec §2.2, §2.3).
 */

/**
 * Schema for a single input field exposed by a component or action return.
 * `type` is the primitive kind. `values` is present only for enum types.
 * `default` is the default value if declared in the <contract> block.
 */
export interface InputSchema {
  type: 'string' | 'number' | 'boolean' | 'enum'
  values?: string[]
  default?: string
}

/**
 * Schema for a single callable action on a component.
 * `returns` maps return field names to their type schemas.
 */
export interface ActionSchema {
  returns: Record<string, InputSchema>
}

/**
 * Static metadata describing a `<custom-tag>` component for AI-agent
 * consumption. Sourced from each component's `<agent>` SFC block; emitted by
 * the compiler as a frozen object.
 *
 * The trailing index signature is spec-mandated (spec §9.1: "Unknown fields
 * are preserved, not rejected"). New top-level keys flow through without a
 * type error or data loss.
 */
export interface AgentMetadata {
  /** The custom-element tag name this metadata describes. */
  tag: string
  /** MCP prompt/description — human-readable summary of what this element does. */
  describes?: string
  /** MCP resources — names mapped to human-readable descriptions of reactive state. */
  state?: Record<string, string>
  /** MCP tools — action names mapped to typed schemas. */
  actions?: Record<string, ActionSchema>
  /** Unknown fields are preserved, not rejected (spec §9.1). */
  [key: string]: unknown
}

const registry = new Map<string, AgentMetadata>()

/**
 * Insert or overwrite the registry entry for `meta.tag`.
 *
 * Idempotent for identical objects; last-registration-wins for the same tag
 * (HMR re-execution overwrites — spec §2.1, OQ-1). Does not deep-clone the
 * argument: the compiler-emitted object is already frozen (spec §9.2); the
 * registry stores the reference directly.
 */
export function registerAgentMetadata(meta: AgentMetadata): void {
  registry.set(meta.tag, meta)
}

/**
 * Return the registered `AgentMetadata` for `tag`, or `undefined` if no entry
 * exists. Never throws. Returns the same object reference that was registered
 * — no copy, no deep-freeze wrapper.
 */
export function getAgentMetadata(tag: string): AgentMetadata | undefined {
  return registry.get(tag)
}

/**
 * Test-only helper: clear all registered entries.
 *
 * Exported from this module so unit tests can reset shared module state in
 * `beforeEach`. Intentionally NOT re-exported from `index.ts` — it is not part
 * of the public package surface (spec §5).
 *
 * @internal
 */
export function __resetRegistryForTesting(): void {
  registry.clear()
}
