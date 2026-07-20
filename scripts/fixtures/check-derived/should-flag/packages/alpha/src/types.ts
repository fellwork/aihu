// Fixture: the FIRST of two copies of one declaration, across a package
// boundary. check:derived D1 must report this pair as exactly ONE finding.
//
// Deliberately carries NO "keep in sync" comment — the defect is the
// duplication, and the check must find it without being told.

export interface AgentSkill {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly inputSchema?: Record<string, unknown>
}
