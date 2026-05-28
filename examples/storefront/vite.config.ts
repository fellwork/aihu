import { resolve } from 'node:path'
import { aihuCompilerPlugin } from '@aihu/compiler'
import { defineConfig } from 'vite'

const PRODUCTS = [
  { id: '1', name: 'Wireless Headphones', price: 79.99, description: 'Over-ear, noise-cancelling' },
  { id: '2', name: 'Mechanical Keyboard', price: 129.99, description: 'Tenkeyless, blue switches' },
  { id: '3', name: 'USB-C Hub', price: 49.99, description: '7-in-1, 4K HDMI' },
  { id: '4', name: 'Webcam 4K', price: 89.99, description: '60fps, auto-focus' },
]

export default defineConfig({
  plugins: [
    aihuCompilerPlugin(),
    {
      name: 'storefront-api-mock',
      configureServer(server) {
        // GET /api/products — public mock
        server.middlewares.use('/api/products', (req, res, next) => {
          if (req.method !== 'GET') { next(); return }
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(PRODUCTS))
        })

        // POST /api/checkout — checks Authorization header
        server.middlewares.use('/api/checkout', (req, res, next) => {
          if (req.method !== 'POST') { next(); return }
          const auth = req.headers['authorization']
          if (!auth) {
            res.statusCode = 401
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'UNAUTHORIZED', message: 'Missing authorization token' }))
            return
          }
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ orderId: 'order-' + Date.now(), status: 'ok' }))
        })
      },
    },
  ],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, '../_shared'),
      '@aihu/arbor': resolve(__dirname, 'node_modules/@aihu/arbor'),
      '@aihu/signals': resolve(__dirname, 'node_modules/@aihu/signals'),
      '@aihu/runtime': resolve(__dirname, 'node_modules/@aihu/runtime'),
      '@aihu/agent': resolve(__dirname, 'node_modules/@aihu/agent'),
      '@aihu/context': resolve(__dirname, 'node_modules/@aihu/context'),
      '@aihu-plugin/data': resolve(__dirname, 'node_modules/@aihu-plugin/data'),
    },
  },
})
