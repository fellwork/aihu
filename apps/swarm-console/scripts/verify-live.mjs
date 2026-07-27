#!/usr/bin/env bun
// verify-live.mjs — the swarm-console acceptance script (task items 3 + 4).
//
// Proves the data path end-to-end WITHOUT a browser: a minimal
// EventSource-over-fetch shim (Bun has no global EventSource) stands in for
// the browser API `@aihu/use/useSwarm` constructs against, so we can drive
// the real composable from a plain script.
//
// Two runs, one process each (isClient is computed ONCE at module import
// time in packages/use/src/shared/index.ts, so the client-vs-SSR branch
// must be decided by which globals exist BEFORE the dynamic import, not
// changed afterward):
//   --client  window + document + EventSource all set before import()
//             -> useSwarm opens a real connection to the live bus.
//   --ssr     (default, no flag) none of those globals set
//             -> the isClient no-op path: no EventSource ever constructed.
//
// Usage:
//   bun scripts/verify-live.mjs --client   # expect connected:true agents:5
//   bun scripts/verify-live.mjs --ssr      # MUST-FAIL guard: connected:false, 0 constructions

const mode = process.argv.includes('--client') ? 'client' : 'ssr'
const BUS_URL = process.env.SWARM_BUS_URL ?? 'http://127.0.0.1:8791'

let eventSourceConstructions = 0

if (mode === 'client') {
  // window/document must exist before the dynamic import below, because
  // `isClient` in @aihu/use/shared is a module-scope `const` evaluated once
  // at import time.
  globalThis.window = globalThis
  globalThis.document = { title: 'verify-live' }

  // Minimal EventSource-over-fetch shim. useSwarm only touches
  // `.onopen` / `.onmessage` / `.onerror` (assigned, not addEventListener)
  // and `.close()` — this implements exactly that surface, parsing the
  // `data: <json>\n\n` SSE framing over a streamed fetch response.
  class FetchEventSource {
    constructor(url) {
      eventSourceConstructions++
      this.url = url
      this.onopen = null
      this.onmessage = null
      this.onerror = null
      this._closed = false
      this._controller = new AbortController()
      this._run()
    }

    async _run() {
      try {
        const res = await fetch(this.url, {
          headers: { Accept: 'text/event-stream' },
          signal: this._controller.signal,
        })
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
        this.onopen?.()
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          let sep
          // biome-ignore lint/suspicious/noAssignInExpressions: SSE frame scanner
          while ((sep = buf.indexOf('\n\n')) !== -1) {
            const frame = buf.slice(0, sep)
            buf = buf.slice(sep + 2)
            const dataLines = frame
              .split('\n')
              .filter((l) => l.startsWith('data:'))
              .map((l) => l.slice(5).trimStart())
            if (dataLines.length > 0) this.onmessage?.({ data: dataLines.join('\n') })
          }
        }
      } catch (err) {
        if (this._closed) return
        this.onerror?.(err)
      }
    }

    close() {
      this._closed = true
      this._controller.abort()
    }
  }

  globalThis.EventSource = FetchEventSource
}

const { useSwarm } = await import('@aihu/use/useSwarm')

if (mode === 'ssr') {
  const { state, agents, connected, close } = useSwarm({ url: BUS_URL })
  const result = {
    mode,
    connected: connected(),
    agentsLength: agents().length,
    stateT: state().t,
    eventSourceConstructions,
  }
  close()
  console.log(JSON.stringify(result, null, 2))
  const pass = result.connected === false && result.eventSourceConstructions === 0
  console.log(
    pass
      ? 'MUST-FAIL PASS: no EventSource constructed under SSR, connected=false'
      : 'MUST-FAIL VIOLATION',
  )
  process.exit(pass ? 0 : 1)
} else {
  const { agents, connected, close } = useSwarm({ url: BUS_URL })

  // Wait for the first SSE frame (or a timeout) — the composable's
  // `connected`/`agents` getters only reflect real data after `onmessage`
  // fires at least once.
  const deadline = Date.now() + 8000
  while (!connected() && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100))
  }
  // One extra tick so `agents()` has the frame's payload, not just the
  // `onopen` flip.
  await new Promise((r) => setTimeout(r, 300))

  const result = {
    mode,
    connected: connected(),
    agentsLength: agents().length,
    eventSourceConstructions,
  }
  close()
  console.log(JSON.stringify(result, null, 2))
  const pass = result.connected === true && result.agentsLength === 5
  console.log(pass ? 'LIVE PASS: connected=true agents=5' : 'LIVE CHECK FAILED')
  process.exit(pass ? 0 : 1)
}
