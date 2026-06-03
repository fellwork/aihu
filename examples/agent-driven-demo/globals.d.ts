/**
 * Minimal ambient declarations for this example so `tsc --noEmit` passes without
 * pulling in `@types/bun` (the example runs on Bun for `server.ts` only). Only
 * the surface this demo uses is declared.
 */

interface BunServeWebSocketHandlers<T> {
  open?(ws: BunWebSocket<T>): void
  message?(ws: BunWebSocket<T>, message: string | Uint8Array): void
  close?(ws: BunWebSocket<T>): void
}

interface BunWebSocket<T> {
  send(data: string): void
  readonly readyState: number
  readonly data: T
}

interface BunServer {
  upgrade(req: Request, opts?: { data?: unknown }): boolean
}

interface BunServeOptions<T> {
  port?: number
  fetch(req: Request, server: BunServer): Promise<Response | undefined> | Response | undefined
  websocket?: BunServeWebSocketHandlers<T>
}

declare const Bun: {
  serve<T = unknown>(options: BunServeOptions<T>): { port: number }
}
