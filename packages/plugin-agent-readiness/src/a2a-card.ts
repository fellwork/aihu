/**
 * A2A (Agent-to-Agent) Agent Card generator.
 *
 * Canonical discovery path: GET /.well-known/agent-card.json
 * A2A v0.3.0 (2025-07-30) renamed the path from `/.well-known/agent.json` to
 * `/.well-known/agent-card.json` (flagged breaking; IANA feedback that
 * `agent.json` was too generic). Current spec: v1.0.1 (2026-05-28), Linux
 * Foundation. `/.well-known/agent.json` is still served as a DEPRECATED alias
 * (with a `Deprecation` response header) so existing consumers do not break.
 *
 * Spec: https://a2a-protocol.org/ — the card object below is spec-shaped; the
 * path is served by the vite plugin / route handlers, not this pure generator.
 */

export interface A2aCapabilities {
  readonly streaming?: boolean
  readonly pushNotifications?: boolean
}

export interface A2aSkill {
  readonly id: string
  readonly name: string
  readonly description?: string
}

export interface A2aCard {
  readonly name: string
  readonly description?: string
  readonly url: string
  readonly version?: string
  readonly capabilities: {
    readonly streaming: boolean
    readonly pushNotifications: boolean
  }
  readonly skills?: ReadonlyArray<A2aSkill>
}

export interface A2aCardConfig {
  readonly name: string
  readonly description?: string
  readonly url: string
  readonly version?: string
  readonly capabilities?: A2aCapabilities
  readonly skills?: ReadonlyArray<A2aSkill>
}

/**
 * Generate an A2A Agent Card object.
 * Pure function. No I/O.
 */
export function generateA2aCard(config: A2aCardConfig): A2aCard {
  return {
    name: config.name,
    ...(config.description !== undefined ? { description: config.description } : {}),
    url: config.url,
    ...(config.version !== undefined ? { version: config.version } : {}),
    capabilities: {
      streaming: config.capabilities?.streaming ?? false,
      pushNotifications: config.capabilities?.pushNotifications ?? false,
    },
    ...(config.skills !== undefined && config.skills.length > 0 ? { skills: config.skills } : {}),
  }
}
