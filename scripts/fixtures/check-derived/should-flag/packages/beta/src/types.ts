// Fixture: the SECOND copy, in a different package, ALREADY DRIFTED — it
// carries two fields the other lacks. This mirrors the real
// `AgentReadinessConfig` situation, where the plugin copy has five fields the
// server copy does not. An equality-on-structural-hash rule finds nothing
// here; the overlap rule finds the seam.

export interface AgentSkill {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly inputSchema?: Record<string, unknown>
  readonly deprecated?: boolean
  readonly tags?: ReadonlyArray<string>
}
