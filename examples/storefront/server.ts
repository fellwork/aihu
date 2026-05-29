/**
 * EX-13 storefront — Bun API server.
 *
 * Routes:
 *   GET  /api/products  — public, returns 4 mock products
 *   POST /api/checkout  — protected by requireAuth() middleware
 */

import { requireAuth } from '@aihu/auth'

const PRODUCTS = [
  { id: '1', name: 'Wireless Headphones', price: 79.99, description: 'Over-ear, noise-cancelling' },
  { id: '2', name: 'Mechanical Keyboard', price: 129.99, description: 'Tenkeyless, blue switches' },
  { id: '3', name: 'USB-C Hub', price: 49.99, description: '7-in-1, 4K HDMI' },
  { id: '4', name: 'Webcam 4K', price: 89.99, description: '60fps, auto-focus' },
]

// requireAuth() is a factory — returns a (req, next) => Response middleware
const checkAuth = requireAuth()

const PORT = 5213

Bun.serve({
  port: PORT,
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)

    // GET /api/products — public
    if (req.method === 'GET' && url.pathname === '/api/products') {
      return new Response(JSON.stringify(PRODUCTS), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // POST /api/checkout — protected
    if (req.method === 'POST' && url.pathname === '/api/checkout') {
      return checkAuth(req, async () => {
        return new Response(JSON.stringify({ orderId: `order-${Date.now()}`, status: 'ok' }), {
          headers: { 'Content-Type': 'application/json' },
        })
      })
    }

    // 404
    return new Response(JSON.stringify({ error: 'NOT_FOUND' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  },
})

console.log('[storefront] API server listening on http://localhost:5213')
