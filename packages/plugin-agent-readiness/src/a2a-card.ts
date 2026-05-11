/**
 * Google A2A (Agent-to-Agent) Agent Card generator.
 * Discovery: GET /.well-known/agent.json
 * Spec: https://google.github.io/A2A/specification/
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
