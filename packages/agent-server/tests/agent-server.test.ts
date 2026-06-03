/**
 * `@aihu/agent-server` — scripted end-to-end tests (T2).
 *
 * Acceptance: a scripted client actually DRIVES a server-mounted component.
 * We assert user-visible behavior — a real signal changes and `serialize()`
 * reflects it — not merely "it builds".
 *
 * Coverage:
 *  - MCP tool call (over an in-memory MCP client↔server pair) drives a mounted
 *    component: a write action mutates a real signal; serialize() reflects it.
 *  - 404 for an unmounted tag (gate, via the live registry).
 *  - 401 for a scoped component with no auth context.
 *  - 403 for a scoped component whose JWT lacks the claim.
 *  - WS capability-bridge contract: approved invocations are forwarded as
 *    `{ opaqueActionId, args }`; rejected ones are NOT; the browser's result
 *    is surfaced back; disconnect mid-drive is a loud error.
 *
 * The tests build a genuine reactive component out of `@aihu/signals` +
 * `@aihu/arbor` so the LiveBinding's reads/writes/actions are real signals
 * mounted into a jsdom host — exactly the server-mount path the plan requires.
 */

import { registerAgentMetadata } from '@aihu/agent'
import { type AgentBindingSpec, branch, leaf } from '@aihu/arbor'
import { type Signal, signal } from '@aihu/signals'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createAgentServer } from '../src/agent-server.ts'
import { createComponentMcpServer } from '../src/mcp-server.ts'
import { opaqueActionId } from '../src/opaque-id.ts'
import type { AgentServer, BridgeChannel } from '../src/types.ts'

// ─── A real reactive counter component + its server agent-binding ────────────

const TAG = 'agent-counter'

/**
 * Build a real `<agent-counter>` component: a `count` signal rendered into a
 * leaf, plus an `increment`/`set` action and a read of `count`. Returns the
 * arbor node + the `__agentBinding`-shaped spec the SERVER build would emit.
 */
function makeCounter(opts?: { scope?: string; rateLimit?: string }): {
  node: ReturnType<typeof branch>
  agentBinding: AgentBindingSpec
  readCount: () => number
} {
  const [count, setCount] = signal(0)
  // Render the `count` signal directly as the leaf's text. The leaf factory
  // takes a Signal tuple `[Read, Write]`; passing `count`'s tuple makes the
  // reactive text binding register in the mount's signalRegistry so
  // serialize() reflects it. (Numbers stringify in the text-leaf effect.)
  const countSig = [count, setCount] as unknown as Signal<string>
  const node = branch('div', { id: TAG }, [leaf(countSig)])

  const agentBinding: AgentBindingSpec = {
    tag: TAG,
    actions: {
      increment: (args: unknown) => {
        const by = Array.isArray(args) && typeof args[0] === 'number' ? args[0] : 1
        setCount(count() + by)
        return count()
      },
      set: (args: unknown) => {
        const v = Array.isArray(args) && typeof args[0] === 'number' ? args[0] : 0
        setCount(v)
        return count()
      },
    },
    reads: { count: () => count() },
    writes: { count: (v: unknown) => setCount(Number(v)) },
    scope: opts?.scope,
    rateLimit: opts?.rateLimit,
  }

  return { node, agentBinding, readCount: () => count() }
}

function host(): Element {
  return new JSDOM('<!DOCTYPE html><body></body>').window.document.body
}

// Register the static metadata so MCP tool-listing surfaces the actions.
beforeEach(() => {
  registerAgentMetadata({
    tag: TAG,
    describes: 'A counter exposing increment/set actions and a count read.',
    actions: { increment: { returns: {} }, set: { returns: {} } },
    state: { count: 'The current counter value.' },
  })
})

let servers: AgentServer[] = []
afterEach(() => {
  for (const s of servers) s.dispose()
  servers = []
})

function spawn(...args: Parameters<typeof createAgentServer>): AgentServer {
  const s = createAgentServer(...args)
  servers.push(s)
  return s
}

// ─── Scripted MCP client drives the mounted component ────────────────────────

describe('scripted MCP client drives a server-mounted component', () => {
  it('a tools/call increment mutates a real signal and serialize() reflects it', async () => {
    const counter = makeCounter()
    const server = spawn({
      target: { node: counter.node, agentBinding: counter.agentBinding },
      createHost: host,
    })

    // Starting state: signal is 0, serialize reflects 0.
    expect(counter.readCount()).toBe(0)
    const before = server.serialize()
    expect(Object.values(before)).toContain(0)

    // Wire a real MCP client ↔ the component MCP server over in-memory transport.
    const mcp = createComponentMcpServer(server)
    const [clientT, serverT] = InMemoryTransport.createLinkedPair()
    await mcp.connect(serverT)
    const client = new Client({ name: 'test-agent', version: '0.0.0' }, { capabilities: {} })
    await client.connect(clientT)

    // The agent discovers the tools…
    const { tools } = await client.listTools()
    const names = tools.map((t) => t.name)
    expect(names).toContain(`${TAG}/increment`)
    expect(names).toContain(`${TAG}/count`)

    // …then DRIVES the component: increment by 5.
    const res = await client.callTool({
      name: `${TAG}/increment`,
      arguments: { args: [5] },
    })
    expect(res.isError).toBeFalsy()

    // User-visible proof: the real signal changed.
    expect(counter.readCount()).toBe(5)
    // …and serialize() (the browser-view stream payload) reflects it.
    const after = server.serialize()
    expect(Object.values(after)).toContain(5)

    await client.close()
    await mcp.close()
  })

  it('a read tool returns the live signal value', async () => {
    const counter = makeCounter()
    const server = spawn({
      target: { node: counter.node, agentBinding: counter.agentBinding },
      createHost: host,
    })
    counter.agentBinding.actions.increment!([3])

    const mcp = createComponentMcpServer(server)
    const [clientT, serverT] = InMemoryTransport.createLinkedPair()
    await mcp.connect(serverT)
    const client = new Client({ name: 'test-agent', version: '0.0.0' }, { capabilities: {} })
    await client.connect(clientT)

    const res = (await client.callTool({ name: `${TAG}/count`, arguments: {} })) as {
      content: Array<{ text: string }>
      isError?: boolean
    }
    expect(res.isError).toBeFalsy()
    expect(res.content[0]!.text).toContain('3')

    await client.close()
    await mcp.close()
  })
})

// ─── Gate: 404 / 401 / 403 (delegated to agent-service, verified end-to-end) ──

describe('security gate is preserved through callTool', () => {
  it('404 for an unmounted tag', async () => {
    const counter = makeCounter()
    const server = spawn({
      target: { node: counter.node, agentBinding: counter.agentBinding },
      createHost: host,
    })
    const res = (await server.callTool('not-mounted/doThing', {}, { userId: 'u1' })) as {
      code: number
      error: string
    }
    expect(res.code).toBe(404)
    expect(res.error).toContain('not-mounted')
  })

  it('401 for a scoped component with no auth context', async () => {
    const counter = makeCounter({ scope: 'authenticated' })
    const server = spawn({
      target: { node: counter.node, agentBinding: counter.agentBinding },
      createHost: host,
      authPlugin: { checkScope: () => true },
    })
    const res = (await server.callTool(`${TAG}/increment`, { args: [1] })) as {
      code: number
      error: string
    }
    expect(res.code).toBe(401)
  })

  it('403 for a scoped component whose JWT lacks the claim', async () => {
    const counter = makeCounter({ scope: 'admin' })
    const server = spawn({
      target: { node: counter.node, agentBinding: counter.agentBinding },
      createHost: host,
      authPlugin: { checkScope: (jwt, scope) => jwt.includes(scope) },
    })
    const res = (await server.callTool(
      `${TAG}/increment`,
      { args: [1] },
      { userId: 'u1', jwt: 'token-without-the-claim' },
    )) as { code: number; error: string }
    expect(res.code).toBe(403)
    expect(res.error).toContain('SCOPE_DENIED')
  })

  it('a rejected call is NOT forwarded to the bridge', async () => {
    const counter = makeCounter({ scope: 'admin' })
    const server = spawn({
      target: { node: counter.node, agentBinding: counter.agentBinding },
      createHost: host,
      authPlugin: { checkScope: (jwt, scope) => jwt.includes(scope) },
    })
    const forwarded: string[] = []
    server.attachBridge(makeFakeBridge((msg) => forwarded.push(msg)))

    const res = (await server.callTool(
      `${TAG}/increment`,
      { args: [1] },
      { userId: 'u1', jwt: 'nope' },
    )) as { code: number }
    expect(res.code).toBe(403)
    // The gate rejected it; the visible instance must never have been driven.
    expect(forwarded).toHaveLength(0)
  })
})

// ─── WS capability-bridge contract ───────────────────────────────────────────

/** Minimal in-memory bridge whose outbound frames are captured by `onSend`. */
function makeFakeBridge(onSend: (data: string) => void): BridgeChannel & {
  reply(data: string): void
  fireClose(): void
} {
  let msgHandler: ((d: string) => void) | null = null
  let closeHandler: (() => void) | null = null
  let open = true
  return {
    get connected() {
      return open
    },
    send(data: string) {
      onSend(data)
    },
    onMessage(h) {
      msgHandler = h
      return () => {
        msgHandler = null
      }
    },
    onClose(h) {
      closeHandler = h
      return () => {
        closeHandler = null
      }
    },
    reply(data: string) {
      msgHandler?.(data)
    },
    fireClose() {
      open = false
      closeHandler?.()
    },
  }
}

describe('WS capability bridge', () => {
  it('forwards an approved invocation as {opaqueActionId, args} and surfaces the browser result', async () => {
    const counter = makeCounter()
    const server = spawn({
      target: { node: counter.node, agentBinding: counter.agentBinding },
      createHost: host,
    })

    let lastFrame: {
      type: string
      callId: string
      opaqueActionId: string
      args: unknown[]
    } | null = null
    const bridge = makeFakeBridge((data) => {
      lastFrame = JSON.parse(data)
      // Browser executes + replies with the visible instance's result.
      bridge.reply(
        JSON.stringify({ type: 'result', callId: lastFrame!.callId, result: { visible: 42 } }),
      )
    })
    server.attachBridge(bridge)

    // callTool takes the positional args array directly (the MCP layer unwraps
    // `.args` before calling it; here we call callTool directly).
    const res = (await server.callTool(`${TAG}/increment`, [7], { userId: 'u1' })) as {
      result: unknown
    }

    // Contract: forwarded message carries the STABLE opaque id (matching the
    // compiler-emitted __agentDispatcher) + args, and no policy info.
    expect(lastFrame).not.toBeNull()
    expect(lastFrame!.type).toBe('invoke')
    expect(lastFrame!.opaqueActionId).toBe(opaqueActionId(TAG, 'increment'))
    expect(lastFrame!.opaqueActionId).toMatch(/^a_[0-9a-f]{16}$/)
    expect(lastFrame!.args).toEqual([7])
    expect('scope' in (lastFrame as Record<string, unknown>)).toBe(false)
    expect('rateLimit' in (lastFrame as Record<string, unknown>)).toBe(false)

    // The visible instance's result is surfaced back to the agent.
    expect(res.result).toEqual({ visible: 42 })

    // Browser is authoritative: the server-mounted twin was NOT driven. The
    // server gates (policy) but delegates execution to the visible instance, so
    // its signal stays at 0 — no double-execution, no projection drift.
    expect(counter.readCount()).toBe(0)
  })

  it('a disconnect mid-drive is a loud error, not a silent drop', async () => {
    const counter = makeCounter()
    const server = spawn({
      target: { node: counter.node, agentBinding: counter.agentBinding },
      createHost: host,
    })

    const bridge = makeFakeBridge(() => {
      // Browser never replies; instead the socket drops.
      bridge.fireClose()
    })
    server.attachBridge(bridge)

    const res = (await server.callTool(`${TAG}/increment`, [1], { userId: 'u1' })) as {
      code: number
      error: string
    }
    expect(res.code).toBe(503)
    expect(res.error).toContain('BRIDGE_ERROR')
  })
})
