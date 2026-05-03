export interface AcpAdapterOptions {
  /** URL prefix for all routes. Default: '' */
  prefix?: string
  /** Agent identifier for the agent card. Default: 'scribe-agent-service' */
  agentId?: string
}

export interface AcpAdapter {
  asMiddleware(): (req: Request) => Promise<Response | null>
}

/** Minimal ACP message shape */
export interface AcpMessage {
  role: string
  content: string
  parts?: Array<{ type: string; content: unknown }>
}
