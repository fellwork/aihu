import type { RequestContext } from '@aihu/agent-service'

export type { RequestContext }

export interface AcpAdapterOptions {
  /** URL prefix for all routes. Default: '' */
  prefix?: string
  /** Agent identifier for the agent card. Default: 'aihu-agent-service' */
  agentId?: string
  /**
   * Per-request auth resolver — the same injection point `agent-service`'s own
   * `asMiddleware()` uses (`AgentServiceOptions.resolveAuth`) and that
   * `agent-server` forwards verbatim. The adapter calls it to build the
   * `RequestContext` threaded into `handleToolCall`, so scoped/$rate-limited
   * tools are decidable over the ACP transport.
   *
   * Thesis §4 tier 0: every transport must express WHO IS ASKING, even when
   * the answer is anonymous. When this is absent — or when it throws — the
   * adapter still forwards an explicit anonymous context (`{ userId: null }`)
   * rather than nothing, so the gate always has something to decide against.
   * Fail-closed is preserved: an anonymous context 401s on a scoped binding.
   */
  resolveAuth?: (req: Request) => RequestContext | Promise<RequestContext>
}

export interface AcpAdapter {
  asMiddleware(): (req: Request) => Promise<Response | null>
}

/** Minimal ACP message shape */
export interface AcpMessage {
  role: string
  content: string
  parts?: Array<{ type: string; content: unknown }>
  /**
   * Action arguments when the tool name arrived via `content` rather than a
   * part. Part-carried `content.params` / `content.args` take precedence.
   */
  params?: unknown
}
