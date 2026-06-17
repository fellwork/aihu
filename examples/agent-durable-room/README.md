# agent-durable-room

The **server-authoritative, multi-client** version of the agent-driven component.

`create-aihu --template agent` makes the *browser* the source of truth (with
`localStorage` for refresh-durability). This example moves the source of truth
**server-side into a Cloudflare Durable Object**, so the same component is:

- **Shared** — every connected tab/device sees the same state.
- **Live** — an agent (or any viewer) mutates the room and all viewers update in
  real time over a WebSocket.
- **Durable** — state lives in DO storage; it survives a refresh *and* a server
  restart, with no `localStorage`.

## Architecture

```
AGENT   --POST /agent/call--> Worker --RPC--> TaskRoom (DO)   the gate: 404→403→429
BROWSER --ws  /ws----------> Worker --fetch--> TaskRoom (DO)   hibernatable WebSocket
                                                   |
                              apply → persist (DO storage) → broadcast to all sockets
```

- `src/task-room.ts` — the Durable Object: canonical state, WebSocket Hibernation
  API, the scope + rate-limit gate, persist-then-broadcast.
- `src/worker.ts` — routes `/ws`, `/agent/call`, `/agent/state` to the room DO;
  everything else is served from `./dist` by Workers Static Assets.
- `src/task-list.aihu` — the aihu component as a live **view**: hydrates from the
  DO snapshot on mount, applies every broadcast, sends user intents back.

This inverts the default aihu model (browser = sole executor). Here the DO is the
executor + policy authority; browsers are subscribers.

## Run it

```bash
bun install
bun run dev          # vite build → wrangler dev (http://localhost:8787)
```

Open two tabs. Type in one — it appears in both. Then drive it as an agent:

```bash
# authorized → mutates the room, all viewers update live
curl -XPOST localhost:8787/agent/call -H 'content-type: application/json' \
  -d '{"tool":"task-list/setVariant","params":["danger"],"userId":"u1","jwt":"tasks:write"}'

# wrong scope → 403; more than 5 calls/key/min → 429; unknown tool → 404
curl -XPOST localhost:8787/agent/call -H 'content-type: application/json' \
  -d '{"tool":"task-list/setLabel","params":["Sprint Board"],"userId":"u1","jwt":"nope"}'
```

Refresh every tab — the state is still there (DO storage).

## Deploy

```bash
bun run deploy       # vite build → wrangler deploy
```

> The bridge/WebSocket is unauthenticated (demo). The agent gate (`/agent/call`)
> enforces scope + rate limits; a real deployment would also authenticate the
> WebSocket and persist the rate counter.
