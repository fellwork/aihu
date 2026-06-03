import { resolve } from 'node:path'
import { aihuCompilerPlugin } from '@aihu/compiler'
import { defineConfig } from 'vite'

// The compiler plugin compiles `.aihu` SFCs (client pipeline: auto-wiring + the
// @agent opaque-ID dispatcher pass). The browser entry takes the per-instance
// dispatcher off the mounted element via `_takeAgentDispatcher` and runs the
// capability-bridge client against it.
export default defineConfig({
  // `target: 'client'` so the browser bundle ships the policy-free @agent
  // opaque-ID dispatcher + the per-instance `_registerAgentDispatcher` wiring
  // (NOT the server `__agentBinding`). The browser entry reads the instance
  // dispatcher via `_takeAgentDispatcher(el)` and runs the capability bridge.
  plugins: [aihuCompilerPlugin({ target: 'client' })],
  server: {
    proxy: {
      // Forward the agent HTTP API + the ws bridge to the Bun server.
      '/agent': 'http://localhost:5208',
      '/bridge': { target: 'ws://localhost:5208', ws: true },
    },
  },
  resolve: {
    alias: {
      '@aihu/arbor': resolve(__dirname, 'node_modules/@aihu/arbor'),
      '@aihu/signals': resolve(__dirname, 'node_modules/@aihu/signals'),
      '@aihu/runtime': resolve(__dirname, 'node_modules/@aihu/runtime'),
      '@aihu/agent': resolve(__dirname, 'node_modules/@aihu/agent'),
      '@aihu/agent-server': resolve(__dirname, 'node_modules/@aihu/agent-server'),
    },
  },
})
