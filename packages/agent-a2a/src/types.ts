import type { AgentService } from '@aihu/agent-service'

export type { AgentService }

export interface A2aAdapterOptions {
  /** URL prefix for all routes. Default: '' */
  prefix?: string
  /** Agent name for the agent card. Default: 'aihu-agent-service' */
  name?: string
}

export interface A2aAdapter {
  asMiddleware(): (req: Request) => Promise<Response | null>
}
