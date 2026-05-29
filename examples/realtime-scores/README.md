# EX-12 realtime-scores

Live score board demonstrating WebSocket-driven signal updates, `$lifecycle.mount/dispose`,
and `createResource` from `@aihu-plugin/data` for the initial-scores base layer.

## Run

```bash
bun install
bun run dev    # http://localhost:5112
```

A mock WebSocket server starts automatically on `ws://localhost:5172` via a Vite
`configureServer` hook. No separate process needed — one `bun run dev` starts both.

## Architecture

- `src/realtime-scores.aihu` — single-file SFC
  - `@state`: `scores` signal (WS updates), `connected` boolean signal, `$lifecycle` with `mount`/`dispose`
  - `$lifecycle.mount`: opens `ws://localhost:5172`, wires `onmessage`, `onopen`, `onclose`, `onerror`
  - `$lifecycle.dispose`: calls `ws.close()` for clean teardown
  - `createResource('initial-scores', ...)`: fetches `/api/initial-scores` for the base layer;
    live WS updates overlay on top once the socket is open
  - `@agent` block exposes `scores` and `connected`; declares `getScores` capability
- `vite.config.ts` — Vite plugin with `configureServer` hook:
  - Spins up a `ws` WebSocketServer on port 5172
  - Sends current mock scores immediately on connection
  - Broadcasts a random score increment every 3 seconds
  - Adds `GET /api/initial-scores` middleware returning the same mock data

## Mock teams

| ID | Team |
|----|------|
| team-alpha | Alpha Wolves |
| team-beta | Beta Sharks |
| team-gamma | Gamma Hawks |
| team-delta | Delta Lions |

## Swapping the data source

**Supabase Realtime or magna NOTIFY subscription:** WebSocket source can be swapped for
Supabase Realtime or a magna NOTIFY subscription — replace the `ws://` URL in
`$lifecycle.mount` and the server-side emitter in `vite.config.ts`. The SFC signal model
and `$lifecycle.mount/dispose` contract remain identical; only the transport changes.

Example Supabase Realtime drop-in (browser side):

```js
// In $lifecycle.mount:
const channel = supabase
  .channel('scores')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, (payload) => {
    setScores(payload.new)
  })
  .subscribe()

// In $lifecycle.dispose:
supabase.removeChannel(channel)
```

## Tests

```bash
bun run test   # vitest run — offline, no WS connection
```

8 smoke assertions covering `$lifecycle`, `mount`, `dispose`, `createResource`,
`@aihu-plugin/data`, `@agent`, `$expose`, and registry simulation.
