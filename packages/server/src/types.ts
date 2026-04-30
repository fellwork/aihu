export interface RouteContext {
  readonly params: Record<string, string>
  readonly url: URL
  readonly env?: unknown
}

export type Next = () => Promise<Response>

export type RouteHandler = (req: Request, ctx: RouteContext) => Response | Promise<Response>

export type Middleware = (req: Request, next: Next) => Response | Promise<Response>

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'
