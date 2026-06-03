/**
 * agent-driven-demo — browser entry.
 *
 * Mounts the REAL, visible `<task-list>` component, takes the compiler-injected
 * per-instance opaque-ID dispatcher off the mounted element, and runs the
 * capability-bridge client over a real browser WebSocket. Server-approved
 * invocations execute against THIS on-screen instance — so what the user sees
 * is what the agent drives.
 */

import type { BridgeChannel } from '@aihu/agent-server'
import { createBridgeClient } from '@aihu/agent-server'
import { _takeAgentDispatcher } from '@aihu/runtime'

// Side-effect import: the Vite plugin compiles `task-list.aihu` with the client
// pipeline (auto-wiring + the @agent dispatcher pass) and registers the custom
// element. The per-instance dispatcher is registered in the element's setup.
import './task-list.aihu'

const TAG = 'task-list'
const BRIDGE_URL = `ws://${location.hostname}:5208/bridge`

function wrapBrowserWs(ws: WebSocket): BridgeChannel {
  return {
    get connected() {
      return ws.readyState === WebSocket.OPEN
    },
    send(data) {
      ws.send(data)
    },
    onMessage(handler) {
      const h = (e: MessageEvent): void => handler(String(e.data))
      ws.addEventListener('message', h)
      return () => ws.removeEventListener('message', h)
    },
    onClose(handler) {
      ws.addEventListener('close', handler)
      return () => ws.removeEventListener('close', handler)
    },
  }
}

function start(): void {
  const el = document.querySelector(TAG)
  if (!el) {
    console.error(`[agent-driven-demo] <${TAG}> not found in the DOM`)
    return
  }

  // The Step-0 wiring: the compiler injected `_registerAgentDispatcher(ctx.element, …)`
  // into the component's setup, so the instance-bound dispatcher is available now.
  const dispatcher = _takeAgentDispatcher(el)
  if (!dispatcher) {
    console.error(
      '[agent-driven-demo] no per-instance dispatcher — was the component built for client+@agent?',
    )
    return
  }

  const ws = new WebSocket(BRIDGE_URL)
  ws.addEventListener('open', () => {
    createBridgeClient({
      dispatcher,
      channel: wrapBrowserWs(ws),
      // Stream a flat snapshot of the visible instance after each invocation so
      // the server (and any read-only viewer) reflects the on-screen state.
      serialize: () => ({
        taskCount: (el.shadowRoot ?? el).querySelectorAll('.tl-item').length,
      }),
    })
    console.log('[agent-driven-demo] bridge connected — the agent can now drive this instance')
  })
  ws.addEventListener('error', () => {
    console.warn(
      `[agent-driven-demo] could not reach the bridge at ${BRIDGE_URL}. Is the API server running (bun run server)?`,
    )
  })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start)
} else {
  start()
}
