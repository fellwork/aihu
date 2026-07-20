import type { AgentService, RequestContext } from '@aihu/agent-service'

export type { AgentService, RequestContext }

export interface A2aAdapterOptions {
  /** URL prefix for all routes. Default: '' */
  prefix?: string
  /** Agent name for the agent card. Default: 'aihu-agent-service' */
  name?: string
  /**
   * Per-request auth resolver — the same injection point `agent-service`'s own
   * `asMiddleware()` uses (`AgentServiceOptions.resolveAuth`) and that
   * `agent-server` forwards verbatim. The adapter calls it to build the
   * `RequestContext` threaded into `handleToolCall`, so scoped/$rate-limited
   * tools are decidable over the a2a transport.
   *
   * Thesis §4 tier 0: every transport must express WHO IS ASKING, even when
   * the answer is anonymous. When this is absent — or when it throws — the
   * adapter still forwards an explicit anonymous context (`{ userId: null }`)
   * rather than nothing, so the gate always has something to decide against.
   * Fail-closed is preserved: an anonymous context 401s on a scoped binding.
   */
  resolveAuth?: (req: Request) => RequestContext | Promise<RequestContext>
}

export interface A2aAdapter {
  asMiddleware(): (req: Request) => Promise<Response | null>
}
