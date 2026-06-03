/**
 * `@aihu/agent-server` — `createAgentServer()` (T2).
 *
 * Glue that lets an external MCP client drive a *server-mounted* aihu component
 * through the already-tested live-dispatch runtime, and forwards only APPROVED
 * invocations to a connected browser bridge (the visible, authoritative
 * instance).
 *
 * Responsibilities:
 *  1. Mount the target component server-side (jsdom host) so its `LiveBinding`
 *     registers in arbor's `componentInstanceRegistry`.
 *  2. Build the agent-service via `createAgentService({ manifests:
 *     getAllAgentMetadata(), getRegistry: _getComponentInstanceRegistry, … })`.
 *  3. Run tool calls through `handleToolCall` (the 404→401→403→429 security
 *     gate — NOT re-implemented here) and, on approval only, forward the
 *     invocation to an attached browser bridge.
 *
 * The MCP protocol layer lives in `./mcp-server.ts` so the SDK import stays
 * lazy (server-side package, no `.size-limit.json` row).
 */

import { getAllAgentMetadata } from '@aihu/agent'
import type { RequestContext } from '@aihu/agent-service'
import { createAgentService } from '@aihu/agent-service'
import type { MountScope, Snapshot } from '@aihu/arbor'
import { _getComponentInstanceRegistry, mount } from '@aihu/arbor'
import { opaqueActionIdForTool } from './opaque-id.ts'
import type {
  AgentServer,
  AgentServerOptions,
  BridgeChannel,
  BridgeClientMessage,
  BridgeInvokeMessage,
} from './types.ts'
import { BRIDGE_PROTOCOL_VERSION } from './types.ts'

/** A pending `callTool` whose result will arrive over the bridge. */
interface PendingBridgeCall {
  resolve(value: unknown): void
  reject(err: Error): void
}

/** Monotonic id source for bridge `callId`s. */
let _callIdCounter = 0

/**
 * Detect a gate-rejection envelope from `handleToolCall`. The agent-service
 * returns `{ error, code, jsonrpc }` for 404/401/403/429 and `{ result }` on
 * success. We forward to the bridge ONLY when there is no rejection `code`.
 */
function isGateRejection(envelope: unknown): envelope is { error: string; code: number } {
  return (
    typeof envelope === 'object' &&
    envelope !== null &&
    typeof (envelope as { code?: unknown }).code === 'number'
  )
}

/**
 * Create an {@link AgentServer}.
 *
 * @throws if neither `target.mount` nor (`target.node` + `createHost`) is given.
 */
export function createAgentServer(options: AgentServerOptions): AgentServer {
  const { target } = options

  // ── Step 1: mount server-side so the LiveBinding registers ─────────────────
  let scope: MountScope
  if (target.mount) {
    scope = target.mount
  } else {
    if (!target.node) {
      throw new Error(
        '@aihu/agent-server: target must provide either `mount` or `node` (+ `agentBinding`).',
      )
    }
    if (!options.createHost) {
      throw new Error(
        '@aihu/agent-server: mounting `node` requires `createHost` (e.g. () => new JSDOM().window.document.body).',
      )
    }
    const host = options.createHost()
    scope = mount(
      target.node,
      host,
      target.agentBinding ? { agentBinding: target.agentBinding } : undefined,
    )
  }

  // ── Step 2: build the agent-service over the live registry ─────────────────
  // manifests come from the global @aihu/agent registry (compiler-populated);
  // getRegistry is the live componentInstanceRegistry getter from arbor/mount.
  // The security gate lives entirely inside this service.
  const service = createAgentService({
    manifests: getAllAgentMetadata(),
    getRegistry: _getComponentInstanceRegistry,
    ...(options.authPlugin ? { authPlugin: options.authPlugin } : {}),
    ...(options.rateLimitPlugin ? { rateLimitPlugin: options.rateLimitPlugin } : {}),
    ...(options.resolveAuth ? { resolveAuth: options.resolveAuth } : {}),
  })

  // ── Bridge state ───────────────────────────────────────────────────────────
  let bridge: BridgeChannel | null = null
  let detachBridge: (() => void) | null = null
  const pending = new Map<string, PendingBridgeCall>()
  let lastBridgeSnapshot: Snapshot | null = null

  function handleBridgeFrame(data: string): void {
    let msg: BridgeClientMessage
    try {
      msg = JSON.parse(data) as BridgeClientMessage
    } catch {
      return // ignore malformed frames
    }
    switch (msg.type) {
      case 'hello':
        // The client may also gate on version; we just record it. A mismatch is
        // surfaced by the client refusing to connect, not by the server here.
        return
      case 'snapshot':
        lastBridgeSnapshot = msg.snapshot
        if (msg.callId) {
          const p = pending.get(msg.callId)
          // A snapshot alone does not resolve a call — we wait for result/error.
          // (kept for read-only viewers / spontaneous state pushes.)
          void p
        }
        return
      case 'result': {
        const p = pending.get(msg.callId)
        if (p) {
          pending.delete(msg.callId)
          p.resolve(msg.result)
        }
        return
      }
      case 'error': {
        const p = pending.get(msg.callId)
        if (p) {
          pending.delete(msg.callId)
          p.reject(new Error(msg.message))
        }
        return
      }
    }
  }

  function rejectAllPending(reason: string): void {
    for (const [, p] of pending) p.reject(new Error(reason))
    pending.clear()
  }

  function attachBridge(channel: BridgeChannel): () => void {
    // Replace any prior bridge.
    detachBridge?.()
    bridge = channel
    const offMsg = channel.onMessage(handleBridgeFrame)
    const offClose = channel.onClose(() => {
      rejectAllPending('bridge disconnected')
      if (bridge === channel) bridge = null
    })
    detachBridge = () => {
      offMsg()
      offClose()
      if (bridge === channel) bridge = null
      detachBridge = null
    }
    return detachBridge
  }

  /**
   * Forward an approved invocation to the bridge and await the browser's reply
   * (the visible instance's result). If the bridge is disconnected mid-flight
   * the promise rejects (loud failure, per the plan's failure modes).
   */
  function forwardToBridge(opaqueActionId: string, args: unknown[]): Promise<unknown> {
    if (!bridge?.connected) {
      return Promise.resolve(undefined)
    }
    const callId = `c${_callIdCounter++}`
    const frame: BridgeInvokeMessage = { type: 'invoke', callId, opaqueActionId, args }
    return new Promise<unknown>((resolve, reject) => {
      pending.set(callId, { resolve, reject })
      try {
        bridge!.send(JSON.stringify(frame))
      } catch (err) {
        pending.delete(callId)
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })
  }

  // ── callTool: bridge attached → gate-only + delegate; else server dispatch ─
  async function callTool(
    toolName: string,
    params: unknown,
    ctx?: RequestContext,
  ): Promise<unknown> {
    const args = Array.isArray(params)
      ? params
      : params !== null && params !== undefined
        ? [params]
        : []

    if (bridge?.connected) {
      // Capability-bridge topology: the VISIBLE browser instance is
      // authoritative. Gate on the server (policy authority) but do NOT
      // dispatch on the server-mounted twin — that would double-execute side
      // effects and reintroduce the projection drift the bridge exists to
      // avoid. Execution is delegated to the browser via the opaque-ID
      // dispatcher; the gate carries no policy info onto the wire.
      const verdict = await service.authorize(toolName, params, ctx)
      if (isGateRejection(verdict)) return verdict

      const opaqueActionId = opaqueActionIdForTool(toolName)
      if (!opaqueActionId) return { error: `bad tool: ${toolName}`, code: 400 }

      try {
        const bridgeResult = await forwardToBridge(opaqueActionId, args)
        return { result: bridgeResult ?? null }
      } catch (err) {
        // WS-disconnect mid-drive must be surfaced, not silently dropped.
        return {
          error: `BRIDGE_ERROR: ${err instanceof Error ? err.message : String(err)}`,
          code: 503,
        }
      }
    }

    // No bridge (headless / CI): gate + dispatch on the server-mounted instance.
    return service.handleToolCall(toolName, params, ctx)
  }

  function serialize(): Snapshot {
    return lastBridgeSnapshot ?? scope.serialize()
  }

  function dispose(): void {
    detachBridge?.()
    rejectAllPending('agent server disposed')
    scope.dispose()
  }

  return {
    service,
    mount: scope,
    callTool,
    serialize,
    attachBridge,
    dispose,
  }
}

export { BRIDGE_PROTOCOL_VERSION }
