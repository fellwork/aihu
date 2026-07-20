/**
 * `@aihu/agent` — registry of static agent metadata per spec §1, §2.
 *
 * Module-level `Map<string, AgentMetadata>` keyed by custom-element tag name.
 * The compiler emits `registerAgentMetadata(metadata)` at the top level of each
 * `.aihu`-derived JS module; module evaluation populates the registry.
 * `getAgentMetadata(tag)` returns the registered object by reference, or
 * `undefined` if no entry exists. No reactive wrapping, no error class
 * (spec §2.2, §2.3).
 */

/**
 * Schema for a single input field exposed by a component or action return.
 * `type` is the primitive kind. `values` is present only for enum types.
 * `default` is the default value if declared in the <agent> block.
 */
export interface InputSchema {
  type: 'string' | 'number' | 'boolean' | 'enum'
  values?: string[]
  default?: string
}

/**
 * The MCP `inputSchema` fragment for an action's parameters, DERIVED by the
 * compiler from the `$action` handler's own signature (DE5). `properties` is
 * keyed by the real parameter names; each value is a JSON-Schema type object
 * (`{ type: 'string' }`, `{ type: 'array', items: … }`, or the permissive `{}`
 * when the TS type was not trivially mappable). `required` lists the parameters
 * that are neither optional (`x?`) nor defaulted (`x = …`).
 *
 * Property VALUES are intentionally `unknown`: the compiler emits arbitrary
 * JSON-Schema fragments, and this type must not constrain them to a closed set.
 * The property KEY ORDER is the declared parameter order — `@aihu/agent-server`
 * relies on it to marshal named arguments back into the positional array the
 * runtime dispatch expects.
 */
export interface ActionParamsSchema {
  properties: Record<string, unknown>
  required: string[]
}

/**
 * Schema for a single callable action on a component.
 * `returns` maps return field names to their type schemas.
 */
export interface ActionSchema {
  returns: Record<string, InputSchema>
  /**
   * Human-readable description of what the action does, sourced from the
   * `describe:` key on the component's `$action` entry. Surfaced as the MCP
   * tool description — this is the text an LLM reads when deciding whether to
   * call the tool, so its absence degrades tool selection, not just docs.
   */
  describe?: string
  /**
   * Derived MCP parameter schema (DE5). Present when the compiler could model
   * the handler signature; absent when it could not (an unparseable handler or
   * an unnameable destructuring parameter), in which case the server falls back
   * to the legacy positional `args: { type: 'array' }` schema for this tool.
   */
  params?: ActionParamsSchema
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
 * Return all registered `AgentMetadata` entries as an array.
 *
 * Order is insertion order (Map guarantee). Returns an array snapshot — the
 * array itself is a new allocation each call, but the elements are the same
 * references stored in the registry (no deep-clone).
 *
 * Used by adapters (e.g. `@aihu/agent-a2a`) that need the full registry
 * without knowing individual tags in advance (Plan 5.3 prerequisite).
 */
export function getAllAgentMetadata(): AgentMetadata[] {
  return Array.from(registry.values())
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
