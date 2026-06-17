/**
 * `--template agent` generators — the agent-drivable showcase.
 *
 * Unlike the client-only `minimal`/`full`/`docs` templates (Vite + viteAihuPlugin
 * + pages router), the `agent` template is the headline aihu thesis made runnable:
 * a durable on-screen Web Component that BOTH a human and an external AI agent
 * drive. The agent reaches the SAME visible instance over a server-mediated
 * capability bridge — the Bun server (`server.ts`) is the sole policy gate; the
 * browser instance is the sole executor.
 *
 * It is a two-process app: `bun run dev` runs the Bun bridge server (:5208) AND
 * Vite (:5108, proxying `/agent` + `/bridge`). Ported from the in-repo reference
 * `examples/agent-driven-demo`, adapted for a standalone (non-workspace) app and
 * extended with human controls.
 *
 * Per the repo's dep-free thesis: pure string generators, no runtime file reads.
 * Generated files deliberately avoid template literals (string concatenation) so
 * these generators don't need nested-backtick escaping.
 */

/** package.json for the `agent` template. */
export function agentPackageJson(name: string, pm = 'bun'): string {
  const bunVersion =
    (globalThis as { Bun?: { version: string } }).Bun?.version ?? process.versions.bun
  const packageManager = pm === 'bun' && bunVersion ? `bun@${bunVersion}` : undefined
  return JSON.stringify(
    {
      name,
      version: '0.1.0',
      private: true,
      type: 'module',
      scripts: {
        // Two processes: the Bun capability-bridge server + Vite.
        server: 'bun server.ts',
        dev: 'concurrently "bun run server" "vite --port 5108"',
        build: 'vite build',
        preview: 'vite preview',
        typecheck: 'tsc --noEmit',
      },
      dependencies: {
        '@aihu/agent': 'latest',
        '@aihu/agent-server': 'latest',
        '@aihu/agent-service': 'latest',
        '@aihu/arbor': 'latest',
        '@aihu/compiler': 'latest',
        '@aihu/runtime': 'latest',
        '@aihu/signals': 'latest',
        ws: '^8.18.0',
      },
      devDependencies: {
        '@aihu/cli': 'latest',
        '@types/ws': '^8.5.12',
        concurrently: '^9.0.0',
        typescript: '^5.0.0',
        vite: '^6.0.0',
      },
      // @aihu/compiler ships its native binary via an arch-validating postinstall
      // that bun blocks unless the package is trusted.
      trustedDependencies: ['@aihu/compiler'],
      ...(packageManager ? { packageManager } : {}),
    },
    null,
    2,
  )
}

/** vite.config.ts — client-target compiler + proxy to the Bun bridge server. */
export function agentViteConfig(): string {
  const lines = [
    "import { aihuCompilerPlugin } from '@aihu/compiler'",
    "import { defineConfig } from 'vite'",
    '',
    '// `target: client` makes the browser bundle ship the per-instance @agent',
    '// opaque-ID dispatcher; src/main.ts takes it off the mounted element and runs',
    '// the capability-bridge client. /agent + /bridge proxy to the Bun server.',
    'export default defineConfig({',
    "  plugins: [aihuCompilerPlugin({ target: 'client' })],",
    '  server: {',
    '    proxy: {',
    "      '/agent': 'http://localhost:5208',",
    "      '/bridge': { target: 'ws://localhost:5208', ws: true },",
    '    },',
    '  },',
    '})',
    '',
  ]
  return lines.join('\n')
}

/** tsconfig.json — self-contained (no monorepo paths). */
export function agentTsConfig(): string {
  return `${JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
        lib: ['ES2022', 'DOM', 'DOM.Iterable'],
        types: ['node'],
        noEmit: true,
      },
      include: ['server.ts', 'src', 'vite.config.ts'],
    },
    null,
    2,
  )}\n`
}

/** Ambient module shim so `import './task-list.aihu'` typechecks. */
export function agentModuleShim(): string {
  const lines = [
    '/** Side-effect import of a compiled .aihu SFC (registers the custom element). */',
    "declare module '*.aihu' {",
    '  const _default: unknown',
    '  export default _default',
    '}',
    '',
  ]
  return lines.join('\n')
}

/** server.ts — the Bun capability-bridge server (policy gate). */
export function agentServerTs(): string {
  const lines = [
    '/**',
    ' * Bun API + capability-bridge server.',
    ' *',
    ' *   EXTERNAL AGENT --POST /agent/call--> createAgentServer (the security gate;',
    ' *                                         sole policy authority)',
    ' *                                           | approved { opaqueActionId, args }',
    ' *                                           v',
    ' *   BROWSER (ws /bridge) <-- attachBridge -- WS capability bridge',
    ' *     the real <task-list> instance executes the action -> on-screen UI updates.',
    ' *',
    ' * Drive it (while `bun run dev` is up and the page is open):',
    " *   curl -XPOST localhost:5208/agent/call -H 'content-type: application/json' \\",
    ' *     -d \'{"tool":"task-list/addTask","params":["Write the launch post"]}\'',
    ' *',
    ' * SECURITY: this bridge is UNAUTHENTICATED — it is a local dev/demo server.',
    ' * Do NOT expose it to untrusted networks without adding auth/origin checks.',
    ' */',
    '',
    "import { registerAgentMetadata } from '@aihu/agent'",
    "import type { BridgeChannel } from '@aihu/agent-server'",
    "import { createAgentServer } from '@aihu/agent-server'",
    "import { branch, leaf } from '@aihu/arbor'",
    "import { type Signal, signal } from '@aihu/signals'",
    '',
    "const TAG = 'task-list'",
    'const PORT = 5208',
    '',
    '// The @agent surface the gate authorizes against (mirrors the component).',
    'registerAgentMetadata({',
    '  tag: TAG,',
    "  describes: 'A durable task list driven over the capability bridge.',",
    '  actions: {',
    '    addTask: { returns: {} },',
    '    clearTasks: { returns: {} },',
    '  },',
    '  state: {},',
    '})',
    '',
    '// A server-mounted twin so the gate can resolve the tag. It is NEVER executed',
    '// while a browser bridge is attached (the visible instance is authoritative).',
    'const [twinLen, setTwinLen] = signal(0)',
    "const twinNode = branch('div', { id: TAG + '-twin' }, [",
    '  leaf([twinLen, setTwinLen] as unknown as Signal<string>),',
    '])',
    'const server = createAgentServer({',
    '  target: {',
    '    node: twinNode,',
    '    agentBinding: {',
    '      tag: TAG,',
    '      actions: {',
    '        addTask: () => twinLen(),',
    '        clearTasks: () => twinLen(),',
    '      },',
    '      reads: { length: () => twinLen() },',
    '      writes: {},',
    '      scope: undefined,',
    '      rateLimit: undefined,',
    '    },',
    '  },',
    '  // @aihu/agent-server stands up its own server-side DOM internally — no',
    '  // createHost / jsdom glue needed.',
    '})',
    '',
    'type BunWs = { send(data: string): void; readyState: number }',
    'const messageHandlers = new Set<(data: string) => void>()',
    'const closeHandlers = new Set<() => void>()',
    '',
    'function bridgeChannelFor(ws: BunWs): BridgeChannel {',
    '  return {',
    '    get connected() {',
    '      return ws.readyState === 1',
    '    },',
    '    send(data) {',
    '      ws.send(data)',
    '    },',
    '    onMessage(handler) {',
    '      messageHandlers.add(handler)',
    '      return () => messageHandlers.delete(handler)',
    '    },',
    '    onClose(handler) {',
    '      closeHandlers.add(handler)',
    '      return () => closeHandlers.delete(handler)',
    '    },',
    '  }',
    '}',
    '',
    'let detachBridge: (() => void) | null = null',
    '',
    'Bun.serve<{ bridge: boolean }>({',
    '  port: PORT,',
    '  async fetch(req, srv): Promise<Response | undefined> {',
    '    const url = new URL(req.url)',
    "    if (url.pathname === '/bridge') {",
    '      if (srv.upgrade(req, { data: { bridge: true } })) return undefined',
    "      return new Response('expected websocket', { status: 426 })",
    '    }',
    "    if (url.pathname === '/agent/call' && req.method === 'POST') {",
    '      const body = (await req.json()) as { tool: string; params?: unknown; userId?: string }',
    '      const result = await server.callTool(body.tool, body.params ?? [], {',
    "        userId: body.userId ?? 'demo-agent',",
    '      })',
    '      return Response.json(result)',
    '    }',
    "    if (url.pathname === '/agent/state') {",
    '      return Response.json(server.serialize())',
    '    }',
    "    return new Response('not found', { status: 404 })",
    '  },',
    '  websocket: {',
    '    open(ws) {',
    '      detachBridge?.()',
    '      detachBridge = server.attachBridge(bridgeChannelFor(ws as unknown as BunWs))',
    "      console.log('[agent] browser bridge connected')",
    '    },',
    '    message(_ws, message) {',
    "      const data = typeof message === 'string' ? message : message.toString()",
    '      for (const h of [...messageHandlers]) h(data)',
    '    },',
    '    close() {',
    '      for (const h of [...closeHandlers]) h()',
    '      messageHandlers.clear()',
    '      closeHandlers.clear()',
    '    },',
    '  },',
    '})',
    '',
    "console.log('[agent] API + bridge on http://localhost:' + PORT)",
    "console.log('  POST /agent/call   { tool, params }   drive the component')",
    "console.log('  GET  /agent/state                     read current state')",
    "console.log('  WS   /bridge                          browser capability bridge')",
    '',
  ]
  return lines.join('\n')
}

/** src/main.ts — the browser bridge entry. */
export function agentMainTs(): string {
  const lines = [
    '/**',
    ' * Browser entry. Mounts the visible <task-list>, takes the compiler-injected',
    ' * per-instance @agent dispatcher off the element, and runs the capability-bridge',
    ' * client over a WebSocket — so server-approved agent calls execute against THIS',
    ' * on-screen instance.',
    ' */',
    "import { createBridgeClient } from '@aihu/agent-server'",
    "import type { BridgeChannel } from '@aihu/agent-server'",
    "import { _takeAgentDispatcher } from '@aihu/runtime'",
    '',
    '// Side-effect import: compiles + registers the custom element.',
    "import './task-list.aihu'",
    '',
    "const TAG = 'task-list'",
    "const BRIDGE_URL = 'ws://' + location.hostname + ':5208/bridge'",
    '',
    'function wrapBrowserWs(ws: WebSocket): BridgeChannel {',
    '  return {',
    '    get connected() {',
    '      return ws.readyState === WebSocket.OPEN',
    '    },',
    '    send(data) {',
    '      ws.send(data)',
    '    },',
    '    onMessage(handler) {',
    '      const h = (e: MessageEvent): void => handler(String(e.data))',
    "      ws.addEventListener('message', h)",
    "      return () => ws.removeEventListener('message', h)",
    '    },',
    '    onClose(handler) {',
    "      ws.addEventListener('close', handler)",
    "      return () => ws.removeEventListener('close', handler)",
    '    },',
    '  }',
    '}',
    '',
    'function start(): void {',
    '  const el = document.querySelector(TAG)',
    '  if (!el) {',
    "    console.error('[agent] <' + TAG + '> not found')",
    '    return',
    '  }',
    '  const dispatcher = _takeAgentDispatcher(el)',
    '  if (!dispatcher) {',
    "    console.error('[agent] no per-instance dispatcher — built for client+@agent?')",
    '    return',
    '  }',
    '  const ws = new WebSocket(BRIDGE_URL)',
    "  ws.addEventListener('open', () => {",
    '    createBridgeClient({',
    '      dispatcher,',
    '      channel: wrapBrowserWs(ws),',
    '      serialize: () => ({',
    "        taskCount: (el.shadowRoot ?? el).querySelectorAll('.tl-item').length,",
    '      }),',
    '    })',
    "    console.log('[agent] bridge connected — the agent can now drive this instance')",
    '  })',
    "  ws.addEventListener('error', () => {",
    "    console.warn('[agent] could not reach the bridge at ' + BRIDGE_URL + ' — is `bun run server` up?')",
    '  })',
    '}',
    '',
    "if (document.readyState === 'loading') {",
    "  document.addEventListener('DOMContentLoaded', start)",
    '} else {',
    '  start()',
    '}',
    '',
  ]
  return lines.join('\n')
}

/** src/task-list.aihu — the durable, human+agent-drivable component. */
export function agentComponentAihu(): string {
  return `@state {
  import { signal } from '@aihu/signals'

  // The durable list both a human and an agent drive. Each task: { id, text }.
  const [tasks, setTasks] = signal([])
  const [nextId, setNextId] = signal(1)
  const [draft, setDraft] = signal('')

  // Shared mutation — the human input and the agent's addTask both call this, so
  // both drive the SAME signal state on this one instance.
  const add = (text) => {
    const t = (text ?? '').trim()
    if (!t) return
    const id = nextId()
    setTasks([...tasks(), { id, text: t }])
    setNextId(id + 1)
  }

  const onDraft = (e) => setDraft(e.target.value)
  const addFromInput = () => {
    add(draft())
    setDraft('')
  }

  $action: {
    addTask: {
      describe: 'Append a task with the given text.',
      expose: { read: true },
      handler: (args) => add(typeof args?.[0] === 'string' ? args[0] : String(args?.[0] ?? '')),
    },
    clearTasks: {
      describe: 'Remove all tasks.',
      expose: { read: true },
      handler: () => setTasks([]),
    },
  }
}

@template {
  <section class="tl">
    <header class="tl-head">
      <h2 class="tl-title">Tasks</h2>
      <span class="tl-count">{tasks.length}</span>
    </header>
    <div class="tl-add">
      <label class="tl-label" for="tl-new">New task</label>
      <input
        id="tl-new"
        class="tl-input"
        $value={draft}
        $on.input={onDraft}
        $on.keydown={(e) => e.key === 'Enter' && addFromInput()}
        placeholder="Add a task and press Enter"
      />
      <button class="tl-btn" $on.click={addFromInput}>Add</button>
      <button class="tl-btn" $on.click={() => setTasks([])}>Clear</button>
    </div>
    <ul class="tl-items">
      <li $each="tasks as task" $key="task.id" class="tl-item">
        <span class="tl-text">{task.text}</span>
      </li>
    </ul>
  </section>
}

@style {
  .tl {
    max-width: 32rem;
    margin: 0 auto;
    padding: 1.25rem 1.5rem;
    border: 1px solid #e2e2e2;
    border-radius: 12px;
    font-family: system-ui, -apple-system, sans-serif;
    color: #1a1a1a;
  }
  .tl-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }
  .tl-title {
    margin: 0;
    font-size: 1.1rem;
  }
  .tl-count {
    min-width: 1.5rem;
    text-align: center;
    padding: 0.1rem 0.45rem;
    background: #eef;
    color: #225;
    border-radius: 999px;
    font-size: 0.8rem;
    font-weight: 700;
  }
  .tl-add {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    margin-bottom: 0.75rem;
  }
  .tl-label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
  .tl-input {
    flex: 1;
    padding: 0.5rem 0.6rem;
    border: 1px solid #ccc;
    border-radius: 8px;
    font: inherit;
  }
  .tl-btn {
    padding: 0.5rem 0.9rem;
    cursor: pointer;
    border: 1px solid #ccc;
    border-radius: 8px;
    background: #f7f7f7;
    font: inherit;
  }
  .tl-items {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 0.4rem;
  }
  .tl-item {
    padding: 0.5rem 0.7rem;
    background: #fafafa;
    border: 1px solid #ececec;
    border-radius: 8px;
  }
}

@agent {
  action addTask()
  action clearTasks()
}
`
}

/** index.html — mounts <task-list> + the thesis copy and curl one-liner. */
export function agentIndexHtml(name: string): string {
  const lines = [
    '<!doctype html>',
    '<html lang="en">',
    '  <head>',
    '    <meta charset="UTF-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    `    <title>${name} — agent-driven aihu</title>`,
    '    <style>',
    '      body { font-family: system-ui, -apple-system, sans-serif; max-width: 40rem;',
    '        margin: 3rem auto; padding: 0 1rem; color: #1a1a1a; line-height: 1.5; }',
    '      .lede { color: #555; font-size: 0.95rem; margin-bottom: 2rem; }',
    '      code { font-family: ui-monospace, monospace; background: #f3f3f3;',
    '        padding: 0.1rem 0.3rem; border-radius: 4px; }',
    '    </style>',
    '  </head>',
    '  <body>',
    '    <h1>Agent-driven, durable component</h1>',
    '    <p class="lede">',
    '      The &lt;task-list&gt; below is a real aihu custom element with durable signal',
    '      state. Add tasks yourself, AND drive the same on-screen instance as an agent',
    '      would — gated server-side, executed here in the browser:',
    '      <br /><br />',
    '      <code>curl -XPOST localhost:5208/agent/call -H \'content-type: application/json\' -d \'{"tool":"task-list/addTask","params":["from agent"]}\'</code>',
    '    </p>',
    '    <task-list></task-list>',
    '    <script type="module" src="/src/main.ts"></script>',
    '  </body>',
    '</html>',
    '',
  ]
  return lines.join('\n')
}

/**
 * mcp.ts — expose the component's actions to a standard MCP client (Claude
 * Desktop, Cursor, Claude Code) over stdio, bridged to the LIVE browser instance.
 *
 * This is the same gate + bridge as server.ts, plus an MCP stdio transport. Your
 * MCP client SPAWNS this process; it opens the WS bridge (:5208) the browser
 * connects to, and serves MCP over stdout — so all human-facing logging goes to
 * stderr (stdout is the MCP JSON-RPC channel; a stray console.log corrupts it).
 *
 * Run the page separately (`vite --port 5108`), register `bun mcp.ts` with your
 * MCP client (see README), open the page, then ask the AI to add a task.
 */
export function agentMcpTs(): string {
  const lines = [
    "import { getAllAgentMetadata, registerAgentMetadata } from '@aihu/agent'",
    "import type { BridgeChannel } from '@aihu/agent-server'",
    "import { createAgentServer, serveComponentMcp } from '@aihu/agent-server'",
    "import { branch, leaf } from '@aihu/arbor'",
    "import { type Signal, signal } from '@aihu/signals'",
    '',
    "const TAG = 'task-list'",
    'const PORT = 5208',
    '',
    'registerAgentMetadata({',
    '  tag: TAG,',
    "  describes: 'A durable task list driven over the capability bridge.',",
    '  actions: {',
    '    addTask: { returns: {} },',
    '    clearTasks: { returns: {} },',
    '  },',
    '  state: {},',
    '})',
    '',
    'const [twinLen, setTwinLen] = signal(0)',
    "const twinNode = branch('div', { id: TAG + '-twin' }, [",
    '  leaf([twinLen, setTwinLen] as unknown as Signal<string>),',
    '])',
    'const server = createAgentServer({',
    '  target: {',
    '    node: twinNode,',
    '    agentBinding: {',
    '      tag: TAG,',
    '      actions: {',
    '        addTask: () => twinLen(),',
    '        clearTasks: () => twinLen(),',
    '      },',
    '      reads: { length: () => twinLen() },',
    '      writes: {},',
    '      scope: undefined,',
    '      rateLimit: undefined,',
    '    },',
    '  },',
    '})',
    '',
    'type BunWs = { send(data: string): void; readyState: number }',
    'const messageHandlers = new Set<(data: string) => void>()',
    'const closeHandlers = new Set<() => void>()',
    '',
    'function bridgeChannelFor(ws: BunWs): BridgeChannel {',
    '  return {',
    '    get connected() {',
    '      return ws.readyState === 1',
    '    },',
    '    send(data) {',
    '      ws.send(data)',
    '    },',
    '    onMessage(handler) {',
    '      messageHandlers.add(handler)',
    '      return () => messageHandlers.delete(handler)',
    '    },',
    '    onClose(handler) {',
    '      closeHandlers.add(handler)',
    '      return () => closeHandlers.delete(handler)',
    '    },',
    '  }',
    '}',
    '',
    'let detachBridge: (() => void) | null = null',
    '',
    '// WS bridge for the browser instance. NOTE: stdout is the MCP channel — log to',
    '// stderr (console.error) only.',
    'Bun.serve<{ bridge: boolean }>({',
    '  port: PORT,',
    '  fetch(req, srv): Response | undefined {',
    '    const url = new URL(req.url)',
    "    if (url.pathname === '/bridge') {",
    '      if (srv.upgrade(req, { data: { bridge: true } })) return undefined',
    "      return new Response('expected websocket', { status: 426 })",
    '    }',
    "    if (url.pathname === '/agent/state') return Response.json(server.serialize())",
    "    return new Response('not found', { status: 404 })",
    '  },',
    '  websocket: {',
    '    open(ws) {',
    '      detachBridge?.()',
    '      detachBridge = server.attachBridge(bridgeChannelFor(ws as unknown as BunWs))',
    "      console.error('[agent-mcp] browser bridge connected')",
    '    },',
    '    message(_ws, message) {',
    "      const data = typeof message === 'string' ? message : message.toString()",
    '      for (const h of [...messageHandlers]) h(data)',
    '    },',
    '    close() {',
    '      for (const h of [...closeHandlers]) h()',
    '      messageHandlers.clear()',
    '      closeHandlers.clear()',
    '    },',
    '  },',
    '})',
    '',
    "console.error('[agent-mcp] WS bridge on :' + PORT + ' — serving MCP (tools/list, tools/call) over stdio')",
    '',
    '// Serve the component actions as MCP tools (names: <tag>/<action>, e.g.',
    "// 'task-list/addTask') over stdio. Each tools/call routes through the gate and,",
    '// when the browser is connected, executes on the visible instance.',
    'await serveComponentMcp(server, getAllAgentMetadata())',
    '',
  ]
  return lines.join('\n')
}

/** README.md — quickstart + the "drive it with an AI" recipes. */
export function agentReadme(name: string): string {
  const lines = [
    `# ${name}`,
    '',
    'An **agent-drivable** aihu app: a durable `<task-list>` Web Component that both a',
    'human and an AI agent drive. The agent reaches the *same visible instance* over a',
    'server-mediated capability bridge — the server is the policy gate, the browser is',
    'the executor. The UI the user sees is the UI the agent drives.',
    '',
    '## Run it',
    '',
    '```bash',
    'bun install',
    'bun run dev      # Bun bridge server (:5208) + Vite (:5108)',
    '```',
    '',
    'Open the Vite URL, add tasks with the input — then drive the SAME instance as an',
    'agent would over HTTP:',
    '',
    '```bash',
    "curl -XPOST localhost:5208/agent/call -H 'content-type: application/json' \\",
    '  -d \'{"tool":"task-list/addTask","params":["Write the launch post"]}\'',
    '```',
    '',
    'The on-screen list updates. An unexposed action is rejected by the gate.',
    '',
    '## Drive it with an AI (MCP)',
    '',
    'Standard MCP clients (Claude Desktop, Cursor, Claude Code) can discover the',
    "component's tools and call them in natural language. `mcp.ts` serves the actions",
    'as MCP tools over stdio and bridges to the live browser instance.',
    '',
    '1. Start the page (leave it running):',
    '',
    '   ```bash',
    '   bun run vite     # or: vite --port 5108',
    '   ```',
    '',
    '2. Register the MCP server with your client. **Claude Code:**',
    '',
    '   ```bash',
    `   claude mcp add ${name} -- bun /ABSOLUTE/PATH/TO/${name}/mcp.ts`,
    '   ```',
    '',
    '   **Claude Desktop** (`claude_desktop_config.json`):',
    '',
    '   ```json',
    '   {',
    '     "mcpServers": {',
    `       "${name}": { "command": "bun", "args": ["/ABSOLUTE/PATH/TO/${name}/mcp.ts"] }`,
    '     }',
    '   }',
    '   ```',
    '',
    '3. Open the Vite page in a browser (so the instance connects to the bridge).',
    '4. Ask the AI: **"add a task called \'ship it\' to the task list"** — it calls the',
    '   `task-list/addTask` MCP tool, the gate approves, and the on-screen list updates.',
    '',
    '> The MCP client spawns `mcp.ts`, which opens the WS bridge on :5208 (do not also',
    '> run `bun run server` then — they share the port). All `mcp.ts` logging goes to',
    '> stderr; stdout is the MCP channel.',
    '',
    '## Security',
    '',
    'The capability bridge is **unauthenticated** — this is a local dev/demo. Do not',
    'expose `/agent/call` or `/bridge` to untrusted networks without adding auth and',
    'origin checks. The server is the sole policy authority: only actions declared in',
    'the component\'s `@agent` block are callable.',
    '',
  ]
  return lines.join('\n')
}
