import { resolve } from 'node:path'
import { aihuCompilerPlugin } from '@aihu/compiler'
import { defineConfig } from 'vite'
import { WebSocketServer } from 'ws'

// Mock scores data shared between the WS server and the /api/initial-scores endpoint.
const INITIAL_SCORES = [
  { id: 'team-alpha', team: 'Alpha Wolves', score: 0 },
  { id: 'team-beta', team: 'Beta Sharks', score: 0 },
  { id: 'team-gamma', team: 'Gamma Hawks', score: 0 },
  { id: 'team-delta', team: 'Delta Lions', score: 0 },
]

// Mutable live copy updated by the WS tick interval.
const liveScores = INITIAL_SCORES.map((s) => ({ ...s }))

export default defineConfig({
  plugins: [
    aihuCompilerPlugin(),
    {
      name: 'realtime-scores-ws-server',
      configureServer(server) {
        const wss = new WebSocketServer({ port: 5172 })

        // Track connected clients so we can broadcast updates.
        const clients = new Set<import('ws').WebSocket>()

        // Randomly increment one team's score and broadcast to all clients.
        const intervalId = setInterval(() => {
          const idx = Math.floor(Math.random() * liveScores.length)
          liveScores[idx] = {
            ...liveScores[idx],
            score: liveScores[idx].score + Math.floor(Math.random() * 3) + 1,
          }
          const payload = JSON.stringify(liveScores)
          for (const client of clients) {
            if (client.readyState === 1 /* OPEN */) {
              client.send(payload)
            }
          }
        }, 3000)

        wss.on('connection', (ws) => {
          clients.add(ws)
          // Immediately send current scores on connect.
          ws.send(JSON.stringify(liveScores))

          ws.on('close', () => {
            clients.delete(ws)
          })
        })

        wss.on('error', (err: Error) => {
          console.warn('[realtime-scores] WS server error:', err.message)
        })

        // Clean up on Vite server close.
        server.httpServer?.on('close', () => {
          clearInterval(intervalId)
          wss.close()
        })

        // Route middleware: GET /api/initial-scores returns current mock scores.
        server.middlewares.use('/api/initial-scores', (_req, res) => {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(liveScores))
        })

        console.log('[realtime-scores] Mock WS server listening on ws://localhost:5172')
      },
    },
  ],
  resolve: {
    alias: {
      '@aihu/arbor': resolve(__dirname, 'node_modules/@aihu/arbor'),
      // Subpath before package: vite string aliases are PREFIX replacements, so
      // the '/lifecycle' subpath would otherwise rewrite to a nonexistent path
      // under the package dir and never consult the signals exports map.
      '@aihu/signals/lifecycle': resolve(__dirname, 'node_modules/@aihu/signals/dist/lifecycle.js'),
      '@aihu/signals': resolve(__dirname, 'node_modules/@aihu/signals'),
      '@aihu/runtime': resolve(__dirname, 'node_modules/@aihu/runtime'),
      '@aihu/agent': resolve(__dirname, 'node_modules/@aihu/agent'),
      '@aihu-plugin/data': resolve(__dirname, 'node_modules/@aihu-plugin/data'),
    },
  },
})
